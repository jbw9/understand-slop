//! Claude Code in the workspace's tabs. Every tab is the user's shell on a
//! pty (pty.rs); a new one starts their own `claude` in it first, so it looks
//! and behaves exactly as it does in their terminal, and quitting Claude leaves
//! the shell behind. What this module adds is finding that binary, and the
//! launcher that lets the map hand it context.
//!
//! The launcher is a small script, `slop-claude`, on each tab's PATH. It runs
//! the user's `claude` with `--settings` carrying a `UserPromptSubmit` hook,
//! and while it runs it keeps a `.live` marker beside the tab's queue: that is
//! how the UI knows Claude is in front in a tab, and able to take context.
//! `--settings` adds to the user's own settings, so their login, hooks, MCP
//! servers, theme and status line all still apply.
//!
//! The hand-off is a file. Each tab has its own queue under the temp dir,
//! named in `$SLOP_CONTEXT`. Picking on the map appends a block to it —
//! `[Map section: …]` for a whole section, `[Map element: …]` for one thing on
//! a level — and the hook drains it on the next prompt: whatever a prompt hook
//! prints is added to that prompt's context. The file being gone is how the
//! UI knows a pick was delivered (components/workspace.tsx shows it).

use portable_pty::CommandBuilder;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Drains the queue: the `mv` is atomic, so a pick appended while Claude reads
/// lands in a fresh file for the next prompt rather than being lost.
const HOOK: &str = r#"f="$SLOP_CONTEXT"; [ -s "$f" ] || exit 0; mv "$f" "$f.sent" && cat "$f.sent""#;

const SYSTEM: &str = "This session was opened from understand-slop, an app that maps this \
repository as a tree of sections (user journey, data flow, the code behind each). The user \
can attach things they picked on the map: a whole section arrives as a block starting with \
`[Map section:`, one element of a section (a row, a diagram box, a step, a line of code) as \
one starting with `[Map element:`. Each names where it sits on the map, what it says, and \
the code behind it. Treat what is attached as what the user is asking about, and read the \
listed code when it is relevant. Do not edit files unless asked.";

#[derive(serde::Deserialize)]
pub struct Launch {
    path: String,
    model: Option<String>,
}

/// Runs Claude with the hook, and marks the tab live while it does. The marker
/// goes on any exit — a quit, a crash, Ctrl+C — and the script's status is
/// Claude's.
const LAUNCHER: &str = r#"#!/bin/sh
# Claude Code with understand-slop's map-context hook (src-tauri/src/claude.rs).
trap 'rm -f "$SLOP_CONTEXT.live"' EXIT INT TERM HUP
: > "$SLOP_CONTEXT.live"
"$SLOP_CLAUDE_BIN" --settings "$SLOP_CLAUDE_SETTINGS" --append-system-prompt "$SLOP_CLAUDE_SYSTEM" ${SLOP_CLAUDE_MODEL:+--model "$SLOP_CLAUDE_MODEL"} "$@"
"#;

#[derive(serde::Serialize)]
pub struct Detected {
    path: String,
    version: Option<String>,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(Into::into)
}

fn expand(p: &str, home: Option<&Path>) -> PathBuf {
    match (p.strip_prefix("~/"), home) {
        (Some(rest), Some(h)) => h.join(rest),
        _ => PathBuf::from(p),
    }
}

/// Where the installers put it. An app started from the desktop has no shell
/// PATH, so these are checked before asking a login shell.
fn candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(h) = home {
        out.push(h.join(".local/bin/claude"));
        out.push(h.join(".claude/local/claude"));
    }
    out.push("/opt/homebrew/bin/claude".into());
    out.push("/usr/local/bin/claude".into());
    out
}

fn find(configured: Option<&str>, home: Option<&Path>) -> Option<PathBuf> {
    if let Some(c) = configured.map(str::trim).filter(|c| !c.is_empty()) {
        let p = expand(c, home);
        return p.is_file().then_some(p);
    }
    if let Some(p) = candidates(home).into_iter().find(|p| p.is_file()) {
        return Some(p);
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = Command::new(shell).args(["-lc", "command -v claude"]).output().ok()?;
    let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    p.is_file().then_some(p)
}

/// The configured path if it exists, else wherever Claude Code is installed.
/// Async so the login-shell lookup never blocks the window.
#[tauri::command]
pub async fn claude_detect(configured: Option<String>) -> Option<Detected> {
    let path = find(configured.as_deref(), home().as_deref())?;
    let version = Command::new(&path)
        .arg("--version")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|v| !v.is_empty());
    Some(Detected { path: path.to_string_lossy().into_owned(), version })
}

/// This tab's queue. Not created here: the first pick creates it, and the hook
/// removes it each time it delivers.
pub fn queue(id: u32) -> PathBuf {
    std::env::temp_dir()
        .join("understand-slop")
        .join(format!("context-{}-{id}.md", std::process::id()))
}

pub fn forget(queue: &Path) {
    let _ = std::fs::remove_file(queue);
    let _ = std::fs::remove_file(queue.with_extension("md.sent"));
    let _ = std::fs::remove_file(live(queue));
}

/// Present while the launcher's Claude runs in the tab that owns `queue`.
fn live(queue: &Path) -> PathBuf {
    queue.with_extension("md.live")
}

pub fn running(queue: &Path) -> bool {
    live(queue).exists()
}

