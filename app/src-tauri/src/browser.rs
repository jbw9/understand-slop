//! The web in the preview: pages from outside this machine (a search, a
//! library's docs, a service the project calls), which the proxy (preview.rs)
//! cannot frame. Each opens in a webview of its own laid over the Preview
//! tab's viewport (components/preview.tsx keeps it there), with the same agent
//! inside (agent.js). The page never calls the app: the tab asks it things by
//! running script in it and collects what it has to say the same way, so a
//! site on the open web is handed nothing of the app's.
//!
//! And Claude's clicks and keys, on macOS: given to the webview as AppKit
//! events, the preview's own frame or one of these pages alike. A page cannot
//! tell them from a person's, so whatever works for the user works for Claude:
//! a popup, a file picker, a button in a frame from another site.

use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc;
use std::time::Duration;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url, WebviewBuilder, WebviewUrl};

const AGENT: &str = include_str!("agent.js");
const GONE: &str = "The page is gone from the preview.";

static NEXT: AtomicU32 = AtomicU32::new(1);

fn web(url: &str) -> Result<Url, String> {
    let u = Url::parse(url).map_err(|_| format!("Not an address: {url}"))?;
    if !matches!(u.scheme(), "http" | "https") {
        return Err(format!("Only http and https pages open in the preview, not {url}"));
    }
    Ok(u)
}

/// A page from the web, at a place in the window: CSS pixels of the app's
/// page, with `zoom` the scale the viewport is drawn at.
#[tauri::command]
pub async fn browser_open(app: AppHandle, url: String, x: f64, y: f64, width: f64, height: f64, zoom: f64) -> Result<String, String> {
    let window = app.get_window("main").ok_or("The window is gone.")?;
    let label = format!("browser-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let (tell, me) = (app.clone(), label.clone());
    let (own, mine) = (app.clone(), label.clone());
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(web(&url)?))
        // Told that it is asked, rather than posting to a page around it.
        .initialization_script(format!("(function (SLOP_NATIVE) {{\n{AGENT}\n}})(true);"))
        .on_page_load(move |_, load| {
            let done = matches!(load.event(), PageLoadEvent::Finished);
            let _ = tell.emit_to("main", "slop:browser", json!({ "label": me, "url": load.url().as_str(), "done": done }));
        })
        // The preview is one page: what would open a window opens here.
        .on_new_window(move |url, _| {
            if let Some(view) = own.get_webview(&mine) {
                let _ = view.navigate(url);
            }
            NewWindowResponse::Deny
        });
    let view = window
        .add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    let _ = view.set_zoom(zoom);
    Ok(label)
}

