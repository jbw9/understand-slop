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

/// Every prompt first says where the user is on the map (`.where`, kept by the
/// app as they move; see `place`): its first line always, so "what am I
/// reading?" has an answer, and the section itself only when it has changed
/// since the last prompt, so one page read for a while is not sent each turn.
/// Then it drains the queue: the `mv` is atomic, so a pick appended while
/// Claude reads lands in a fresh file for the next prompt rather than being lost.
const HOOK: &str = r#"f="$SLOP_CONTEXT"; w="$f.where"; if [ -s "$w" ]; then head -n 1 "$w"; cmp -s "$w" "$w.sent" || { tail -n +2 "$w"; cp "$w" "$w.sent"; }; fi; [ -s "$f" ] || exit 0; mv "$f" "$f.sent" && cat "$f.sent""#;

/// The scripts beside the launcher, on the PATH of Claude's Bash tool. The
/// tab's PATH has them, but Claude Code builds its Bash tool's environment
/// from a shell of its own, which on Windows drops them; what a session-start
/// hook writes to `$CLAUDE_ENV_FILE` is what every command there starts with.
const ON_PATH: &str = r#"[ -n "$CLAUDE_ENV_FILE" ] && [ -n "$SLOP_BIN" ] || exit 0; d="$SLOP_BIN"; command -v cygpath >/dev/null 2>&1 && d=$(cygpath -u "$d"); printf 'export PATH="%s:$PATH"\n' "$d" >> "$CLAUDE_ENV_FILE""#;

/// The conversation Claude is having in this tab, from the hook's input, so
/// the app can resume it in the tab it reopens after a restart. A `/clear`
/// starts a new one, and this follows it.
const SESSION: &str = r#"id=$(sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1); [ -n "$id" ] && printf '%s\n' "$id" > "$SLOP_CONTEXT.session"; exit 0"#;

/// After a tool that can change files: this turn may have edited code.
const EDITED: &str = r#": > "$SLOP_CONTEXT.dirty""#;
/// The tools EDITED follows. Bash among them, since a shell command can edit too.
const EDITING_TOOLS: &str = "Edit|Write|MultiEdit|NotebookEdit|Bash";

/// A plan Claude asks to start on: the hook's input, which carries the plan's
/// Markdown, kept whole for the app to draw (components/plan.tsx). Renamed
/// into place, so a plan is never read half written.
const PLAN: &str = r#"f="$SLOP_CONTEXT"; cat > "$f.plan.part" && mv "$f.plan.part" "$f.plan""#;
/// ExitPlanMode only runs once the user has accepted the plan, in the terminal
/// or from the plan's own tab.
const APPROVED: &str = r#": > "$SLOP_CONTEXT.approved""#;
/// Said to Claude as the accepted plan comes back to it: on a long build it
/// loses its place without a list to tick off, so it writes one first.
const TODOS: &str = r#"printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"The plan is accepted. Before you change any file, turn its Steps into a to-do list with your to-do tool, one item per step plus a last item for its Check. Work through the list in order: mark an item in progress as you start it and done as soon as it is, and add an item when the work turns up one the plan missed."}}'"#;

/// Claude Code's own dialog shows the plan as its file reads once the hooks
/// have run, and the plan's tab is where it is read: its diagrams are JSON in
/// a terminal. So while the dialog is up the file is only the plan's title and
/// OPEN_PLAN, which the terminal makes a link that opens (or reopens) the
/// plan's tab (components/shell.tsx); it stays in the scrollback, so a closed
/// plan can be found again. The whole plan waits beside the queue (`.hidden`)
/// for RESTORE.
const HIDE: &str = r#"h="$SLOP_CONTEXT.hidden"; p=$(sed -n 's/.*"planFilePath": *"\([^"]*\)".*/\1/p' | head -n 1); [ -f "$p" ] || exit 0; awk '/^# / && !t { print; print ""; t = 1 } END { print "`▸ Open plan`" }' "$p" > "$h.shown" && ! cmp -s "$p" "$h.shown" && cp "$p" "$h" && printf '%s' "$p" > "$h.file" && cp "$h.shown" "$p"; exit 0"#;
/// The whole plan back in its file, at the first hook after the dialog is
/// answered, accepted or not, so a revision starts from it. Unless the file
/// changed meanwhile (the user edited it with ctrl+g): then it is theirs.
const RESTORE: &str = r#"h="$SLOP_CONTEXT.hidden"; [ -e "$h.file" ] || exit 0; p=$(cat "$h.file"); cmp -s "$p" "$h.shown" && cp "$h" "$p"; rm -f "$h" "$h.file" "$h.shown"; exit 0"#;

/// Refuses a Bash call that would start a browser of its own: gstack's shared
/// Chromium (`$B`, browse/dist/browse, which its /browse, /qa, /scrape and
/// design skills drive), or Chrome itself. Exit 2 hands the reason to Claude.
const NO_BROWSER: &str = r#"grep -qE 'browse/dist/browse|\$B [a-z]|Google Chrome|chrome --headless' || exit 0; echo 'Browsing happens in the Preview here (the slop-preview tools), never a headless Chromium or Chrome. Do this step with navigate, computer and get_page_text instead.' >&2; exit 2"#;

