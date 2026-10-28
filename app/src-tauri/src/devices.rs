//! What a project runs as, and the phones it runs on.
//!
//! `project_detect` reads a checkout for how to start it: a web dev server
//! (components/workspace.tsx starts it when the project opens, and the preview
//! follows it), an Android app, an iOS app. Nothing is installed for a phone
//! until a project has one and the user asks: then `device_setup` writes a
//! script that a terminal tab runs in front of them, so every download and
//! license is theirs to see and stop.
//!
//! Android needs no Android Studio: Google publishes the SDK's command-line
//! tools, emulator and system images on their own, and they go under the
//! app's data folder (or an SDK already on the machine is used). The iOS
//! Simulator only comes with Xcode, which only Apple distributes, so setting
//! it up means installing Xcode once; it is never opened. Either way the
//! phone runs with no window of its own and its screen is drawn in the app's
//! tab (components/device.tsx), from screenshots, with taps sent back: `adb`
//! for Android, `simctl` and `idb` for iOS.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/* ── what a project runs as ───────────────────────────────────── */

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Expo,
    ReactNative,
    Flutter,
    Native,
}

fn package(root: &Path) -> Option<serde_json::Value> {
    serde_json::from_str(&std::fs::read_to_string(root.join("package.json")).ok()?).ok()
}

fn depends_on(pkg: &serde_json::Value, name: &str) -> bool {
    ["dependencies", "devDependencies"].iter().any(|k| pkg.get(k).and_then(|d| d.get(name)).is_some())
}

fn kind(root: &Path) -> Kind {
    if root.join("pubspec.yaml").is_file() {
        return Kind::Flutter;
    }
    match package(root) {
        Some(p) if depends_on(&p, "expo") => Kind::Expo,
        Some(p) if depends_on(&p, "react-native") => Kind::ReactNative,
        _ => Kind::Native,
    }
}

/// The package manager the lockfile names, as `(install, run <script>)`.
fn manager(root: &Path) -> (&'static str, &'static str) {
    if root.join("pnpm-lock.yaml").is_file() {
        ("pnpm install", "pnpm run")
    } else if root.join("yarn.lock").is_file() {
        ("yarn install", "yarn run")
    } else if root.join("bun.lockb").is_file() || root.join("bun.lock").is_file() {
        ("bun install", "bun run")
    } else {
        ("npm install", "npm run")
    }
}

/// The command that serves the project as a web app, if it is one: its `dev`
/// script; for a React Native app, its `web` script when it can run on the web
/// at all; else a `start` that is not a phone's bundler. Dependencies are
/// installed first when they never were. `BROWSER=none` keeps Vite, Create
/// React App and the like from opening a browser of their own.
fn web(root: &Path) -> Option<String> {
    let pkg = package(root)?;
    let scripts = pkg.get("scripts")?;
    let has = |s: &str| scripts.get(s).and_then(|v| v.as_str()).is_some();
    let phone = depends_on(&pkg, "expo") || depends_on(&pkg, "react-native");
    let script = if has("dev") {
        "dev"
    } else if phone {
        if has("web") && depends_on(&pkg, "react-native-web") { "web" } else { return None }
    } else if has("start") {
        "start"
    } else {
        return None;
    };
    let (install, run) = manager(root);
    let start = if cfg!(windows) { format!("{run} {script}") } else { format!("BROWSER=none {run} {script}") };
    Some(if root.join("node_modules").is_dir() { start } else { format!("{install} && {start}") })
}

fn has_child(dir: &Path, ext: &str) -> bool {
    std::fs::read_dir(dir)
        .map(|d| d.flatten().any(|e| e.path().extension().is_some_and(|x| x == ext)))
        .unwrap_or(false)
}

fn android_dir(root: &Path) -> Option<PathBuf> {
    [root.join("android"), root.to_path_buf()].into_iter().find(|d| {
        ["settings.gradle", "settings.gradle.kts"].iter().any(|f| d.join(f).is_file())
            && (d.join("app/src/main/AndroidManifest.xml").is_file() || d.join("app/build.gradle").is_file() || d.join("app/build.gradle.kts").is_file())
    })
}

fn ios_dir(root: &Path) -> Option<PathBuf> {
    [root.join("ios"), root.to_path_buf()]
        .into_iter()
        .find(|d| has_child(d, "xcworkspace") || has_child(d, "xcodeproj"))
}

#[derive(serde::Serialize)]
pub struct Project {
    /// How to start its web dev server.
    web: Option<String>,
    android: bool,
    ios: bool,
}

#[tauri::command]
pub fn project_detect(root: String) -> Project {
    let root = PathBuf::from(root);
    // An Expo app can make either native project when asked, so it has both.
    let expo = kind(&root) == Kind::Expo;
    Project {
        web: web(&root),
        android: expo || android_dir(&root).is_some(),
        ios: expo || ios_dir(&root).is_some(),
    }
}

/* ── where things go ──────────────────────────────────────────── */

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// The app's data folder, where Tauri keeps it.
fn data() -> PathBuf {
    let id = "dev.understand-slop.app";
    if cfg!(target_os = "macos") {
        home().join("Library/Application Support").join(id)
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share")).join(id)
    }
}

