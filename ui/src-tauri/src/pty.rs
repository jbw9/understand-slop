//! Shells for the terminal panel. Each one is a real pty running the user's
//! shell in the mapped repo; its output streams to the webview over a
//! `Channel` as raw bytes (xterm decodes UTF-8 itself, so a character split
//! across two reads is fine), and one final JSON `{"exit": code}` says it ended.
//!
//! A tab can run Claude Code instead of the shell (claude.rs); it then owns a
//! context queue, removed with the tab.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::claude;
use crate::repo::Repo;

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    /// Set on a Claude tab: where picks wait for its next prompt.
    context: Option<PathBuf>,
}

impl Pty {
    fn end(mut self) {
        let _ = self.child.kill();
        if let Some(q) = &self.context {
            claude::forget(q);
        }
    }
}

#[derive(Default)]
pub struct Ptys {
    next: AtomicU32,
    open: Arc<Mutex<HashMap<u32, Pty>>>,
}

impl Ptys {
    /// Every shell still running, ended. Called when the app exits, so
    /// closing the window never leaves a shell behind.
    pub fn kill_all(&self) {
        for (_, p) in self.open.lock().unwrap().drain() {
            p.end();
        }
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 }
}

fn shell() -> String {
    #[cfg(windows)]
    return std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into());
    #[cfg(not(windows))]
    return std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
}

/// What the tab is called: the shell's own name, `zsh` for `/usr/bin/zsh`.
#[derive(serde::Serialize)]
pub struct Spawned {
    id: u32,
    shell: String,
}

#[tauri::command]
pub fn pty_spawn(
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
    claude: Option<claude::Launch>,
    ptys: tauri::State<Ptys>,
    repo: tauri::State<Repo>,
) -> Result<Spawned, String> {
    let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| e.to_string())?;
    let id = ptys.next.fetch_add(1, Ordering::Relaxed) + 1;
    let context = claude.as_ref().map(|_| claude::queue(id));
    let (mut cmd, name) = match (&claude, &context) {
        (Some(launch), Some(q)) => (claude::command(launch, q), "claude".to_string()),
        _ => {
            let program = shell();
            let name = std::path::Path::new(&program)
                .file_stem()
                .map_or_else(|| program.clone(), |s| s.to_string_lossy().into_owned());
            (CommandBuilder::new(&program), name)
        }
    };
    if let Some(dir) = repo.root().ok().or_else(|| std::env::var_os("HOME").map(Into::into)) {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave end belongs to the shell now; holding it here would keep the
    // reader below from ever seeing EOF.
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    ptys.open.lock().unwrap().insert(id, Pty { master: pair.master, writer, child, context });

    let open = ptys.open.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_data.send(InvokeResponseBody::Raw(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
        // Gone from the map already if it was killed from the UI.
        let code = open
            .lock()
            .unwrap()
            .remove(&id)
            .and_then(|mut p| {
                if let Some(q) = &p.context {
                    claude::forget(q);
                }
                p.child.wait().ok()
            })
            .map_or(0, |s| s.exit_code());
        let _ = on_data.send(InvokeResponseBody::Json(format!(r#"{{"exit":{code}}}"#)));
    });
    Ok(Spawned { id, shell: name })
}

fn with<T>(ptys: &Ptys, id: u32, f: impl FnOnce(&mut Pty) -> std::io::Result<T>) -> Result<T, String> {
    let mut open = ptys.open.lock().unwrap();
    let p = open.get_mut(&id).ok_or("no such terminal")?;
    f(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_write(id: u32, data: String, ptys: tauri::State<Ptys>) -> Result<(), String> {
    with(&ptys, id, |p| {
        p.writer.write_all(data.as_bytes())?;
        p.writer.flush()
    })
}

#[tauri::command]
pub fn pty_resize(id: u32, cols: u16, rows: u16, ptys: tauri::State<Ptys>) -> Result<(), String> {
    with(&ptys, id, |p| p.master.resize(size(cols, rows)).map_err(std::io::Error::other))
}

#[tauri::command]
pub fn pty_kill(id: u32, ptys: tauri::State<Ptys>) -> Result<(), String> {
    if let Some(p) = ptys.open.lock().unwrap().remove(&id) {
        p.end();
    }
    Ok(())
}

/// A Claude tab's queue, or why there is none.
fn queue_of(ptys: &Ptys, id: u32) -> Result<PathBuf, String> {
    ptys.open
        .lock()
        .unwrap()
        .get(&id)
        .ok_or("no such terminal")?
        .context
        .clone()
        .ok_or_else(|| "not a Claude tab".into())
}

/// Queues a section for this Claude tab's next prompt.
#[tauri::command]
pub fn context_add(id: u32, text: String, ptys: tauri::State<Ptys>) -> Result<(), String> {
    claude::append(&queue_of(&ptys, id)?, &text).map_err(|e| e.to_string())
}

/// Rewrites what is still waiting, after a pick is taken back. Empty clears it.
#[tauri::command]
pub fn context_set(id: u32, text: String, ptys: tauri::State<Ptys>) -> Result<(), String> {
    claude::replace(&queue_of(&ptys, id)?, &text).map_err(|e| e.to_string())
}

/// True while something queued has not gone out with a prompt yet.
#[tauri::command]
pub fn context_pending(id: u32, ptys: tauri::State<Ptys>) -> Result<bool, String> {
    Ok(claude::pending(&queue_of(&ptys, id)?))
}
