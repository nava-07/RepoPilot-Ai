from fastapi import APIRouter, Query, Request

from app.schemas import HistoryEventResponse

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryEventResponse])
async def list_history(
    request: Request, limit: int = Query(50, ge=1, le=200)
) -> list[HistoryEventResponse]:
    """List recent activity events stored in SQLite."""
    events = request.app.state.db.list_events(limit=limit)
    return [HistoryEventResponse(**e) for e in events]
