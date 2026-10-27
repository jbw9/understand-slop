//! The preview: the project's running web app, in a workspace tab
//! (components/preview.tsx). The page is not framed from its dev server
//! directly. It is framed through a small proxy on its own port here, which
//! passes every request on and adds one script to each HTML page: the agent
//! (agent.js), which lets the app, and Claude through it (mcp.rs), read the
//! page and click, type and scroll in it. A page from another origin cannot be
//! reached into from the window around it any other way.
//!
//! The proxy is plain HTTP/1.1 over std, one request per connection: every
//! response says `Connection: close`, so nothing here has to follow a
//! keep-alive stream, and anything it does not change is copied through byte
//! for byte. A WebSocket (the dev server's hot reload) is tunnelled as it is.
//! The frame is served from `localhost` like the app itself, so the two are
//! the same site and the page keeps its cookies.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const AGENT: &str = include_str!("agent.js");

/// Where a preview's requests go: the dev server's host and port.
#[derive(Clone)]
struct Upstream {
    host: String,
    port: u16,
}

impl Upstream {
    /// `http://localhost:5173/x`, `localhost:5173`, `0.0.0.0:3000`. A server
    /// that says it listens everywhere is reached on the loopback.
    fn parse(target: &str) -> Option<Self> {
        let rest = target.trim().trim_start_matches("http://");
        let authority = rest.split(['/', '?', '#']).next()?;
        let (host, port) = match authority.strip_prefix('[') {
            Some(v6) => {
                let (h, p) = v6.split_once("]:")?;
                (h.to_string(), p)
            }
            None => {
                let (h, p) = authority.rsplit_once(':')?;
                (h.to_string(), p)
            }
        };
        let host = if host == "0.0.0.0" || host == "::" { "127.0.0.1".into() } else { host };
        Some(Self { host, port: port.parse().ok()? })
    }

    fn authority(&self) -> String {
        if self.host.contains(':') {
            format!("[{}]:{}", self.host, self.port)
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }

    fn origin(&self) -> String {
        format!("http://{}", self.authority())
    }
}

struct Proxy {
    port: u16,
    upstream: Arc<Mutex<Upstream>>,
    closed: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct Previews {
    next: AtomicU32,
    open: Mutex<HashMap<u32, Proxy>>,
}

impl Previews {
    pub fn close_all(&self) {
        for (_, p) in self.open.lock().unwrap().drain() {
            stop(&p);
        }
    }
}

fn stop(p: &Proxy) {
    p.closed.store(true, Ordering::Relaxed);
    // The accept loop is blocked; one connection wakes it to see the flag.
    let _ = TcpStream::connect(("127.0.0.1", p.port));
}

#[derive(serde::Serialize)]
pub struct Opened {
    id: u32,
    /// The proxy's port: the frame loads `http://localhost:{port}`.
    port: u16,
}

/// A proxy in front of `target`, on a port of its own.
#[tauri::command]
pub fn preview_open(target: String, previews: tauri::State<Previews>) -> Result<Opened, String> {
    let upstream = Upstream::parse(&target).ok_or_else(|| format!("Not an address the preview can open: {target}"))?;
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    // `localhost` may be looked up as ::1 first; the same port there too, if it is free.
    let v6 = TcpListener::bind(("::1", port)).ok();
    let upstream = Arc::new(Mutex::new(upstream));
    let closed = Arc::new(AtomicBool::new(false));
    for l in std::iter::once(listener).chain(v6) {
        let (upstream, closed) = (upstream.clone(), closed.clone());
        std::thread::spawn(move || {
            for conn in l.incoming() {
                if closed.load(Ordering::Relaxed) {
                    break;
                }
                let Ok(conn) = conn else { continue };
                let to = upstream.lock().unwrap().clone();
                std::thread::spawn(move || {
                    let _ = serve(conn, &to, port);
                });
            }
        });
    }
    let id = previews.next.fetch_add(1, Ordering::Relaxed) + 1;
    previews.open.lock().unwrap().insert(id, Proxy { port, upstream, closed });
    Ok(Opened { id, port })
}

/// Points a preview at another server, keeping its port: the frame's origin,
/// and so the page's storage, stay the same when a dev server restarts elsewhere.
#[tauri::command]
pub fn preview_target(id: u32, target: String, previews: tauri::State<Previews>) -> Result<(), String> {
    let upstream = Upstream::parse(&target).ok_or_else(|| format!("Not an address the preview can open: {target}"))?;
    let open = previews.open.lock().unwrap();
    let p = open.get(&id).ok_or("no such preview")?;
    *p.upstream.lock().unwrap() = upstream;
    Ok(())
}

#[tauri::command]
pub fn preview_close(id: u32, previews: tauri::State<Previews>) {
    if let Some(p) = previews.open.lock().unwrap().remove(&id) {
        stop(&p);
    }
}

/// The page in the user's own browser, from the preview's toolbar.
#[tauri::command]
pub fn preview_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only a web address opens in the browser.".into());
    }
    let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
    std::process::Command::new(opener).arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/* ── HTTP, as little of it as a proxy needs ───────────────────── */

pub(crate) struct Head {
    /// The request or status line.
    pub line: String,
    pub headers: Vec<(String, String)>,
}

impl Head {
    pub fn get(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).map(|(_, v)| v.as_str())
    }

