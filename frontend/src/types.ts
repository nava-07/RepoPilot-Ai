// Shapes mirror the backend contract.
export interface ModelInfo {
  name: string;
  size_bytes?: number | null;
  parameter_size?: string | null;
  quantization?: string | null;
  family?: string | null;
}

export interface ModelStatus {
  provider: string;
  base_url: string;
  connected: boolean;
  version?: string | null;
  selected_model?: string | null;
  selected_model_installed: boolean;
  installed_model_count: number;
  detail?: string | null;
  hint?: string | null;
}

export interface Health {
  status: string;
  app_version: string;
  model: ModelStatus;
}

export interface Repository {
  id: string;
  name: string;
  source_type: string;
  local_path?: string;
  default_branch?: string;
  current_commit?: string | null;
  languages?: string[];
  file_count?: number;
  last_indexed_at?: string;
  last_scan_at?: string | null;
  open_findings_count?: number;
  pending_patches_count?: number;
  latest_test_status?: string | null;
  last_investigation_status?: string | null;
}

export interface Finding {
  id: string;
  investigation_id: string;
  title: string;
  severity: string;
  category: string;
  file_path: string;
  line_start?: number | null;
  line_end?: number | null;
  evidence: string;
  explanation?: string;
  suggested_fix?: string;
  root_cause?: string | null;
  impact?: string | null;
  confidence: string;
  review_status: string;
}

export interface Investigation {
  id: string;
  repository_id: string;
  question: string;
  model: string;
  provider: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  limitations?: string[];
  findings?: Finding[];
}

export interface Patch {
  id: string;
  finding_id: string;
  diff: string;
  validation_status: string;
  approval_status: string;
  explanation?: string;
  file_path?: string;
}

export interface TestRun {
  id: string;
  patch_id: string;
  command: string;
  exit_code: number | null;
  duration_ms?: number;
  output?: string;
  status: string;
}

export interface HistoryEvent {
  id: string;
  repository_id?: string | null;
  type: string;
  message: string;
  created_at: string;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
}

// Git Tracking types
export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
  insertions: number;
  deletions: number;
}

export interface GitWorkingTreeStatus {
  is_git: boolean;
  branch?: string | null;
  commit?: string | null;
  clean: boolean;
  staged_files: GitFileChange[];
  unstaged_files: GitFileChange[];
  untracked_files: string[];
  message?: string | null;
}

export interface GitCommit {
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface GitDiffResponse {
  baseline?: string | null;
  target?: string | null;
  file_path?: string | null;
  diff: string;
  stats: {
    insertions?: number;
    deletions?: number;
    lines_total?: number;
  };
}

export interface ChangeReport {
  id: string;
  repository_id: string;
  baseline_commit?: string | null;
  compared_commit?: string | null;
  model: string;
  provider: string;
  summary: string;
  impact: string[];
  risk_level: string;
  risk_rationale: string;
  recommended_checks: string[];
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  source: "git" | "repopilot";
  category: string;
  title: string;
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}
