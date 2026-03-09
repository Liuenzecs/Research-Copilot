from pydantic import BaseModel


class ReproductionPlanRequest(BaseModel):
    paper_id: int | None = None
    repo_id: int | None = None


class ReproductionExecuteRequest(BaseModel):
    reproduction_id: int


class ReproductionPlanResponse(BaseModel):
    reproduction_id: int
    status: str
    plan_markdown: str
    steps: list[dict]


class ReproductionExecuteResponse(BaseModel):
    reproduction_id: int
    executed: bool
    message: str
