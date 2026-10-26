"""Thin Ollama adapter. Only talks to the configured (default: loopback) Ollama server.

Nothing here fabricates data: if Ollama is unreachable we raise OllamaUnavailable and
callers surface a diagnostic with setup instructions.
"""
import httpx

from app.schemas import ModelInfo, ModelStatus

SETUP_HINT = (
    "Install Ollama from https://ollama.com, start it (`ollama serve`), then pull a "
    "coding-capable model with `ollama pull <model>`. Check the model's license and "
    "hardware requirements first, then select it in Settings or set REPOPILOT_OLLAMA_MODEL."
)


class OllamaUnavailable(Exception):
    """Ollama could not be reached or returned an unusable response."""


class OllamaClient:
    def __init__(
        self,
        base_url: str,
        timeout: float,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url, timeout=timeout, transport=transport
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get_json(self, path: str) -> dict:
        try:
            resp = await self._client.get(path)
            resp.raise_for_status()
            data = resp.json()
        except httpx.TimeoutException as exc:
            raise OllamaUnavailable(f"Timed out contacting Ollama at {self.base_url}") from exc
        except httpx.HTTPStatusError as exc:
            raise OllamaUnavailable(
                f"Ollama returned HTTP {exc.response.status_code} for {path}"
            ) from exc
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Could not connect to Ollama at {self.base_url}") from exc
        except ValueError as exc:
            raise OllamaUnavailable(f"Ollama returned invalid JSON for {path}") from exc
        if not isinstance(data, dict):
            raise OllamaUnavailable(f"Unexpected response shape from Ollama for {path}")
        return data

    async def version(self) -> str:
        data = await self._get_json("/api/version")
        return str(data.get("version", "unknown"))

    async def list_models(self) -> list[ModelInfo]:
        data = await self._get_json("/api/tags")
        models: list[ModelInfo] = []
        for m in data.get("models", []):
            details = m.get("details") or {}
            models.append(
                ModelInfo(
                    name=m.get("name", ""),
                    size_bytes=m.get("size"),
                    parameter_size=details.get("parameter_size"),
                    quantization=details.get("quantization_level"),
                    family=details.get("family"),
                    modified_at=m.get("modified_at"),
                )
            )
        return [m for m in models if m.name]

    async def status(self, selected_model: str) -> ModelStatus:
        selected = selected_model or None
        try:
            version = await self.version()
            models = await self.list_models()
        except OllamaUnavailable as exc:
            return ModelStatus(
                base_url=self.base_url,
                connected=False,
                selected_model=selected,
                detail=str(exc),
                hint=SETUP_HINT,
            )
        names = {m.name for m in models}
        installed = selected is not None and selected in names
        detail, hint = None, None
        if selected is None:
            detail = "Connected, but no model is selected."
            hint = (
                "Choose one of the installed models in Settings."
                if models
                else "No models installed. " + SETUP_HINT
            )
        elif not installed:
            detail = f"Selected model '{selected}' is not installed in Ollama."
            hint = f"Run `ollama pull {selected}` or select an installed model."
        return ModelStatus(
            base_url=self.base_url,
            connected=True,
            version=version,
            selected_model=selected,
            selected_model_installed=installed,
            installed_model_count=len(models),
            detail=detail,
            hint=hint,
        )

    async def generate(self, model: str, prompt: str, system: str | None = None, json_format: bool = True) -> str:
        """Call Ollama /api/generate with strict validation and timeouts."""
        payload: dict = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 1500},
        }
        if system:
            payload["system"] = system
        if json_format:
            payload["format"] = "json"

        try:
            resp = await self._client.post("/api/generate", json=payload, timeout=300.0)
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", "")
        except httpx.TimeoutException as exc:
            raise OllamaUnavailable(f"Timed out during model inference ({model}) after 300s") from exc
        except httpx.HTTPError as exc:
            raise OllamaUnavailable(f"Error communicating with Ollama inference endpoint: {exc}") from exc
        except Exception as exc:
            raise OllamaUnavailable(f"Unexpected error calling Ollama model: {exc}") from exc

