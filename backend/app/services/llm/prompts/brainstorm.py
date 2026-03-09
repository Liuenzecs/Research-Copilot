BRAINSTORM_SYSTEM = "You help researchers brainstorm professional research directions."


def idea_prompt(topic: str, context: str = '') -> str:
    return f"Topic: {topic}\nContext: {context}\nGenerate 5 practical research ideas with rationale."


def gap_prompt(topic: str, context: str = '') -> str:
    return f"Topic: {topic}\nContext: {context}\nAnalyze current gaps and open problems."


def outline_prompt(topic: str, scope: str = '') -> str:
    return f"Topic: {topic}\nScope: {scope}\nCreate a literature review outline."


def proposal_prompt(topic: str, constraints: str = '') -> str:
    return f"Topic: {topic}\nConstraints: {constraints}\nDraft a short proposal."
