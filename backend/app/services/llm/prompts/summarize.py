QUICK_SUMMARY_SYSTEM = "You summarize research papers for professionals."
DEEP_SUMMARY_SYSTEM = "You produce deep structured research paper summaries."


def quick_summary_prompt(title: str, abstract: str, body: str) -> str:
    return (
        f"Title: {title}\n"
        f"Abstract: {abstract}\n"
        f"Body excerpt: {body[:5000]}\n\n"
        "Return concise sections: Problem, Method, Contributions, Limitations, Future Work, Summary."
    )


def deep_summary_prompt(title: str, abstract: str, body: str, focus: str | None = None) -> str:
    focus_text = f"Focus: {focus}\n" if focus else ''
    return (
        f"Title: {title}\n{focus_text}"
        f"Abstract: {abstract}\n"
        f"Body excerpt: {body[:12000]}\n\n"
        "Return detailed sections: Problem, Method, Experiments, Contributions, Limitations, Future Work, Risks, Summary."
    )
