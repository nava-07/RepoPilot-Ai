"""Repository inspection, tree generation, and safe file access service."""

import hashlib
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from app.errors import AppError

# Sensitive patterns / filenames to exclude completely
SENSITIVE_NAMES = {
    ".env", ".env.local", ".env.production", ".env.development", ".env.test",
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "credentials.json",
    "service-account.json", "secrets.json", "private_key.pem",
}

SENSITIVE_EXTENSIONS = {
    ".pem", ".key", ".pfx", ".p12", ".kdbx", ".keystore",
}

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".pytest_cache", ".ruff_cache", ".idea", ".vscode",
    ".next", ".nuxt", "target", "bin", "obj", ".mypy_cache",
}

BINARY_EXTENSIONS = {
    ".exe", ".dll", ".so", ".dylib", ".bin", ".dat", ".db", ".sqlite",
    ".sqlite3", ".pyc", ".class", ".jar", ".zip", ".tar", ".gz", ".7z",
    ".rar", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico",
    ".mp3", ".mp4", ".mov", ".wav", ".avi", ".woff", ".woff2", ".ttf", ".eot",
}

LANGUAGE_BY_EXT = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".jsx": "JavaScript (React)",
    ".rs": "Rust",
    ".go": "Go",
    ".java": "Java",
    ".c": "C",
    ".cpp": "C++",
    ".h": "C/C++ Header",
    ".cs": "C#",
    ".rb": "Ruby",
    ".php": "PHP",
    ".html": "HTML",
    ".css": "CSS",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".md": "Markdown",
    ".sh": "Shell",
    ".sql": "SQL",
}

MAX_FILE_BYTES = 250_000  # 250 KB max readable file
MAX_TOTAL_FILES = 2000    # Guard against indexing infinite deep structures


