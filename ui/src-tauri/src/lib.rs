mod claude;
mod pty;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // The folder picker for importing a project; nothing else.
        .plugin(tauri_plugin_dialog::init())
        // The terminal's copy and paste (Ctrl+Shift+C / V): plain text only.
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pty::Ptys::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::pty_state,
            pty::pty_which,
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