fn q(s: &Path) -> String {
    format!("'{}'", s.to_string_lossy().replace('\'', r"'\''"))
}

fn ok(cmd: &mut Command) -> Option<String> {
    let out = cmd.stdin(Stdio::null()).stderr(Stdio::null()).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/* ── Android ──────────────────────────────────────────────────── */

/// An SDK already on the machine (Android Studio's, or one set in the
/// environment), else the app's own.
fn sdk() -> PathBuf {
    let env = ["ANDROID_HOME", "ANDROID_SDK_ROOT"].iter().filter_map(std::env::var_os).map(PathBuf::from);
    let studio = if cfg!(target_os = "macos") { home().join("Library/Android/sdk") } else { home().join("Android/Sdk") };
    env.chain([studio])
        .find(|p| p.join("platform-tools").is_dir() || p.join("cmdline-tools").is_dir())
        .unwrap_or_else(|| data().join("android/sdk"))
}

fn java_home() -> Option<PathBuf> {
    let has = |p: &Path| p.join("bin/java").is_file();
    let own = data().join("android/jdk");
    if has(&own) {
        return Some(own);
    }
    if let Some(p) = std::env::var_os("JAVA_HOME").map(PathBuf::from).filter(|p| has(p)) {
        return Some(p);
    }
    let studio = PathBuf::from("/Applications/Android Studio.app/Contents/jbr/Contents/Home");
    if has(&studio) {
        return Some(studio);
    }
    // Android's Gradle plugin runs on 17 or 21, not on whatever is newest.
    #[cfg(target_os = "macos")]
    for v in ["17", "21"] {
        if let Some(p) = ok(Command::new("/usr/libexec/java_home").args(["-v", v])).map(|s| PathBuf::from(s.trim())) {
            if has(&p) {
                return Some(p);
            }
        }
    }
    None
}

fn adb(sdk: &Path) -> PathBuf {
    sdk.join("platform-tools/adb")
}

fn emulator(sdk: &Path) -> PathBuf {
    sdk.join("emulator/emulator")
}

fn avds(sdk: &Path) -> Vec<String> {
    let Some(out) = ok(Command::new(emulator(sdk)).arg("-list-avds").env("ANDROID_HOME", sdk)) else { return Vec::new() };
    let mut all: Vec<String> = out
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("INFO") && !l.contains(' '))
        .map(String::from)
        .collect();
    // The one the setup made comes first.
    all.sort_by_key(|a| a != "slop_phone");
    all
}

/// An emulator adb can already talk to.
fn emulator_serial(sdk: &Path) -> Option<String> {
    ok(Command::new(adb(sdk)).arg("devices"))?
        .lines()
        .filter_map(|l| l.split_once('\t'))
        .find(|(s, state)| s.starts_with("emulator-") && state.trim() == "device")
        .map(|(s, _)| s.to_string())
}

fn booted(sdk: &Path, serial: &str) -> bool {
    ok(Command::new(adb(sdk)).args(["-s", serial, "shell", "getprop", "sys.boot_completed"])).is_some_and(|s| s.trim() == "1")
}

const ANDROID_SETUP: &str = r#"#!/bin/sh
# Sets up the Android emulator for understand-slop, without Android Studio
# (src-tauri/src/devices.rs). Safe to run again: it skips what is there.
set -e
SDK=__SDK__
JDK=__JDK__
IMAGE="system-images;android-35;google_apis;__ABI__"
export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"
echo "Setting up the Android emulator in $SDK"
echo "Only what is missing is downloaded; building an app fetches Gradle's own on top."
echo "Ctrl+C stops at any point; running this again picks up where it left off."
echo
mkdir -p "$SDK"
if ! "$JDK/bin/java" -version >/dev/null 2>&1; then
  echo "→ Java 17, for the Android tools and Gradle"
  tmp=$(mktemp -d)
  curl -fL --progress-bar "https://api.adoptium.net/v3/binary/latest/17/ga/__OS__/__ARCH__/jdk/hotspot/normal/eclipse" -o "$tmp/jdk.tar.gz"
  mkdir "$tmp/jdk" && tar -xzf "$tmp/jdk.tar.gz" -C "$tmp/jdk"
  java=$(find "$tmp/jdk" -type f -path '*/bin/java' | head -n 1)
  rm -rf "$JDK" && mkdir -p "$(dirname "$JDK")" && mv "$(dirname "$(dirname "$java")")" "$JDK"
  rm -rf "$tmp"
fi
export JAVA_HOME="$JDK"
TOOLS="$SDK/cmdline-tools/latest/bin"
# Only what is missing: an SDK that already has a virtual phone keeps its own.
PKGS=""
[ -x "$SDK/platform-tools/adb" ] || PKGS="$PKGS platform-tools"
[ -x "$SDK/emulator/emulator" ] || PKGS="$PKGS emulator"
PHONES=$("$SDK/emulator/emulator" -list-avds 2>/dev/null | grep -v '^INFO' || true)
[ -n "$PHONES" ] || PKGS="$PKGS platforms;android-35 build-tools;35.0.0 $IMAGE"
if [ -n "$PKGS" ] && [ ! -x "$TOOLS/sdkmanager" ]; then
  echo "→ Android command-line tools"
  tmp=$(mktemp -d)
  curl -fL --progress-bar "https://dl.google.com/android/repository/commandlinetools-__CLT__-11076708_latest.zip" -o "$tmp/tools.zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$SDK/cmdline-tools" && rm -rf "$SDK/cmdline-tools/latest" && mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
