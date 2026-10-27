from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import findings, health, history, investigations, models, patches, repositories, skills, tests
from app.config import Settings, get_settings
from app.database import Database
from app.errors import AppError, app_error_handler
from app.services.analysis_service import AnalysisService
from app.services.change_intelligence_service import ChangeIntelligenceService
from app.services.gemini import GeminiClient
from app.services.git_service import GitService
from app.services.ollama import OllamaClient
from app.services.patch_service import PatchService
from app.services.repo_service import RepoService
from app.services.skills_service import SkillsService
from app.services.test_service import TestService


def create_app(
    settings: Settings | None = None,
    ollama_transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.ollama = OllamaClient(
            settings.ollama_base_url, settings.ollama_timeout_seconds, ollama_transport
        )
        app.state.gemini = GeminiClient(
            api_key=settings.gemini_api_key,
            default_model=settings.gemini_model,
        )
        db_path = settings.data_dir / "repopilot.sqlite3"
        app.state.db = Database(db_path)
        app.state.repo_service = RepoService(settings.data_dir, settings.authorized_root_list)
        app.state.git_service = GitService(app.state.repo_service)
        app.state.analysis_service = AnalysisService(app.state.ollama, app.state.gemini)
        app.state.patch_service = PatchService(app.state.ollama, app.state.gemini)
        app.state.test_service = TestService(app.state.patch_service)
        app.state.change_intelligence_service = ChangeIntelligenceService(
            app.state.ollama, app.state.gemini, app.state.git_service, app.state.repo_service
        )

        skills_dir = Path(__file__).resolve().parent.parent / "skills"
        app.state.skills_service = SkillsService(skills_dir)

        yield
        await app.state.ollama.aclose()
        await app.state.gemini.aclose()

    app = FastAPI(
        title="RepoPilot AI",
        version=__version__,
        description="Repository-aware, open-weight AI coding agent API.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    app.add_exception_handler(AppError, app_error_handler)

    # API routers under /api prefix
    app.include_router(health.router, prefix="/api")
    app.include_router(models.router, prefix="/api")
    app.include_router(repositories.router, prefix="/api")
    app.include_router(investigations.router, prefix="/api")
    app.include_router(findings.router, prefix="/api")
    app.include_router(patches.router, prefix="/api")
    app.include_router(tests.router, prefix="/api")
    app.include_router(history.router, prefix="/api")
    app.include_router(skills.router, prefix="/api")

    return app


app = create_app()
