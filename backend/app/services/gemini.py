"""Google Gemini API adapter with Multimodal (Text + Image) support."""

import httpx
from typing import Any

from app.schemas import ModelInfo, ModelStatus

GEMINI_MODELS = [
    {"name": "gemini-2.5-flash", "desc": "Fast & multimodal model for reasoning, code and images"},
    {"name": "gemini-1.5-pro", "desc": "Deep reasoning multimodal model with 2M context window"},
    {"name": "gemini-1.5-flash", "desc": "High-throughput multimodal model"},
]


class GeminiUnavailable(Exception):
    """Gemini API could not be reached or returned an error."""


class GeminiClient:
    def __init__(self, api_key: str = "", default_model: str = "gemini-2.5-flash"):
        self.api_key = api_key.strip()
        self.default_model = default_model
        self._client = httpx.AsyncClient(timeout=60.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    def set_api_key(self, api_key: str) -> None:
        self.api_key = api_key.strip()

    def status(self) -> ModelStatus:
        has_key = bool(self.api_key)
        return ModelStatus(
            provider="gemini",
            base_url="https://generativelanguage.googleapis.com",
            connected=has_key,
            selected_model=self.default_model if has_key else None,
            selected_model_installed=has_key,
            installed_model_count=len(GEMINI_MODELS) if has_key else 0,
            detail=None if has_key else "Gemini API key is not configured.",
            hint=None if has_key else "Get an API key from Google AI Studio and configure it in Settings.",
        )

    def list_models(self) -> list[ModelInfo]:
        if not self.api_key:
            return []
        return [
            ModelInfo(
                name=m["name"],
                family="google-gemini",
                parameter_size="Multimodal",
                quantization=m["desc"],
            )
            for m in GEMINI_MODELS
        ]

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        image_base64: str | None = None,
        image_mime: str = "image/png",
        model: str | None = None,
        json_format: bool = True,
    ) -> str:
        """Call Gemini generateContent with optional multimodal image data."""
        if not self.api_key:
            raise GeminiUnavailable("No Gemini API Key configured. Add GEMINI_API_KEY in Settings.")

        chosen_model = model or self.default_model
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{chosen_model}:generateContent?key={self.api_key}"

        parts: list[dict[str, Any]] = []

        # If multimodal image attached (e.g. error screenshot or UI bug)
        if image_base64:
            # Strip data url prefix if present
            clean_b64 = image_base64
            if "," in clean_b64:
                header, clean_b64 = clean_b64.split(",", 1)
                if "image/" in header:
                    image_mime = header.split(";")[0].replace("data:", "")
            parts.append({
                "inline_data": {
                    "mime_type": image_mime,
                    "data": clean_b64,
                }
            })

        parts.append({"text": prompt})

        payload: dict[str, Any] = {
            "contents": [{"parts": parts}],
            "generationConfig": {"temperature": 0.1},
        }

        if system:
            payload["systemInstruction"] = {"parts": [{"text": system}]}

        if json_format:
            payload["generationConfig"]["response_mime_type"] = "application/json"

        try:
            resp = await self._client.post(url, json=payload)
            if resp.status_code != 200:
                err_text = resp.text
                raise GeminiUnavailable(f"Gemini API error (HTTP {resp.status_code}): {err_text}")

            data = resp.json()
            candidates = data.get("candidates", [])
            if not candidates:
                raise GeminiUnavailable("Gemini returned no response candidates.")

            content_parts = candidates[0].get("content", {}).get("parts", [])
            if not content_parts:
                raise GeminiUnavailable("Gemini returned empty content.")

            return content_parts[0].get("text", "")
        except httpx.TimeoutException as exc:
            raise GeminiUnavailable("Timed out calling Gemini API") from exc
        except httpx.HTTPError as exc:
            raise GeminiUnavailable(f"Network error calling Gemini API: {exc}") from exc
