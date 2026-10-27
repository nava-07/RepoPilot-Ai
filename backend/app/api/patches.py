from pathlib import Path
from fastapi import APIRouter, Request

from app.errors import AppError
from app.schemas import PatchResponse, TestRunResponse

router = APIRouter(prefix="/patches", tags=["patches"])


@router.get("", response_model=list[PatchResponse])
async def list_patches(
    request: Request, repository_id: str | None = None
) -> list[PatchResponse]:
    """List proposed patches, optionally filtered by repository."""
    patches = request.app.state.db.list_patches(repository_id=repository_id)
    return [PatchResponse(**p) for p in patches]


@router.post("/{patch_id}/validate", response_model=PatchResponse)
async def validate_patch(request: Request, patch_id: str) -> PatchResponse:
    """Validate whether the patch applies cleanly to current repository file."""
    patch = request.app.state.db.get_patch(patch_id)
    if not patch:
        raise AppError(404, "patch_not_found", f"Patch '{patch_id}' not found.")

    finding = request.app.state.db.get_finding(patch["finding_id"])
    if not finding:
        raise AppError(404, "finding_not_found", "Associated finding not found.")

    inv = request.app.state.db.get_investigation(finding["investigation_id"])
    if not inv:
        raise AppError(404, "investigation_not_found", "Associated investigation not found.")

    repo = request.app.state.db.get_repository(inv["repository_id"])
    if not repo:
        raise AppError(404, "repo_not_found", "Associated repository not found.")

    repo_path = Path(repo["local_path"])
    valid, message = request.app.state.patch_service.validate_patch(repo_path, patch)

    new_status = "valid" if valid else "invalid"
    request.app.state.db.update_patch(patch_id, validation_status=new_status)

    updated = request.app.state.db.get_patch(patch_id)
    return PatchResponse(**updated)


@router.post("/{patch_id}/test", response_model=TestRunResponse)
async def run_tests(request: Request, patch_id: str) -> TestRunResponse:
    """Execute tests against the patch in an isolated temporary copy of the repository."""
    patch = request.app.state.db.get_patch(patch_id)
    if not patch:
        raise AppError(404, "patch_not_found", f"Patch '{patch_id}' not found.")

    finding = request.app.state.db.get_finding(patch["finding_id"])
    if not finding:
        raise AppError(404, "finding_not_found", "Associated finding not found.")

    inv = request.app.state.db.get_investigation(finding["investigation_id"])
    if not inv:
        raise AppError(404, "investigation_not_found", "Associated investigation not found.")

    repo = request.app.state.db.get_repository(inv["repository_id"])
    if not repo:
        raise AppError(404, "repo_not_found", "Associated repository not found.")

    repo_path = Path(repo["local_path"])
    test_service = request.app.state.test_service

    run_result = test_service.run_tests_for_patch(repo_path, patch)

    created_run = request.app.state.db.insert_test_run(
        patch_id=patch["id"],
        command=run_result["command"],
        exit_code=run_result["exit_code"],
        output=run_result["output"],
        duration_ms=run_result["duration_ms"],
        status=run_result["status"],
    )

    return TestRunResponse(**created_run)


@router.post("/{patch_id}/approve", response_model=PatchResponse)
async def approve_patch(request: Request, patch_id: str) -> PatchResponse:
    """Approve the patch (explicit user decision)."""
    patch = request.app.state.db.get_patch(patch_id)
    if not patch:
        raise AppError(404, "patch_not_found", f"Patch '{patch_id}' not found.")

    request.app.state.db.update_patch(patch_id, approval_status="approved")
    updated = request.app.state.db.get_patch(patch_id)
    return PatchResponse(**updated)


@router.post("/{patch_id}/reject", response_model=PatchResponse)
async def reject_patch(request: Request, patch_id: str) -> PatchResponse:
    """Reject the patch."""
    patch = request.app.state.db.get_patch(patch_id)
    if not patch:
        raise AppError(404, "patch_not_found", f"Patch '{patch_id}' not found.")

    request.app.state.db.update_patch(patch_id, approval_status="rejected")
    updated = request.app.state.db.get_patch(patch_id)
    return PatchResponse(**updated)
