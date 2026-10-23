//! The workspace's tabs. Each one is a real pty running the user's shell in the
//! open map's checkout; its output streams to the webview over a `Channel` as
//! raw bytes (xterm decodes UTF-8 itself, so a character split across two
//! reads is fine), and one final JSON `{"exit": code}` says it ended.
//!
//! A tab can start Claude Code in the shell first (claude.rs), and Claude can
//! be started again in any tab. Every tab owns a context queue for it,
//! removed with the tab.

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::claude;

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    /// Where picks wait for the next prompt to Claude in this tab.
    context: PathBuf,
}

impl Pty {
    fn end(mut self) {
        let _ = self.child.kill();
        claude::forget(&self.context);
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
    launch: Option<claude::Launch>,
    start_claude: bool,
    cwd: Option<String>,
    ptys: tauri::State<Ptys>,
) -> Result<Spawned, String> {
    let pair = native_pty_system().openpty(size(cols, rows)).map_err(|e| e.to_string())?;
    let id = ptys.next.fetch_add(1, Ordering::Relaxed) + 1;
    let context = claude::queue(id);
    let program = shell();
    let name = std::path::Path::new(&program)
        .file_stem()
        .map_or_else(|| program.clone(), |s| s.to_string_lossy().into_owned());
    let mut cmd = CommandBuilder::new(&program);
    // With Claude found, the launcher works in this tab; asked to, Claude runs
    // first and the user's ordinary interactive shell takes over when it exits.
    if let Some(launch) = &launch {
        claude::prepare(&mut cmd, launch, &context).map_err(|e| e.to_string())?;
        if start_claude && cfg!(unix) {
            cmd.args(["-c", r#""$SLOP_LAUNCHER"; exec "$SHELL""#]);
            cmd.env("SHELL", &program);
        }
    }
    // The checkout the page named, if it is really there; home otherwise.
    let dir = cwd.map(PathBuf::from).filter(|d| d.is_dir());
    if let Some(dir) = dir.or_else(|| std::env::var_os("HOME").map(Into::into)) {
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
                claude::forget(&p.context);
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

/// Which of `names` the user's shell can run, found the way their own
/// terminal finds them: an interactive shell, so PATH set in its rc counts.
/// Only plain names are asked about, never anything the shell would parse.
fn which(names: Vec<String>) -> Vec<String> {
    let names: Vec<String> = names
        .into_iter()
        .filter(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .collect();
    if names.is_empty() || cfg!(windows) {
        return Vec::new();
    }
    let script = names
        .iter()
        .map(|n| format!("command -v {n} >/dev/null 2>&1 && echo {n}"))
        .collect::<Vec<_>>()
        .join("; ");
    let out = std::process::Command::new(shell())
        .args(["-ic", &script])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output();
    let text = out.map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
    // An rc may print its own lines too; only exact names count.
    names.into_iter().filter(|n| text.lines().any(|l| l.trim() == n)).collect()
}

/// The coding agents a tab can start besides Claude. Async so the shell's
/// start-up never blocks the window.
#[tauri::command]
pub async fn pty_which(names: Vec<String>) -> Vec<String> {
    which(names)
}

/// A tab's queue.
fn queue_of(ptys: &Ptys, id: u32) -> Result<PathBuf, String> {
    Ok(ptys.open.lock().unwrap().get(&id).ok_or("no such terminal")?.context.clone())
}

/// What is in front in a tab: Claude through the launcher (able to take
/// context), or some other program the shell started, or the shell itself,
/// waiting at its prompt.
#[derive(serde::Serialize)]
pub struct State {
    claude: bool,
    busy: bool,
}

#[tauri::command]
pub fn pty_state(id: u32, ptys: tauri::State<Ptys>) -> Result<State, String> {
    let open = ptys.open.lock().unwrap();
    let p = open.get(&id).ok_or("no such terminal")?;
    // An interactive shell gives each command its own process group, and
    // hands it the terminal: someone else leading the foreground group means
    // a program is running.
    #[cfg(unix)]
    let busy = match (p.master.process_group_leader(), p.child.process_id()) {
        (Some(front), Some(shell)) => front as u32 != shell,
        _ => false,
    };
    #[cfg(not(unix))]
    let busy = false;
    Ok(State { claude: claude::running(&p.context), busy })
}

/// Queues a section for the next prompt to Claude in this tab.
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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn which_finds_only_plain_names_the_shell_can_run() {
        let asked = ["sh", "surely-not-a-program-xyz", "sh; echo oops", ""].map(String::from).to_vec();
        assert_eq!(which(asked), vec!["sh".to_string()]);
    }
}
