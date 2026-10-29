//! Claude's hands on the preview. Every Claude tab is started with this
//! server in its MCP config (claude.rs), so it can look at the project's
//! running app and use it, the way the Chrome extension lets it use a browser:
//! screenshot, click, type, read the page, navigate, resize the viewport, read
//! the console. And on a phone simulator, through `device` (devices.rs).
//!
//! It is MCP's streamable HTTP transport in its simplest form: one JSON-RPC
//! message per POST, answered as plain JSON. The URL carries a secret, and the
//! tab the request came from, so each Claude drives its own project's
//! preview. The page does the work (components/preview.tsx, and the agent
//! inside the frame, agent.js): a call is handed to it as a `slop:preview`
//! event and waits for `preview_reply`. A screenshot is WebKit's own picture
//! of the frame's part of the window.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::BufReader;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::preview::{read_body, read_head, respond};

struct Server {
    port: u16,
    token: String,
}

static SERVER: OnceLock<Server> = OnceLock::new();

type Reply = Result<Value, String>;
static PENDING: OnceLock<Mutex<HashMap<u64, mpsc::Sender<Reply>>>> = OnceLock::new();
static NEXT: AtomicU64 = AtomicU64::new(1);
/// Claude sends a batch of actions at once, each on its own connection; taken
/// in turn, a click has landed before the typing after it looks for focus.
static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

fn pending() -> &'static Mutex<HashMap<u64, mpsc::Sender<Reply>>> {
    PENDING.get_or_init(Default::default)
}

/// 128 random bits, from the hasher std seeds from the OS.
fn secret() -> String {
    use std::hash::{BuildHasher, Hasher};
    let half = || std::collections::hash_map::RandomState::new().build_hasher().finish();
    format!("{:016x}{:016x}", half(), half())
}

pub fn start(app: AppHandle) {
    let Ok(listener) = TcpListener::bind(("127.0.0.1", 0)) else { return };
    let Ok(port) = listener.local_addr().map(|a| a.port()) else { return };
    let _ = SERVER.set(Server { port, token: secret() });
    std::thread::spawn(move || {
        for conn in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = handle(conn, &app);
            });
        }
    });
}

/// The `--mcp-config` for Claude in tab `tab`, once the server is up.
pub fn config(tab: u32) -> Option<String> {
    let s = SERVER.get()?;
    Some(
        json!({ "mcpServers": { "slop-preview": {
            "type": "http",
            "url": format!("http://127.0.0.1:{}/mcp/{}/{tab}", s.port, s.token)
        } } })
        .to_string(),
    )
}

fn handle(conn: TcpStream, app: &AppHandle) -> std::io::Result<()> {
    let s = SERVER.get().ok_or_else(|| std::io::Error::other("not started"))?;
    let mut r = BufReader::new(conn.try_clone()?);
    let mut w = conn;
    let head = read_head(&mut r)?;
    // Only ever addressed as itself: a page that rebinds a name to the loopback is turned away.
    let host = head.get("host").unwrap_or("");
    if host != format!("127.0.0.1:{}", s.port) && host != format!("localhost:{}", s.port) {
        return respond(&mut w, "403 Forbidden", "text/plain", b"", &[]);
    }
    let mut line = head.line.split_whitespace();
    let (method, path) = (line.next().unwrap_or(""), line.next().unwrap_or(""));
    let tab = path
        .strip_prefix("/mcp/")
        .and_then(|rest| rest.split_once('/'))
        .filter(|(token, _)| *token == s.token)
        .and_then(|(_, tab)| tab.parse::<u32>().ok());
    let Some(tab) = tab else {
        return respond(&mut w, "404 Not Found", "text/plain", b"", &[]);
    };
    if method != "POST" {
        // No stream of server-sent messages: this server only ever answers.
        return respond(&mut w, "405 Method Not Allowed", "text/plain", b"", &[("Allow", "POST")]);
    }
    let body = read_body(&mut r, &head, false)?;
    let Ok(msg) = serde_json::from_slice::<Value>(&body) else {
        let e = json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } });
        return respond(&mut w, "400 Bad Request", "application/json", e.to_string().as_bytes(), &[]);
    };
    let out = match &msg {
        Value::Array(all) => {
            let replies: Vec<Value> = all.iter().filter_map(|m| rpc(m, tab, app)).collect();
            (!replies.is_empty()).then(|| Value::Array(replies))
        }
        m => rpc(m, tab, app),
    };
    match out {
        Some(v) => respond(&mut w, "200 OK", "application/json", v.to_string().as_bytes(), &[]),
        None => respond(&mut w, "202 Accepted", "text/plain", b"", &[]),
    }
}

