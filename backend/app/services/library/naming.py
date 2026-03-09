from app.core.utils import slugify_text


def paper_file_name(paper_id: int, source_id: str, title: str) -> str:
    return f"{paper_id}_{slugify_text(source_id or title)[:80]}"
