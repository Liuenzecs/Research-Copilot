from __future__ import annotations


def analyze_log(log_text: str) -> dict[str, str]:
    lowered = log_text.lower()

    if 'out of memory' in lowered or 'cuda out of memory' in lowered:
        return {
            'error_type': 'oom',
            'next_step_suggestion': 'Try reducing batch size, sequence length, or model size before rerun.',
        }

    if 'module not found' in lowered or 'no module named' in lowered:
        return {
            'error_type': 'missing_dependency',
            'next_step_suggestion': 'Check the active environment and install the missing dependency before rerun.',
        }

    if 'permission denied' in lowered:
        return {
            'error_type': 'permission',
            'next_step_suggestion': 'Verify file permissions, output paths, and environment access rights.',
        }

    return {
        'error_type': 'unknown',
        'next_step_suggestion': 'Inspect the stack trace and rerun the step manually with smaller scope.',
    }
