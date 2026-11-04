//! Files a terminal names, opened in an editor tab (components/file-tab.tsx):
//! a path an agent printed, or the `[Image #N]` Claude Code shows for an
//! image pasted into it. Any file the user can read, not only the project's,
//! since agents point at other checkouts and at Claude's own temp folder.

use std::fs;
use std::path::{Path, PathBuf};

/// Where a reference printed in a terminal at `cwd` points, if it is a file.
#[tauri::command]
pub fn file_resolve(text: String, cwd: String, session: Option<String>) -> Option<String> {
    let found = match image_number(&text) {
        Some(n) => pasted_image(&cwd, session.as_deref(), n),
        None => {
            let p = match text.strip_prefix("~/") {
                Some(rest) => PathBuf::from(std::env::var_os("HOME")?).join(rest),
                None => Path::new(&cwd).join(&text),
            };
            p.is_file().then_some(p)
        }
    }?;
    Some(fs::canonicalize(&found).unwrap_or(found).to_string_lossy().into_owned())
}

fn image_number(text: &str) -> Option<u32> {
    text.strip_prefix("[Image #")?.strip_suffix(']')?.parse().ok()
}

/// Claude Code keeps a pasted image at `/tmp/claude-<uid>/<cwd, slugged>/<session>/images/<n>.<ext>`.
/// Without the session, the newest conversation in that folder that has image `n`.
fn pasted_image(cwd: &str, session: Option<&str>, n: u32) -> Option<PathBuf> {
    let slug: String = cwd.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for tmp in fs::read_dir("/tmp").ok()?.flatten() {
        if !tmp.file_name().to_string_lossy().starts_with("claude-") {
            continue;
        }
        let project = tmp.path().join(&slug);
        let sessions: Vec<PathBuf> = match session {
            Some(s) => vec![project.join(s)],
            None => fs::read_dir(&project).into_iter().flatten().flatten().map(|e| e.path()).collect(),
        };
        for dir in sessions {
            let Some(image) = image_in(&dir.join("images"), n) else { continue };
            let when = fs::metadata(&image).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            if best.as_ref().is_none_or(|(t, _)| when > *t) {
                best = Some((when, image));
            }
        }
    }
    best.map(|(_, p)| p)
}

fn image_in(dir: &Path, n: u32) -> Option<PathBuf> {
    let stem = n.to_string();
    fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| p.is_file() && p.file_stem().is_some_and(|s| s == stem.as_str()))
}

#[tauri::command]
pub fn file_read(path: String) -> Result<tauri::ipc::Response, String> {
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|e| e.to_string())
}

/// Writes `text` over the file, unless it changed on disk since it was read
/// as `expected`: the editor never overwrites what another program wrote.
#[tauri::command]
pub fn file_write(path: String, text: String, expected: String) -> Result<(), String> {
    let now = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if now != expected {
        return Err("stale".into());
    }
    fs::write(&path, text).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_relative_and_image_refs() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.sql"), "select 1").unwrap();
        let cwd = dir.path().to_string_lossy().into_owned();
        assert!(file_resolve("a.sql".into(), cwd.clone(), None).unwrap().ends_with("/a.sql"));
        assert_eq!(file_resolve("missing.sql".into(), cwd.clone(), None), None);
        assert_eq!(image_number("[Image #4]"), Some(4));
        assert_eq!(image_number("[Image #x]"), None);
    }
}