if [ -n "$PKGS" ]; then
  echo
  echo "→ Google's licenses for the Android SDK: read each, and answer y to accept"
  "$TOOLS/sdkmanager" --sdk_root="$SDK" --licenses
  echo
  echo "→ Installing:$PKGS"
  "$TOOLS/sdkmanager" --sdk_root="$SDK" --install $PKGS
fi
if [ -z "$PHONES" ]; then
  echo "→ A virtual Pixel 7"
  echo no | "$TOOLS/avdmanager" create avd -n slop_phone -k "$IMAGE" -d pixel_7
fi
echo
echo "Done. Back in the Android tab, press Start."
"#;

/* ── iOS ──────────────────────────────────────────────────────── */

fn simctl_ok() -> bool {
    cfg!(target_os = "macos") && ok(Command::new("xcrun").args(["simctl", "help"])).is_some()
}

fn idb() -> Option<PathBuf> {
    let candidates = [home().join(".local/bin/idb"), "/opt/homebrew/bin/idb".into(), "/usr/local/bin/idb".into()];
    candidates.into_iter().find(|p| p.is_file()).or_else(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
        let p = PathBuf::from(ok(Command::new(shell).args(["-lc", "command -v idb"]))?.trim());
        p.is_file().then_some(p)
    })
}

const IOS_SETUP: &str = r#"#!/bin/sh
# Sets up the iOS Simulator for understand-slop (src-tauri/src/devices.rs).
# The simulator comes only with Xcode; it is installed once and never opened.
XCODE=$(mdfind "kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'" 2>/dev/null | head -n 1)
[ -n "$XCODE" ] || XCODE=/Applications/Xcode.app
if [ ! -d "$XCODE" ]; then
  echo "The iOS Simulator only comes with Xcode, which only Apple distributes."
  echo "Opening Xcode in the App Store: a large download, 10 GB or more."
  echo "Once it is installed, press Set up in the iOS tab again to finish."
  open "macappstore://apps.apple.com/app/id497799835"
  exit 0
fi
set -e
echo "Using $XCODE"
if [ "$(xcode-select -p)" != "$XCODE/Contents/Developer" ]; then
  echo "→ Pointing the command-line tools at it (asks for your password)"
  sudo xcode-select -s "$XCODE/Contents/Developer"
fi
if ! xcodebuild -license check >/dev/null 2>&1; then
  echo "→ Apple's Xcode license: read it, and type agree to accept"
  sudo xcodebuild -license
fi
xcodebuild -runFirstLaunch
if ! xcrun simctl list runtimes | grep -q '^iOS'; then
  echo "→ The iOS Simulator runtime, several GB"
  xcodebuild -downloadPlatform iOS
fi
echo
if ! command -v idb >/dev/null 2>&1; then
  echo "To tap and type in the simulator from the app, install Meta's idb as well:"
  echo "  brew tap facebook/fb && brew install idb-companion && pipx install fb-idb"
  echo "Without it the iOS tab still shows the simulator's screen."
  echo
fi
echo "Done. Back in the iOS tab, press Start."
"#;

#[derive(serde::Deserialize)]
struct SimList {
    devices: std::collections::HashMap<String, Vec<Sim>>,
}

#[derive(serde::Deserialize, Clone)]
struct Sim {
    udid: String,
    name: String,
    state: String,
    #[serde(rename = "isAvailable", default)]
    available: bool,
}

/// A booted iPhone, else the newest runtime's first iPhone.
fn pick_sim() -> Result<Sim, String> {
    let out = ok(Command::new("xcrun").args(["simctl", "list", "devices", "available", "-j"])).ok_or("simctl could not list simulators.")?;
    let list: SimList = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let mut runtimes: Vec<(&String, &Vec<Sim>)> = list.devices.iter().filter(|(r, _)| r.contains("iOS")).collect();
    // `…SimRuntime.iOS-18-2`: newest last, by version.
    let version = |r: &str| -> Vec<u32> { r.rsplit("iOS-").next().unwrap_or("").split('-').filter_map(|n| n.parse().ok()).collect() };
    runtimes.sort_by_key(|(r, _)| version(r));
    let phones = runtimes.iter().rev().flat_map(|(_, d)| d.iter()).filter(|d| d.available && d.name.starts_with("iPhone"));
    let all: Vec<&Sim> = phones.collect();
    all.iter()
        .find(|d| d.state == "Booted")
        .or_else(|| all.first())
        .map(|d| (*d).clone())
        .ok_or_else(|| "No iPhone simulator is installed: run Set up again to fetch the iOS runtime.".into())
}

/* ── the running phones ───────────────────────────────────────── */

struct Running {
    /// adb serial or simulator udid.
    id: String,
    name: String,
    /// Started here, so ended here when the app quits.
    child: Option<Child>,
    ours: bool,
    /// The screen in pixels, from the last screenshot.
    size: Option<(u32, u32)>,
    /// iOS: pixels per point, for idb, which taps in points.
    density: Option<f64>,
}

