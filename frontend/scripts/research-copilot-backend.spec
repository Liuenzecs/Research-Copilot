# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

backend_root = Path.cwd().resolve()
entry_script = backend_root / "run_desktop_backend.py"


def filtered_submodules(package: str, blocked_prefixes: tuple[str, ...] = ()) -> list[str]:
    modules = collect_submodules(package)
    if not blocked_prefixes:
        return modules

    filtered: list[str] = []
    for module in modules:
        if any(module == prefix or module.startswith(f"{prefix}.") for prefix in blocked_prefixes):
            continue
        filtered.append(module)
    return filtered

hiddenimports = [
    "app.main",
    "chromadb",
    "chromadb.app",
    "chromadb.config",
]
hiddenimports += filtered_submodules("uvicorn")
for package in (
    "chromadb.api",
    "chromadb.auth",
    "chromadb.db",
    "chromadb.execution",
    "chromadb.ingest",
    "chromadb.migrations",
    "chromadb.proto",
    "chromadb.quota",
    "chromadb.rate_limit",
    "chromadb.segment",
    "chromadb.telemetry",
    "chromadb.types",
    "chromadb.utils",
):
    hiddenimports += filtered_submodules(
        package,
        (
            "chromadb.cli",
            "chromadb.server.fastapi",
            "chromadb.telemetry.opentelemetry.fastapi",
            "chromadb.test",
            "chromadb.utils.fastapi",
        ),
    )
hiddenimports += filtered_submodules("pydantic_settings")

excludes = [
    "pytest",
    "app.tests",
    "tests",
    "chromadb.cli",
    "chromadb.server.fastapi",
    "chromadb.telemetry.opentelemetry.fastapi",
    "chromadb.test",
    "chromadb.utils.fastapi",
]

a = Analysis(
    [str(entry_script)],
    pathex=[str(backend_root)],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="research-copilot-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="research-copilot-backend",
)
