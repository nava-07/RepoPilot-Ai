from pathlib import Path
from typing import Any
from fastapi import APIRouter, Query, Request

from app.errors import AppError
from app.schemas import (
    ChangeAnalysisRequest,
    ChangeReportResponse,
    FileContentResponse,
    GitCommit,
    GitDiffResponse,
    GitWorkingTreeStatus,
    RepositoryImportRequest,
    RepositoryResponse,
    TimelineEvent,
    TreeNode,
)

router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(request: Request) -> list[RepositoryResponse]:
    """List all imported repositories with live statistics."""
    repos = request.app.state.db.list_repositories_with_stats()
    return [RepositoryResponse(**r) for r in repos]


@router.get("/{repository_id}", response_model=RepositoryResponse)
async def get_repository(request: Request, repository_id: str) -> RepositoryResponse:
    """Get single repository details with live statistics."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")
    stats = request.app.state.db.get_repo_stats(repository_id)
    repo.update(stats)
    return RepositoryResponse(**repo)


@router.post("/import", response_model=RepositoryResponse)
async def import_repository(
    request: Request, body: RepositoryImportRequest
) -> RepositoryResponse:
    """Import a local repository folder or clone a public GitHub repository."""
    repo_service = request.app.state.repo_service
    if body.source_type == "local":
        repo_data = repo_service.import_local(body.location)
    elif body.source_type == "github":
        repo_data = repo_service.import_github(body.location)
    else:
        raise AppError(
            400,
            "invalid_source_type",
            f"Unsupported source type: {body.source_type}. Use 'local' or 'github'.",
        )

    stored = request.app.state.db.insert_repository(
        name=repo_data["name"],
        source_type=repo_data["source_type"],
        local_path=repo_data["local_path"],
        default_branch=repo_data.get("default_branch"),
        languages=repo_data.get("languages"),
        file_count=repo_data.get("file_count", 0),
        current_commit=repo_data.get("current_commit"),
    )
    stats = request.app.state.db.get_repo_stats(stored["id"])
    stored.update(stats)
    return RepositoryResponse(**stored)


@router.post("/{repository_id}/refresh", response_model=RepositoryResponse)
async def refresh_repository(request: Request, repository_id: str) -> RepositoryResponse:
    """Re-scan files, detect new changes, and refresh Git branch/commit metadata."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    inspected = request.app.state.repo_service._inspect_repo(repo_path, repo["name"], repo["source_type"])

    updated = request.app.state.db.update_repo_scan(
        rid=repository_id,
        file_count=inspected["file_count"],
        languages=inspected["languages"],
        default_branch=inspected.get("default_branch"),
        current_commit=inspected.get("current_commit"),
    )
    stats = request.app.state.db.get_repo_stats(repository_id)
    updated.update(stats)
    return RepositoryResponse(**updated)


@router.delete("/{repository_id}")
async def delete_repository(request: Request, repository_id: str) -> dict[str, Any]:
    """Remove repository from RepoPilot's registry without deleting files on disk."""
    success = request.app.state.db.delete_repository(repository_id)
    if not success:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")
    return {"status": "ok", "message": "Repository removed from registry. Disk files preserved."}


@router.get("/{repository_id}/tree", response_model=TreeNode)
async def get_repository_tree(request: Request, repository_id: str) -> TreeNode:
    """Get the navigable file tree for a repository."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    tree_data = request.app.state.repo_service.get_tree(repo_path)
    return TreeNode(**tree_data)


@router.get("/{repository_id}/files", response_model=FileContentResponse)
async def get_repository_file(
    request: Request, repository_id: str, path: str = Query(..., description="Relative file path")
) -> FileContentResponse:
    """Read a repository source file safely with truncation and secret filtering."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    file_data = request.app.state.repo_service.read_file(repo_path, path)
    return FileContentResponse(**file_data)


# ---------------------------------------------------------------------- Git Tracking
@router.get("/{repository_id}/git/status", response_model=GitWorkingTreeStatus)
async def get_git_status(request: Request, repository_id: str) -> GitWorkingTreeStatus:
    """Get working-tree Git status (staged, unstaged, untracked)."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    status_data = request.app.state.git_service.get_working_tree_status(repo_path)
    return GitWorkingTreeStatus(**status_data)


@router.get("/{repository_id}/git/commits", response_model=list[GitCommit])
async def get_git_commits(
    request: Request, repository_id: str, limit: int = Query(50, ge=1, le=200)
) -> list[GitCommit]:
    """Get recent Git commit history."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    commits = request.app.state.git_service.get_commit_history(repo_path, limit=limit)
    return [GitCommit(**c) for c in commits]


@router.get("/{repository_id}/git/diff", response_model=GitDiffResponse)
async def get_git_diff(
    request: Request,
    repository_id: str,
    baseline: str | None = Query(None, description="Baseline commit or branch"),
    target: str | None = Query(None, description="Target commit or branch"),
    file_path: str | None = Query(None, description="Optional specific file path"),
) -> GitDiffResponse:
    """Get unified diff between two commits, or working tree vs HEAD."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    diff_data = request.app.state.git_service.get_diff(
        repo_path=repo_path,
        baseline=baseline,
        target=target,
        file_path=file_path,
    )
    return GitDiffResponse(**diff_data)


@router.post("/{repository_id}/git/analyze-changes", response_model=ChangeReportResponse)
async def analyze_git_changes(
    request: Request,
    repository_id: str,
    body: ChangeAnalysisRequest,
) -> ChangeReportResponse:
    """Perform AI change intelligence on Git diff using configured model."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    settings = request.app.state.settings
    provider = settings.active_provider or "ollama"
    model = (
        (settings.gemini_model or "gemini-2.5-flash")
        if provider == "gemini"
        else (settings.ollama_model or "gemma2:2b")
    )

    repo_path = Path(repo["local_path"])
    report = await request.app.state.change_intelligence_service.analyze_changes(
        repo_path=repo_path,
        repo_id=repository_id,
        db=request.app.state.db,
        baseline_commit=body.baseline_commit,
        compared_commit=body.compared_commit,
        target_files=body.target_files,
        model=model,
        provider=provider,
    )
    return ChangeReportResponse(**report)


@router.get("/{repository_id}/git/change-reports", response_model=list[ChangeReportResponse])
async def list_change_reports(
    request: Request,
    repository_id: str,
    limit: int = Query(20, ge=1, le=100),
) -> list[ChangeReportResponse]:
    """List historical AI change intelligence reports for this repository."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    reports = request.app.state.db.list_change_reports(repository_id, limit=limit)
    return [ChangeReportResponse(**r) for r in reports]


@router.get("/{repository_id}/git/timeline", response_model=list[TimelineEvent])
async def get_change_timeline(
    request: Request,
    repository_id: str,
) -> list[TimelineEvent]:
    """Get unified chronological timeline of real Git commits and RepoPilot actions."""
    repo = request.app.state.db.get_repository(repository_id)
    if not repo:
        raise AppError(404, "repo_not_found", f"Repository '{repository_id}' not found.")

    repo_path = Path(repo["local_path"])
    events = request.app.state.git_service.get_timeline(
        repo_path=repo_path,
        repo_id=repository_id,
        db=request.app.state.db,
    )
    return [TimelineEvent(**e) for e in events]