/// What Claude is doing, for the dot on its tab: each hook below writes one
/// word, `working`, `waiting` (a question or a permission only the user can
/// answer) or `done`.
fn status(word: &str) -> serde_json::Value {
    serde_json::json!({ "type": "command", "command": format!(r#"printf {word} > "$SLOP_CONTEXT.status""#) })
}

/// At the end of every turn, two markers, for two different readers.
///
/// `.ended` is written always: it names the session's transcript, which is how
/// the app offers to keep an answer on the map (lib/keep.ts). A turn that only
/// answered a question changes no file and files no fix, so the map-following
/// marker below never fires for it — and that is the common case for a reader
/// who just asked how something works.
///
/// `.turn` is written only when the turn may have edited code or found the map
/// wrong (slop-map-fix), and is what makes the map follow the agent. Keeping
/// the two separate means offering to keep an answer never triggers an update,
/// and an edit never implies the reader wanted a note.
const TURN: &str = r#"f="$SLOP_CONTEXT"; s=$(cat); printf '%s' "$s" > "$f.ended.part" && mv "$f.ended.part" "$f.ended"; [ -e "$f.dirty" ] || [ -s "$f.fix" ] || exit 0; rm -f "$f.dirty"; printf '%s' "$s" > "$f.turn.part" && mv "$f.turn.part" "$f.turn"; exit 0"#;

/// What Claude runs when it finds the map wrong: one line per section, kept
/// beside the tab's queue until the turn ends. Allowed without asking.
const FIX: &str = r#"#!/bin/sh
# Tells Mira its map is wrong about a section (src-tauri/src/claude.rs).
[ -n "$SLOP_CONTEXT" ] || { echo "Not in a Mira tab; nothing to correct." >&2; exit 1; }
[ $# -ge 2 ] || { echo 'usage: slop-map-fix "<section title>" "<what the map gets wrong, and what is true>"' >&2; exit 2; }
printf '%s\t%s\n' "$(printf '%s' "$1" | tr '\t\n' '  ')" "$(printf '%s' "$2" | tr '\t\n' '  ')" >> "$SLOP_CONTEXT.fix"
echo "Noted. The map's \"$1\" will be corrected after this turn."
"#;

/// What Claude runs to put the user in front of what it is talking about: one
/// line per act, taken by the app on its next poll rather than at the end of
/// the turn. Refs are written as the user said them and resolved by the app.
/// Allowed without asking.
const SHOW: &str = r#"#!/bin/sh
# Drives Mira's map: shows a section, a diff, or the history (src-tauri/src/claude.rs).
[ -n "$SLOP_CONTEXT" ] || { echo "Not in a Mira tab; nothing to show." >&2; exit 1; }
clean() { printf '%s' "$1" | tr '\t\n' '  '; }
case "$1" in
section)
  [ -n "$2" ] || { echo 'usage: slop-map-show section "<section title or id>"' >&2; exit 2; }
  printf 'section\t%s\t\n' "$(clean "$2")" >> "$SLOP_CONTEXT.act"
  echo "Showing \"$2\" on the map."
  ;;
diff)
  [ $# -ge 2 ] || { echo 'usage: slop-map-show diff "<from>" ["<to>"]' >&2; exit 2; }
  printf 'diff\t%s\t%s\n' "$(clean "$2")" "$(clean "$3")" >> "$SLOP_CONTEXT.act"
  echo "Showing the diff${2:+ from \"$2\"}${3:+ to \"$3\"} on the map."
  ;;
timeline)
  printf 'timeline\t\t\n' >> "$SLOP_CONTEXT.act"
  echo "Showing the history of the code over the map."
  ;;
*)
  echo 'usage: slop-map-show section "<section title or id>" | slop-map-show diff "<from>" ["<to>"] | slop-map-show timeline' >&2
  exit 2
  ;;
esac
"#;

/// A terminal's output, for any agent in a tab: Claude has `read_terminal`
/// (mcp.rs), and this reaches the same tool for the agents that have no MCP
/// config. Allowed without asking.
const TERMINAL: &str = r#"#!/bin/sh
# Prints what a Mira terminal printed, the dev server's by default (src-tauri/src/mcp.rs).
[ -n "$SLOP_MCP_URL" ] || { echo "Not in a Mira tab; no terminals to read." >&2; exit 1; }
case "$2" in ''|*[!0-9]*) lines=200 ;; *) lines=$2 ;; esac
name=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\t\n' '  ')
curl -sS --fail-with-body "$SLOP_MCP_URL/text" -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"read_terminal\",\"arguments\":{\"name\":\"$name\",\"lines\":$lines}}}"
"#;

/// The map's own table of contents, for naming a section that was not picked.
///
/// The user asks "how do sign ups work?" with nothing attached, so the only
/// section names in context are whatever they happened to pick earlier —
/// usually none. Without this, `slop-map-show section` would be a guess at a
/// title that may not exist, which is how a reader ends up somewhere they did
/// not ask to be. The outline is written beside the tab's queue when the tab
/// starts (pty.rs), from the map the page already has.
const LIST: &str = r#"#!/bin/sh
# Lists Mira's map, section by section (src-tauri/src/claude.rs).
[ -n "$SLOP_CONTEXT" ] || { echo "Not in a Mira tab; no map to list." >&2; exit 1; }
[ -s "$SLOP_CONTEXT.map" ] || { echo "This repository has no map yet." >&2; exit 1; }
cat "$SLOP_CONTEXT.map"
"#;

