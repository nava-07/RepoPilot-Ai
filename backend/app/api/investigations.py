from pathlib import Path
from fastapi import APIRouter, Request

from app.errors import AppError
from app.schemas import AnalyzeRequest, FindingResponse, InvestigationResponse

router = APIRouter(tags=["investigations"])


@router.get("/investigations", response_model=list[InvestigationResponse])
async def list_investigations(
    request: Request, repository_id: str | None = None
) -> list[InvestigationResponse]:
    """List all completed and ongoing investigations."""
    investigations = request.app.state.db.list_investigations(repository_id=repository_id)
    all_findings = request.app.state.db.list_findings(repository_id=repository_id)

    findings_by_inv: dict[str, list] = {}
    for f in all_findings:
        findings_by_inv.setdefault(f["investigation_id"], []).append(FindingResponse(**f))

    result = []
    for inv in investigations:
        inv_data = dict(inv)
        inv_data["findings"] = findings_by_inv.get(inv["id"], [])
        result.append(InvestigationResponse(**inv_data))
    return result


@router.get("/investigations/{investigation_id}", response_model=InvestigationResponse)
async def get_investigation(
    request: Request, investigation_id: str
) -> InvestigationResponse:
    """Get details of a specific investigation."""
    inv = request.app.state.db.get_investigation(investigation_id)
    if not inv:
        raise AppError(404, "investigation_not_found", f"Investigation '{investigation_id}' not found.")

    findings = [
        FindingResponse(**f)
        for f in request.app.state.db.list_findings()
        if f["investigation_id"] == investigation_id
    ]
    inv_data = dict(inv)
    inv_data["findings"] = findings
    return InvestigationResponse(**inv_data)


@router.post("/repositories/{repository_id}/analyze", response_model=InvestigationResponse)
async def analyze_repository(
    request: Request, repository_id: str, body: AnalyzeRequest
) -> InvestigationResponse:
    """Analyze a repository to diagnose a bug or answer a question."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    settings = request.app.state.settings
    provider = settings.active_provider or "ollama"
    if provider == "gemini":
        model = settings.gemini_model or "gemini-2.5-flash"
    else:
        model = settings.ollama_model or ""

    # Insert pending investigation
    inv = request.app.state.db.insert_investigation(
        repository_id=repository_id,
        question=body.question,
        model=model or "heuristic/ast",
        provider=provider,
    )

    repo_path = Path(repo["local_path"])
    analysis_service = request.app.state.analysis_service

    try:
        res = await analysis_service.analyze(
            repo_path=repo_path,
            question=body.question,
            model=model if model else None,
            provider=provider,
            image_data=body.image_data,
        )

        findings_resp = []
        for f in res.get("findings", []):
            created_finding = request.app.state.db.insert_finding(
                investigation_id=inv["id"],
                title=f["title"],
                severity=f["severity"],
                category=f["category"],
                file_path=f["file_path"],
                line_start=f.get("line_start"),
                line_end=f.get("line_end"),
                evidence=f.get("evidence", ""),
                explanation=f.get("explanation"),
                suggested_fix=f.get("suggested_fix"),
                root_cause=f.get("root_cause"),
                impact=f.get("impact"),
                confidence=f.get("confidence", "medium"),
            )
            findings_resp.append(FindingResponse(**created_finding))

        limitations = res.get("limitations", [])
        request.app.state.db.complete_investigation(
            iid=inv["id"],
            status="completed",
            limitations=limitations,
        )

        updated_inv = request.app.state.db.get_investigation(inv["id"])
        inv_data = dict(updated_inv)
        inv_data["findings"] = findings_resp
        return InvestigationResponse(**inv_data)

    except Exception as exc:
        request.app.state.db.complete_investigation(
            iid=inv["id"],
            status="failed",
            error=str(exc),
        )
        raise AppError(500, "analysis_failed", f"Investigation failed: {exc}")
