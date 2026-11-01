//! Programs the app runs behind the scenes: git, `where`, `adb`, Claude's
//! `--version`. On Windows a console program started from a windowed app
//! opens a console window of its own, which flashes on screen for every call;
//! `command` starts it without one.

use std::ffi::OsStr;
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn command(program: impl AsRef<OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// The user's home folder: `HOME` where there is one, else Windows' own.
pub fn home() -> Option<std::path::PathBuf> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(Into::into)
}

/// Which `program`s on PATH Windows would run, by `where`, in its order.
#[cfg(windows)]
pub fn where_is(program: &str) -> Vec<std::path::PathBuf> {
    command("where")
        .arg(program)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).lines().map(|l| l.trim().into()).collect())
        .unwrap_or_default()
}
