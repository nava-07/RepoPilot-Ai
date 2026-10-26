from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.errors import AppError
from app.schemas import ModelListResponse
from app.services.ollama import SETUP_HINT, OllamaUnavailable

router = APIRouter(tags=["models"])


class SelectModelRequest(BaseModel):
    model: str


class SetProviderRequest(BaseModel):
    provider: str  # "ollama" or "gemini"


class SetGeminiKeyRequest(BaseModel):
    api_key: str


@router.get("/models", response_model=ModelListResponse)
async def list_models(request: Request) -> ModelListResponse:
    """Models available for the currently active provider."""
    settings = request.app.state.settings
    provider = settings.active_provider

    if provider == "gemini":
        gemini_client = request.app.state.gemini
        models = gemini_client.list_models()
        return ModelListResponse(
            provider="gemini",
            selected_model=settings.gemini_model,
            models=models,
        )

    try:
        models = await request.app.state.ollama.list_models()
    except OllamaUnavailable as exc:
        raise AppError(503, "model_provider_unavailable", str(exc), SETUP_HINT) from exc

    selected = settings.ollama_model or None
    return ModelListResponse(provider="ollama", selected_model=selected, models=models)


@router.post("/models/select")
async def select_model(request: Request, body: SelectModelRequest) -> dict:
    """Select the active model dynamically."""
    settings = request.app.state.settings
    if settings.active_provider == "gemini":
        settings.gemini_model = body.model.strip()
        return {"status": "ok", "provider": "gemini", "selected_model": settings.gemini_model}

    settings.ollama_model = body.model.strip()
    return {"status": "ok", "provider": "ollama", "selected_model": settings.ollama_model}


@router.post("/models/provider")
async def set_provider(request: Request, body: SetProviderRequest) -> dict:
    """Switch active AI provider between 'ollama' (local) and 'gemini' (multimodal cloud)."""
    p = body.provider.lower().strip()
    if p not in {"ollama", "gemini"}:
        raise AppError(400, "invalid_provider", "Provider must be 'ollama' or 'gemini'.")

    request.app.state.settings.active_provider = p
    return {"status": "ok", "active_provider": p}


@router.post("/models/gemini-key")
async def set_gemini_key(request: Request, body: SetGeminiKeyRequest) -> dict:
    """Set Gemini API Key for multimodal assistant."""
    key = body.api_key.strip()
    request.app.state.settings.gemini_api_key = key
    request.app.state.gemini.set_api_key(key)
    return {"status": "ok", "has_key": bool(key)}