#[tauri::command]
pub async fn browser_place(app: AppHandle, label: String, x: f64, y: f64, width: f64, height: f64, zoom: f64, shown: bool) -> Result<(), String> {
    let view = app.get_webview(&label).ok_or(GONE)?;
    let bounds = Rect { position: LogicalPosition::new(x, y).into(), size: LogicalSize::new(width, height).into() };
    view.set_bounds(bounds).map_err(|e| e.to_string())?;
    view.set_zoom(zoom).map_err(|e| e.to_string())?;
    if shown { view.show() } else { view.hide() }.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_go(app: AppHandle, label: String, url: String) -> Result<(), String> {
    app.get_webview(&label).ok_or(GONE)?.navigate(web(&url)?).map_err(|e| e.to_string())
}

/// Runs `js` in the page and returns its value. The tab's agent calls go
/// through this, and so does collecting what the page has said since.
#[tauri::command]
pub async fn browser_eval(app: AppHandle, label: String, js: String) -> Result<Value, String> {
    let view = app.get_webview(&label).ok_or(GONE)?;
    let (tx, rx) = mpsc::channel();
    view.eval_with_callback(js, move |out| {
        let _ = tx.send(out);
    })
    .map_err(|e| e.to_string())?;
    let out = rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "The page did not answer.".to_string())?;
    Ok(serde_json::from_str(&out).unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn browser_close(app: AppHandle, label: String) {
    if let Some(view) = app.get_webview(&label) {
        let _ = view.close();
    }
}

/// One thing a person does with a mouse or keyboard. `x` and `y` are points
/// from the top left of the webview it is done in.
#[derive(Deserialize)]
pub struct Act {
    kind: String,
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    /// 0 the left button, 2 the right.
    #[serde(default)]
    button: u8,
    #[serde(default = "one")]
    clicks: isize,
    /// A key with its modifiers for `key` ("Enter", "cmd+a"), the characters for `text`.
    #[serde(default)]
    text: String,
}

fn one() -> isize {
    1
}

/// Does `acts` in a webview: a page from the web by its label, or the
/// window's own (where the preview's frame is) when there is none.
#[tauri::command]
pub async fn native_input(app: AppHandle, view: Option<String>, acts: Vec<Act>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = mpsc::channel();
        let run = move |w: tauri::webview::PlatformWebview| {
            // On the main thread: Tauri's promise for with_webview.
            let _ = tx.send(unsafe { macos::send(&*(w.inner() as *const objc2_app_kit::NSView), &acts) });
        };
        let target = app.get_webview(view.as_deref().unwrap_or("main")).ok_or(GONE)?;
        target.with_webview(run).map_err(|e| e.to_string())?;
        rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "The input was not taken.".to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, view, acts);
        Err("native input is macOS only".into())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{code_of, Act};
    use objc2::{sel, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSEvent, NSEventModifierFlags, NSEventType, NSView};
    use objc2_foundation::{NSPoint, NSProcessInfo, NSString};

    pub fn send(view: &NSView, acts: &[Act]) -> Result<(), String> {
        let window = view.window().ok_or("The preview is not in a window.")?;
        let number = window.windowNumber();
        let start = NSProcessInfo::processInfo().systemUptime();
        let (flipped, height) = (view.isFlipped(), view.bounds().size.height);
        let at = |x: f64, y: f64| view.convertPoint_toView(NSPoint::new(x, if flipped { y } else { height - y }), None);
        // A press or a key takes the keyboard, as a person's click would; a hover does not.
        if acts.iter().any(|a| a.kind != "move") {
            window.makeFirstResponder(Some(view));
        }
        for (i, a) in acts.iter().enumerate() {
            let time = start + i as f64 * 0.001;
            match a.kind.as_str() {
                "move" | "down" | "up" | "drag" => {
                    let right = a.button == 2;
                    let kind = match a.kind.as_str() {
                        "move" => NSEventType::MouseMoved,
                        "drag" => NSEventType::LeftMouseDragged,
                        "down" if right => NSEventType::RightMouseDown,
                        "down" => NSEventType::LeftMouseDown,
                        _ if right => NSEventType::RightMouseUp,
                        _ => NSEventType::LeftMouseUp,
                    };
                    let pressure = if matches!(a.kind.as_str(), "down" | "drag") { 1.0 } else { 0.0 };
                    let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                        kind,
                        at(a.x, a.y),
                        NSEventModifierFlags::empty(),
                        time,
                        number,
                        None,
                        0,
                        a.clicks,
                        pressure,
                    )
                    .ok_or("AppKit made no mouse event.")?;
                    match kind {
                        NSEventType::MouseMoved => view.mouseMoved(&event),
                        NSEventType::LeftMouseDragged => view.mouseDragged(&event),
                        NSEventType::LeftMouseDown => view.mouseDown(&event),
                        NSEventType::RightMouseDown => view.rightMouseDown(&event),
                        NSEventType::RightMouseUp => view.rightMouseUp(&event),
                        _ => view.mouseUp(&event),
                    }
                }
                "key" => {
                    let (code, chars, flags) = combo(&a.text).ok_or_else(|| format!("Not a key: {}", a.text))?;
                    key(view, number, time, code, &chars, flags)?;
                }
                "text" => {
                    for c in a.text.chars() {
                        let (code, chars) = if c == '\n' { (36, "\r".to_string()) } else { (code_of(c), c.to_string()) };
                        key(view, number, time, code, &chars, NSEventModifierFlags::empty())?;
                    }
                }
                other => return Err(format!("Unknown input: {other}")),
            }
        }
        Ok(())
    }

    fn key(view: &NSView, number: isize, time: f64, code: u16, chars: &str, flags: NSEventModifierFlags) -> Result<(), String> {
        let chars = NSString::from_str(chars);
        let event = |kind| {
            NSEvent::keyEventWithType_location_modifierFlags_timestamp_windowNumber_context_characters_charactersIgnoringModifiers_isARepeat_keyCode(
                kind,
                NSPoint::new(0.0, 0.0),
                flags,
                time,
                number,
                None,
                &chars,
                &chars,
                false,
                code,
            )
            .ok_or("AppKit made no key event.")
        };
        let down = event(NSEventType::KeyDown)?;
        view.keyDown(&down);
        // The page hears a shortcut, but the edit it stands for is the Edit
        // menu's, which acts only in the key window: done here instead, so it
        // works with the app behind others.
        if flags.contains(NSEventModifierFlags::Command) {
            let edit = match (chars.to_string().to_ascii_lowercase().as_str(), flags.contains(NSEventModifierFlags::Shift)) {
                ("a", _) => Some(sel!(selectAll:)),
                ("c", _) => Some(sel!(copy:)),
                ("x", _) => Some(sel!(cut:)),
                ("v", _) => Some(sel!(paste:)),
                ("z", false) => Some(sel!(undo:)),
                ("z", true) => Some(sel!(redo:)),
                _ => None,
            };
            if let Some(edit) = edit {
                // send() runs on the main thread (native_input).
                let app = NSApplication::sharedApplication(unsafe { MainThreadMarker::new_unchecked() });
                unsafe { app.sendAction_to_from(edit, Some(view), None) };
            }
        }
        let up = event(NSEventType::KeyUp)?;
        view.keyUp(&up);
        Ok(())
    }

    /// "Enter", "a", "shift+Tab", "cmd+a": the key code, its characters and the modifiers.
    fn combo(text: &str) -> Option<(u16, String, NSEventModifierFlags)> {
        let mut parts: Vec<&str> = text.split('+').collect();
        let name = parts.pop()?;
        let mut flags = NSEventModifierFlags::empty();
        for m in parts {
            flags |= match m.to_ascii_lowercase().as_str() {
                "ctrl" | "control" => NSEventModifierFlags::Control,
                "shift" => NSEventModifierFlags::Shift,
                "alt" | "option" => NSEventModifierFlags::Option,
                "cmd" | "command" | "meta" | "super" => NSEventModifierFlags::Command,
                _ => return None,
            };
        }
        let (code, chars) = super::key_of(name)?;
        Some((code, chars, flags))
    }
}

