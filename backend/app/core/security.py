from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class CommandSafetyResult:
    allowed: bool
    reason: str


DANGEROUS_TOKENS = {'rm ', 'del ', 'shutdown', 'reboot', 'format ', 'mkfs', 'dd '}


def validate_command_safety(command: str) -> CommandSafetyResult:
    lowered = command.lower().strip()
    for token in DANGEROUS_TOKENS:
        if token in lowered:
            return CommandSafetyResult(False, f'Blocked token detected: {token.strip()}')
    return CommandSafetyResult(True, 'Command passes basic safety checks')
