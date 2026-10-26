from fastapi import APIRouter, Request

from app import __version__
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    """Backend liveness plus an honest model-connection diagnostic for the active provider."""
    settings = request.app.state.settings
    if settings.active_provider == "gemini":
        model_status = request.app.state.gemini.status()
    else:
        model_status = await request.app.state.ollama.status(settings.ollama_model)

    return HealthResponse(status="ok", app_version=__version__, model=model_status)
