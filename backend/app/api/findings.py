from pathlib import Path
from fastapi import APIRouter, Request

from app.errors import AppError
from app.schemas import FindingResponse, PatchResponse

router = APIRouter(prefix="/findings", tags=["findings"])


@router.get("", response_model=list[FindingResponse])
async def list_findings(
    request: Request,
    repository_id: str | None = None,
    investigation_id: str | None = None,
) -> list[FindingResponse]:
    """List all findings across investigations, optionally filtered by repository or investigation."""
    findings = request.app.state.db.list_findings(
        repository_id=repository_id, investigation_id=investigation_id
    )
    return [FindingResponse(**f) for f in findings]


@router.post("/{finding_id}/propose-patch", response_model=PatchResponse)
async def propose_patch_from_finding(
    request: Request, finding_id: str
) -> PatchResponse:
    """Propose a minimal code patch for the finding."""
    finding = request.app.state.db.get_finding(finding_id)
    if not finding:
        raise AppError(404, "finding_not_found", f"Finding '{finding_id}' not found.")

    inv = request.app.state.db.get_investigation(finding["investigation_id"])
    if not inv:
        raise AppError(404, "investigation_not_found", "Associated investigation not found.")

    repo = request.app.state.db.get_repository(inv["repository_id"])
    if not repo:
        raise AppError(404, "repo_not_found", "Associated repository not found.")

    repo_path = Path(repo["local_path"])
    model = request.app.state.settings.ollama_model or ""

    patch_data = await request.app.state.patch_service.propose_patch(
        repo_path=repo_path,
        finding=finding,
        model=model if model else None,
    )

    created_patch = request.app.state.db.insert_patch(
        finding_id=finding["id"],
        diff=patch_data["diff"],
        explanation=patch_data.get("explanation"),
        file_path=patch_data.get("file_path"),
        original_hash=patch_data.get("original_hash"),
    )

    return PatchResponse(**created_patch)