#[derive(Default)]
struct Phones {
    android: Option<Running>,
    ios: Option<Running>,
}

fn phones() -> &'static Mutex<Phones> {
    static P: OnceLock<Mutex<Phones>> = OnceLock::new();
    P.get_or_init(Default::default)
}

fn slot<'a>(p: &'a mut Phones, platform: &str) -> Result<&'a mut Option<Running>, String> {
    match platform {
        "android" => Ok(&mut p.android),
        "ios" => Ok(&mut p.ios),
        _ => Err(format!("No such platform: {platform}")),
    }
}

/// Ends the phones the app started, when it quits.
pub fn stop_all() {
    let mut p = phones().lock().unwrap();
    if let Some(mut a) = p.android.take() {
        let _ = Command::new(adb(&sdk())).args(["-s", &a.id, "emu", "kill"]).status();
        if let Some(c) = a.child.as_mut() {
            let _ = c.kill();
        }
    }
    if let Some(i) = p.ios.take().filter(|i| i.ours) {
        let _ = Command::new("xcrun").args(["simctl", "shutdown", &i.id]).status();
    }
}

#[derive(serde::Serialize)]
pub struct Status {
    /// Everything it needs is installed.
    ready: bool,
    /// What is missing, said plainly.
    missing: Vec<String>,
    /// The phone running now, by name.
    running: Option<String>,
    /// Where setup puts things, and roughly how much.
    location: String,
    size: String,
    /// Setup can be run on this machine.
    can_setup: bool,
    /// Something worth knowing that is not a blocker.
    note: Option<String>,
}

fn status(platform: &str) -> Status {
    let running = {
        let p = phones().lock().unwrap();
        if platform == "android" { p.android.as_ref() } else { p.ios.as_ref() }.map(|r| r.name.clone())
    };
    if platform == "android" {
        let sdk = sdk();
        let mut missing = Vec::new();
        if java_home().is_none() {
            missing.push("Java 17".into());
        }
        if !adb(&sdk).is_file() || !emulator(&sdk).is_file() {
            missing.push("the Android emulator and platform tools".into());
        }
        if emulator(&sdk).is_file() && avds(&sdk).is_empty() {
            missing.push("a virtual phone".into());
        }
        let size = if missing.len() == 1 && java_home().is_none() { "about 200 MB" } else { "about 4–6 GB" };
        Status {
            ready: missing.is_empty(),
            missing,
            running,
            location: sdk.to_string_lossy().into_owned(),
            size: size.into(),
            can_setup: cfg!(unix),
            note: None,
        }
    } else {
        let macos = cfg!(target_os = "macos");
        let ready = simctl_ok();
        Status {
            ready,
            missing: if ready { Vec::new() } else { vec!["Xcode".into()] },
            running,
            location: "/Applications/Xcode.app".into(),
            size: "10 GB or more, from the App Store".into(),
            can_setup: macos,
            note: if !macos {
                Some("The iOS Simulator only runs on a Mac.".into())
            } else if ready && idb().is_none() {
                Some("Tapping and typing need Meta's idb: brew tap facebook/fb && brew install idb-companion && pipx install fb-idb".into())
            } else {
                None
            },
        }
    }
}

#[tauri::command]
pub async fn device_status(platform: String) -> Status {
    tauri::async_runtime::spawn_blocking(move || status(&platform)).await.unwrap_or_else(|e| Status {
        ready: false,
        missing: vec![e.to_string()],
        running: None,
        location: String::new(),
        size: String::new(),
        can_setup: false,
        note: None,
    })
}

/// Writes the setup script and says how to run it, in a terminal tab.
#[tauri::command]
pub fn device_setup(platform: String) -> Result<String, String> {
    let script = if platform == "android" {
        let arm = cfg!(target_arch = "aarch64");
        ANDROID_SETUP
            .replace("__SDK__", &q(&sdk()))
            .replace("__JDK__", &q(&java_home().unwrap_or_else(|| data().join("android/jdk"))))
            .replace("__ABI__", if arm { "arm64-v8a" } else { "x86_64" })
            .replace("__OS__", if cfg!(target_os = "macos") { "mac" } else { "linux" })
            .replace("__ARCH__", if arm { "aarch64" } else { "x64" })
            .replace("__CLT__", if cfg!(target_os = "macos") { "mac" } else { "linux" })
    } else {
        IOS_SETUP.to_string()
    };
    let path = data().join(format!("setup-{platform}.sh"));
    std::fs::create_dir_all(data()).map_err(|e| e.to_string())?;
    std::fs::write(&path, script).map_err(|e| e.to_string())?;
    Ok(format!("sh {}", q(&path)))
}

#[derive(serde::Serialize)]
pub struct Device {
    id: String,
    name: String,
}

fn start(platform: &str) -> Result<Device, String> {
    if let Some(r) = slot(&mut phones().lock().unwrap(), platform)?.as_ref() {
        return Ok(Device { id: r.id.clone(), name: r.name.clone() });
    }
    let running = if platform == "android" { start_android()? } else { start_ios()? };
    let device = Device { id: running.id.clone(), name: running.name.clone() };
    *slot(&mut phones().lock().unwrap(), platform)? = Some(running);
    Ok(device)
}

