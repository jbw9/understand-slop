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
        // A reload of the app's page forgets what its tabs had running: the web
        // pages its Previews opened (browser.rs), which would stay drawn over the
        // new page and refuse its labels, and the terminals and Previews' proxies,
        // which the new page opens afresh, resuming each Claude's conversation in
        // a new one; left running, two Claudes would answer in one conversation.
        .on_page_load(|webview, load| {
            if webview.label() == "main" && matches!(load.event(), tauri::webview::PageLoadEvent::Started) {
                let app = webview.app_handle();
                for (label, view) in app.webviews() {
                    if label.starts_with("browser-") {
                        let _ = view.close();
                    }
                }
                app.state::<pty::Ptys>().kill_all();
                app.state::<preview::Previews>().close_all();
            }
        })
        .setup(|app| {
            // Claude's way into the preview, for every Claude tab (mcp.rs).
            mcp::start(app.handle().clone());
            // Tab files a crashed or killed Bluprint left in the temp folder.
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
                        handle.dialog().message(e).title("Bluprint couldn't start").blocking_show();
                        handle.exit(1);
                    }
                });
            }
            #[cfg(target_os = "macos")]
            terminal_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            attention_count,
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

/// The Dock icon's badge: how many Claude tabs have finished or are waiting on
/// the user (components/workspace.tsx), so it shows from any app, as Discord's does.
#[tauri::command]
fn attention_count(app: tauri::AppHandle, n: i64) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_badge_count(if n == 0 { None } else { Some(n) });
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
    // Claude Code's send-now (components/shell.tsx): Control-Return is otherwise
    // AppKit's key for the context menu, which opens and the terminal never sees it.
    let send = MenuItem::with_id(app, "send-now", "Send Now", true, Some("Ctrl+Enter"))?;
    menu.append(&Submenu::with_items(app, "Terminal", true, &[&cmd, &ctrl, &send])?)?;
    // The title bar's project tabs (components/titlebar.tsx), for when focus is in a Preview's page.
    let mut projects = Vec::new();
    for n in 1..=9 {
        projects.push(MenuItem::with_id(app, format!("project-{n}"), format!("Project {n}"), true, Some(&format!("Cmd+{n}")))?);
    }
    // No key: Ctrl+Tab steps through the tabs (the Window menu below), as in a browser.
    projects.push(MenuItem::with_id(app, "project-last", "Last Project", true, None::<&str>)?);
    let items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = projects.iter().map(|m| m as _).collect();
    menu.append(&Submenu::with_items(app, "Projects", true, &items)?)?;
    // A Preview's own keys, as a browser's (components/preview.tsx): its page is
    // a webview of its own or a frame, and the keys pressed in it stay there.
    let reload = MenuItem::with_id(app, "preview-reload", "Reload Page", true, Some("Cmd+R"))?;
    let back = MenuItem::with_id(app, "preview-back", "Back", true, Some("Cmd+["))?;
    let forward = MenuItem::with_id(app, "preview-forward", "Forward", true, Some("Cmd+]"))?;
    let address = MenuItem::with_id(app, "preview-address", "Open Location", true, Some("Cmd+L"))?;
    menu.append(&Submenu::with_items(app, "Preview", true, &[&reload, &back, &forward, &address])?)?;
    // A menu key reaches the menu before the page, so the page is handed these
    // and the tab strip with focus acts on them (components/workspace.tsx).
    let next = MenuItem::with_id(app, "tab-next", "Next Tab", true, Some("Ctrl+Tab"))?;
    let prev = MenuItem::with_id(app, "tab-prev", "Previous Tab", true, Some("Ctrl+Shift+Tab"))?;
    let next_cmd = MenuItem::with_id(app, "tab-next-cmd", "Next Tab", true, Some("Cmd+Shift+]"))?;
    let prev_cmd = MenuItem::with_id(app, "tab-prev-cmd", "Previous Tab", true, Some("Cmd+Shift+["))?;
    let close = MenuItem::with_id(app, "tab-close", "Close Tab", true, Some("Cmd+W"))?;
    menu.append(&Submenu::with_items(app, "Tabs", true, &[&next, &prev, &next_cmd, &prev_cmd, &close])?)?;
    // Cmd+W closes a tab, never the window: the default Close Window took the
    // key first and, Bluprint being one window, quit the app.
    for item in menu.items()? {
        if let Some(sub) = item.as_submenu() {
            for inner in sub.items()? {
                if let Some(p) = inner.as_predefined_menuitem().filter(|p| p.text().is_ok_and(|t| t == "Close Window")) {
                    sub.remove(p)?;
                }
            }
        }
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, e| {
        let id = e.id().as_ref();
        if id == "terminal" || id == "terminal-ctrl" {
            let _ = app.emit_to("main", "slop:toggle-workspace", ());
        } else if id == "send-now" {
            let _ = app.emit_to("main", "slop:send-now", ());
        } else if id == "tab-close" {
            let _ = app.emit_to("main", "slop:tab-close", ());
        } else if let Some(dir) = id.strip_prefix("tab-") {
            let _ = app.emit_to("main", "slop:tab-step", if dir.starts_with("next") { 1 } else { -1 });
        } else if let Some(n) = id.strip_prefix("project-") {
            let _ = app.emit_to("main", "slop:project", n.to_string());
        } else if let Some(key) = id.strip_prefix("preview-") {
            // The address bar is the app's page: the keyboard is taken back from a page's webview.
            if key == "address" {
                if let Some(main) = app.get_webview("main") {
                    let _ = main.set_focus();
                }
            }
            let _ = app.emit_to("main", "slop:preview-key", key.to_string());
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
