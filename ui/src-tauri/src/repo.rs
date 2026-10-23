//! The only door to the real repository — what `app/api/source` was before
//! the desktop app. `file` arrives from the webview, so it is assumed hostile:
//! `contain` is the whole security model and neither command is allowed its
//! own version of it. Refusals are plain strings ("outside repo", "not a
//! file", "stale"); a path that is missing and one that is out of bounds get
//! the same answer, so probing learns nothing about the filesystem.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The mapped repository, canonical, once `open_repo` has found it.
#[derive(Default)]
pub struct Repo(pub Mutex<Option<PathBuf>>);

impl Repo {
    pub fn root(&self) -> Result<PathBuf, String> {
        self.0.lock().unwrap().clone().ok_or_else(|| "no repo".into())
    }
}

#[derive(Serialize)]
pub struct Slice {
    file: String,
    start: usize,
    end: usize,
    code: String,
    total: usize,
}

#[derive(Serialize)]
pub struct Written {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    refused: Option<&'static str>,
}

/// Where the repo named `name` lives: `SLOP_REPO_ROOT`, else
/// `~/Desktop/Code/<name>` — the same rule the Node version used.
fn locate(name: &str) -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("SLOP_REPO_ROOT") {
        return Some(PathBuf::from(p));
    }
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?;
    Some(Path::new(&home).join("Desktop/Code").join(name))
}

/// Bind the app to the repo the map describes. Returns its absolute path.
#[tauri::command]
pub fn open_repo(name: String, repo: tauri::State<Repo>) -> Result<String, String> {
    let root = locate(&name)
        .and_then(|p| fs::canonicalize(p).ok())
        .filter(|p| p.is_dir())
        .ok_or("repo not found")?;
    let shown = root.to_string_lossy().into_owned();
    *repo.0.lock().unwrap() = Some(root);
    Ok(shown)
}

/// `file` resolved under `root`, or None if it escapes.
///
/// 1. Joining and normalising `..` textually stops `../../../etc/passwd`;
///    an absolute `file` replaces the base in `join`, and is then caught by
///    the same prefix test rather than silently honoured.
/// 2. The prefix test is per path component, so `explorify-secrets` is not
///    inside `explorify`.
/// 3. `canonicalize` resolves symlinks and the test runs AGAIN: string
///    arithmetic can't see a link inside the repo pointing out of it.
fn contain(root: &Path, file: &str) -> Option<PathBuf> {
    let mut target = PathBuf::new();
    for part in root.join(file).components() {
        match part {
            std::path::Component::ParentDir => {
                target.pop();
            }
            std::path::Component::CurDir => {}
            p => target.push(p),
        }
    }
    if !target.starts_with(root) {
        return None;
    }
    // A path that doesn't exist is a refusal, not an error: nothing to read
    // and nothing to write.
    let real = fs::canonicalize(&target).ok()?;
    real.starts_with(root).then_some(real)
}

fn read_lines(real: &Path) -> Result<Vec<String>, &'static str> {
    if !real.is_file() {
        return Err("not a file");
    }
    let text = fs::read_to_string(real).map_err(|_| "unreadable")?;
    Ok(text.split('\n').map(str::to_owned).collect())
}

pub fn read(root: &Path, file: &str, start: usize, end: usize) -> Result<Slice, &'static str> {
    let real = contain(root, file).ok_or("outside repo")?;
    let lines = read_lines(&real)?;
    let start = start.max(1);
    let end = lines.len().min(end.max(start));
    let code = lines.get(start - 1..end).unwrap_or_default().join("\n");
    Ok(Slice { file: file.into(), start, end, code, total: lines.len() })
}

/// Replace lines [start, end] of `file` with `code` — only if they still read
/// `expected`. Read, compare and write happen in this one call, so a save
/// built on a stale read can't slip in between the check and the write. The
/// write is a temp file and a rename, so the file is never seen half-written.
pub fn write(
    root: &Path,
    file: &str,
    start: usize,
    end: usize,
    code: &str,
    expected: &str,
) -> Result<(), &'static str> {
    let real = contain(root, file).ok_or("outside repo")?;
    let lines = read_lines(&real)?;
    if start < 1 || end > lines.len() || end < start {
        return Err("stale");
    }
    if lines[start - 1..end].join("\n") != expected {
        return Err("stale");
    }
    let code = code.strip_suffix('\n').unwrap_or(code);
    let mut next: Vec<&str> = lines[..start - 1].iter().map(String::as_str).collect();
    next.extend(code.split('\n'));
    next.extend(lines[end..].iter().map(String::as_str));

    let name = real.file_name().ok_or("not a file")?.to_string_lossy();
    let tmp = real.with_file_name(format!(".{name}.slop-{}", std::process::id()));
    let perms = fs::metadata(&real).map_err(|_| "unreadable")?.permissions();
    fs::write(&tmp, next.join("\n")).map_err(|_| "unwritable")?;
    let _ = fs::set_permissions(&tmp, perms);
    fs::rename(&tmp, &real).map_err(|_| {
        let _ = fs::remove_file(&tmp);
        "unwritable"
    })
}

#[tauri::command]
pub fn read_slice(
    file: String,
    start: usize,
    end: usize,
    repo: tauri::State<Repo>,
) -> Result<Slice, String> {
    read(&repo.root()?, &file, start, end).map_err(Into::into)
}

#[tauri::command]
pub fn write_slice(
    file: String,
    start: usize,
    end: usize,
    code: String,
    expected: String,
    repo: tauri::State<Repo>,
) -> Result<Written, String> {
    let root = repo.root()?;
    Ok(match write(&root, &file, start, end, &code, &expected) {
        Ok(()) => Written { ok: true, refused: None },
        Err(why) => Written { ok: false, refused: Some(why) },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repo() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("explorify");
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/a.ts"), "one\ntwo\nthree\n").unwrap();
        fs::create_dir_all(dir.path().join("explorify-secrets")).unwrap();
        fs::write(dir.path().join("explorify-secrets/key"), "secret").unwrap();
        let root = fs::canonicalize(root).unwrap();
        (dir, root)
    }

    #[test]
    fn reads_a_slice() {
        let (_d, root) = repo();
        let s = read(&root, "src/a.ts", 2, 3).unwrap();
        assert_eq!(s.code, "two\nthree");
        assert_eq!(s.total, 4);
    }

    #[test]
    fn refuses_escapes() {
        let (_d, root) = repo();
        for bad in ["../../../etc/passwd", "/etc/passwd", "../explorify-secrets/key", "src/../../explorify-secrets/key", "nope.ts"] {
            assert_eq!(read(&root, bad, 1, 1).err(), Some("outside repo"), "{bad}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink_out() {
        let (d, root) = repo();
        std::os::unix::fs::symlink(d.path().join("explorify-secrets/key"), root.join("link")).unwrap();
        assert_eq!(read(&root, "link", 1, 1).err(), Some("outside repo"));
    }

    #[test]
    fn writes_when_fresh_and_refuses_when_stale() {
        let (_d, root) = repo();
        write(&root, "src/a.ts", 2, 2, "TWO\n", "two").unwrap();
        assert_eq!(fs::read_to_string(root.join("src/a.ts")).unwrap(), "one\nTWO\nthree\n");
        assert_eq!(write(&root, "src/a.ts", 2, 2, "2", "two"), Err("stale"));
        assert_eq!(fs::read_to_string(root.join("src/a.ts")).unwrap(), "one\nTWO\nthree\n");
    }
}