fn start_android() -> Result<Running, String> {
    let sdk = sdk();
    if let Some(serial) = emulator_serial(&sdk) {
        return Ok(Running { name: "Android emulator".into(), id: serial, child: None, ours: false, size: None, density: None });
    }
    let avd = avds(&sdk).into_iter().next().ok_or("There is no virtual phone yet: run Set up.")?;
    let log = data().join("android/emulator.log");
    // The SDK may be Android Studio's, so the app's own folder may not exist yet.
    let _ = std::fs::create_dir_all(data().join("android"));
    // No window of its own: the tab draws its screen. Some emulator builds
    // cannot hide their window, so the second try has none at all.
    for flags in [&["-qt-hide-window"][..], &["-no-window", "-gpu", "swiftshader_indirect"][..]] {
        let out = std::fs::File::create(&log).map_err(|e| e.to_string())?;
        let mut child = Command::new(emulator(&sdk))
            .args(["-avd", &avd, "-no-audio", "-no-boot-anim"])
            .args(flags)
            .env("ANDROID_HOME", &sdk)
            .env("ANDROID_SDK_ROOT", &sdk)
            .stdin(Stdio::null())
            .stdout(out.try_clone().map_err(|e| e.to_string())?)
            .stderr(out)
            .spawn()
            .map_err(|e| e.to_string())?;
        let begun = Instant::now();
        loop {
            if child.try_wait().ok().flatten().is_some() {
                break;
            }
            if let Some(serial) = emulator_serial(&sdk).filter(|s| booted(&sdk, s)) {
                return Ok(Running { name: avd.replace('_', " "), id: serial, child: Some(child), ours: true, size: None, density: None });
            }
            if begun.elapsed() > Duration::from_secs(300) {
                let _ = child.kill();
                return Err(format!("The emulator did not finish starting in five minutes. Its log: {}", log.display()));
            }
            std::thread::sleep(Duration::from_secs(2));
        }
    }
    let log = std::fs::read_to_string(&log).unwrap_or_default();
    let lines: Vec<&str> = log.lines().collect();
    let tail = lines[lines.len().saturating_sub(6)..].join("\n");
    Err(format!("The emulator stopped while starting:\n{tail}"))
}

fn start_ios() -> Result<Running, String> {
    if !simctl_ok() {
        return Err("The iOS Simulator needs Xcode: run Set up.".into());
    }
    let sim = pick_sim()?;
    let ours = sim.state != "Booted";
    if ours {
        // Booted with simctl alone, the simulator has no window; Simulator.app is never opened.
        ok(Command::new("xcrun").args(["simctl", "boot", &sim.udid])).ok_or("simctl could not boot the simulator.")?;
    }
    ok(Command::new("xcrun").args(["simctl", "bootstatus", &sim.udid, "-b"])).ok_or("The simulator did not finish booting.")?;
    Ok(Running { id: sim.udid, name: sim.name, child: None, ours, size: None, density: None })
}

#[tauri::command]
pub async fn device_start(platform: String) -> Result<Device, String> {
    tauri::async_runtime::spawn_blocking(move || start(&platform)).await.map_err(|e| e.to_string())?
}

fn running_id(platform: &str) -> Result<String, String> {
    slot(&mut phones().lock().unwrap(), platform)?
        .as_ref()
        .map(|r| r.id.clone())
        .ok_or_else(|| format!("No {} is running in the app: the user starts one from its tab.", if platform == "ios" { "iOS Simulator" } else { "Android emulator" }))
}

/// The screen now, as a PNG.
fn frame(platform: &str) -> Result<Vec<u8>, String> {
    let id = running_id(platform)?;
    let png = if platform == "android" {
        let out = Command::new(adb(&sdk())).args(["-s", &id, "exec-out", "screencap", "-p"]).stderr(Stdio::null()).output().map_err(|e| e.to_string())?;
        if !out.status.success() || out.stdout.len() < 24 {
            return Err("The emulator did not send its screen.".into());
        }
        out.stdout
    } else {
        let file = std::env::temp_dir().join(format!("slop-sim-{}.png", std::process::id()));
        ok(Command::new("xcrun").args(["simctl", "io", &id, "screenshot", "--type=png"]).arg(&file)).ok_or("The simulator did not send its screen.")?;
        std::fs::read(&file).map_err(|e| e.to_string())?
    };
    if let Some(r) = slot(&mut phones().lock().unwrap(), platform)?.as_mut() {
        r.size = crate::mcp::png_size(&png);
    }
    Ok(png)
}

#[tauri::command]
pub async fn device_frame(platform: String) -> Result<tauri::ipc::Response, String> {
    let png = tauri::async_runtime::spawn_blocking(move || frame(&platform)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(png))
}

/// A touch or a key. Points are fractions of the screen, 0 to 1, so the tab
/// need not know its pixels.
#[derive(serde::Deserialize, Default)]
pub struct Input {
    kind: String,
    #[serde(default)]
    x: f64,
    #[serde(default)]
    y: f64,
    #[serde(default)]
    x2: f64,
    #[serde(default)]
    y2: f64,
    #[serde(default)]
    ms: u32,
    #[serde(default)]
    text: String,
}

