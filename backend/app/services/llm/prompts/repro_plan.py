REPRO_PLAN_SYSTEM = "Produce safe, step-by-step reproducibility plans."


def repro_plan_prompt(context: str) -> str:
    return (
        "Generate a reproducibility plan with numbered steps, expected outputs, risks, and"
        " suggested commands requiring manual confirmation.\n\n"
        f"Context:\n{context}"
    )
