from fastapi import APIRouter, Request

from app.schemas import TestRunResponse

router = APIRouter(prefix="/test-runs", tags=["test-runs"])


@router.get("", response_model=list[TestRunResponse])
async def list_test_runs(request: Request) -> list[TestRunResponse]:
    """List all recorded test executions."""
    runs = request.app.state.db.list_test_runs()
    return [TestRunResponse(**r) for r in runs]
