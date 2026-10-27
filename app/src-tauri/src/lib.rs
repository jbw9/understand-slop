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
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                pinch_to_page(&window);
            }
            #[cfg(not(target_os = "linux"))]
            let _ = app;
            Ok(())
        })
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
            pty::context_where,
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

/// WebKitGTK answers a touchpad pinch by magnifying the whole page — the title
/// bar and status bar with it, out of view — and tells the page nothing. So
/// the pinch is taken here, before WebKit's own handler runs, and handed to
/// the level's zoom (components/zoom.tsx) as a `slop:pinch` event: only the
/// map magnifies, as a pinch does on a Mac. `scale` is relative to the start
/// of the pinch, which is exactly 1.
#[cfg(target_os = "linux")]
fn pinch_to_page(window: &tauri::WebviewWindow) {
    use gtk::glib::Propagation;
    use gtk::prelude::WidgetExt;
    let target = window.clone();
    let _ = window.with_webview(move |webview| {
        webview.inner().connect_event(move |_, event| {
            let Some(pinch) = event.downcast_ref::<gtk::gdk::EventTouchpadPinch>() else {
                return Propagation::Proceed;
            };
            let (x, y) = pinch.position();
            let _ = target.eval(format!(
                "window.dispatchEvent(new CustomEvent('slop:pinch',{{detail:{{scale:{},x:{x},y:{y}}}}}))",
                pinch.scale()
            ));
            Propagation::Stop
        });
    });
}
