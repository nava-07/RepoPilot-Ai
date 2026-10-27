from fastapi import APIRouter, Request

from app.schemas import TestRunResponse

router = APIRouter(prefix="/test-runs", tags=["test-runs"])


@router.get("", response_model=list[TestRunResponse])
async def list_test_runs(
    request: Request, repository_id: str | None = None
) -> list[TestRunResponse]:
    """List recorded test executions, optionally filtered by repository."""
    runs = request.app.state.db.list_test_runs(repository_id=repository_id)
    return [TestRunResponse(**r) for r in runs]
