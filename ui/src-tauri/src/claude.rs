//! Claude Code in a terminal tab. The user's own `claude` runs on a pty like
//! any shell (pty.rs); what this module adds is finding that binary and the
//! launch config that lets the map hand it context.
//!
//! The hand-off is a file. Each Claude tab gets its own queue under the temp
//! dir, named in `$SLOP_CONTEXT`. Picking on the map appends a block to it —
//! `[Map section: …]` for a whole section, `[Map element: …]` for one thing on
//! a level — and a `UserPromptSubmit` hook passed in with
//! `--settings` drains it on the next prompt: whatever a prompt hook prints is
//! added to that prompt's context. The file being gone is how the UI knows a
//! pick was delivered. `--settings` adds to the user's own settings, so their
//! login, hooks and MCP servers all still apply.
//!
//! The same settings give the tab a status line under Claude's prompt saying
//! what is waiting and what just went, so the hand-off is visible where the
//! user is typing. It replaces their own status line, in these tabs only.

use portable_pty::CommandBuilder;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Drains the queue: the `mv` is atomic, so a pick appended while Claude reads
/// lands in a fresh file for the next prompt rather than being lost. What went
/// stays in `.sent` for the status line, until a prompt goes without any.
const HOOK: &str = r#"f="$SLOP_CONTEXT"; [ -s "$f" ] || { rm -f "$f.sent"; exit 0; }; mv "$f" "$f.sent" && cat "$f.sent""#;

/// One line: the sections waiting for the next prompt, else the ones the last
/// prompt took, each by the last name in its trail. Never blank — with nothing
/// either way it says how to add some, so the line is there to be found.
const STATUS: &str = r#"f="$SLOP_CONTEXT"; names() { sed -n 's/^\[Map [a-z]*: //p' "$1" | sed 's/ ([^()]*)$//; s/.* › //' | paste -sd '|' - | sed 's/|/, /g'; }; if [ -s "$f" ]; then n=$(grep -c '^\[Map [a-z]*:' "$f"); [ "$n" = 1 ] && w="item from the map goes" || w="items from the map go"; printf '◷ %s %s with your next prompt: %s\n' "$n" "$w" "$(names "$f")"; elif [ -s "$f.sent" ]; then printf '✓ Sent from the map: %s\n' "$(names "$f.sent")"; else printf '◇ No map context — right-click a card on the map to add it\n'; fi"#;

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
}

/// The command for a Claude tab, with its queue named in the environment.
pub fn command(launch: &Launch, queue: &Path) -> CommandBuilder {
    let settings = serde_json::json!({
        "hooks": { "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": HOOK }] }] },
        // Picks land while Claude sits idle, when no event would redraw it.
        "statusLine": { "type": "command", "command": STATUS, "refreshInterval": 1 }
    });
    let mut cmd = CommandBuilder::new(&launch.path);
    cmd.args(["--settings", &settings.to_string(), "--append-system-prompt", SYSTEM]);
    if let Some(m) = launch.model.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        cmd.args(["--model", m]);
    }
    cmd.env("SLOP_CONTEXT", queue);
    cmd
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

    #[cfg(unix)]
    const IDLE: &str = "◇ No map context — right-click a card on the map to add it\n";

    /// Runs a hook or status command the way Claude Code does, against `queue`.
    #[cfg(unix)]
    fn run(cmd: &str, queue: &Path) -> String {
        let out = Command::new("sh").args(["-c", cmd]).env("SLOP_CONTEXT", queue).output().unwrap();
        String::from_utf8(out.stdout).unwrap()
    }

    #[cfg(unix)]
    #[test]
    fn status_line_follows_the_queue() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        assert_eq!(run(STATUS, &q), IDLE);

        append(&q, "[Map section: Signing Up › Student Sign-Up (explorify)\nFive stages.]").unwrap();
        assert_eq!(run(STATUS, &q), "◷ 1 item from the map goes with your next prompt: Student Sign-Up\n");
        append(&q, "[Map element: Signing Up › Student Sign-Up › Email field (explorify)\nType: field]").unwrap();
        assert_eq!(
            run(STATUS, &q),
            "◷ 2 items from the map go with your next prompt: Student Sign-Up, Email field\n"
        );

        // A prompt takes them: Claude gets the blocks, the line says they went.
        assert!(run(HOOK, &q).contains("Five stages."));
        assert!(!pending(&q));
        assert_eq!(run(STATUS, &q), "✓ Sent from the map: Student Sign-Up, Email field\n");

        // The next prompt goes without any, and the line rests again.
        assert_eq!(run(HOOK, &q), "");
        assert_eq!(run(STATUS, &q), IDLE);
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
