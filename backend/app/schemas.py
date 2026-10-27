from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------- Model & Health
class ModelInfo(BaseModel):
    name: str
    size_bytes: int | None = None
    parameter_size: str | None = None
    quantization: str | None = None
    family: str | None = None
    modified_at: str | None = None


class ModelStatus(BaseModel):
    provider: str = "ollama"
    base_url: str
    connected: bool
    version: str | None = None
    selected_model: str | None = None
    selected_model_installed: bool = False
    installed_model_count: int = 0
    detail: str | None = None
    hint: str | None = None


class HealthResponse(BaseModel):
    status: str  # "ok" means backend is up
    app_version: str
    model: ModelStatus


class ModelListResponse(BaseModel):
    provider: str = "ollama"
    selected_model: str | None
    models: list[ModelInfo]


# ---------------------------------------------------------------------- Repositories
class RepositoryImportRequest(BaseModel):
    source_type: str = Field(..., description="'local' or 'github'")
    location: str = Field(..., description="Absolute path or GitHub URL")


class RepositoryResponse(BaseModel):
    id: str
    name: str
    source_type: str
    local_path: str | None = None
    default_branch: str | None = None
    current_commit: str | None = None
    languages: list[str] = []
    file_count: int = 0
    last_indexed_at: str | None = None
    last_scan_at: str | None = None
    open_findings_count: int = 0
    pending_patches_count: int = 0
    latest_test_status: str | None = None
    last_investigation_status: str | None = None


class TreeNode(BaseModel):
    name: str
    path: str
    type: str  # "file" or "dir"
    children: list["TreeNode"] | None = None


class FileContentResponse(BaseModel):
    path: str
    content: str
    language: str | None = None
    truncated: bool = False
    skipped_reason: str | None = None


# ---------------------------------------------------------------------- Investigations
class AnalyzeRequest(BaseModel):
    question: str
    image_data: str | None = Field(None, description="Optional base64 screenshot for multimodal bug analysis")



class FindingResponse(BaseModel):
    id: str
    investigation_id: str
    title: str
    severity: str
    category: str
    file_path: str
    line_start: int | None = None
    line_end: int | None = None
    evidence: str
    explanation: str | None = None
    suggested_fix: str | None = None
    root_cause: str | None = None
    impact: str | None = None
    confidence: str
    review_status: str


class InvestigationResponse(BaseModel):
    id: str
    repository_id: str
    question: str
    model: str
    provider: str
    status: str
    started_at: str
    completed_at: str | None = None
    error: str | None = None
    limitations: list[str] = []
    findings: list[FindingResponse] = []


# ---------------------------------------------------------------------- Patches
class PatchResponse(BaseModel):
    id: str
    finding_id: str
    diff: str
    explanation: str | None = None
    file_path: str | None = None
    original_hash: str | None = None
    validation_status: str
    approval_status: str


# ---------------------------------------------------------------------- Test Runs
class TestRunResponse(BaseModel):
    id: str
    patch_id: str
    command: str
    exit_code: int | None = None
    output: str | None = None
    duration_ms: int | None = None
    status: str


# ---------------------------------------------------------------------- History & Skills
class HistoryEventResponse(BaseModel):
    id: str
    type: str
    message: str
    created_at: str


class SkillResponse(BaseModel):
    name: str
    description: str
    path: str


# ---------------------------------------------------------------------- Git & Tracking
class GitFileChange(BaseModel):
    path: str
    status: str
    staged: bool
    insertions: int = 0
    deletions: int = 0


class GitWorkingTreeStatus(BaseModel):
    is_git: bool
    branch: str | None = None
    commit: str | None = None
    clean: bool = True
    staged_files: list[GitFileChange] = []
    unstaged_files: list[GitFileChange] = []
    untracked_files: list[str] = []
    message: str | None = None


class GitCommit(BaseModel):
    hash: str
    short_hash: str
    author: str
    date: str
    message: str
    files_changed: int = 0
    insertions: int = 0
    deletions: int = 0


class GitDiffResponse(BaseModel):
    baseline: str | None = None
    target: str | None = None
    file_path: str | None = None
    diff: str
    stats: dict[str, Any] = {}


class ChangeAnalysisRequest(BaseModel):
    baseline_commit: str | None = None
    compared_commit: str | None = None
    target_files: list[str] | None = None


class ChangeReportResponse(BaseModel):
    id: str
    repository_id: str
    baseline_commit: str | None = None
    compared_commit: str | None = None
    model: str
    provider: str
    summary: str
    impact: list[str] = []
    risk_level: str
    risk_rationale: str
    recommended_checks: list[str] = []
    created_at: str


class TimelineEvent(BaseModel):
    id: str
    source: str
    category: str
    title: str
    description: str
    timestamp: str
    metadata: dict[str, Any] = {}

