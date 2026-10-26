from pathlib import Path
from fastapi import APIRouter, Query, Request

from app.errors import AppError
from app.schemas import FileContentResponse, RepositoryImportRequest, RepositoryResponse, TreeNode

router = APIRouter(prefix="/repositories", tags=["repositories"])


@router.get("", response_model=list[RepositoryResponse])
async def list_repositories(request: Request) -> list[RepositoryResponse]:
    """List all imported repositories."""
    repos = request.app.state.db.list_repositories()
    return [RepositoryResponse(**r) for r in repos]


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
        default_branch=repo_data["default_branch"],
        languages=repo_data["languages"],
        file_count=repo_data["file_count"],
    )
    return RepositoryResponse(**stored)


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
