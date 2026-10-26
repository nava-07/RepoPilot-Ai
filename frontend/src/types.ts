// Shapes mirror the backend contract (Milestone 1 endpoints are implemented; the rest are planned).
export interface ModelInfo { name: string; size_bytes?: number | null; parameter_size?: string | null; quantization?: string | null; family?: string | null }
export interface ModelStatus {
  provider: string; base_url: string; connected: boolean; version?: string | null;
  selected_model?: string | null; selected_model_installed: boolean; installed_model_count: number;
  detail?: string | null; hint?: string | null;
}
export interface Health { status: string; app_version: string; model: ModelStatus }
export interface Repository { id: string; name: string; source_type: string; default_branch?: string; languages?: string[]; file_count?: number; last_indexed_at?: string }
export interface Finding { id: string; investigation_id: string; title: string; severity: string; category: string; file_path: string; line_start?: number | null; line_end?: number | null; evidence: string; explanation?: string; confidence: string; review_status: string }
export interface Investigation { id: string; repository_id: string; question: string; model: string; provider: string; status: string; started_at: string; completed_at?: string | null; limitations?: string[] }
export interface Patch { id: string; finding_id: string; diff: string; validation_status: string; approval_status: string; explanation?: string }
export interface TestRun { id: string; patch_id: string; command: string; exit_code: number | null; duration_ms?: number; output?: string; status: string }
export interface HistoryEvent { id: string; type: string; message: string; created_at: string }
export interface Skill { name: string; description: string; path: string }