    fn has_token(&self, name: &str, token: &str) -> bool {
        self.get(name).is_some_and(|v| v.split(',').any(|t| t.trim().eq_ignore_ascii_case(token)))
    }
}

/// A message's head: its first line and headers, up to the blank line.
pub(crate) fn read_head(r: &mut impl BufRead) -> std::io::Result<Head> {
    let mut line = String::new();
    if r.read_line(&mut line)? == 0 {
        return Err(std::io::ErrorKind::UnexpectedEof.into());
    }
    let mut headers = Vec::new();
    let mut size = line.len();
    loop {
        let mut h = String::new();
        if r.read_line(&mut h)? == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        size += h.len();
        if size > 64 * 1024 {
            return Err(std::io::Error::other("head too large"));
        }
        let h = h.trim_end_matches(['\r', '\n']);
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            headers.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    Ok(Head { line: line.trim_end().to_string(), headers })
}

/// A body as its head frames it: chunked, a length, or (`to_eof`) the rest of
/// the stream, which is how a response with neither ends.
pub(crate) fn read_body(r: &mut impl BufRead, head: &Head, to_eof: bool) -> std::io::Result<Vec<u8>> {
    let mut body = Vec::new();
    if head.has_token("transfer-encoding", "chunked") {
        loop {
            let mut size = String::new();
            r.read_line(&mut size)?;
            let n = usize::from_str_radix(size.trim().split(';').next().unwrap_or(""), 16)
                .map_err(|_| std::io::Error::other("bad chunk"))?;
            if n == 0 {
                // Trailers, then the blank line.
                loop {
                    let mut t = String::new();
                    if r.read_line(&mut t)? == 0 || t.trim().is_empty() {
                        break;
                    }
                }
                return Ok(body);
            }
            let at = body.len();
            body.resize(at + n, 0);
            r.read_exact(&mut body[at..])?;
            let mut crlf = [0u8; 2];
            r.read_exact(&mut crlf)?;
        }
    }
    if let Some(n) = head.get("content-length").and_then(|v| v.parse::<usize>().ok()) {
        body.resize(n, 0);
        r.read_exact(&mut body)?;
    } else if to_eof {
        r.read_to_end(&mut body)?;
    }
    Ok(body)
}

pub(crate) fn respond(w: &mut impl Write, status: &str, kind: &str, body: &[u8], extra: &[(&str, &str)]) -> std::io::Result<()> {
    let mut head = format!("HTTP/1.1 {status}\r\nContent-Type: {kind}\r\nContent-Length: {}\r\nConnection: close\r\n", body.len());
    for (k, v) in extra {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");
    w.write_all(head.as_bytes())?;
    w.write_all(body)?;
    w.flush()
}

/// Headers that belong to one hop, not to the message: each side of the proxy
/// sets its own.
fn hop(name: &str) -> bool {
    ["connection", "keep-alive", "proxy-connection", "te", "trailer", "upgrade", "transfer-encoding"]
        .iter()
        .any(|h| name.eq_ignore_ascii_case(h))
}

fn write_head(w: &mut impl Write, line: &str, headers: &[(String, String)]) -> std::io::Result<()> {
    let mut out = format!("{line}\r\n");
    for (k, v) in headers {
        out.push_str(&format!("{k}: {v}\r\n"));
    }
    out.push_str("\r\n");
    w.write_all(out.as_bytes())
}

/// One request from the frame, passed to the dev server and its answer back.
fn serve(client: TcpStream, to: &Upstream, port: u16) -> std::io::Result<()> {
    let mut from = BufReader::new(client.try_clone()?);
    let mut client = client;
    let req = read_head(&mut from)?;
    let here = format!("http://localhost:{port}");
    let there = to.origin();
    let swap = |v: &str| match v.strip_prefix(&here) {
        Some(rest) => format!("{there}{rest}"),
        None => v.to_string(),
    };

    let Ok(mut server) = TcpStream::connect((to.host.as_str(), to.port)) else {
        return respond(&mut client, "502 Bad Gateway", "text/html; charset=utf-8", waiting(&there).as_bytes(), &[]);
    };

    // The dev server sees itself asked for, by its own origin: Vite checks the
    // host, Next.js the origin of its own dev requests.
    let upgrade = req.has_token("connection", "upgrade") && req.get("upgrade").is_some();
    let mut headers: Vec<(String, String)> = req
        .headers
        .iter()
        .filter(|(k, _)| !k.eq_ignore_ascii_case("host") && !k.eq_ignore_ascii_case("accept-encoding") && (upgrade || !hop(k)))
        .map(|(k, v)| match k.to_ascii_lowercase().as_str() {
            "origin" | "referer" => (k.clone(), swap(v)),
            _ => (k.clone(), v.clone()),
        })
        .collect();
    headers.insert(0, ("Host".into(), to.authority()));

    if upgrade {
        // Hot reload: the handshake goes through as asked, then the two
        // streams are joined until either side hangs up.
        write_head(&mut server, &req.line, &headers)?;
        server.write_all(from.buffer())?;
        let mut up = server.try_clone()?;
        let mut down = client.try_clone()?;
        let mut inner = from.into_inner();
        let a = std::thread::spawn(move || {
            let _ = std::io::copy(&mut inner, &mut up);
            let _ = up.shutdown(Shutdown::Write);
        });
        let _ = std::io::copy(&mut server, &mut down);
        let _ = down.shutdown(Shutdown::Both);
        let _ = a.join();
        return Ok(());
    }

    let body = read_body(&mut from, &req, false)?;
    headers.push(("Accept-Encoding".into(), "identity".into()));
    headers.push(("Connection".into(), "close".into()));
    if !body.is_empty() || req.get("content-length").is_some() || req.has_token("transfer-encoding", "chunked") {
        headers.push(("Content-Length".into(), body.len().to_string()));
    }
    write_head(&mut server, &req.line, &headers)?;
    server.write_all(&body)?;
    server.flush()?;

    let mut back = BufReader::new(server);
    let res = read_head(&mut back)?;
    let ok = res.line.split_whitespace().nth(1) == Some("200");
    let html = res.get("content-type").is_some_and(|t| t.to_ascii_lowercase().starts_with("text/html"));
    let encoded = res.get("content-encoding").is_some_and(|e| !e.eq_ignore_ascii_case("identity"));
    let inject = req.line.starts_with("GET ") && ok && html && !encoded;

    // Framing is this proxy's when the page is rewritten; otherwise the
    // server's own, copied as it is. The frame may always be framed.
    let headers: Vec<(String, String)> = res
        .headers
        .iter()
        .filter(|(k, _)| {
            let k = k.to_ascii_lowercase();
            k != "x-frame-options"
                && k != "content-security-policy"
                && k != "connection"
                && k != "keep-alive"
                && !(inject && (k == "content-length" || k == "transfer-encoding"))
        })
        .map(|(k, v)| match k.to_ascii_lowercase().as_str() {
            "location" => (k.clone(), v.strip_prefix(&there).map_or_else(|| v.clone(), |rest| format!("{here}{rest}"))),
            _ => (k.clone(), v.clone()),
        })
        .chain(std::iter::once(("Connection".to_string(), "close".to_string())))
        .collect();

    if inject {
        let page = with_agent(&read_body(&mut back, &res, true)?);
        let mut headers = headers;
        headers.push(("Content-Length".into(), page.len().to_string()));
        headers.push(("Cache-Control".into(), "no-store".into()));
        write_head(&mut client, &res.line, &headers)?;
        client.write_all(&page)?;
    } else {
        write_head(&mut client, &res.line, &headers)?;
        client.write_all(back.buffer())?;
        let mut rest = back.into_inner();
        // Copied as it arrives, so a stream of events is not held back.
        let mut buf = [0u8; 16 * 1024];
        loop {
            match rest.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    client.write_all(&buf[..n])?;
                    client.flush()?;
                }
            }
        }
    }
    client.flush()?;
    let _ = client.shutdown(Shutdown::Both);
    Ok(())
}