const SYSTEM: &str = "This session was opened from Mira, an app that maps this \
repository as a tree of sections (user journey, data flow, the code behind each). The user \
can attach things they picked on the map: a whole section arrives as a block starting with \
`[Map section:`, one element of a section (a row, a diagram box, a step, a line of code) as \
one starting with `[Map element:`. Each names where it sits on the map, what it says, and \
the code behind it. Treat what is attached as what the user is asking about, and read the \
listed code when it is relevant. Each prompt also opens with a `[Reading now:` line naming \
the section the user has open, followed by that section when it has changed since the last \
prompt. When they ask what they are reading, or say \"this\" or \"here\" with nothing \
attached, they mean that section: summarize or answer from it and the code it lists. It is \
told to you, not shown to them, so never mention having been told where they are. Do not edit files unless asked. The map can be wrong: when \
you find that it is (a listed problem that is not real, a description or a line reference \
that does not match the code), run `slop-map-fix \"<section title>\" \"<what it gets wrong, \
and what is true>\"` once per section, and the map is corrected after your turn. Code you \
change updates the map by itself, deletions included; there is no need to report edits. \
You also drive what the user is looking at. When they ask how something works and nothing \
is attached, run `slop-map-list` to see what the map actually calls its sections, then, if \
one of them is what they are asking about, run `slop-map-show section \"<section title>\"` \
before you explain, naming it exactly as the outline spells it, so \
they are looking at the thing you are explaining as you explain it; the app takes it \
immediately, not at the end of your turn. When they ask to see what changed, run \
`slop-map-show diff \"<from>\" \"<to>\"` — `<to>` may be left off, meaning the working tree, \
and an empty `<from>` means the commit the map was built from. Pass the refs through as the \
user said them, `HEAD~1`, a sha, a branch, or a phrase like \"last commit by hindra2\": the \
app resolves them against the repository, so do not run git to work one out first. When they \
ask how the code got here or how it changed over time, run `slop-map-show timeline`: it draws \
every commit on the map's sections, and they can click through it while you tell the history. \
The `map_search`, `map_section` and `map_where` tools read the map itself. Before you change a \
file, ask `map_where` which sections explain it, so the change fits the part of the product it \
lives in and the user can follow what you are building on the map. \
Keeping the map right is background upkeep, not part of the answer: never tell the user \
whether you edited files, whether the map is accurate, or that there is nothing to correct, \
and mention a correction only in passing when you ran slop-map-fix. What you show is \
likewise not worth narrating — the user can see it, so never announce that you are taking \
them somewhere, though naming the section you are explaining is fine where the prose wants \
it. The app also runs the project: its web app in a Preview tab, and its phone app on an iOS \
Simulator or Android emulator when the user has started one. The slop-preview tools use them \
as a person would (screenshot, click, type, read the page, navigate, resize); use them to check \
that a change you made works, or when the user asks about what the app shows; `read_terminal` \
reads the dev server's logs (and the project's other terminals) when something fails. They are also \
your browser: to search the web or read a page as the user would see it, navigate the preview \
there, never another browser: not Chrome, not a headless Chromium. When a skill says to \
drive its own browser (gstack's `$B`), do those steps with the slop-preview tools instead. WebSearch and WebFetch are fine for reading docs as text; they \
stay out of the preview. \
A plan you finish in plan mode opens beside you as a short visual design doc, drawn from its \
Markdown, and is accepted from there. Most people skip a long plan, so write one they will read: \
`# <what will be built>`, then one sentence on what the user gets. Then the picture, as a fenced \
block of JSON: a ```diagram of how the pieces fit, {\"caption\" (a few words), \"boxes\": [{\"id\", \
\"label\" (1-3 words), \"sub\" (a file, or a few words), \"col\", \"row\", \"change\", \"section\" \
(the id path of the map section this box is, from map_where or map_search, when it is one)}], \"arrows\": \
[{\"from\", \"to\", \"label\" (1-3 words), \"change\"}]}, on a grid read left to right and at most \
three columns wide, where `change` is \"new\", \"changed\" or \"gone\" and what stays as it is has \
none; and when the user will see the change, a ```screen \
wireframe too, {\"title\", \"device\": \"web\" or \"phone\", \"route\", \"items\": [{\"type\": heading, \
text, field, choice, button, list or image, \"label\", \"note\"}]}, with a note on each new item. \
Then `## Steps`, numbered, at most six, each a short line in plain words on what changes, not \
how (the how is for the code); `## Files`, a ```files block with one line per file: `+ path — \
what it is`, `~ path — what changes` or `- path — why it goes`; `## Risks` only when there are \
real ones; and `## Check`, one to three short bullets on how you will know it works. Keep the \
words outside the blocks under 150: no context section, no restating the request, and code only \
where a signature is the decision. \
End on the answer itself.";

#[derive(serde::Deserialize)]
pub struct Launch {
    path: String,
    model: Option<String>,
    #[serde(default)]
    voice: bool,
    #[serde(default)]
    research: bool,
}

/// Runs Claude with the hook, and marks the tab live while it does. The marker,
/// and the conversation the tab would be reopened into, go on any exit — a
/// quit, a crash, Ctrl+C — and the script's status is Claude's.
const LAUNCHER: &str = r#"#!/bin/sh
# Claude Code with Mira's map-context hook (src-tauri/src/claude.rs).
trap 'rm -f "$SLOP_CONTEXT.live" "$SLOP_CONTEXT.session"' EXIT INT TERM HUP
: > "$SLOP_CONTEXT.live"
# A reopened tab's conversation, taken once: a `claude` typed later starts afresh.
r=$(cat "$SLOP_CONTEXT.resume" 2>/dev/null); rm -f "$SLOP_CONTEXT.resume"
"$SLOP_CLAUDE_BIN" --settings "$SLOP_CLAUDE_SETTINGS" --append-system-prompt "$SLOP_CLAUDE_SYSTEM" ${SLOP_CLAUDE_MODEL:+--model "$SLOP_CLAUDE_MODEL"} ${SLOP_CLAUDE_MCP:+--mcp-config "$SLOP_CLAUDE_MCP"} ${r:+--resume "$r"} "$@"
"#;

/// `claude` typed in a tab: the launcher, so it is in front and takes context
/// like one the app started. Not from Claude's own Bash tool, where the
/// launcher's exit would take the tab's live marker from the Claude still running.
const CLAUDE_SHIM: &str = r#"#!/bin/sh
[ -n "$CLAUDECODE" ] && exec "$SLOP_CLAUDE_BIN" "$@"
exec "$SLOP_LAUNCHER" "$@"
"#;