/// The key code and characters AppKit gives a key, by its name or its character.
fn key_of(name: &str) -> Option<(u16, String)> {
    let named = match name.to_ascii_lowercase().as_str() {
        "enter" | "return" => Some((36, "\r")),
        "tab" => Some((48, "\t")),
        "escape" | "esc" => Some((53, "\u{1b}")),
        "backspace" => Some((51, "\u{7f}")),
        "delete" => Some((117, "\u{f728}")),
        "space" => Some((49, " ")),
        "up" | "arrowup" => Some((126, "\u{f700}")),
        "down" | "arrowdown" => Some((125, "\u{f701}")),
        "left" | "arrowleft" => Some((123, "\u{f702}")),
        "right" | "arrowright" => Some((124, "\u{f703}")),
        "home" => Some((115, "\u{f729}")),
        "end" => Some((119, "\u{f72b}")),
        "pageup" => Some((116, "\u{f72c}")),
        "pagedown" => Some((121, "\u{f72d}")),
        _ => None,
    };
    if let Some((code, chars)) = named {
        return Some((code, chars.into()));
    }
    let mut it = name.chars();
    let c = it.next()?;
    it.next().is_none().then(|| (code_of(c), c.to_string()))
}

/// The key a character is on, on a US keyboard, by its position in this
/// string; 0 for one it has no key of its own for, which pages rarely read.
fn code_of(c: char) -> u16 {
    const KEYS: &str = "asdfhgzxcv\0bqweryt123465=97-80]ou[ip\rlj'k;\\,/nm.\t `";
    KEYS.chars().position(|k| k == c.to_ascii_lowercase()).map_or(0, |i| i as u16)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_have_their_macos_codes() {
        assert_eq!(key_of("Enter"), Some((36, "\r".into())));
        assert_eq!(key_of("a").map(|k| k.0), Some(0));
        assert_eq!(key_of("B").map(|k| k.0), Some(11));
        assert_eq!(key_of("m").map(|k| k.0), Some(46));
        assert_eq!(key_of("0").map(|k| k.0), Some(29));
        assert_eq!(key_of("`").map(|k| k.0), Some(50));
        assert_eq!(key_of("ArrowUp").map(|k| k.0), Some(126));
        assert_eq!(key_of("nope"), None);
    }

    #[test]
    fn only_web_pages_open() {
        assert!(web("https://example.com/a?b").is_ok());
        assert!(web("file:///etc/passwd").is_err());
        assert!(web("javascript:alert(1)").is_err());
    }
}
