from __future__ import annotations


def suggest_next_steps(log_text: str) -> str:
    lowered = log_text.lower()
    if 'out of memory' in lowered:
        return 'Try reducing batch size or using a smaller model configuration.'
    if 'module not found' in lowered or 'no module named' in lowered:
        return 'Check environment and dependency installation before rerun.'
    if 'permission denied' in lowered:
        return 'Verify file permissions and environment path settings.'
    return 'Inspect stack trace and rerun step-by-step with manual confirmations.'
