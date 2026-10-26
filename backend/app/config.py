"""Application settings, loaded from environment variables (prefix REPOPILOT_) or .env."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="REPOPILOT_", env_file=".env", extra="ignore"
    )

    # Bind to loopback only. Do not expose a local repo/Ollama setup publicly by default.
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Ollama is the default, local inference path. No API key required.
    ollama_base_url: str = "http://127.0.0.1:11434"
    # Intentionally empty: the user selects from models actually installed locally.
    # We never assume a model tag exists.
    ollama_model: str = ""
    ollama_timeout_seconds: float = 300.0

    # Optional Google Gemini Multimodal API provider
    active_provider: str = "ollama"  # "ollama" or "gemini"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    data_dir: Path = Path("./data")
    # Comma-separated absolute paths the backend may read repositories from.
    authorized_roots: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def authorized_root_list(self) -> list[Path]:
        return [Path(p.strip()).resolve() for p in self.authorized_roots.split(",") if p.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
