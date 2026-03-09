from app.core.security import validate_command_safety


def assess_commands(commands: list[str]) -> list[dict]:
    result: list[dict] = []
    for command in commands:
        check = validate_command_safety(command)
        result.append({'command': command, 'allowed': check.allowed, 'reason': check.reason})
    return result
