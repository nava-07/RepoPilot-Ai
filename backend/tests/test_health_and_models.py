import httpx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

TAGS = {
    "models": [
        {
            "name": "example-model:7b",
            "size": 123,
            "modified_at": "2026-01-01T00:00:00Z",
            "details": {"family": "x", "parameter_size": "7B", "quantization_level": "Q4_K_M"},
        }
    ]
}


def make_client(handler, model: str = "") -> TestClient:
    app = create_app(Settings(ollama_model=model), httpx.MockTransport(handler))
    return TestClient(app)


def ollama_ok(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/api/version":
        return httpx.Response(200, json={"version": "0.0.test"})
    if request.url.path == "/api/tags":
        return httpx.Response(200, json=TAGS)
    return httpx.Response(404)


def ollama_down(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("refused", request=request)


def test_health_when_ollama_down_reports_diagnostic_not_fake_success():
    with make_client(ollama_down) as c:
        body = c.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["model"]["connected"] is False
    assert "ollama pull" in body["model"]["hint"]


def test_health_no_model_selected():
    with make_client(ollama_ok) as c:
        m = c.get("/api/health").json()["model"]
    assert m["connected"] is True and m["selected_model"] is None
    assert m["installed_model_count"] == 1
    assert m["selected_model_installed"] is False


def test_health_selected_model_installed():
    with make_client(ollama_ok, "example-model:7b") as c:
        m = c.get("/api/health").json()["model"]
    assert m["selected_model_installed"] is True and m["detail"] is None


def test_health_selected_model_missing():
    with make_client(ollama_ok, "nope:1b") as c:
        m = c.get("/api/health").json()["model"]
    assert m["connected"] is True and m["selected_model_installed"] is False
    assert "not installed" in m["detail"]


def test_models_lists_installed():
    with make_client(ollama_ok) as c:
        r = c.get("/api/models")
    assert r.status_code == 200
    assert r.json()["models"][0]["name"] == "example-model:7b"
    assert r.json()["models"][0]["quantization"] == "Q4_K_M"


def test_models_unavailable_returns_503_with_error_format():
    with make_client(ollama_down) as c:
        r = c.get("/api/models")
    assert r.status_code == 503
    err = r.json()["error"]
    assert err["code"] == "model_provider_unavailable" and err["hint"]


def test_models_timeout_is_handled():
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with make_client(slow) as c:
        r = c.get("/api/models")
    assert r.status_code == 503