/// The agent, first thing in the page's head, so it hears the page's own
/// console from the start.
fn with_agent(page: &[u8]) -> Vec<u8> {
    let script = format!("<script data-slop-agent>{AGENT}</script>");
    let lower = String::from_utf8_lossy(page).to_ascii_lowercase();
    let after_tag = |tag: &str| lower.find(tag).and_then(|at| lower[at..].find('>').map(|end| at + end + 1));
    let at = after_tag("<head").or_else(|| after_tag("<html")).or_else(|| after_tag("<!doctype")).unwrap_or(0);
    // `lower` is the same length as `page` only when the page was valid UTF-8;
    // anything else gets the script up front, where it still runs.
    let at = if lower.len() == page.len() { at } else { 0 };
    let mut out = Vec::with_capacity(page.len() + script.len());
    out.extend_from_slice(&page[..at]);
    out.extend_from_slice(script.as_bytes());
    out.extend_from_slice(&page[at..]);
    out
}

/// What the frame shows while the dev server is not answering: it tries again
/// every second, so a server that restarts comes back by itself.
fn waiting(origin: &str) -> String {
    format!(
        r#"<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="1"><title>Waiting</title><body style="font:13px ui-monospace,monospace;color:#6b7280;display:grid;place-items:center;height:100vh;margin:0">Waiting for {origin}…</body>"#
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_addresses_dev_servers_print() {
        let u = Upstream::parse("http://localhost:5173/").unwrap();
        assert_eq!((u.host.as_str(), u.port), ("localhost", 5173));
        assert_eq!(Upstream::parse("0.0.0.0:3000").unwrap().authority(), "127.0.0.1:3000");
        assert_eq!(Upstream::parse("http://[::1]:8080/x?y").unwrap().authority(), "[::1]:8080");
        assert!(Upstream::parse("http://localhost/").is_none());
    }

    #[test]
    fn the_agent_goes_first_in_the_head() {
        let page = with_agent(b"<!DOCTYPE html><html lang=en><HEAD><title>x</title></head></html>");
        let page = String::from_utf8(page).unwrap();
        assert!(page.starts_with("<!DOCTYPE html><html lang=en><HEAD><script data-slop-agent>"));
        assert!(page.ends_with("<title>x</title></head></html>"));
        // A fragment with no head still gets it.
        assert!(String::from_utf8(with_agent(b"<p>hi")).unwrap().starts_with("<script"));
    }

    /// A dev server that answers once, as told.
    fn server(reply: &'static [u8]) -> (u16, std::thread::JoinHandle<String>) {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        let t = std::thread::spawn(move || {
            let (s, _) = l.accept().unwrap();
            let mut r = BufReader::new(s.try_clone().unwrap());
            let head = read_head(&mut r).unwrap();
            let mut s = s;
            s.write_all(reply).unwrap();
            format!("{}\n{}", head.line, head.headers.iter().map(|(k, v)| format!("{k}: {v}")).collect::<Vec<_>>().join("\n"))
        });
        (port, t)
    }

    fn through(port: u16, request: &str) -> String {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let me = l.local_addr().unwrap().port();
        let mut c = TcpStream::connect(("127.0.0.1", me)).unwrap();
        let (conn, _) = l.accept().unwrap();
        let to = Upstream { host: "127.0.0.1".into(), port };
        let h = std::thread::spawn(move || serve(conn, &to, me).unwrap());
        c.write_all(request.replace("{me}", &me.to_string()).as_bytes()).unwrap();
        let mut out = String::new();
        c.read_to_string(&mut out).unwrap();
        h.join().unwrap();
        out
    }

    #[test]
    fn a_page_gets_the_agent_and_can_be_framed() {
        let (port, seen) = server(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nX-Frame-Options: DENY\r\nTransfer-Encoding: chunked\r\n\r\n6\r\n<head>\r\n7\r\n</head>\r\n0\r\n\r\n",
        );
        let out = through(port, "GET / HTTP/1.1\r\nHost: localhost:{me}\r\nOrigin: http://localhost:{me}\r\nAccept-Encoding: gzip\r\n\r\n");
        assert!(out.contains("<head><script data-slop-agent>"));
        assert!(out.ends_with("</head>"));
        assert!(!out.to_ascii_lowercase().contains("x-frame-options"));
        assert!(!out.to_ascii_lowercase().contains("chunked"));
        // The server was asked as itself, for plain bytes.
        let seen = seen.join().unwrap();
        assert!(seen.contains(&format!("Host: 127.0.0.1:{port}")));
        assert!(seen.contains(&format!("Origin: http://127.0.0.1:{port}")));
        assert!(seen.contains("Accept-Encoding: identity") && !seen.contains("gzip"));
    }

    #[test]
    fn everything_else_is_copied_through() {
        let (port, _) = server(b"HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:PORT/next\r\nContent-Length: 2\r\n\r\nok");
        let out = through(port, "GET /a.js HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(out.starts_with("HTTP/1.1 302 Found"));
        assert!(out.ends_with("\r\n\r\nok"));
        assert!(!out.contains("slop-agent"));
    }

    #[test]
    fn a_server_that_is_down_is_waited_for() {
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        drop(l);
        let out = through(port, "GET / HTTP/1.1\r\nHost: x\r\n\r\n");
        assert!(out.starts_with("HTTP/1.1 502"));
        assert!(out.contains("http-equiv=\"refresh\""));
    }
}
