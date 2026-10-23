mod claude;
mod pty;
mod repo;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(repo::Repo::default())
        .manage(pty::Ptys::default())
        .invoke_handler(tauri::generate_handler![
            repo::open_repo,
            repo::read_slice,
            repo::write_slice,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::context_add,
            pty::context_set,
            pty::context_pending,
            claude::claude_detect,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<pty::Ptys>().kill_all();
            }
        });
}