/// What `adb shell input text` needs: its own space, and the device shell's specials escaped.
fn adb_text(t: &str) -> String {
    t.chars()
        .map(|c| match c {
            ' ' => "%s".to_string(),
            '\\' | '\'' | '"' | '(' | ')' | '<' | '>' | '|' | ';' | '&' | '*' | '~' | '$' | '`' | '#' | '?' | '[' | ']' | '{' | '}' | '%' | '!' => format!("\\{c}"),
            c => c.to_string(),
        })
        .collect()
}

fn input(platform: &str, i: &Input) -> Result<(), String> {
    let id = running_id(platform)?;
    let (size, density) = {
        let p = phones().lock().unwrap();
        let r = if platform == "android" { p.android.as_ref() } else { p.ios.as_ref() };
        (r.and_then(|r| r.size), r.and_then(|r| r.density))
    };
    let (w, h) = match size {
        Some(s) => s,
        None => {
            frame(platform)?;
            return input(platform, i);
        }
    };
    let run = |cmd: &mut Command| -> Result<(), String> {
        let out = cmd.stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
        if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
        }
    };
    if platform == "android" {
        let px = |f: f64, of: u32| ((f.clamp(0.0, 1.0) * of as f64) as u32).to_string();
        let adb = adb(&sdk());
        let shell = |args: &[&str]| run(Command::new(&adb).args(["-s", &id, "shell", "input"]).args(args));
        return match i.kind.as_str() {
            "tap" => shell(&["tap", &px(i.x, w), &px(i.y, h)]),
            "swipe" => shell(&["swipe", &px(i.x, w), &px(i.y, h), &px(i.x2, w), &px(i.y2, h), &i.ms.max(100).to_string()]),
            "text" => {
                // adb types ASCII alone, and fails partway, in Java, on anything else.
                let other: String = i.text.chars().filter(|c| !c.is_ascii()).collect();
                if !other.is_empty() {
                    return Err(format!("The Android emulator can only be typed into in plain ASCII, and nothing was typed: not {other}."));
                }
                for (n, line) in i.text.split('\n').enumerate() {
                    if n > 0 {
                        shell(&["keyevent", "66"])?;
                    }
                    if !line.is_empty() {
                        shell(&["text", &adb_text(line)])?;
                    }
                }
                Ok(())
            }
            "key" => {
                let code = match i.text.to_ascii_lowercase().as_str() {
                    "home" => "3",
                    "back" | "escape" => "4",
                    "enter" => "66",
                    "delete" | "backspace" => "67",
                    "recents" | "app_switch" => "187",
                    k => return Err(format!("No key called {k} on Android: home, back, enter, delete, recents.")),
                };
                shell(&["keyevent", code])
            }
            k => Err(format!("No input called {k}.")),
        };
    }
    let idb = idb().ok_or("Tapping in the iOS Simulator needs Meta's idb: brew tap facebook/fb && brew install idb-companion && pipx install fb-idb")?;
    let density = match density {
        Some(d) => d,
        None => {
            let d = ok(Command::new(&idb).args(["describe", "--udid", &id, "--json"]))
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("screen_dimensions")?.get("density")?.as_f64())
                .unwrap_or(3.0);
            if let Some(r) = phones().lock().unwrap().ios.as_mut() {
                r.density = Some(d);
            }
            d
        }
    };
    let pt = |f: f64, of: u32| ((f.clamp(0.0, 1.0) * of as f64 / density) as u32).to_string();
    let ui = |args: &[&str]| run(Command::new(&idb).arg("ui").args(args).args(["--udid", &id]));
    match i.kind.as_str() {
        "tap" => ui(&["tap", &pt(i.x, w), &pt(i.y, h)]),
        "swipe" => ui(&["swipe", &pt(i.x, w), &pt(i.y, h), &pt(i.x2, w), &pt(i.y2, h), "--duration", &format!("{:.2}", i.ms.max(100) as f64 / 1000.0)]),
        "text" => ui(&["text", &i.text]),
        "key" => match i.text.to_ascii_lowercase().as_str() {
            "home" => ui(&["button", "HOME"]),
            "enter" => ui(&["key", "40"]),
            "delete" | "backspace" => ui(&["key", "42"]),
            "back" | "escape" => Err("An iPhone has no back button: swipe from the left edge instead.".into()),
            k => Err(format!("No key called {k} on iOS: home, enter, delete.")),
        },
        k => Err(format!("No input called {k}.")),
    }
}

#[tauri::command]
pub async fn device_input(platform: String, input: Input) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || self::input(&platform, &input)).await.map_err(|e| e.to_string())?
}