/// zsh in a tab starts from here (`ZDOTDIR`), so the shim stays first on PATH
/// after the user's own startup files: a `.zshrc` that puts `~/.local/bin`
/// first would otherwise find the real `claude`, and a `claude` typed in the tab
/// would run without the hooks (no plan tab, no status, no map context).
/// Each file loads the user's own from where zsh would have read it.
#[cfg(unix)]
const ZSHENV: &str = r#"# Mira's zsh startup (src-tauri/src/claude.rs).
_slop_dot=$ZDOTDIR
ZDOTDIR=${SLOP_ZDOTDIR:-$HOME}
[ -f "$ZDOTDIR/.zshenv" ] && source "$ZDOTDIR/.zshenv"
# Their .zshenv may move ZDOTDIR: that is where their .zshrc is.
SLOP_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_slop_dot
unset _slop_dot
"#;
#[cfg(unix)]
const ZSHRC: &str = r#"# Mira's zsh startup (src-tauri/src/claude.rs).
ZDOTDIR=$SLOP_ZDOTDIR
[ "$ZDOTDIR" = "$HOME" ] && unset ZDOTDIR
[ -f "${ZDOTDIR:-$HOME}/.zshrc" ] && source "${ZDOTDIR:-$HOME}/.zshrc"
[ -n "$SLOP_BIN" ] && PATH="$SLOP_BIN:$PATH"
"#;

#[derive(serde::Serialize)]
pub struct Detected {
    path: String,
    version: Option<String>,
}

use crate::proc::home;

fn expand(p: &str, home: Option<&Path>) -> PathBuf {
    match (p.strip_prefix("~/"), home) {
        (Some(rest), Some(h)) => h.join(rest),
        _ => PathBuf::from(p),
    }
}

/// Where the installers put it. An app started from the desktop has no shell
/// PATH, so these are checked before asking a login shell.
#[cfg(not(windows))]
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

/// The native installer's, then npm's.
#[cfg(windows)]
fn candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(h) = home {
        out.push(h.join(r".local\bin\claude.exe"));
        out.push(h.join(r".claude\local\claude.exe"));
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        out.push(PathBuf::from(appdata).join(r"npm\claude.cmd"));
    }
    out
}

#[cfg(not(windows))]
fn on_path() -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = crate::proc::command(shell).args(["-lc", "command -v claude"]).output().ok()?;
    let p = PathBuf::from(String::from_utf8_lossy(&out.stdout).trim());
    p.is_file().then_some(p)
}

#[cfg(windows)]
fn on_path() -> Option<PathBuf> {
    crate::proc::where_is("claude").into_iter().find(|p| p.is_file())
}

/// Git for Windows' bash, which runs the launcher and the scripts beside it
/// on Windows, as it runs Claude Code's own hooks and Bash tool there: where
/// Claude Code is told it is, else beside the `git` on PATH, else where its
/// installer puts it.
#[cfg(windows)]
fn git_bash() -> Option<PathBuf> {
    let told = std::env::var_os("CLAUDE_CODE_GIT_BASH_PATH").map(PathBuf::from);
    let beside_git = crate::proc::where_is("git")
        .into_iter()
        .filter_map(|g| Some(g.parent()?.parent()?.join(r"bin\bash.exe")));
    let installed = ["ProgramFiles", "ProgramW6432", "LOCALAPPDATA"]
        .iter()
        .filter_map(std::env::var_os)
        .map(|d| PathBuf::from(d).join(r"Git\bin\bash.exe"));
    told.into_iter().chain(beside_git).chain(installed).find(|p| p.is_file())
}

fn find(configured: Option<&str>, home: Option<&Path>) -> Option<PathBuf> {
    if let Some(c) = configured.map(str::trim).filter(|c| !c.is_empty()) {
        let p = expand(c, home);
        return p.is_file().then_some(p);
    }
    if let Some(p) = candidates(home).into_iter().find(|p| p.is_file()) {
        return Some(p);
    }
    on_path()
}

/// The configured path if it exists, else wherever Claude Code is installed.
/// Async so the login-shell lookup never blocks the window.
#[tauri::command]
pub async fn claude_detect(configured: Option<String>) -> Option<Detected> {
    let path = find(configured.as_deref(), home().as_deref())?;
    let version = crate::proc::command(&path)
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
        .join("mira")
        .join(format!("context-{}-{id}.md", std::process::id()))
}

/// Removes the tab's queue and everything kept beside it: every file named
/// `context-<pid>-<tab>.md` plus a suffix, so a marker added later (or a
/// `.part` a hook left half-written) goes with the rest.
pub fn forget(queue: &Path) {
    let (Some(dir), Some(name)) = (queue.parent(), queue.file_name().and_then(|n| n.to_str())) else { return };
    remove_named(dir, |f| f == name || f.strip_prefix(name).is_some_and(|rest| rest.starts_with('.')));
}

fn remove_named(dir: &Path, doomed: impl Fn(&str) -> bool) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        if e.file_name().to_str().is_some_and(&doomed) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

/// At startup: the tab files of a Mira that is gone. A crash or a kill skips
/// `forget`, and the files would wait for a reboot. Another Mira still
/// running (the dev build beside the installed one) keeps its own.
pub fn sweep_stale() {
    let Some(dir) = queue(0).parent().map(Path::to_path_buf) else { return };
    let me = std::process::id();
    remove_named(&dir, |f| {
        let Some(pid) = f.strip_prefix("context-").and_then(|r| r.split('-').next()).and_then(|p| p.parse::<u32>().ok()) else {
            return false;
        };
        pid != me && !alive(pid, &dir.join(f))
    });
}

/// How long a plan Claude Code wrote may sit untouched before it goes: the
/// same as Claude Code's own default for keeping sessions.
pub const PLAN_AGE: std::time::Duration = std::time::Duration::from_secs(30 * 24 * 3600);

/// Where Claude Code keeps the plans it writes in plan mode.
fn plans_dir() -> Option<PathBuf> {
    let config = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).or_else(|| crate::proc::home().map(|h| h.join(".claude")))?;
    Some(config.join("plans"))
}

/// At startup: plans nothing has touched in `PLAN_AGE`. Nothing reads them
/// once their session is over (a plan's tab holds its own copy), and Claude
/// Code never removes them. A plan being shown right now was just rewritten
/// by HIDE, so it is never old.
pub fn prune_plans() {
    if let Some(dir) = plans_dir() {
        prune_older(&dir, PLAN_AGE);
    }
}

