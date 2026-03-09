TRANSLATE_SYSTEM = "Translate English research text to Chinese faithfully and concisely."


def translation_prompt(text: str) -> str:
    return f"Translate to Chinese. Keep terminology precise.\n\n{text}"