/// The shell command that builds the project's app and opens it on the
/// running phone, typed into a terminal tab so the build is in view.
#[tauri::command]
pub fn device_run(platform: String, root: String) -> Result<String, String> {
    let id = running_id(&platform)?;
    let root = PathBuf::from(root);
    let kind = kind(&root);
    if platform == "android" {
        let sdk = sdk();
        let java = java_home().ok_or("Java 17 is missing: run Set up.")?;
        let env = format!(
            "export ANDROID_HOME={sdk} ANDROID_SDK_ROOT={sdk} JAVA_HOME={java} PATH={tools}:{emu}:{bin}:\"$PATH\"; ",
            sdk = q(&sdk),
            java = q(&java),
            tools = q(&sdk.join("platform-tools")),
            emu = q(&sdk.join("emulator")),
            bin = q(&java.join("bin")),
        );
        let run = match kind {
            Kind::Expo => "npx expo run:android".to_string(),
            Kind::ReactNative => "npx react-native run-android".to_string(),
            Kind::Flutter => format!("flutter run -d {id}"),
            Kind::Native => {
                let dir = android_dir(&root).ok_or("This project has no Android app to build.")?;
                let launch = application_id(&dir)
                    .map(|app| format!(" && adb -s {id} shell monkey -p {app} -c android.intent.category.LAUNCHER 1"))
                    .unwrap_or_default();
                format!("(cd {} && ./gradlew installDebug){launch}", q(&dir))
            }
        };
        return Ok(env + &run);
    }
    Ok(match kind {
        Kind::Expo => format!("npx expo run:ios --device {id}"),
        Kind::ReactNative => format!("npx react-native run-ios --udid {id}"),
        Kind::Flutter => format!("flutter run -d {id}"),
        Kind::Native => {
            let dir = ios_dir(&root).ok_or("This project has no iOS app to build.")?;
            let (flag, file) = std::fs::read_dir(&dir)
                .map_err(|e| e.to_string())?
                .flatten()
                .map(|e| e.path())
                .filter_map(|p| match p.extension().and_then(|x| x.to_str()) {
                    Some("xcworkspace") => Some(("-workspace", p)),
                    Some("xcodeproj") => Some(("-project", p)),
                    _ => None,
                })
                .min_by_key(|(f, _)| *f != "-workspace")
                .ok_or("This project has no Xcode project.")?;
            let scheme = file.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            let build = std::env::temp_dir().join("slop-ios-build");
            format!(
                "xcodebuild {flag} {file} -scheme {scheme} -destination id={id} -derivedDataPath {build} build && app=$(find {products} -maxdepth 2 -name '*.app' | head -n 1) && xcrun simctl install {id} \"$app\" && xcrun simctl launch {id} \"$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' \"$app/Info.plist\")\"",
                file = q(&file),
                scheme = q(Path::new(&scheme)),
                build = q(&build),
                products = q(&build.join("Build/Products")),
            )
        }
    })
}

fn application_id(dir: &Path) -> Option<String> {
    ["app/build.gradle", "app/build.gradle.kts"].iter().find_map(|f| {
        let text = std::fs::read_to_string(dir.join(f)).ok()?;
        let line = text.lines().find(|l| l.trim_start().starts_with("applicationId"))?;
        let quoted = line.split(['"', '\'']).nth(1)?;
        Some(quoted.to_string())
    })
}

/* ── Claude's `device` tool (mcp.rs) ──────────────────────────── */

/// A phone's screen is 2–3 times its points across. A picture that large is
/// shrunk before Claude sees it, so coordinates read off it would land wide
/// of the mark: it is made smaller by a whole factor here instead, to about
/// a thousand pixels at most, and coordinates are taken in it. On an iPhone
/// that is its points.
fn divisor(w: u32, h: u32) -> u32 {
    if cfg!(target_os = "macos") { w.max(h).div_ceil(1000).max(1) } else { 1 }
}

/// The screenshot made smaller by `divisor`, and the divisor it was; as it is
/// where it cannot be (`sips` is macOS's own).
fn shrink(png: &[u8], w: u32, h: u32) -> (Vec<u8>, u32) {
    let d = divisor(w, h);
    if d == 1 {
        return (png.to_vec(), 1);
    }
    static NEXT: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
    let n = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = std::env::temp_dir();
    let (from, to) = (tmp.join(format!("slop-shot-{}-{n}.png", std::process::id())), tmp.join(format!("slop-shot-{}-{n}-small.png", std::process::id())));
    let small = std::fs::write(&from, png).ok().and_then(|_| {
        ok(Command::new("sips").args(["--resampleWidth", &(w / d).to_string()]).arg(&from).arg("--out").arg(&to))?;
        std::fs::read(&to).ok()
    });
    let _ = (std::fs::remove_file(&from), std::fs::remove_file(&to));
    match small {
        Some(s) => (s, d),
        None => (png.to_vec(), 1),
    }
}