fn prune_older(dir: &Path, age: std::time::Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let path = e.path();
        let old = e
            .metadata()
            .ok()
            .filter(|m| m.is_file())
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|a| a > age);
        if old && path.extension().is_some_and(|x| x == "md") {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(unix)]
fn alive(pid: u32, _file: &Path) -> bool {
    crate::proc::command("kill").args(["-0", &pid.to_string()]).stderr(std::process::Stdio::null()).status().is_ok_and(|s| s.success())
}

/// No cheap liveness check without a dependency: a day untouched is gone.
#[cfg(not(unix))]
fn alive(_pid: u32, file: &Path) -> bool {
    let age = std::fs::metadata(file).and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok());
    age.map_or(true, |a| a < std::time::Duration::from_secs(24 * 3600))
}

/// A plan Claude is waiting to have accepted: its Markdown, and the file
/// Claude Code keeps it in.
#[derive(serde::Serialize, Debug)]
pub struct Plan {
    text: String,
    file: Option<String>,
}

/// The plan Claude asked to start on since this was last asked. Taking it
/// clears it, so each plan opens its tab once.
pub fn take_plan(queue: &Path) -> Option<Plan> {
    let marker = queue.with_extension("md.plan");
    let hook = std::fs::read_to_string(&marker).ok()?;
    let _ = std::fs::remove_file(&marker);
    let input = serde_json::from_str::<serde_json::Value>(&hook).ok()?;
    let input = input.get("tool_input")?;
    Some(Plan {
        text: input.get("plan")?.as_str()?.to_string(),
        file: input.get("planFilePath").and_then(|f| f.as_str()).map(String::from),
    })
}

/// Whether the plan was accepted since this was last asked; reported once.
pub fn take_approved(queue: &Path) -> bool {
    std::fs::remove_file(queue.with_extension("md.approved")).is_ok()
}

/// Something Claude asked the app to show. Serializes tagged on `verb`, for a
/// discriminated union on the page: `{"verb":"section","section":"Sign ups"}`,
/// or `{"verb":"diff","from":"HEAD~1","to":null}` — `from` empty meaning the
/// map's own commit, `to` null meaning the working tree. Refs arrive as Claude
/// wrote them; resolving them is the page's job.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "verb", rename_all = "lowercase")]
pub enum Act {
    Section { section: String },
    Diff { from: String, to: Option<String> },
    /// The history of the code, drawn over the map's sections.
    Timeline,
}

