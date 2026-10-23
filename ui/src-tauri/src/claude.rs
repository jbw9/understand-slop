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

/// After a tool that can change files: this turn may have edited code.
const EDITED: &str = r#": > "$SLOP_CONTEXT.dirty""#;
/// The tools EDITED follows. Bash among them, since a shell command can edit too.
const EDITING_TOOLS: &str = "Edit|Write|MultiEdit|NotebookEdit|Bash";

/// When Claude finishes a turn that may have edited code, or that found the
/// map wrong (slop-map-fix), it says so once: the app takes the marker
/// (take_turn) and updates the map. The marker holds what the hook was given,
/// which names the session's transcript: the updater reads from it what the
/// turn did and why.
const TURN: &str = r#"f="$SLOP_CONTEXT"; [ -e "$f.dirty" ] || [ -s "$f.fix" ] || exit 0; rm -f "$f.dirty"; cat > "$f.turn.part" && mv "$f.turn.part" "$f.turn"; exit 0"#;

/// What Claude runs when it finds the map wrong: one line per section, kept
/// beside the tab's queue until the turn ends. Allowed without asking.
const FIX: &str = r#"#!/bin/sh
# Tells understand-slop its map is wrong about a section (src-tauri/src/claude.rs).
[ -n "$SLOP_CONTEXT" ] || { echo "Not in an understand-slop tab; nothing to correct." >&2; exit 1; }
[ $# -ge 2 ] || { echo 'usage: slop-map-fix "<section title>" "<what the map gets wrong, and what is true>"' >&2; exit 2; }
printf '%s\t%s\n' "$(printf '%s' "$1" | tr '\t\n' '  ')" "$(printf '%s' "$2" | tr '\t\n' '  ')" >> "$SLOP_CONTEXT.fix"
echo "Noted. The map's \"$1\" will be corrected after this turn."
"#;

const SYSTEM: &str = "This session was opened from understand-slop, an app that maps this \
repository as a tree of sections (user journey, data flow, the code behind each). The user \
can attach things they picked on the map: a whole section arrives as a block starting with \
`[Map section:`, one element of a section (a row, a diagram box, a step, a line of code) as \
one starting with `[Map element:`. Each names where it sits on the map, what it says, and \
the code behind it. Treat what is attached as what the user is asking about, and read the \
listed code when it is relevant. Do not edit files unless asked. The map can be wrong: when \
you find that it is (a listed problem that is not real, a description or a line reference \
that does not match the code), run `slop-map-fix \"<section title>\" \"<what it gets wrong, \
and what is true>\"` once per section, and the map is corrected after your turn. Code you \
change updates the map by itself, deletions included; there is no need to report edits. \
Keeping the map right is background upkeep, not part of the answer: never tell the user \
whether you edited files, whether the map is accurate, or that there is nothing to correct, \
and mention a correction only in passing when you ran slop-map-fix. End on the answer \
itself.";

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
    let _ = std::fs::remove_file(queue.with_extension("md.dirty"));
    let _ = std::fs::remove_file(queue.with_extension("md.turn"));
    let _ = std::fs::remove_file(queue.with_extension("md.fix"));
}

/// A finished turn the map should follow: where its transcript is, and the
/// sections Claude found the map wrong about.
#[derive(serde::Serialize, Debug)]
pub struct Turn {
    transcript: Option<String>,
    corrections: Vec<Correction>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
pub struct Correction {
    section: String,
    note: String,
}

/// The turn Claude finished since this was last asked, if it edited code or
/// found the map wrong. Taking it clears it, so each is reported once.
pub fn take_turn(queue: &Path) -> Option<Turn> {
    let marker = queue.with_extension("md.turn");
    let stop = std::fs::read_to_string(&marker).ok()?;
    let _ = std::fs::remove_file(&marker);
    let transcript = serde_json::from_str::<serde_json::Value>(&stop)
        .ok()
        .and_then(|v| v.get("transcript_path")?.as_str().map(String::from));
    let fix = queue.with_extension("md.fix");
    let corrections = std::fs::read_to_string(&fix)
        .unwrap_or_default()
        .lines()
        .filter_map(|l| l.split_once('\t'))
        .map(|(s, n)| Correction { section: s.trim().to_string(), note: n.trim().to_string() })
        .collect();
    let _ = std::fs::remove_file(&fix);
    Some(Turn { transcript, corrections })
}

/// Present while the launcher's Claude runs in the tab that owns `queue`.
fn live(queue: &Path) -> PathBuf {
    queue.with_extension("md.live")
}

pub fn running(queue: &Path) -> bool {
    live(queue).exists()
}

/// The launcher, and slop-map-fix beside it, written where every tab's PATH
/// can find them. Rewritten only when they differ, so an upgrade of the app
/// replaces old ones.
fn launcher() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("understand-slop").join("bin");
    install(&dir.join("slop-map-fix"), FIX)?;
    let path = dir.join("slop-claude");
    install(&path, LAUNCHER)?;
    Ok(path)
}

fn install(path: &Path, script: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).ok().as_deref() != Some(script) {
        std::fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
        std::fs::write(path, script)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
        }
    }
    Ok(())
}

/// What a tab's shell needs so that the launcher works in it: the user's
/// `claude`, the hook, the system prompt, and the launcher on PATH. Returns
/// the launcher's own path, for starting Claude without relying on PATH.
pub fn prepare(cmd: &mut CommandBuilder, launch: &Launch, queue: &Path) -> std::io::Result<PathBuf> {
    let path = launcher()?;
    let settings = serde_json::json!({
        "hooks": {
            "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": HOOK }] }],
            "PostToolUse": [{ "matcher": EDITING_TOOLS, "hooks": [{ "type": "command", "command": EDITED }] }],
            "Stop": [{ "hooks": [{ "type": "command", "command": TURN }] }]
        },
        "permissions": { "allow": ["Bash(slop-map-fix:*)"] }
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

    /// The stop hook as Claude Code runs it: what it is told arrives on stdin.
    #[cfg(unix)]
    fn stop(queue: &Path) -> String {
        use std::io::Write as _;
        let mut child = Command::new("sh")
            .args(["-c", TURN])
            .env("SLOP_CONTEXT", queue)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(br#"{"transcript_path":"/t/s.jsonl","stop_hook_active":false}"#).unwrap();
        String::from_utf8(child.wait_with_output().unwrap().stdout).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn a_turn_that_edited_is_reported_once() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        // A turn that only talked says nothing.
        stop(&q);
        assert!(take_turn(&q).is_none());
        // One that ran an editing tool is reported when it ends, once, with its transcript.
        run(EDITED, &q);
        run(EDITED, &q);
        assert!(take_turn(&q).is_none());
        assert_eq!(stop(&q), "");
        let t = take_turn(&q).unwrap();
        assert_eq!(t.transcript.as_deref(), Some("/t/s.jsonl"));
        assert!(t.corrections.is_empty());
        assert!(take_turn(&q).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_correction_alone_makes_a_turn() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let fix = launcher().unwrap().with_file_name("slop-map-fix");
        let out = Command::new(&fix)
            .args(["Viewing the Gantt", "The gate is deliberate:\tthe chart is public."])
            .env("SLOP_CONTEXT", &q)
            .output()
            .unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).contains("corrected"));
        stop(&q);
        let t = take_turn(&q).unwrap();
        assert_eq!(
            t.corrections,
            vec![Correction { section: "Viewing the Gantt".into(), note: "The gate is deliberate: the chart is public.".into() }]
        );
        assert!(!q.with_extension("md.fix").exists());
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
