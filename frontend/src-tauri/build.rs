use std::process::Command;

fn emit_env(name: &str, value: String) {
    println!("cargo:rustc-env={name}={value}");
}

fn git_commit() -> String {
    Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn main() {
    println!("cargo:rerun-if-env-changed=RC_BUILD_TIMESTAMP");
    println!("cargo:rerun-if-env-changed=RC_GIT_COMMIT");
    println!("cargo:rerun-if-env-changed=RC_BUILD_MODE");

    let build_timestamp = std::env::var("RC_BUILD_TIMESTAMP").unwrap_or_else(|_| "unset".to_string());
    let git_commit = std::env::var("RC_GIT_COMMIT").unwrap_or_else(|_| git_commit());
    let build_mode = std::env::var("RC_BUILD_MODE")
        .unwrap_or_else(|_| std::env::var("PROFILE").unwrap_or_else(|_| "unknown".to_string()));

    emit_env("RESEARCH_COPILOT_BUILD_TIMESTAMP", build_timestamp);
    emit_env("RESEARCH_COPILOT_GIT_COMMIT", git_commit);
    emit_env("RESEARCH_COPILOT_BUILD_MODE", build_mode);

    tauri_build::build()
}