/// What Claude has asked to show since this was last asked. Taking it clears
/// it, so each act happens once.
///
/// Deliberately not tied to the end of the turn, unlike `take_turn` and
/// `take_ended`: Claude shows a section as it starts explaining it, and the
/// point is that the user is looking at it while the answer streams. So this is
/// drained on every poll, with no Stop marker involved.
pub fn take_acts(queue: &Path) -> Vec<Act> {
    let marker = queue.with_extension("md.act");
    let Ok(text) = std::fs::read_to_string(&marker) else { return Vec::new() };
    let _ = std::fs::remove_file(&marker);
    text.lines()
        .filter_map(|l| {
            let mut f = l.split('\t');
            match (f.next()?, f.next()?.trim(), f.next().unwrap_or("").trim()) {
                ("section", s, _) if !s.is_empty() => Some(Act::Section { section: s.to_string() }),
                ("diff", from, to) => Some(Act::Diff {
                    from: from.to_string(),
                    to: (!to.is_empty()).then(|| to.to_string()),
                }),
                ("timeline", _, _) => Some(Act::Timeline),
                _ => None,
            }
        })
        .collect()
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

/// The transcript of the turn Claude just finished, whatever it did. Taking it
/// clears it, so each turn is offered once. Unlike `take_turn` this fires for a
/// turn that only answered a question, which is what the reader keeps.
pub fn take_ended(queue: &Path) -> Option<String> {
    let marker = queue.with_extension("md.ended");
    let stop = std::fs::read_to_string(&marker).ok()?;
    let _ = std::fs::remove_file(&marker);
    serde_json::from_str::<serde_json::Value>(&stop)
        .ok()
        .and_then(|v| v.get("transcript_path")?.as_str().map(String::from))
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

fn session(queue: &Path) -> PathBuf {
    queue.with_extension("md.session")
}

/// The conversation Claude has in the tab that owns `queue`, while it runs.
pub fn session_of(queue: &Path) -> Option<String> {
    std::fs::read_to_string(session(queue)).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// A tab reopened into `id`: the launcher resumes it, in a file rather than the
/// tab's command line so the user's shell never has to split it. The tab counts
/// as that conversation's from the start, so a restart before Claude is up does
/// not lose it, and a resume that fails drops it when the launcher exits.
pub fn resuming(queue: &Path, id: &str) -> std::io::Result<()> {
    if let Some(dir) = queue.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(queue.with_extension("md.resume"), id)?;
    std::fs::write(session(queue), format!("{id}\n"))
}

/// The last word a status hook wrote; none before Claude's first prompt.
pub fn status_of(queue: &Path) -> Option<String> {
    std::fs::read_to_string(queue.with_extension("md.status")).ok().map(|s| s.trim().to_string())
}

/// The launcher, and the scripts Claude talks back through beside it, written
/// where every tab's PATH can find them. Rewritten only when they differ, so
/// an upgrade of the app replaces old ones.
fn launcher() -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("mira").join("bin");
    install(&dir.join("slop-map-fix"), FIX)?;
    install(&dir.join("slop-map-show"), SHOW)?;
    install(&dir.join("slop-map-list"), LIST)?;
    install(&dir.join("slop-terminal"), TERMINAL)?;
    let path = dir.join("slop-claude");
    install(&path, LAUNCHER)?;
    #[cfg(unix)]
    {
        install(&dir.join("claude"), CLAUDE_SHIM)?;
        install(&zdotdir().join(".zshenv"), ZSHENV)?;
        install(&zdotdir().join(".zshrc"), ZSHRC)?;
    }
    #[cfg(windows)]
    let path = {
        let cmd = dir.join("slop-claude.cmd");
        install(&cmd, LAUNCHER_CMD)?;
        cmd
    };
    Ok(path)
}

#[cfg(unix)]
fn zdotdir() -> PathBuf {
    std::env::temp_dir().join("mira").join("zsh")
}

/// What cmd and PowerShell find as `slop-claude` on Windows: the launcher,
/// run by Git for Windows' bash (`git_bash`).
#[cfg(windows)]
const LAUNCHER_CMD: &str = "@echo off\r\n\
if not defined SLOP_BASH (\r\n\
  echo Claude Code in Mira needs Git for Windows: https://git-scm.com/download/win 1>&2\r\n\
  exit /b 1\r\n\
)\r\n\
\"%SLOP_BASH%\" \"%~dp0slop-claude\" %*\r\n";

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
/// `claude`, the hook, the system prompt, the preview's tools (mcp.rs), and
/// the launcher on PATH. Returns the launcher's own path, for starting Claude
/// without relying on PATH.
pub fn prepare(cmd: &mut CommandBuilder, launch: &Launch, queue: &Path, outline: Option<&str>, tab: u32) -> std::io::Result<PathBuf> {
    let path = launcher()?;
    // The page has the map; this only keeps it where slop-map-list can read it.
    // Written per tab and cleared with the tab, so it never outlives the map it
    // was taken from.
    if let Some(text) = outline.map(str::trim).filter(|t| !t.is_empty()) {
        if let Some(dir) = queue.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(queue.with_extension("md.map"), format!("{text}\n"))?;
    }
    let hook = |c: &str| serde_json::json!({ "type": "command", "command": c });
    let mut settings = serde_json::json!({
        "hooks": {
            "SessionStart": [{ "hooks": [hook(ON_PATH), hook(SESSION)] }],
            "UserPromptSubmit": [{ "hooks": [hook(HOOK), status("working")] }],
            "PreToolUse": [
                { "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [status("waiting")] },
                { "matcher": "ExitPlanMode", "hooks": [hook(PLAN), hook(HIDE)] },
                // Not on ExitPlanMode itself, whose HIDE runs beside it.
                { "matcher": "^(?!ExitPlanMode$)", "hooks": [hook(RESTORE)] },
                { "matcher": "Bash", "hooks": [hook(NO_BROWSER)] }
            ],
            "PostToolUse": [
                { "matcher": EDITING_TOOLS, "hooks": [hook(EDITED)] },
                { "matcher": "ExitPlanMode", "hooks": [hook(APPROVED), hook(TODOS)] },
                { "hooks": [hook(RESTORE), status("working")] }
            ],
            "Notification": [{ "matcher": "permission_prompt|elicitation_dialog", "hooks": [status("waiting")] }],
            "Stop": [{ "hooks": [hook(TURN), hook(RESTORE), status("done")] }],
            "SessionEnd": [{ "hooks": [hook(RESTORE)] }]
        },
        "permissions": {
            "allow": ["Bash(slop-map-fix:*)", "Bash(slop-map-show:*)", "Bash(slop-map-list:*)", "Bash(slop-terminal:*)", "mcp__slop-preview"],
            // The preview is the browser here: Chrome would open beside the app, out of the user's sight.
            // So is gstack's headless Chromium: these skills do nothing but drive it, or hand it Chrome's sign-ins.
            "deny": [
                "mcp__claude-in-chrome",
                "Skill(browse)", "Skill(connect-chrome)", "Skill(open-gstack-browser)",
                "Skill(setup-browser-cookies)", "Skill(pair-agent)", "Skill(scrape)", "Skill(skillify)"
            ]
        }
    });
    // Only ever turned on here: with the setting off, the user's own `/voice` stands.
    if launch.voice {
        settings["voice"] = serde_json::json!({ "enabled": true });
    }
    // Lets plan mode research without a prompt per step; plan mode still blocks edits.
    if launch.research {
        if let Some(allow) = settings["permissions"]["allow"].as_array_mut() {
            allow.extend(["Skill", "WebSearch", "WebFetch"].map(serde_json::Value::from));
        }
    }
    cmd.env("SLOP_CONTEXT", queue);
    cmd.env("SLOP_LAUNCHER", &path);
    cmd.env("SLOP_CLAUDE_BIN", &launch.path);
    cmd.env("SLOP_CLAUDE_SETTINGS", settings.to_string());
    cmd.env("SLOP_CLAUDE_SYSTEM", SYSTEM);
    if let Some(mcp) = crate::mcp::config(tab) {
        cmd.env("SLOP_CLAUDE_MCP", mcp);
    }
    if let Some(url) = crate::mcp::url(tab) {
        cmd.env("SLOP_MCP_URL", url);
    }
    if let Some(m) = launch.model.as_deref().map(str::trim).filter(|m| !m.is_empty()) {
        cmd.env("SLOP_CLAUDE_MODEL", m);
    }
    #[cfg(windows)]
    if let Some(bash) = git_bash() {
        cmd.env("SLOP_BASH", bash);
    }
    if let Some(dir) = path.parent() {
        cmd.env("SLOP_BIN", dir);
        let rest = std::env::var_os("PATH").unwrap_or_default();
        let joined = std::env::join_paths(std::iter::once(dir.to_path_buf()).chain(std::env::split_paths(&rest)))
            .map_err(std::io::Error::other)?;
        cmd.env("PATH", joined);
    }
    // Other shells ignore it.
    #[cfg(unix)]
    {
        if let Some(theirs) = std::env::var_os("ZDOTDIR") {
            cmd.env("SLOP_ZDOTDIR", theirs);
        }
        cmd.env("ZDOTDIR", zdotdir());
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

/// Where the user is on the map, rewritten whenever they move. Written whole
/// and renamed into place, so a prompt never reads half of it.
pub fn place(queue: &Path, text: &str) -> std::io::Result<()> {
    if let Some(dir) = queue.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let to = queue.with_extension("md.where");
    let part = queue.with_extension("md.where.part");
    std::fs::write(&part, format!("{}\n", text.trim_end()))?;
    std::fs::rename(part, to)
}

/// Replaces what is still waiting. Empty clears it.
pub fn replace(queue: &Path, text: &str) -> std::io::Result<()> {
    if text.trim().is_empty() {
        // Only the queue: `forget` would also drop the tab's live, map and fix state.
        let _ = std::fs::remove_file(queue);
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
    #[cfg(unix)]
    use std::process::Command;

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
        let local = dir.path().join(".local").join("bin");
        let installed = local.join(if cfg!(windows) { "claude.exe" } else { "claude" });
        std::fs::create_dir_all(&local).unwrap();
        std::fs::write(&installed, "").unwrap();

        assert_eq!(find(Some(bin.to_str().unwrap()), Some(dir.path())), Some(bin));
        assert_eq!(find(Some("/nope/claude"), Some(dir.path())), None);
        // Blank means auto-detect, and the installer's spot comes first.
        assert_eq!(find(Some("  "), Some(dir.path())), Some(installed));
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

    #[cfg(unix)]
    #[test]
    fn the_hook_says_where_and_the_page_once() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        place(&q, "[Reading now: explorify › Signing Up]\n[Map section: Signing Up\nFive stages.]").unwrap();
        // The first prompt gets where, and the page.
        let first = run(HOOK, &q);
        assert!(first.starts_with("[Reading now: explorify › Signing Up]"));
        assert!(first.contains("Five stages."));
        // Still there: where again, the page not.
        let second = run(HOOK, &q);
        assert!(second.contains("[Reading now:"));
        assert!(!second.contains("Five stages."));
        // Moved: the new page goes out, and a pick still follows it.
        place(&q, "[Reading now: explorify › Tax Engine]\n[Map section: Tax Engine\nFormulas.]").unwrap();
        append(&q, "[Map element: a row]").unwrap();
        let third = run(HOOK, &q);
        assert!(third.contains("Formulas.") && third.contains("[Map element: a row]"));
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
    fn every_turn_is_offered_for_keeping_even_one_that_only_talked() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        // The case the map-following marker deliberately ignores: a question
        // answered, nothing edited. Keeping an answer has to work here.
        stop(&q);
        assert!(take_turn(&q).is_none());
        assert_eq!(take_ended(&q).as_deref(), Some("/t/s.jsonl"));
        // Offered once, so the app never asks twice about the same answer.
        assert!(take_ended(&q).is_none());
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

    #[cfg(unix)]
    #[test]
    fn showing_takes_effect_without_waiting_for_the_turn_to_end() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let show = launcher().unwrap().with_file_name("slop-map-show");
        let run = |args: &[&str]| {
            Command::new(&show).args(args).env("SLOP_CONTEXT", &q).output().unwrap()
        };
        assert!(take_acts(&q).is_empty());

        let out = run(&["section", "Sign ups\tand in"]);
        assert!(String::from_utf8_lossy(&out.stdout).contains("Showing"));
        assert!(run(&["diff", "last commit by hindra2"]).status.success());
        assert!(run(&["diff", "", "HEAD"]).status.success());
        assert!(run(&["timeline"]).status.success());
        // No stop hook has fired, and the acts are already there.
        assert_eq!(
            take_acts(&q),
            vec![
                Act::Section { section: "Sign ups and in".into() },
                Act::Diff { from: "last commit by hindra2".into(), to: None },
                Act::Diff { from: String::new(), to: Some("HEAD".into()) },
                Act::Timeline,
            ]
        );
        // Taken once, and nothing left behind.
        assert!(take_acts(&q).is_empty());
        assert!(!q.with_extension("md.act").exists());
    }

    #[cfg(unix)]
    #[test]
    fn the_map_is_listable_only_once_a_tab_has_one() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let list = launcher().unwrap().with_file_name("slop-map-list");
        let run = || Command::new(&list).env("SLOP_CONTEXT", &q).output().unwrap();

        // No map yet: it says so rather than printing nothing, so Claude does
        // not read an empty outline as an empty map.
        let out = run();
        assert!(!out.status.success());
        assert!(String::from_utf8_lossy(&out.stderr).contains("no map yet"));

        std::fs::write(q.with_extension("md.map"), "repo: about\n\n- Sign ups — how people join\n").unwrap();
        let out = run();
        assert!(out.status.success());
        assert!(String::from_utf8_lossy(&out.stdout).contains("Sign ups"));

        // It goes with the tab: a stale outline must never outlive its map.
        forget(&q);
        assert!(!q.with_extension("md.map").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_bad_act_is_refused_or_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let show = launcher().unwrap().with_file_name("slop-map-show");
        for args in [vec!["section"], vec!["diff"], vec!["zoom", "in"], vec![]] {
            let out = Command::new(&show).args(&args).env("SLOP_CONTEXT", &q).output().unwrap();
            assert_eq!(out.status.code(), Some(2), "{args:?}");
            assert!(String::from_utf8_lossy(&out.stderr).contains("usage:"));
        }
        // Outside a tab there is nowhere to write to.
        assert!(!Command::new(&show).args(["section", "A"]).env("SLOP_CONTEXT", "").status().unwrap().success());
        assert!(!q.with_extension("md.act").exists());

        // A line the app cannot read is dropped, and its neighbours still arrive.
        std::fs::create_dir_all(dir.path()).unwrap();
        std::fs::write(q.with_extension("md.act"), "section\tA\t\ngibberish\nsection\t\t\nsection\tB\t\n").unwrap();
        assert_eq!(
            take_acts(&q),
            vec![Act::Section { section: "A".into() }, Act::Section { section: "B".into() }]
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_terminal_sees_only_a_link_to_the_plan_and_the_file_gets_it_back() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let file = dir.path().join("plan.md");
        let whole = "# Fix\n\nIt works.\n\n```diagram\n{\"boxes\": []}\n```\n\n```screen\n{}\n```\n\n## Steps\n1. Do it\n";
        let hide = || {
            let mut child = Command::new("sh")
                .args(["-c", HIDE])
                .env("SLOP_CONTEXT", &q)
                .stdin(std::process::Stdio::piped())
                .spawn()
                .unwrap();
            let input = serde_json::json!({ "tool_name": "ExitPlanMode", "tool_input": { "plan": "…", "planFilePath": file } });
            child.stdin.take().unwrap().write_all(input.to_string().as_bytes()).unwrap();
            assert!(child.wait().unwrap().success());
        };
        let read = || std::fs::read_to_string(&file).unwrap();

        std::fs::write(&file, whole).unwrap();
        hide();
        assert_eq!(read(), "# Fix\n\n`\u{25b8} Open plan`\n");
        run(RESTORE, &q);
        assert_eq!(read(), whole);
        // Once: a later hook finds nothing waiting.
        std::fs::write(&file, "# Revised\n").unwrap();
        run(RESTORE, &q);
        assert_eq!(read(), "# Revised\n");

        // A plan the user rewrote while the dialog was up is theirs, and stays.
        std::fs::write(&file, whole).unwrap();
        hide();
        std::fs::write(&file, "# Mine\n").unwrap();
        run(RESTORE, &q);
        assert_eq!(read(), "# Mine\n");

        // A plan with no title still gets its link.
        std::fs::write(&file, "Just do it.\n").unwrap();
        hide();
        assert_eq!(read(), "`\u{25b8} Open plan`\n");
        run(RESTORE, &q);
        assert_eq!(read(), "Just do it.\n");
    }

    #[cfg(unix)]
    #[test]
    fn a_plan_opens_once_and_its_acceptance_is_heard_once() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        assert!(take_plan(&q).is_none());
        // ExitPlanMode's PreToolUse hook, handed what Claude Code hands it.
        let mut child = Command::new("sh")
            .args(["-c", PLAN])
            .env("SLOP_CONTEXT", &q)
            .stdin(std::process::Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(br##"{"tool_name":"ExitPlanMode","tool_input":{"plan":"# Add /health\n\nIt answers ok.","planFilePath":"/p/plan.md"}}"##)
            .unwrap();
        assert!(child.wait().unwrap().success());
        let plan = take_plan(&q).unwrap();
        assert_eq!(plan.text, "# Add /health\n\nIt answers ok.");
        assert_eq!(plan.file.as_deref(), Some("/p/plan.md"));
        assert!(take_plan(&q).is_none());

        assert!(!take_approved(&q));
        run(APPROVED, &q);
        assert!(take_approved(&q));
        assert!(!take_approved(&q));

        // What Claude hears on acceptance must be JSON Claude Code can read.
        let said = Command::new("sh").args(["-c", TODOS]).output().unwrap();
        let said: serde_json::Value = serde_json::from_slice(&said.stdout).unwrap();
        assert!(said["hookSpecificOutput"]["additionalContext"].as_str().unwrap().contains("to-do list"));
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

    #[cfg(unix)]
    #[test]
    fn the_tab_keeps_its_conversation_while_claude_runs() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let q = dir.path().join("context-1.md");
        let start = |input: &str| {
            let mut child = Command::new("sh")
                .args(["-c", SESSION])
                .env("SLOP_CONTEXT", &q)
                .stdin(std::process::Stdio::piped())
                .spawn()
                .unwrap();
            child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
            assert!(child.wait().unwrap().success());
        };
        start(r#"{"session_id": "abc-1", "source": "startup"}"#);
        assert_eq!(session_of(&q).as_deref(), Some("abc-1"));
        // A /clear is a new conversation; input without one changes nothing.
        start(r#"{"session_id":"abc-2","source":"clear"}"#);
        start("{}");
        assert_eq!(session_of(&q).as_deref(), Some("abc-2"));
        // A reopened tab has it from the start, and loses it when Claude exits.
        resuming(&q, "abc-3").unwrap();
        assert_eq!(session_of(&q).as_deref(), Some("abc-3"));
        assert!(!launch(&q, "/usr/bin/false").success());
        assert!(session_of(&q).is_none());
        // Claude is handed it as its own two arguments, once.
        let args = dir.path().join("args");
        let probe = dir.path().join("probe");
        std::fs::write(&probe, format!("#!/bin/sh
printf '[%s]' \"$@\" > '{}'\n", args.display())).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&probe, std::fs::Permissions::from_mode(0o755)).unwrap();
        resuming(&q, "abc-4").unwrap();
        launch(&q, probe.to_str().unwrap());
        assert!(std::fs::read_to_string(&args).unwrap().ends_with("[--resume][abc-4]"));
        launch(&q, probe.to_str().unwrap());
        assert!(!std::fs::read_to_string(&args).unwrap().contains("--resume"));
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

    #[test]
    fn prune_takes_only_old_plans() {
        let dir = tempfile::tempdir().unwrap();
        let at = |name: &str, days: u64| {
            let p = dir.path().join(name);
            std::fs::write(&p, "# Plan\n").unwrap();
            let then = std::time::SystemTime::now() - std::time::Duration::from_secs(days * 24 * 3600);
            std::fs::File::options().write(true).open(&p).unwrap().set_modified(then).unwrap();
            p
        };
        let old = at("old.md", 40);
        let fresh = at("fresh.md", 2);
        let other = at("notes.txt", 40);
        std::fs::create_dir(dir.path().join("sub.md")).unwrap();
        prune_older(dir.path(), PLAN_AGE);
        assert!(!old.exists());
        assert!(fresh.exists() && other.exists() && dir.path().join("sub.md").is_dir());
        // A folder that is not there is nothing to do.
        prune_older(&dir.path().join("missing"), PLAN_AGE);
    }
}