const INSTRUCTIONS: &str = "These tools use the Preview tab in Mira: the user's project, \
running as a web app beside you, exactly as the user sees it, and any page on the web. Use them \
to check that what you built works: take a screenshot, then click, type and read the page, as \
you would in a browser. They are your browser here: to look something up or read a page on \
the web, navigate the preview there (an address, or words to search for) instead of opening \
another browser, so the user sees it beside you. `device` does the same on an iOS Simulator or \
Android emulator running in the app.";

/// One JSON-RPC message; nothing back for a notification.
fn rpc(msg: &Value, tab: u32, app: &AppHandle) -> Option<Value> {
    let id = msg.get("id")?.clone();
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    let result = match msg.get("method").and_then(Value::as_str).unwrap_or("") {
        "initialize" => Ok(json!({
            "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or("2025-06-18"),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "mira", "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            let _turn = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
            Ok(match call(name, &args, tab, app) {
                Ok(content) => json!({ "content": content }),
                Err(e) => json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
            })
        }
        _ => Err(json!({ "code": -32601, "message": "Method not found" })),
    };
    Some(match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err(e) => json!({ "jsonrpc": "2.0", "id": id, "error": e }),
    })
}

fn text(t: impl Into<String>) -> Vec<Value> {
    vec![json!({ "type": "text", "text": t.into() })]
}

fn said(v: Value) -> Vec<Value> {
    text(match v {
        Value::String(s) => s,
        v => v.to_string(),
    })
}

fn call(name: &str, args: &Value, tab: u32, app: &AppHandle) -> Result<Vec<Value>, String> {
    match name {
        "computer" if args.get("action").and_then(Value::as_str) == Some("screenshot") => screenshot(tab, app),
        "computer" | "read_page" | "find" | "form_input" | "get_page_text" | "javascript" => {
            ask(app, tab, json!({ "op": "agent", "name": name, "args": args })).map(said)
        }
        "navigate" => ask(app, tab, json!({ "op": "navigate", "url": args.get("url") })).map(said),
        "resize_preview" => ask(app, tab, json!({ "op": "resize", "args": args })).map(said),
        "read_console_messages" => ask(app, tab, json!({ "op": "console", "args": args })).map(said),
        "device" => crate::devices::tool(args, app),
        _ => Err(format!("No tool called {name}.")),
    }
}

/// Hands a call to the page and waits for its answer.
fn ask(app: &AppHandle, tab: u32, cmd: Value) -> Reply {
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    pending().lock().unwrap().insert(id, tx);
    let sent = app.emit_to("main", "slop:preview", json!({ "id": id, "tab": tab, "cmd": cmd }));
    let out = match sent {
        Ok(()) => rx
            .recv_timeout(Duration::from_secs(60))
            .unwrap_or_else(|_| Err("The preview did not answer within a minute.".into())),
        Err(e) => Err(e.to_string()),
    };
    pending().lock().unwrap().remove(&id);
    out
}

/// The page's answer to `ask`.
#[tauri::command]
pub fn preview_reply(id: u64, ok: bool, value: Value) {
    if let Some(tx) = pending().lock().unwrap().remove(&id) {
        let _ = tx.send(if ok {
            Ok(value)
        } else {
            Err(value.as_str().map_or_else(|| value.to_string(), String::from))
        });
    }
}

/// Where the frame is in the window, and how big its viewport is.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
struct Frame {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    dpr: f64,
    url: String,
    /// A page from the web has a webview of its own (browser.rs).
    view: Option<String>,
}

fn screenshot(tab: u32, app: &AppHandle) -> Result<Vec<Value>, String> {
    let frame: Frame = serde_json::from_value(ask(app, tab, json!({ "op": "frame" }))?).map_err(|e| e.to_string())?;
    // Asked for at the viewport's own size in pixels, so a point in the
    // picture is a point to click.
    let png = snapshot(app, &frame, frame.viewport_width / frame.dpr.max(1.0))?;
    let (w, h) = png_size(&png).unwrap_or((0, 0));
    let mut note = format!(
        "{} — viewport {}×{}.",
        frame.url, frame.viewport_width as u32, frame.viewport_height as u32
    );
    if w != frame.viewport_width as u32 && w > 0 {
        note.push_str(&format!(
            " The screenshot is {w}×{h} pixels: scale its coordinates by {:.3} before clicking.",
            frame.viewport_width / w as f64
        ));
    }
    Ok(vec![
        json!({ "type": "image", "data": base64(&png), "mimeType": "image/png" }),
        json!({ "type": "text", "text": note }),
    ])
}

#[cfg(target_os = "macos")]
fn snapshot(app: &AppHandle, frame: &Frame, points: f64) -> Result<Vec<u8>, String> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError, NSNumber, NSPoint, NSRect, NSSize};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
    use tauri::Manager;

    let own = frame.view.is_some();
    let view = app.get_webview(frame.view.as_deref().unwrap_or("main")).ok_or("The window is gone.")?;
    let (tx, rx) = mpsc::channel::<Option<Vec<u8>>>();
    let rect = NSRect::new(NSPoint::new(frame.x, frame.y), NSSize::new(frame.width, frame.height));
    view
        .with_webview(move |webview| unsafe {
            let view = &*(webview.inner() as *const WKWebView);
            // This closure runs on the main thread: Tauri's promise.
            let config = WKSnapshotConfiguration::new(objc2::MainThreadMarker::new_unchecked());
            // A page in its own webview is the whole of it.
            if !own {
                config.setRect(rect);
            }
            config.setSnapshotWidth(Some(&NSNumber::new_f64(points)));
            let tx = tx.clone();
            let done = block2::RcBlock::new(move |image: *mut NSImage, _: *mut NSError| {
                let png = image.as_ref().and_then(|image| {
                    let tiff = image.TIFFRepresentation()?;
                    let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
                    let png = rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())?;
                    Some(png.to_vec())
                });
                let _ = tx.send(png);
            });
            view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &done);
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(10))
        .ok()
        .flatten()
        .ok_or_else(|| "The screenshot did not come back.".into())
}

