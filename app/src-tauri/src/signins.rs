//! Sign-ins the preview keeps for pages from the web (browser.rs): a site the
//! user signed in to once opens signed in from then on, as in a browser. What
//! is kept is the site's own cookies, in WebKit's store; never a password,
//! which the user types into the page themselves (agent.js refuses to).
//!
//! There are two kinds of store. The shared one is WebKit's default, which
//! every project's preview uses, so a sign-in kept there (Instagram, YouTube)
//! works in all of them. And each project has one of its own, named by its
//! folder, for a sign-in the user keeps to that project only. Which sites go
//! in a project's store is listed in `sign-ins.json` in the app's data folder,
//! along with the shared ones, for settings to list: site names, nothing else.
//!
//! A project's store needs macOS 14; before that WebKit has only the shared one.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, Url, WebviewBuilder, WebviewUrl};

#[derive(Default, Serialize, Deserialize)]
pub struct Kept {
    #[serde(default)]
    global: Vec<String>,
    /// By project folder.
    #[serde(default)]
    projects: BTreeMap<String, Vec<String>>,
}

static FILE: Mutex<()> = Mutex::new(());
static NEXT: AtomicU32 = AtomicU32::new(1);

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join("sign-ins.json")).map_err(|e| e.to_string())
}

fn read(app: &AppHandle) -> Kept {
    path(app)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn write(app: &AppHandle, kept: &Kept) -> Result<(), String> {
    let p = path(app)?;
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, serde_json::to_vec_pretty(kept).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

/// A site as it is kept: `www.instagram.com` is `instagram.com`.
fn site_of(host: &str) -> String {
    host.trim_start_matches('.').trim_start_matches("www.").to_ascii_lowercase()
}

/// Whether a host is the site or one of its subdomains.
fn covers(site: &str, host: &str) -> bool {
    let host = site_of(host);
    host == site || host.ends_with(&format!(".{site}"))
}

/// A project's store, named by its folder: the same folder, the same store.
/// FNV-1a over 128 bits, marked as a UUID.
pub fn store_of(root: &str) -> [u8; 16] {
    let mut h: u128 = 0x6c62272e07bb014262b821756295c58d;
    for b in root.bytes() {
        h ^= b as u128;
        h = h.wrapping_mul(0x0000000001000000000000000000013B);
    }
    let mut id = h.to_be_bytes();
    id[6] = (id[6] & 0x0f) | 0x80;
    id[8] = (id[8] & 0x3f) | 0x80;
    id
}

/// Whether a page opens in the project's own store rather than the shared one.
#[tauri::command]
pub fn signin_project(app: AppHandle, root: String, url: String) -> bool {
    let Some(host) = Url::parse(&url).ok().and_then(|u| u.host_str().map(String::from)) else { return false };
    read(&app).projects.get(&root).is_some_and(|sites| sites.iter().any(|s| covers(s, &host)))
}

/// Keeps a site's sign-in for all projects, or for `root` only.
#[tauri::command]
pub fn signin_keep(app: AppHandle, root: String, site: String, project: bool) -> Result<(), String> {
    let _lock = FILE.lock().unwrap_or_else(|e| e.into_inner());
    let site = site_of(&site);
    let mut kept = read(&app);
    kept.global.retain(|s| *s != site);
    let mine = kept.projects.entry(root.clone()).or_default();
    mine.retain(|s| *s != site);
    if project {
        mine.push(site);
        mine.sort();
    } else {
        if mine.is_empty() {
            kept.projects.remove(&root);
        }
        kept.global.push(site);
        kept.global.sort();
    }
    write(&app, &kept)
}

#[tauri::command]
pub fn signin_list(app: AppHandle) -> Kept {
    read(&app)
}

/// Signs out of a site: its cookies are deleted from the store it was kept
/// in (the shared one when `root` is none), and it is no longer listed. A
/// project left with no sign-ins has its store removed.
#[tauri::command]
pub async fn signin_forget(app: AppHandle, root: Option<String>, site: String) -> Result<(), String> {
    let site = site_of(&site);
    clear(&app, root.as_deref().map(store_of), &site)?;
    let emptied = {
        let _lock = FILE.lock().unwrap_or_else(|e| e.into_inner());
        let mut kept = read(&app);
        let mut emptied = false;
        match &root {
            None => kept.global.retain(|s| *s != site),
            Some(r) => {
                if let Some(mine) = kept.projects.get_mut(r) {
                    mine.retain(|s| *s != site);
                    emptied = mine.is_empty();
                }
                if emptied {
                    kept.projects.remove(r);
                }
            }
        }
        write(&app, &kept)?;
        emptied
    };
    #[cfg(target_vendor = "apple")]
    if let (true, Some(r)) = (emptied, &root) {
        // Fails while a preview still has a page open in it; its cookies are gone either way.
        let _ = app.remove_data_store(store_of(r)).await;
    }
    #[cfg(not(target_vendor = "apple"))]
    let _ = emptied;
    Ok(())
}

/// A site's cookies deleted from a store, through a webview of that store
/// that nobody sees: a store is reached only through a webview of it.
fn clear(app: &AppHandle, store: Option<[u8; 16]>, site: &str) -> Result<(), String> {
    let window = app.get_window("main").ok_or("The window is gone.")?;
    let label = format!("forget-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let blank = Url::parse("about:blank").map_err(|e| e.to_string())?;
    let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(blank));
    if let Some(id) = store {
        builder = builder.data_store_identifier(id);
    }
    let view = window
        .add_child(builder, LogicalPosition::new(0.0, 0.0), LogicalSize::new(1.0, 1.0))
        .map_err(|e| e.to_string())?;
    let _ = view.hide();
    let out = view.cookies().map_err(|e| e.to_string()).map(|all| {
        for c in all {
            if c.domain().is_some_and(|d| covers(site, d)) {
                let _ = view.delete_cookie(c);
            }
        }
    });
    let _ = view.close();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_site_covers_its_subdomains_only() {
        assert!(covers("instagram.com", "www.instagram.com"));
        assert!(covers("instagram.com", ".instagram.com"));
        assert!(covers("instagram.com", "i.instagram.com"));
        assert!(!covers("instagram.com", "notinstagram.com"));
        assert!(!covers("instagram.com", "instagram.com.evil.io"));
    }

    #[test]
    fn a_folder_names_one_store() {
        assert_eq!(store_of("/a/b"), store_of("/a/b"));
        assert_ne!(store_of("/a/b"), store_of("/a/c"));
        assert_eq!(store_of("/a/b")[6] >> 4, 8);
    }
}
