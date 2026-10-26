"""Isolated test runner: executes tests in a safe, ephemeral workspace copy."""

import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from app.services.patch_service import PatchService


class TestService:
    def __init__(self, patch_service: PatchService):
        self.patch_service = patch_service

    def run_tests_for_patch(
        self,
        repo_path: Path,
        patch: dict[str, Any],
        timeout_seconds: float = 30.0,
    ) -> dict[str, Any]:
        """Copy repo to temporary workspace, apply patch, and run auto-detected tests."""
        # Check if tests exist in repo
        test_cmd = self._detect_test_command(repo_path)
        if not test_cmd:
            return {
                "command": "(none)",
                "exit_code": None,
                "output": "No supported automated test framework detected in repository (e.g. pytest, npm test).",
                "duration_ms": 0,
                "status": "unavailable",
            }

        # Create temporary isolated workspace
        with tempfile.TemporaryDirectory(prefix="repopilot_test_") as temp_dir:
            temp_workspace = Path(temp_dir) / "workspace"
            # Copy repo files, skipping .git and node_modules for speed and safety
            shutil.copytree(
                repo_path,
                temp_workspace,
                ignore=shutil.ignore_patterns(".git", "node_modules", ".venv", "__pycache__", "dist"),
            )

            # Apply patch to workspace
            rel_path = patch.get("file_path")
            diff_text = patch.get("diff", "")
            if rel_path and diff_text:
                target_file = temp_workspace / rel_path
                if target_file.exists():
                    try:
                        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
                            current = f.read()
                        ok, new_content = self.patch_service.apply_diff_to_string(current, diff_text)
                        if ok:
                            with open(target_file, "w", encoding="utf-8") as f:
                                f.write(new_content)
                    except Exception as exc:
                        return {
                            "command": "apply_patch",
                            "exit_code": 1,
                            "output": f"Failed to apply patch to temporary workspace: {exc}",
                            "duration_ms": 0,
                            "status": "failed",
                        }

            # Execute the test command in the isolated workspace
            start_time = time.monotonic()
            cmd_str = " ".join(test_cmd)
            try:
                env = os.environ.copy()
                env["PYTHONPATH"] = str(temp_workspace)
                proc = subprocess.run(
                    test_cmd,
                    cwd=str(temp_workspace),
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    env=env,
                    check=False,
                )
                duration_ms = int((time.monotonic() - start_time) * 1000)
                output = (proc.stdout + "\n" + proc.stderr).strip()
                status = "passed" if proc.returncode == 0 else "failed"

                return {
                    "command": cmd_str,
                    "exit_code": proc.returncode,
                    "output": output or "(test exited with no output)",
                    "duration_ms": duration_ms,
                    "status": status,
                }
            except subprocess.TimeoutExpired:
                duration_ms = int((time.monotonic() - start_time) * 1000)
                return {
                    "command": cmd_str,
                    "exit_code": -1,
                    "output": f"Test execution timed out after {timeout_seconds} seconds.",
                    "duration_ms": duration_ms,
                    "status": "failed",
                }
            except Exception as exc:
                duration_ms = int((time.monotonic() - start_time) * 1000)
                return {
                    "command": cmd_str,
                    "exit_code": 1,
                    "output": f"Execution error: {exc}",
                    "duration_ms": duration_ms,
                    "status": "failed",
                }

    def _detect_test_command(self, repo_path: Path) -> list[str] | None:
        """Detect language test runner available in repository."""
        # 1. Python pytest / unittest
        has_py_test = any(
            repo_path.glob("test_*.py")
        ) or any(
            repo_path.glob("*_test.py")
        ) or (repo_path / "tests").is_dir()

        if has_py_test or (repo_path / "pytest.ini").exists():
            return [sys.executable, "-m", "pytest", "-v"]

        # 2. Node npm test
        pkg_json = repo_path / "package.json"
        if pkg_json.exists():
            return ["npm", "test"]

        # 3. Go
        if any(repo_path.glob("*_test.go")):
            return ["go", "test", "./..."]

        # 4. Cargo
        if (repo_path / "Cargo.toml").exists():
            return ["cargo", "test"]

        return None