class RepoService:
    def __init__(self, data_dir: Path, authorized_roots: list[Path]):
        self.data_dir = data_dir
        self.authorized_roots = authorized_roots
        self.clones_dir = data_dir / "clones"
        self.clones_dir.mkdir(parents=True, exist_ok=True)

    def validate_authorized(self, path: Path) -> None:
        """If authorized_roots are set, enforce that path is within one of them."""
        if not self.authorized_roots:
            return
        resolved = path.resolve()
        for root in self.authorized_roots:
            try:
                resolved.relative_to(root.resolve())
                return
            except ValueError:
                continue
        # Also allow clones directory
        try:
            resolved.relative_to(self.clones_dir.resolve())
            return
        except ValueError:
            pass
        raise AppError(
            403,
            "forbidden_path",
            f"Path '{path}' is not within any authorized root directory.",
            f"Authorized roots: {', '.join(str(r) for r in self.authorized_roots)}",
        )

    def import_local(self, path_str: str) -> dict[str, Any]:
        """Import an existing local directory."""
        path = Path(path_str).resolve()
        if not path.exists():
            raise AppError(404, "path_not_found", f"Directory does not exist: {path_str}")
        if not path.is_dir():
            raise AppError(400, "not_a_directory", f"Path is not a directory: {path_str}")

        self.validate_authorized(path)
        return self._inspect_repo(path, name=path.name, source_type="local")

    def import_github(self, url: str) -> dict[str, Any]:
        """Clone a public GitHub repository into data/clones/<repo_name>."""
        url = url.strip()
        # Validate GitHub URL format
        match = re.match(r"^https://github\.com/([\w.-]+)/([\w.-]+?)(?:\.git)?/?$", url)
        if not match:
            raise AppError(
                400,
                "invalid_github_url",
                "Invalid GitHub URL. Expected format: https://github.com/owner/repository",
            )
        owner, repo_name = match.group(1), match.group(2)
        target_dir = self.clones_dir / f"{owner}_{repo_name}"

        # Clean existing directory if present
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)

        try:
            result = subprocess.run(
                ["git", "clone", "--depth", "1", f"https://github.com/{owner}/{repo_name}.git", str(target_dir)],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise AppError(504, "clone_timeout", "Git clone timed out after 60 seconds.")
        except Exception as exc:
            raise AppError(500, "git_error", f"Failed to execute git clone: {exc}")

        if result.returncode != 0:
            raise AppError(
                400,
                "clone_failed",
                f"Failed to clone repository: {result.stderr.strip() or 'Unknown git error'}",
                "Ensure the repository is public and accessible.",
            )

        return self._inspect_repo(target_dir, name=f"{owner}/{repo_name}", source_type="github")

    def _inspect_repo(self, path: Path, name: str, source_type: str) -> dict[str, Any]:
        """Discover languages, default branch, and file count."""
        branch = "main"
        # Try getting git branch
        try:
            res = subprocess.run(
                ["git", "-C", str(path), "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True, text=True, timeout=5, check=False,
            )
            if res.returncode == 0 and res.stdout.strip():
                branch = res.stdout.strip()
        except Exception:
            pass

        languages_set: set[str] = set()
        file_count = 0

        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
            for f in files:
                if f.startswith("."):
                    continue
                file_count += 1
                if file_count > MAX_TOTAL_FILES:
                    break
                ext = Path(f).suffix.lower()
                if ext in LANGUAGE_BY_EXT:
                    languages_set.add(LANGUAGE_BY_EXT[ext])

        return {
            "name": name,
            "source_type": source_type,
            "local_path": str(path),
            "default_branch": branch,
            "languages": sorted(list(languages_set)),
            "file_count": file_count,
        }

    def get_tree(self, repo_path: Path) -> dict[str, Any]:
        """Generate nested tree structure respecting ignore lists."""
        self.validate_authorized(repo_path)
        if not repo_path.exists() or not repo_path.is_dir():
            raise AppError(404, "repo_not_found", "Repository directory does not exist on disk.")

        def build_node(cur_path: Path, rel_path: str = "") -> dict[str, Any]:
            name = cur_path.name if rel_path else repo_path.name
            if cur_path.is_file():
                return {"name": name, "path": rel_path, "type": "file"}

            children = []
            try:
                entries = sorted(cur_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
            except PermissionError:
                return {"name": name, "path": rel_path, "type": "dir", "children": []}

            for entry in entries:
                if entry.name in IGNORED_DIRS or entry.name in SENSITIVE_NAMES:
                    continue
                if entry.name.startswith(".") and entry.name != ".gitignore":
                    continue
                child_rel = f"{rel_path}/{entry.name}".lstrip("/")
                if entry.is_dir():
                    children.append(build_node(entry, child_rel))
                elif entry.is_file():
                    children.append({"name": entry.name, "path": child_rel, "type": "file"})

            return {"name": name, "path": rel_path, "type": "dir", "children": children}

        return build_node(repo_path)

    def read_file(self, repo_path: Path, relative_path: str) -> dict[str, Any]:
        """Safely read a file with security checks, size limits, and skipped reasons."""
        self.validate_authorized(repo_path)
        # Prevent path traversal
        clean_rel = os.path.normpath(relative_path).lstrip("/\\")
        if ".." in clean_rel.split(os.sep):
            raise AppError(400, "invalid_path", "Path traversal is not permitted.")

        target = (repo_path / clean_rel).resolve()
        try:
            target.relative_to(repo_path.resolve())
        except ValueError:
            raise AppError(403, "access_denied", "File is outside of the repository boundary.")

        if not target.exists():
            raise AppError(404, "file_not_found", f"File '{clean_rel}' not found.")
        if target.is_dir():
            raise AppError(400, "is_directory", f"Path '{clean_rel}' is a directory, not a file.")

        filename = target.name
        ext = target.suffix.lower()

        # Check sensitive
        if filename in SENSITIVE_NAMES or ext in SENSITIVE_EXTENSIONS or filename.startswith(".env"):
            return {
                "path": clean_rel,
                "content": "",
                "skipped_reason": "Sensitive or credential file hidden for security.",
            }

        # Check binary
        if ext in BINARY_EXTENSIONS:
            return {
                "path": clean_rel,
                "content": "",
                "skipped_reason": f"Binary file type ({ext}) cannot be previewed as text.",
            }

        file_size = target.stat().st_size
        truncated = False
        try:
            with open(target, "rb") as f:
                raw = f.read(MAX_FILE_BYTES + 1024)
            # Detect null bytes (binary)
            if b"\x00" in raw[:1024]:
                return {
                    "path": clean_rel,
                    "content": "",
                    "skipped_reason": "File contains binary data.",
                }
            if len(raw) > MAX_FILE_BYTES:
                raw = raw[:MAX_FILE_BYTES]
                truncated = True
            content = raw.decode("utf-8", errors="replace")
        except Exception as exc:
            return {
                "path": clean_rel,
                "content": "",
                "skipped_reason": f"Unable to read file: {exc}",
            }

        language = LANGUAGE_BY_EXT.get(ext)
        return {
            "path": clean_rel,
            "content": content,
            "language": language,
            "truncated": truncated,
            "skipped_reason": None,
        }

    @staticmethod
    def get_file_hash(target_path: Path) -> str:
        """Compute sha256 hash of a file for patch validation."""
        hasher = hashlib.sha256()
        with open(target_path, "rb") as f:
            while chunk := f.read(65536):
                hasher.update(chunk)
        return hasher.hexdigest()
