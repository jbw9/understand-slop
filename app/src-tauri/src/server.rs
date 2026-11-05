//! The installed app's own server. `npm run app:install` copies `app/` into
//! `<app_data_dir>/server` and builds it there, so the Next server behind the
//! window is a snapshot that editing the checkout never touches. The app starts
//! it on launch and stops it on quit; `app:dev` never comes here.
//!
//! An app opened from Finder gets a bare PATH, so the install records the Node
//! and PATH of the shell that ran it in `env.json`, and the server (and the
//! git, claude and tsx it runs) sees what it would in a terminal.

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

/// Fixed in `tauri.conf.json`'s `frontendDist`; `app:dev` keeps 3000.
pub const PORT: u16 = 3123;

#[derive(Default)]
pub struct Server(Mutex<Option<Child>>);

#[derive(serde::Deserialize)]
struct Env {
    node: PathBuf,
    path: String,
}

fn up() -> bool {
    TcpStream::connect_timeout(&([127, 0, 0, 1], PORT).into(), Duration::from_millis(200)).is_ok()
}

/// Returns once the server answers. A server already answering is one a crashed
/// Bluprint left behind, and is used as it is.
pub fn start(app: &tauri::AppHandle) -> Result<(), String> {
    if up() {
        return Ok(());
    }
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = data.join("server");
    let env: Env = std::fs::read_to_string(dir.join("env.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .ok_or("Bluprint's server isn't installed. Run `npm run app:install` in the repo's app folder.")?;
    let log = std::fs::File::create(data.join("server.log")).map_err(|e| e.to_string())?;
    let child = crate::proc::command(&env.node)
        .arg(dir.join("node_modules/next/dist/bin/next"))
        .args(["start", "-p", &PORT.to_string(), "-H", "127.0.0.1"])
        .current_dir(&dir)
        .env("PATH", &env.path)
        .stdin(Stdio::null())
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log)
        .spawn()
        .map_err(|e| format!("Couldn't start {}: {e}", env.node.display()))?;
    *app.state::<Server>().0.lock().unwrap() = Some(child);
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if up() {
            return Ok(());
        }
        if let Some(c) = app.state::<Server>().0.lock().unwrap().as_mut() {
            if let Ok(Some(status)) = c.try_wait() {
                return Err(format!("Bluprint's server exited ({status}). See {}.", data.join("server.log").display()));
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!("Bluprint's server didn't start in 30 s. See {}.", data.join("server.log").display()))
}

pub fn stop(app: &tauri::AppHandle) {
    if let Some(mut c) = app.state::<Server>().0.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}
