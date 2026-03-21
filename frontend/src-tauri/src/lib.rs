use std::env;
use std::fs::{self, OpenOptions};
use std::net::TcpListener;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use reqwest::blocking::Client;
use serde::Serialize;
use tauri::{AppHandle, Manager, RunEvent, State};

const BACKEND_STATUS_IDLE: &str = "idle";
const BACKEND_STATUS_STARTING: &str = "starting";
const BACKEND_STATUS_READY: &str = "ready";
const BACKEND_STATUS_FAILED: &str = "failed";

const BACKEND_STAGE_WAITING_HOST: &str = "等待桌面宿主响应";
const BACKEND_STAGE_PREPARING_RUNTIME: &str = "准备运行目录";
const BACKEND_STAGE_STARTING_BACKEND: &str = "启动后端";
const BACKEND_STAGE_WAITING_HEALTH: &str = "等待健康检查";
const BACKEND_STAGE_READY: &str = "已就绪";
const BACKEND_STAGE_FAILED: &str = "启动失败";

#[derive(Clone, Debug, Serialize)]
struct RuntimeConfigResponse {
    api_base: String,
    app_data_dir: String,
    logs_dir: String,
    platform: String,
    is_desktop: bool,
    backend_status: String,
    backend_stage: String,
    backend_error: String,
    app_version: String,
    build_timestamp: String,
    git_commit: String,
    build_mode: String,
    executable_path: String,
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
            runtime_config: default_runtime_config(),
        }
    }
}

struct BackendState {
    inner: Mutex<ManagedBackend>,
}

fn build_timestamp() -> String {
    option_env!("RESEARCH_COPILOT_BUILD_TIMESTAMP")
        .unwrap_or("unset")
        .to_string()
}

fn git_commit() -> String {
    option_env!("RESEARCH_COPILOT_GIT_COMMIT")
        .unwrap_or("unknown")
        .to_string()
}

fn build_mode() -> String {
    option_env!("RESEARCH_COPILOT_BUILD_MODE")
        .unwrap_or("desktop")
        .to_string()
}

fn executable_path() -> String {
    env::current_exe()
        .ok()
        .map(|path| path.display().to_string())
        .unwrap_or_default()
}

