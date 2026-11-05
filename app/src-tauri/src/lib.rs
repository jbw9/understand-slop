mod browser;
mod claude;
mod devices;
mod dictate;
mod files;
mod mcp;
mod preview;
mod proc;
mod pty;
mod server;
mod signins;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // The folder picker for importing a project; nothing else.
        .plugin(tauri_plugin_dialog::init())
        // The terminal's copy and paste (Ctrl+Shift+C / V): plain text only.
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(pty::Ptys::default())
        .manage(preview::Previews::default())
        .manage(server::Server::default())
        .setup(|app| {
            // Claude's way into the preview, for every Claude tab (mcp.rs).
            mcp::start(app.handle().clone());
            // Tab files a crashed or killed Mira left in the temp folder.
            std::thread::spawn(claude::sweep_stale);
            // Plans Claude Code wrote and nothing has touched in a month.
            std::thread::spawn(claude::prune_plans);
            // `app:dev` serves the page itself; the installed app starts its
            // snapshot's server first (server.rs), so the window never opens
            // onto a page that isn't there yet.
            if cfg!(debug_assertions) {
                open_main(app.handle())?;
            } else {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    if let Err(e) = server::start(&handle).and_then(|()| open_main(&handle).map_err(|e| e.to_string())) {
                        use tauri_plugin_dialog::DialogExt;
                        handle.dialog().message(e).title("Mira couldn't start").blocking_show();
                        handle.exit(1);
                    }
                });
            }
            #[cfg(target_os = "macos")]
            terminal_menu(app)?;
            done_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            done_count,
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
            preview::preview_open,
            preview::preview_target,
            preview::preview_close,
            preview::preview_external,
            mcp::preview_reply,
            browser::browser_open,
            browser::browser_place,
            browser::browser_go,
            browser::browser_eval,
            browser::browser_close,
            signins::signin_project,
            signins::signin_keep,
            signins::signin_list,
            signins::signin_forget,
            browser::native_input,
            devices::project_detect,
            devices::device_status,
            devices::device_setup,
            devices::device_start,
            devices::device_frame,
            devices::device_input,
            devices::device_describe,
            devices::device_run,
            dictate::dictate_status,
            dictate::dictate_download,
            dictate::dictate_remove,
            dictate::dictate_start,
            dictate::dictate_stop,
            dictate::dictate_cancel,
            dictate::dictate_hush,
            files::file_resolve,
            files::file_read,
            files::file_write,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the app")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                dictate::unhush();
                app.state::<pty::Ptys>().kill_all();
                app.state::<preview::Previews>().close_all();
                devices::stop_all();
                server::stop(app);
            }
        });
}

/// The main window, as `tauri.conf.json` describes it (`create: false` there,
/// so it opens only once there is a page to show).
fn open_main(app: &tauri::AppHandle) -> tauri::Result<()> {
    let _window = tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?.build()?;
    #[cfg(target_os = "linux")]
    pinch_to_page(&_window);
    Ok(())
}

/// Mira in the menu bar, with how many Claude tabs have finished beside it, so
/// a finished turn shows from any app. Clicking it brings the window forward.
fn done_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let mut tray = TrayIconBuilder::with_id("done").tooltip("Mira").on_tray_icon_event(|tray, e| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
            if let Some(w) = tray.app_handle().get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The workspace's count of Claude tabs whose dot is green (components/workspace.tsx).
#[tauri::command]
fn done_count(app: tauri::AppHandle, n: u32) {
    if let Some(tray) = app.tray_by_id("done") {
        let _ = tray.set_title(if n == 0 { None } else { Some(n.to_string()) });
        let _ = tray.set_tooltip(Some(if n == 0 { "Mira".to_string() } else { format!("Mira: {n} done") }));
    }
}

/// Cmd+` and Ctrl+` from the menu bar as well as the page: a key pressed in
/// a Preview's page (its own webview, or a frame) never reaches the page's
/// handler, but a menu key equivalent is the app's wherever focus is. A key
/// the page handles itself is not passed on to the menu, so it toggles once.
#[cfg(target_os = "macos")]
fn terminal_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, Submenu};
    use tauri::Emitter;
    let menu = Menu::default(app.handle())?;
    let cmd = MenuItem::with_id(app, "terminal", "Toggle Terminal", true, Some("Cmd+`"))?;
    let ctrl = MenuItem::with_id(app, "terminal-ctrl", "Toggle Terminal", true, Some("Ctrl+`"))?;
    menu.append(&Submenu::with_items(app, "Terminal", true, &[&cmd, &ctrl])?)?;
    // The title bar's project tabs (components/titlebar.tsx), for when focus is in a Preview's page.
    let mut projects = Vec::new();
    for n in 1..=9 {
        projects.push(MenuItem::with_id(app, format!("project-{n}"), format!("Project {n}"), true, Some(&format!("Cmd+{n}")))?);
    }
    projects.push(MenuItem::with_id(app, "project-last", "Last Project", true, Some("Ctrl+Tab"))?);
    let items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = projects.iter().map(|m| m as _).collect();
    menu.append(&Submenu::with_items(app, "Projects", true, &items)?)?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, e| {
        let id = e.id().as_ref();
        if id == "terminal" || id == "terminal-ctrl" {
            let _ = app.emit_to("main", "slop:toggle-workspace", ());
        } else if let Some(n) = id.strip_prefix("project-") {
            let _ = app.emit_to("main", "slop:project", n.to_string());
        }
    });
    Ok(())
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