pub fn tool(args: &serde_json::Value, app: &tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    use serde_json::json;
    let p = phones().lock().unwrap();
    let platform = match args.get("platform").and_then(|v| v.as_str()) {
        Some(p) => p.to_string(),
        None => match (&p.ios, &p.android) {
            (Some(_), None) => "ios".into(),
            (None, Some(_)) => "android".into(),
            (Some(_), Some(_)) => return Err("Both an iOS Simulator and an Android emulator are running: say which with platform.".into()),
            (None, None) => return Err("No phone is running in the app. The user starts one from the iOS or Android tab.".into()),
        },
    };
    let known = match platform.as_str() {
        "ios" => p.ios.as_ref(),
        "android" => p.android.as_ref(),
        other => return Err(format!("No such platform: {other}")),
    }
    .and_then(|r| r.size);
    drop(p);
    let action = args.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let point = |key: &str| -> Option<(f64, f64)> {
        let a = args.get(key)?.as_array()?;
        Some((a.first()?.as_f64()?, a.get(1)?.as_f64()?))
    };
    if action == "screenshot" {
        let png = frame(&platform)?;
        let (w, h) = crate::mcp::png_size(&png).unwrap_or((0, 0));
        let (png, d) = shrink(&png, w, h);
        return Ok(vec![
            json!({ "type": "image", "data": crate::mcp::base64(&png), "mimeType": "image/png" }),
            json!({ "type": "text", "text": format!("The {platform} screen, {}×{} pixels: coordinates are this picture's.", w / d, h / d) }),
        ]);
    }
    let (w, h) = match known {
        Some(s) => s,
        None => crate::mcp::png_size(&frame(&platform)?).ok_or("The screen's size is unknown.")?,
    };
    // Coordinates are the screenshot's, which is the screen made smaller.
    let d = divisor(w, h) as f64;
    let (w, h) = (w as f64 / d, h as f64 / d);
    let at = |key: &str| point(key).map(|(x, y)| (x / w, y / h)).ok_or_else(|| format!("{action} needs {key}: [x, y]."));
    let text = args.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let i = match action {
        "tap" => {
            let (x, y) = at("coordinate")?;
            Input { kind: "tap".into(), x, y, ..Default::default() }
        }
        "swipe" => {
            let ((x, y), (x2, y2)) = (at("coordinate")?, at("to")?);
            Input { kind: "swipe".into(), x, y, x2, y2, ms: 300, ..Default::default() }
        }
        "type" => Input { kind: "text".into(), text, ..Default::default() },
        "key" => Input { kind: "key".into(), text, ..Default::default() },
        a => return Err(format!("No device action called {a}.")),
    };
    // Claude's pointer goes there first, in the phone's tab (components/device.tsx), as it does on a page.
    if matches!(action, "tap" | "swipe") {
        use tauri::Emitter;
        let _ = app.emit_to("main", "slop:device-touch", json!({ "platform": platform, "x": i.x, "y": i.y, "x2": i.x2, "y2": i.y2, "swipe": action == "swipe" }));
        std::thread::sleep(Duration::from_millis(450));
    }
    input(&platform, &i)?;
    Ok(vec![json!({ "type": "text", "text": format!("Done: {action}.") })])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        for (path, text) in files {
            let p = dir.path().join(path);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, text).unwrap();
        }
        dir
    }

    fn detect(dir: &tempfile::TempDir) -> Project {
        project_detect(dir.path().to_string_lossy().into_owned())
    }

    #[test]
    fn a_vite_app_is_served_with_its_own_manager() {
        let d = project(&[("package.json", r#"{"scripts":{"dev":"vite"}}"#), ("pnpm-lock.yaml", ""), ("node_modules/.keep", "")]);
        let p = detect(&d);
        assert_eq!(p.web.as_deref(), Some("BROWSER=none pnpm run dev"));
        assert!(!p.android && !p.ios);
    }

    #[test]
    fn dependencies_are_installed_first_when_missing() {
        let d = project(&[("package.json", r#"{"scripts":{"start":"react-scripts start"}}"#)]);
        assert_eq!(detect(&d).web.as_deref(), Some("npm install && BROWSER=none npm run start"));
    }

    #[test]
    fn an_expo_app_has_both_phones_and_the_web_only_when_it_can() {
        let native = r#"{"scripts":{"start":"expo start","web":"expo start --web"},"dependencies":{"expo":"~51.0.0"}}"#;
        let d = project(&[("package.json", native), ("node_modules/.keep", "")]);
        let p = detect(&d);
        assert!(p.web.is_none() && p.android && p.ios);
        let webby = r#"{"scripts":{"start":"expo start","web":"expo start --web"},"dependencies":{"expo":"~51.0.0","react-native-web":"~0.19.10"}}"#;
        let d = project(&[("package.json", webby), ("node_modules/.keep", "")]);
        assert_eq!(detect(&d).web.as_deref(), Some("BROWSER=none npm run web"));
    }

    #[test]
    fn native_projects_are_found_by_their_files() {
        let d = project(&[("settings.gradle", ""), ("app/build.gradle", "android {\n    defaultConfig {\n        applicationId \"dev.example.app\"\n    }\n}\n")]);
        let p = detect(&d);
        assert!(p.android && !p.ios && p.web.is_none());
        assert_eq!(application_id(d.path()).as_deref(), Some("dev.example.app"));
        let d = project(&[("ios/Thing.xcodeproj/project.pbxproj", "")]);
        assert!(detect(&d).ios);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn a_phone_screen_is_shown_at_about_its_points() {
        assert_eq!(divisor(1179, 2556), 3);
        assert_eq!(divisor(1080, 2400), 3);
        assert_eq!(divisor(800, 600), 1);
    }

    #[test]
    fn adb_text_survives_the_device_shell() {
        assert_eq!(adb_text("hi there"), "hi%sthere");
        assert_eq!(adb_text("a&b's $5"), r"a\&b\'s%s\$5");
    }
}
