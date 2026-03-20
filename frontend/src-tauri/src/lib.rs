use std::env;
use std::fs::{self, OpenOptions};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};

#[derive(Clone, Debug, Serialize)]
struct RuntimeConfigResponse {
    api_base: String,
    app_data_dir: String,
    logs_dir: String,
    platform: String,
    is_desktop: bool,
}

#[derive(Debug)]
struct ManagedBackend {
    child: Option<Child>,
    runtime_config: RuntimeConfigResponse,
}

impl Default for ManagedBackend {
    fn default() -> Self {
        Self {
            child: None,
            runtime_config: RuntimeConfigResponse {
                api_base: "http://127.0.0.1:8000".to_string(),
                app_data_dir: String::new(),
                logs_dir: String::new(),
                platform: env::consts::OS.to_string(),
                is_desktop: true,
            },
        }
    }
}

struct BackendState {
    inner: Mutex<ManagedBackend>,
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".."))
}

fn ensure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("Failed to create runtime directory {}: {error}", path.display()))
}

fn reserve_local_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Failed to reserve local backend port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Failed to inspect local backend port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn resolve_runtime_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve desktop data directory: {error}"))?;
    let logs_dir = app.path().app_log_dir().unwrap_or_else(|_| app_data_dir.join("logs"));

    ensure_directory(&app_data_dir)?;
    ensure_directory(&logs_dir)?;
    ensure_directory(&app_data_dir.join("vectors"))?;

    Ok((app_data_dir, logs_dir))
}

fn build_runtime_config(app: &AppHandle, port: u16) -> Result<RuntimeConfigResponse, String> {
    let (app_data_dir, logs_dir) = resolve_runtime_dirs(app)?;

    Ok(RuntimeConfigResponse {
        api_base: format!("http://127.0.0.1:{port}"),
        app_data_dir: app_data_dir.display().to_string(),
        logs_dir: logs_dir.display().to_string(),
        platform: env::consts::OS.to_string(),
        is_desktop: true,
    })
}

fn resolve_packaged_backend_executable(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let executable = resource_dir
        .join("backend-sidecar")
        .join("research-copilot-backend")
        .join("research-copilot-backend.exe");

    executable.exists().then_some(executable)
}

fn open_log_file(path: &Path) -> Result<Stdio, String> {
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(path)
        .map_err(|error| format!("Failed to open log file {}: {error}", path.display()))?;
    Ok(Stdio::from(file))
}

fn spawn_backend_process(app: &AppHandle, runtime: &RuntimeConfigResponse) -> Result<Child, String> {
    let data_dir = PathBuf::from(&runtime.app_data_dir);
    let logs_dir = PathBuf::from(&runtime.logs_dir);
    let stdout = open_log_file(&logs_dir.join("backend.stdout.log"))?;
    let stderr = open_log_file(&logs_dir.join("backend.stderr.log"))?;
    let db_path = data_dir.join("research_copilot.db");
    let vectors_dir = data_dir.join("vectors");

    let mut command = if let Some(executable) = resolve_packaged_backend_executable(app) {
        Command::new(executable)
    } else {
        let backend_root = repo_root().join("backend");
        let venv_python = backend_root.join(".venv").join("Scripts").join("python.exe");
        let python = if venv_python.exists() {
            venv_python
        } else {
            PathBuf::from(env::var("PYTHON").unwrap_or_else(|_| "python".to_string()))
        };

        let mut command = Command::new(python);
        command.arg(backend_root.join("run_desktop_backend.py"));
        command.current_dir(backend_root);
        command
    };

    command
        .env("RESEARCH_COPILOT_ENV", "desktop")
        .env("RESEARCH_COPILOT_HOST", "127.0.0.1")
        .env(
            "RESEARCH_COPILOT_PORT",
            runtime
                .api_base
                .rsplit(':')
                .next()
                .unwrap_or("8000")
                .to_string(),
        )
        .env("RESEARCH_COPILOT_DATA_DIR", &runtime.app_data_dir)
        .env("RESEARCH_COPILOT_VECTOR_DIR", vectors_dir)
        .env(
            "RESEARCH_COPILOT_DB_URL",
            format!("sqlite:///{}", db_path.to_string_lossy().replace('\\', "/")),
        )
        .stdout(stdout)
        .stderr(stderr)
        .stdin(Stdio::null());

    command
        .spawn()
        .map_err(|error| format!("Failed to launch desktop backend sidecar: {error}"))
}

fn wait_for_backend_health(api_base: &str) -> Result<(), String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(1200))
        .build()
        .map_err(|error| format!("Failed to build health-check client: {error}"))?;
    let url = format!("{api_base}/health");

    for _ in 0..80 {
        if let Ok(response) = client.get(&url).send() {
            if response.status().is_success() {
                return Ok(());
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    Err(format!("Desktop backend did not become healthy in time: {url}"))
}

fn stop_backend_locked(backend: &mut ManagedBackend) {
    if let Some(child) = backend.child.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    backend.child = None;
}

fn start_or_restart_backend(app: &AppHandle, state: &BackendState) -> Result<RuntimeConfigResponse, String> {
    let port = reserve_local_port()?;
    let runtime_config = build_runtime_config(app, port)?;
    let mut child = spawn_backend_process(app, &runtime_config)?;

    if let Err(error) = wait_for_backend_health(&runtime_config.api_base) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    let mut backend = state
        .inner
        .lock()
        .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
    stop_backend_locked(&mut backend);
    backend.child = Some(child);
    backend.runtime_config = runtime_config.clone();
    Ok(runtime_config)
}

fn open_directory(path: &str) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to open directory {path}: {error}"))
}

#[tauri::command]
fn get_runtime_config(state: State<'_, BackendState>) -> Result<RuntimeConfigResponse, String> {
    let backend = state
        .inner
        .lock()
        .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
    Ok(backend.runtime_config.clone())
}

#[tauri::command]
fn open_data_dir(state: State<'_, BackendState>) -> Result<(), String> {
    let backend = state
        .inner
        .lock()
        .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
    open_directory(&backend.runtime_config.app_data_dir)
}

#[tauri::command]
fn open_logs_dir(state: State<'_, BackendState>) -> Result<(), String> {
    let backend = state
        .inner
        .lock()
        .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
    open_directory(&backend.runtime_config.logs_dir)
}

#[tauri::command]
fn restart_backend(app: AppHandle, state: State<'_, BackendState>) -> Result<RuntimeConfigResponse, String> {
    start_or_restart_backend(&app, state.inner())
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendState>() {
        if let Ok(mut backend) = state.inner.lock() {
            stop_backend_locked(&mut backend);
        }
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        .manage(BackendState {
            inner: Mutex::new(ManagedBackend::default()),
        })
        .setup(|app| {
            let state = app.state::<BackendState>();
            start_or_restart_backend(&app.handle(), state.inner())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_config,
            open_data_dir,
            open_logs_dir,
            restart_backend
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("failed to build desktop shell")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                stop_backend(app);
            }
        });
}
