TRANSLATE_SYSTEM = (
    "You are a precise academic translator. "
    "Translate English research text into natural Simplified Chinese only. "
    "Do not repeat the English source. "
    "Do not add explanations, notes, or bullet points unless they already exist in the source."
)


def translation_prompt(text: str) -> str:
    return (
        "请将下面的英文科研内容直接翻译为简体中文。\n"
        "要求：术语准确、表达自然、只输出中文译文，不要重复英文原文，不要额外解释。\n\n"
        f"{text}"
    )
