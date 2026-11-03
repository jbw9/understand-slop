//! On-device dictation, with Handy's own engine: the microphone through
//! handy-recorder, the words through transcribe-cpp running Parakeet locally.
//! Nothing leaves the machine; the one network use is fetching the model once.
//! The page decides where the words go (lib/dictate.ts).

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use handy_recorder::{CollectingSink, Recorder, RecorderConfig};
use tauri::{AppHandle, Manager};
use transcribe_cpp::{Model, RunOptions, Session};

const FILE: &str = "parakeet-tdt-0.6b-v3-Q8_0.gguf";
const URL: &str = "https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf/resolve/main/parakeet-tdt-0.6b-v3-Q8_0.gguf";
const SIZE: u64 = 739_508_576;

static RECORDER: Mutex<Option<Recorder<CollectingSink>>> = Mutex::new(None);
// Held by the loader while it loads, so a stop waits for the model rather than missing it.
static SESSION: Mutex<Option<Session>> = Mutex::new(None);
static DOWNLOAD: Mutex<Option<Child>> = Mutex::new(None);

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("models").join(FILE))
}

fn part(path: &PathBuf) -> PathBuf {
    path.with_extension("gguf.part")
}

#[derive(serde::Serialize)]
pub struct Status {
    /// "missing", "downloading" or "ready".
    model: &'static str,
    bytes: u64,
    total: u64,
    /// Why the last download stopped short, if it did.
    error: Option<String>,
}

#[tauri::command]
pub fn dictate_status(app: AppHandle) -> Result<Status, String> {
    let path = model_path(&app)?;
    let mut error = None;
    let mut download = DOWNLOAD.lock().unwrap();
    if let Some(child) = download.as_mut() {
        match child.try_wait() {
            Ok(None) => {
                let bytes = std::fs::metadata(part(&path)).map(|m| m.len()).unwrap_or(0);
                return Ok(Status { model: "downloading", bytes, total: SIZE, error: None });
            }
            Ok(Some(s)) if s.success() => {
                std::fs::rename(part(&path), &path).map_err(|e| e.to_string())?;
            }
            Ok(Some(s)) => error = Some(format!("The download stopped (curl exit {}). Try again to resume it.", s.code().unwrap_or(-1))),
            Err(e) => error = Some(e.to_string()),
        }
        *download = None;
    }
    let ready = path.exists();
    let bytes = if ready { SIZE } else { std::fs::metadata(part(&path)).map(|m| m.len()).unwrap_or(0) };
    Ok(Status { model: if ready { "ready" } else { "missing" }, bytes, total: SIZE, error })
}

/// Fetches the model with the system's curl (macOS, Windows 10+), resuming any
/// earlier partial download.
#[tauri::command]
pub fn dictate_download(app: AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    let mut download = DOWNLOAD.lock().unwrap();
    if download.is_some() || path.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let child = Command::new("curl")
        .args(["-fsSL", "--retry", "3", "-C", "-", "-o"])
        .arg(part(&path))
        .arg(URL)
        .spawn()
        .map_err(|e| format!("Couldn't start curl: {e}"))?;
    *download = Some(child);
    Ok(())
}

#[tauri::command]
pub fn dictate_remove(app: AppHandle) -> Result<(), String> {
    if let Some(mut child) = DOWNLOAD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    *SESSION.lock().unwrap() = None;
    let path = model_path(&app)?;
    for p in [part(&path), path] {
        if p.exists() {
            std::fs::remove_file(p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Opens the microphone and starts recording; loads the model alongside, so
/// the load overlaps the speaking.
#[tauri::command]
pub async fn dictate_start(app: AppHandle) -> Result<(), String> {
    let path = model_path(&app)?;
    if !path.exists() {
        return Err("missing".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::spawn(move || {
            let mut session = SESSION.lock().unwrap();
            if session.is_none() {
                match Model::load(&path).and_then(|m| m.session()) {
                    Ok(s) => *session = Some(s),
                    Err(e) => eprintln!("dictation: loading the model failed: {e}"),
                }
            }
        });
        let mut slot = RECORDER.lock().unwrap();
        // A recording left open (a key-up the page never saw) is dropped, not resumed.
        *slot = None;
        let recorder = Recorder::open(RecorderConfig::speech()).map_err(|e| e.to_string())?;
        recorder.start(CollectingSink::new()).map_err(|e| e.to_string())?;
        *slot = Some(recorder);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Stops recording and returns what was said. The microphone closes with it.
#[tauri::command]
pub async fn dictate_stop() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(recorder) = RECORDER.lock().unwrap().take() else {
            return Ok(String::new());
        };
        let pcm = recorder.stop().map_err(|e| e.to_string())?.sink.into_samples();
        drop(recorder);
        // Under a quarter second is a slip of the key, not speech.
        if pcm.len() < 4_000 {
            return Ok(String::new());
        }
        let mut session = SESSION.lock().unwrap();
        let session = session.as_mut().ok_or("The speech model didn't load.")?;
        let result = session.run(&pcm, &RunOptions::default()).map_err(|e| e.to_string())?;
        Ok(result.text.trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn dictate_cancel() {
    if let Some(recorder) = RECORDER.lock().unwrap().take() {
        let _ = recorder.stop();
    }
}
