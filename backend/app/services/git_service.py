"""Git tracking, commit history, diff generation, and repository event timeline service."""

import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.errors import AppError
from app.services.repo_service import RepoService


class GitService:
    def __init__(self, repo_service: RepoService):
        self.repo_service = repo_service

    def _run_git(self, repo_path: Path, args: list[str], timeout: int = 15) -> tuple[int, str, str]:
        """Execute a git command safely in repo_path with timeout and utf-8 decoding."""
        try:
            # We explicitly pass safe.directory config to prevent Windows ownership warnings
            cmd = ["git", "-c", "safe.directory=*"] + args
            env = dict(os.environ)
            res = subprocess.run(
                cmd,
                cwd=str(repo_path),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                encoding="utf-8",
                errors="replace",
                env=env,
            )
            return res.returncode, res.stdout, res.stderr
        except subprocess.TimeoutExpired:
            return -1, "", "Git command timed out after 15s"
        except FileNotFoundError:
            return -1, "", "Git executable not found on host machine"
        except Exception as e:
            return -1, "", str(e)

    def is_git_repo(self, repo_path: Path) -> bool:
        """Check if target path is an initialized Git repository."""
        if not repo_path.exists() or not repo_path.is_dir():
            return False
        git_dir = repo_path / ".git"
        if git_dir.exists():
            return True
        code, stdout, _ = self._run_git(repo_path, ["rev-parse", "--is-inside-work-tree"], timeout=5)
        return code == 0 and "true" in stdout.strip().lower()

    def get_current_branch(self, repo_path: Path) -> str | None:
        code, stdout, _ = self._run_git(repo_path, ["rev-parse", "--abbrev-ref", "HEAD"], timeout=5)
        if code == 0 and stdout.strip():
            b = stdout.strip()
            return b if b != "HEAD" else "detached"
        return None

    def get_current_commit(self, repo_path: Path) -> str | None:
        code, stdout, _ = self._run_git(repo_path, ["rev-parse", "HEAD"], timeout=5)
        return stdout.strip() if code == 0 and stdout.strip() else None

    def get_working_tree_status(self, repo_path: Path) -> dict[str, Any]:
        """Inspect working tree: staged changes, unstaged changes, and untracked files."""
        self.repo_service.validate_authorized(repo_path)
        if not self.is_git_repo(repo_path):
            return {
                "is_git": False,
                "branch": None,
                "commit": None,
                "clean": True,
                "staged_files": [],
                "unstaged_files": [],
                "untracked_files": [],
                "message": "Not a Git repository. Source browsing and investigations are supported.",
            }

        branch = self.get_current_branch(repo_path)
        commit = self.get_current_commit(repo_path)

        # Parse porcelain status
        code, stdout, stderr = self._run_git(repo_path, ["status", "--porcelain=v1", "-uall"])
        if code != 0:
            return {
                "is_git": True,
                "branch": branch,
                "commit": commit,
                "clean": True,
                "staged_files": [],
                "unstaged_files": [],
                "untracked_files": [],
                "message": f"Git status warning: {stderr.strip()}",
            }

        staged_files: list[dict[str, Any]] = []
        unstaged_files: list[dict[str, Any]] = []
        untracked_files: list[str] = []

        # Get diff stats for line changes
        staged_stats = self._get_numstat(repo_path, cached=True)
        unstaged_stats = self._get_numstat(repo_path, cached=False)

        for line in stdout.splitlines():
            if len(line) < 3:
                continue
            idx_code = line[0]
            work_code = line[1]
            file_entry = line[3:].strip()

            # Handle renames e.g. "old -> new"
            if " -> " in file_entry:
                _, file_path = file_entry.split(" -> ", 1)
            else:
                file_path = file_entry

            # Untracked files
            if idx_code == "?" and work_code == "?":
                untracked_files.append(file_path)
                continue

            # Staged changes (Index)
            if idx_code in ("M", "A", "D", "R", "C"):
                status_name = {
                    "M": "modified",
                    "A": "added",
                    "D": "deleted",
                    "R": "renamed",
                    "C": "copied",
                }.get(idx_code, "changed")
                ins, dels = staged_stats.get(file_path, (0, 0))
                staged_files.append({
                    "path": file_path,
                    "status": status_name,
                    "staged": True,
                    "insertions": ins,
                    "deletions": dels,
                })

            # Unstaged changes (Working Tree)
            if work_code in ("M", "D"):
                status_name = "modified" if work_code == "M" else "deleted"
                ins, dels = unstaged_stats.get(file_path, (0, 0))
                unstaged_files.append({
                    "path": file_path,
                    "status": status_name,
                    "staged": False,
                    "insertions": ins,
                    "deletions": dels,
                })

        is_clean = len(staged_files) == 0 and len(unstaged_files) == 0 and len(untracked_files) == 0

        return {
            "is_git": True,
            "branch": branch,
            "commit": commit,
            "clean": is_clean,
            "staged_files": staged_files,
            "unstaged_files": unstaged_files,
            "untracked_files": untracked_files,
            "message": "Working tree is clean" if is_clean else f"{len(staged_files)} staged, {len(unstaged_files)} unstaged, {len(untracked_files)} untracked",
        }

    def _get_numstat(self, repo_path: Path, cached: bool = False) -> dict[str, tuple[int, int]]:
        """Fetch insertions/deletions mapped by file path."""
        args = ["diff", "--numstat"]
        if cached:
            args.append("--cached")
        code, stdout, _ = self._run_git(repo_path, args)
        stats: dict[str, tuple[int, int]] = {}
        if code != 0:
            return stats
        for line in stdout.splitlines():
            parts = line.strip().split("\t")
            if len(parts) >= 3:
                ins = int(parts[0]) if parts[0].isdigit() else 0
                dels = int(parts[1]) if parts[1].isdigit() else 0
                path = parts[2]
                stats[path] = (ins, dels)
        return stats

    def get_commit_history(self, repo_path: Path, limit: int = 50) -> list[dict[str, Any]]:
        """Retrieve recent Git commits with author, ISO date, message, and stats."""
        self.repo_service.validate_authorized(repo_path)
        if not self.is_git_repo(repo_path):
            return []

        # Use unit separator (ASCII 31, \x1f) delimiter for reliable parsing of commit logs
        fmt = "%H\x1f%h\x1f%an\x1f%ae\x1f%ad\x1f%s"
        code, stdout, _ = self._run_git(
            repo_path,
            ["log", f"-n{limit}", f"--pretty=format:{fmt}", "--date=iso-strict", "--shortstat"],
        )
        if code != 0 or not stdout.strip():
            return []

        commits: list[dict[str, Any]] = []
        current_commit: dict[str, Any] | None = None

        for line in stdout.splitlines():
            line = line.strip()
            if not line:
                continue

            # Check if this line is the commit metadata header
            if "\x1f" in line:
                if current_commit:
                    commits.append(current_commit)
                parts = line.split("\x1f")
                if len(parts) >= 6:
                    current_commit = {
                        "hash": parts[0],
                        "short_hash": parts[1],
                        "author": f"{parts[2]} <{parts[3]}>" if parts[3] else parts[2],
                        "date": parts[4],
                        "message": parts[5],
                        "files_changed": 0,
                        "insertions": 0,
                        "deletions": 0,
                    }
            elif current_commit and ("changed" in line or "insertion" in line or "deletion" in line):
                # Parse shortstat line: e.g., "3 files changed, 45 insertions(+), 12 deletions(-)"
                m_files = re.search(r"(\d+)\s+file", line)
                m_ins = re.search(r"(\d+)\s+insertion", line)
                m_dels = re.search(r"(\d+)\s+deletion", line)
                if m_files:
                    current_commit["files_changed"] = int(m_files.group(1))
                if m_ins:
                    current_commit["insertions"] = int(m_ins.group(1))
                if m_dels:
                    current_commit["deletions"] = int(m_dels.group(1))

        if current_commit:
            commits.append(current_commit)

        return commits

    def get_diff(
        self,
        repo_path: Path,
        baseline: str | None = None,
        target: str | None = None,
        file_path: str | None = None,
    ) -> dict[str, Any]:
        """Generate unified diff between baseline and target (or working tree vs HEAD)."""
        self.repo_service.validate_authorized(repo_path)
        if not self.is_git_repo(repo_path):
            raise AppError(400, "not_git_repo", "Diff generation requires a Git repository.")

        args = ["diff", "-u"]

        if baseline and target:
            # Commit-to-commit comparison
            args.append(f"{baseline}..{target}")
        elif baseline:
            # Commit to current working tree
            args.append(baseline)
        else:
            # Default: changes compared to HEAD
            args.append("HEAD")

        if file_path:
            args.extend(["--", file_path])

        code, stdout, stderr = self._run_git(repo_path, args)
        if code != 0 and not stdout.strip():
            # If HEAD fails (e.g. initial repository with no commits yet), try raw diff
            code, stdout, _ = self._run_git(repo_path, ["diff", "-u"] + (["--", file_path] if file_path else []))

        diff_text = stdout

        # Calculate insertion/deletion line counts
        insertions = 0
        deletions = 0
        for l in diff_text.splitlines():
            if l.startswith("+") and not l.startswith("+++"):
                insertions += 1
            elif l.startswith("-") and not l.startswith("---"):
                deletions += 1

        return {
            "baseline": baseline,
            "target": target,
            "file_path": file_path,
            "diff": diff_text,
            "stats": {
                "insertions": insertions,
                "deletions": deletions,
                "lines_total": len(diff_text.splitlines()),
            },
        }

    def get_timeline(self, repo_path: Path, repo_id: str, db: Any) -> list[dict[str, Any]]:
        """Build unified chronological timeline merging real Git events and RepoPilot records."""
        events: list[dict[str, Any]] = []

        # 1. Real Git commits
        if self.is_git_repo(repo_path):
            commits = self.get_commit_history(repo_path, limit=30)
            for c in commits:
                events.append({
                    "id": f"git_{c['short_hash']}",
                    "source": "git",
                    "category": "commit",
                    "title": c["message"],
                    "description": f"Commit {c['short_hash']} by {c['author']} ({c['files_changed']} files, +{c['insertions']}/-{c['deletions']})",
                    "timestamp": c["date"],
                    "metadata": {"hash": c["hash"], "short_hash": c["short_hash"]},
                })

        # 2. RepoPilot Investigations
        invs = db.list_investigations(repo_id)
        for inv in invs:
            events.append({
                "id": f"rp_inv_{inv['id']}",
                "source": "repopilot",
                "category": "investigation",
                "title": f"Investigation: {inv['question'][:60]}",
                "description": f"Model: {inv['model'] or inv['provider']} • Status: {inv['status']}",
                "timestamp": inv["started_at"],
                "metadata": {"investigation_id": inv["id"], "status": inv["status"]},
            })

        # 3. Findings
        findings = db.list_findings(repository_id=repo_id)
        for f in findings:
            events.append({
                "id": f"rp_find_{f['id']}",
                "source": "repopilot",
                "category": "finding",
                "title": f"Finding: {f['title']}",
                "description": f"Severity: {f['severity'].upper()} in {f['file_path']} ({f['category']})",
                "timestamp": f["created_at"],
                "metadata": {"finding_id": f["id"], "severity": f["severity"]},
            })

        # 4. Patches
        patches = db.list_patches(repository_id=repo_id)
        for p in patches:
            events.append({
                "id": f"rp_patch_{p['id']}",
                "source": "repopilot",
                "category": "patch",
                "title": f"Patch proposed for finding {p['finding_id']}",
                "description": f"Validation: {p['validation_status']} • Review: {p['approval_status']}",
                "timestamp": p["created_at"],
                "metadata": {"patch_id": p["id"], "status": p["approval_status"]},
            })

        # 5. Test Runs
        runs = db.list_test_runs(repository_id=repo_id)
        for r in runs:
            events.append({
                "id": f"rp_test_{r['id']}",
                "source": "repopilot",
                "category": "test_run",
                "title": f"Test Execution: {r['status'].upper()}",
                "description": f"Command: {r['command']} • Exit code: {r['exit_code']}",
                "timestamp": r["created_at"],
                "metadata": {"test_run_id": r["id"], "status": r["status"]},
            })

        # 6. Change Intelligence Reports
        reports = db.list_change_reports(repository_id=repo_id)
        for rep in reports:
            events.append({
                "id": f"rp_rep_{rep['id']}",
                "source": "repopilot",
                "category": "change_report",
                "title": f"Change Intelligence: {rep['risk_level']} Risk",
                "description": rep["summary"][:90] + ("..." if len(rep["summary"]) > 90 else ""),
                "timestamp": rep["created_at"],
                "metadata": {"report_id": rep["id"], "risk_level": rep["risk_level"]},
            })

        # Sort all events chronologically descending
        def parse_ts(ts_str: str) -> float:
            try:
                # Handle iso format
                clean = ts_str.replace("Z", "+00:00")
                return datetime.fromisoformat(clean).timestamp()
            except Exception:
                return 0.0

        events.sort(key=lambda x: parse_ts(x["timestamp"]), reverse=True)
        return events