/// The launcher, written where every tab's PATH can find it. Rewritten only
/// when it differs, so an upgrade of the app replaces an old one.
fn launcher() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("understand-slop").join("bin");
    let path = dir.join("slop-claude");
    if std::fs::read_to_string(&path).ok().as_deref() != Some(LAUNCHER) {
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&path, LAUNCHER)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
        }
    }
    Ok(path)
}

/// What a tab's shell needs so that the launcher works in it: the user's
/// `claude`, the hook, the system prompt, and the launcher on PATH. Returns
/// the launcher's own path, for starting Claude without relying on PATH.
pub fn prepare(cmd: &mut CommandBuilder, launch: &Launch, queue: &Path) -> std::io::Result<PathBuf> {
    let path = launcher()?;
    let settings = serde_json::json!({
        "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": HOOK }] }] }
    });
    cmd.env("SLOP_CONTEXT", queue);
    cmd.env("SLOP_LAUNCHER", &path);
    cmd.env("SLOP_CLAUDE_BIN", &launch.path);
    cmd.env("SLOP_CLAUDE_SETTINGS", settings.to_string());
    cmd.env("SLOP_CLAUDE_SYSTEM", SYSTEM);
    if let Some(m) = launch.model.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        cmd.env("SLOP_CLAUDE_MODEL", m);
    }
    if let Some(dir) = path.parent() {
        let rest = std::env::var_os("PATH").unwrap_or_default();
        let joined = std::env::join_paths(std::iter::once(dir.to_path_buf()).chain(std::env::split_paths(&rest)))
            .map_err(std::io::Error::other)?;
        cmd.env("PATH", joined);
    }
    Ok(path)
}

/// Adds one block to the queue, after anything not yet delivered.
pub fn append(queue: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = queue.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(queue)?;
    writeln!(f, "{}\n", text.trim_end())
}

/// Replaces what is still waiting. Empty clears it.
pub fn replace(queue: &Path, text: &str) -> std::io::Result<()> {
    if text.trim().is_empty() {
        forget(queue);
        return Ok(());
    }
    if let Some(dir) = queue.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(queue, format!("{}\n\n", text.trim_end()))
}

pub fn pending(queue: &Path) -> bool {
    std::fs::metadata(queue).is_ok_and(|m| m.len() > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_home() {
        let h = Path::new("/home/me");
        assert_eq!(expand("~/bin/claude", Some(h)), PathBuf::from("/home/me/bin/claude"));
        assert_eq!(expand("/usr/bin/claude", Some(h)), PathBuf::from("/usr/bin/claude"));
    }

    #[test]
    fn a_configured_path_wins_and_must_exist() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("claude");
        std::fs::write(&bin, "").unwrap();
        let local = dir.path().join(".local/bin");
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(local.join("claude"), "").unwrap();

        assert_eq!(find(Some(bin.to_str().unwrap()), Some(dir.path())), Some(bin));
        assert_eq!(find(Some("/nope/claude"), Some(dir.path())), None);
        // Blank means auto-detect, and the installer's spot comes first.
        assert_eq!(find(Some("  "), Some(dir.path())), Some(local.join("claude")));
    }

    /// Runs the hook the way Claude Code does, against `queue`.
    #[cfg(unix)]
    fn run(cmd: &str, queue: &Path) -> String {
        let out = Command::new("sh").args(["-c", cmd]).env("SLOP_CONTEXT", queue).output().unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn the_hook_delivers_once() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        assert_eq!(run(HOOK, &q), "");

        append(&q, "[Map section: Signing Up › Student Sign-Up (explorify)\nFive stages.]").unwrap();
        assert!(pending(&q));
        // A prompt takes it: Claude gets the block, and the queue is empty.
        assert!(run(HOOK, &q).contains("Five stages."));
        assert!(!pending(&q));
        // The next prompt goes without it.
        assert_eq!(run(HOOK, &q), "");
    }

    /// The launcher as a tab runs it, with `bin` standing in for Claude.
    #[cfg(unix)]
    fn launch(queue: &Path, bin: &str) -> std::process::ExitStatus {
        Command::new(launcher().unwrap())
            .env("SLOP_CONTEXT", queue)
            .env("SLOP_CLAUDE_BIN", bin)
            .env("SLOP_CLAUDE_SETTINGS", "{}")
            .env("SLOP_CLAUDE_SYSTEM", "")
            .status()
            .unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn the_launcher_marks_the_tab_live_while_claude_runs() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        // A stand-in Claude that reports whether the marker is there.
        let probe = dir.path().join("probe");
        std::fs::write(&probe, format!("#!/bin/sh\n[ -e '{}' ] && exit 7\nexit 3\n", live(&q).display())).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&probe, std::fs::Permissions::from_mode(0o755)).unwrap();

        assert!(!running(&q));
        // Live while it ran (7), and Claude's own status comes back.
        assert_eq!(launch(&q, probe.to_str().unwrap()).code(), Some(7));
        assert!(!running(&q));
        // Gone after a failing exit too.
        assert!(!launch(&q, "/bin/false").success());
        assert!(!running(&q));
    }

    #[test]
    fn queue_appends_replaces_and_forgets() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("sub/context-1.md");
        assert!(!pending(&q));
        append(&q, "[Map section: A]").unwrap();
        append(&q, "[Map section: B]").unwrap();
        let text = std::fs::read_to_string(&q).unwrap();
        assert!(text.contains("A]") && text.contains("B]"));
        assert!(pending(&q));
        replace(&q, "[Map section: B]").unwrap();
        assert!(!std::fs::read_to_string(&q).unwrap().contains("A]"));
        replace(&q, "").unwrap();
        assert!(!pending(&q) && !q.exists());
    }
}