fn default_runtime_config() -> RuntimeConfigResponse {
    RuntimeConfigResponse {
        api_base: "http://127.0.0.1:8000".to_string(),
        app_data_dir: String::new(),
        logs_dir: String::new(),
        platform: env::consts::OS.to_string(),
        is_desktop: true,
        backend_status: BACKEND_STATUS_IDLE.to_string(),
        backend_stage: BACKEND_STAGE_WAITING_HOST.to_string(),
        backend_error: String::new(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        build_timestamp: build_timestamp(),
        git_commit: git_commit(),
        build_mode: build_mode(),
        executable_path: executable_path(),
    }
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
    let mut config = default_runtime_config();
    config.api_base = format!("http://127.0.0.1:{port}");
    config.app_data_dir = app_data_dir.display().to_string();
    config.logs_dir = logs_dir.display().to_string();
    config.backend_status = BACKEND_STATUS_STARTING.to_string();
    config.backend_stage = BACKEND_STAGE_PREPARING_RUNTIME.to_string();
    config.backend_error.clear();
    Ok(config)
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

#[cfg(windows)]
fn apply_background_flags(command: &mut Command) {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn apply_background_flags(_: &mut Command) {}

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

    apply_background_flags(&mut command);

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

fn set_backend_runtime(app: &AppHandle, runtime_config: RuntimeConfigResponse) -> Result<RuntimeConfigResponse, String> {
    let state = app.state::<BackendState>();
    let mut backend = state
        .inner
        .lock()
        .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
    backend.runtime_config = runtime_config.clone();
    Ok(runtime_config)
}

fn set_backend_failed(app: &AppHandle, runtime_config: &RuntimeConfigResponse, error: String) {
    if let Some(state) = app.try_state::<BackendState>() {
        match state.inner.lock() {
            Ok(mut backend) => {
                stop_backend_locked(&mut backend);
                let mut failed_config = runtime_config.clone();
                failed_config.backend_status = BACKEND_STATUS_FAILED.to_string();
                failed_config.backend_stage = BACKEND_STAGE_FAILED.to_string();
                failed_config.backend_error = error;
                backend.runtime_config = failed_config;
            }
            Err(_) => {}
        };
    }
}

fn queue_backend_start(app: &AppHandle) -> Result<RuntimeConfigResponse, String> {
    let state = app.state::<BackendState>();
    {
        let backend = state
            .inner
            .lock()
            .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
        if backend.runtime_config.backend_status == BACKEND_STATUS_STARTING {
            return Ok(backend.runtime_config.clone());
        }
    }

    let port = reserve_local_port()?;
    let runtime_config = build_runtime_config(app, port)?;

    {
        let mut backend = state
            .inner
            .lock()
            .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
        stop_backend_locked(&mut backend);
        backend.runtime_config = runtime_config.clone();
    }

    let app_handle = app.clone();
    let runtime_for_worker = runtime_config.clone();
    std::thread::spawn(move || {
        let mut starting_config = runtime_for_worker.clone();
        starting_config.backend_stage = BACKEND_STAGE_STARTING_BACKEND.to_string();
        let _ = set_backend_runtime(&app_handle, starting_config);

        let child = match spawn_backend_process(&app_handle, &runtime_for_worker) {
            Ok(child) => child,
            Err(error) => {
                set_backend_failed(&app_handle, &runtime_for_worker, error);
                return;
            }
        };

        {
            let state = app_handle.state::<BackendState>();
            match state.inner.lock() {
                Ok(mut backend) => {
                    let mut waiting_config = runtime_for_worker.clone();
                    waiting_config.backend_stage = BACKEND_STAGE_WAITING_HEALTH.to_string();
                    backend.child = Some(child);
                    backend.runtime_config = waiting_config;
                }
                Err(_) => return,
            };
        }

        if let Err(error) = wait_for_backend_health(&runtime_for_worker.api_base) {
            set_backend_failed(&app_handle, &runtime_for_worker, error);
            return;
        }

        let mut ready_config = runtime_for_worker.clone();
        ready_config.backend_status = BACKEND_STATUS_READY.to_string();
        ready_config.backend_stage = BACKEND_STAGE_READY.to_string();
        ready_config.backend_error.clear();
        let _ = set_backend_runtime(&app_handle, ready_config);
    });

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
    match queue_backend_start(&app) {
        Ok(runtime) => Ok(runtime),
        Err(error) => {
            let mut backend = state
                .inner
                .lock()
                .map_err(|_| "Desktop backend state lock poisoned.".to_string())?;
            stop_backend_locked(&mut backend);
            backend.runtime_config.backend_status = BACKEND_STATUS_FAILED.to_string();
            backend.runtime_config.backend_stage = BACKEND_STAGE_FAILED.to_string();
            backend.runtime_config.backend_error = error;
            Ok(backend.runtime_config.clone())
        }
    }
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendState>() {
        match state.inner.lock() {
            Ok(mut backend) => stop_backend_locked(&mut backend),
            Err(_) => {}
        };
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        .manage(BackendState {
            inner: Mutex::new(ManagedBackend::default()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(error) = queue_backend_start(&handle) {
                if let Some(state) = handle.try_state::<BackendState>() {
                    match state.inner.lock() {
                        Ok(mut backend) => {
                            backend.runtime_config.backend_status = BACKEND_STATUS_FAILED.to_string();
                            backend.runtime_config.backend_stage = BACKEND_STAGE_FAILED.to_string();
                            backend.runtime_config.backend_error = error;
                        }
                        Err(_) => {}
                    };
                }
            }
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