#[cfg(not(target_os = "macos"))]
fn snapshot(_: &AppHandle, _: &Frame, _: f64) -> Result<Vec<u8>, String> {
    Err("Screenshots of the preview are only taken on macOS so far: read_page and get_page_text show what is on it.".into())
}

/// A PNG's width and height, from its header.
pub(crate) fn png_size(png: &[u8]) -> Option<(u32, u32)> {
    let w = png.get(16..20)?;
    let h = png.get(20..24)?;
    Some((u32::from_be_bytes(w.try_into().ok()?), u32::from_be_bytes(h.try_into().ok()?)))
}

pub(crate) fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for c in bytes.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= c.len() {
                out.push(T[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

fn tools() -> Value {
    json!([
        {
            "name": "computer",
            "description": "Use the page in the Preview tab with a mouse and keyboard, as a person would: on macOS these are real clicks and keystrokes, so anything a person can click works, and your pointer is drawn where you act for the user to follow. Coordinates are CSS pixels in the preview's viewport, which are the screenshot's pixels (its reply says when they are not). Take a screenshot to see the page, and another after acting to see what changed. A ref from read_page or find can stand in for a coordinate. `type` types into whatever has focus, so click the field first; `key` presses keys, space-separated, like \"Enter\", \"Tab Tab\", \"ctrl+a\" or \"shift+Tab\".",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "action": { "type": "string", "enum": ["screenshot", "left_click", "right_click", "double_click", "triple_click", "hover", "type", "key", "scroll", "scroll_to", "left_click_drag", "wait"] },
                    "coordinate": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": "[x, y]: where to click, hover or scroll; the end of a drag." },
                    "start_coordinate": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": "[x, y]: where a drag starts." },
                    "ref": { "type": "string", "description": "An element's ref from read_page or find, instead of a coordinate." },
                    "text": { "type": "string", "description": "What to type, or the keys to press." },
                    "scroll_direction": { "type": "string", "enum": ["up", "down", "left", "right"] },
                    "scroll_amount": { "type": "number", "description": "How far to scroll, in steps of about 100px. Default 3." },
                    "duration": { "type": "number", "description": "Seconds to wait, at most 10." }
                },
                "required": ["action"]
            }
        },
        {
            "name": "read_page",
            "description": "The preview's page as a tree: each element's role and name, field values, and a ref for everything that can be clicked or typed into. filter \"interactive\" lists only those; ref reads one part of the page.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filter": { "type": "string", "enum": ["all", "interactive"] },
                    "ref": { "type": "string" }
                }
            }
        },
        {
            "name": "find",
            "description": "Elements in the preview matching a CSS selector, or text in their label, name or visible text, with their refs and where they are.",
            "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] }
        },
        {
            "name": "form_input",
            "description": "Sets a form field by ref: text for an input or textarea, an option's value or label for a select, true or false for a checkbox.",
            "inputSchema": {
                "type": "object",
                "properties": { "ref": { "type": "string" }, "value": { "type": ["string", "boolean", "number"] } },
                "required": ["ref", "value"]
            }
        },
        {
            "name": "get_page_text",
            "description": "The preview page's visible text, with its title and URL.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "navigate",
            "description": "Opens something in the preview: a path on the dev server (\"/settings\"), a full URL on this machine (another server, which the preview then follows), any page on the web (\"https://react.dev\", \"docs.rs/serde\"), words to search the web for (\"vite proxy websocket\"), or \"back\", \"forward\" or \"reload\".",
            "inputSchema": { "type": "object", "properties": { "url": { "type": "string" } }, "required": ["url"] }
        },
        {
            "name": "resize_preview",
            "description": "Resizes the preview's viewport, as the user can by dragging its edges: width and height in CSS pixels, or a preset — mobile (390×844), tablet (820×1180), laptop (1280×800), desktop (1440×900), or fill (the whole tab). Use it to check a layout at a breakpoint.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "width": { "type": "number" },
                    "height": { "type": "number" },
                    "preset": { "type": "string", "enum": ["mobile", "tablet", "laptop", "desktop", "fill"] }
                }
            }
        },
        {
            "name": "javascript",
            "description": "Runs JavaScript in the previewed page and returns the result: an expression, or the body of an async function (with return).",
            "inputSchema": { "type": "object", "properties": { "code": { "type": "string" } }, "required": ["code"] }
        },
        {
            "name": "read_console_messages",
            "description": "What the previewed page logged: console messages and uncaught errors, oldest first. pattern is a regex to filter by; only_errors keeps errors; clear empties the log after reading.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "pattern": { "type": "string" },
                    "only_errors": { "type": "boolean" },
                    "clear": { "type": "boolean" },
                    "limit": { "type": "number" }
                }
            }
        },
        {
            "name": "device",
            "description": "Uses the iOS Simulator or Android emulator running in the app's iOS or Android tab: screenshot, tap, swipe, type text, press a key (home, back, enter, delete). Coordinates are the screenshot's pixels. The user starts the device from its tab; this tool only uses one that is already running.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "platform": { "type": "string", "enum": ["ios", "android"], "description": "Which device, when both are running." },
                    "action": { "type": "string", "enum": ["screenshot", "tap", "swipe", "type", "key"] },
                    "coordinate": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
                    "to": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2, "description": "Where a swipe ends." },
                    "text": { "type": "string", "description": "Text to type, or a key: home, back, enter, delete." }
                },
                "required": ["action"]
            }
        }
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_the_standard() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn reads_a_png_size() {
        let mut png = vec![0u8; 24];
        png[16..20].copy_from_slice(&390u32.to_be_bytes());
        png[20..24].copy_from_slice(&844u32.to_be_bytes());
        assert_eq!(png_size(&png), Some((390, 844)));
    }
}
