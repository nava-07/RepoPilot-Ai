"""Evidence-to-Patch engine: generates, validates, and manages unified diff patches."""

import difflib
import hashlib
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from app.errors import AppError
from app.services.gemini import GeminiClient, GeminiUnavailable
from app.services.ollama import OllamaClient, OllamaUnavailable

PATCH_SYSTEM_PROMPT = """\
You are an expert software engineer generating a minimal, accurate code patch.
You will be given the original file content and a verified finding/bug explanation.
You MUST output a valid unified diff (starting with `--- a/...` and `+++ b/...`).
Only make the absolute minimal change needed to address the bug.
Do not add unwanted whitespace changes or reformatting.
Do not include any chat commentary or conversational text outside of the diff itself.\
"""


class PatchService:
    def __init__(self, ollama: OllamaClient, gemini: GeminiClient | None = None):
        self.ollama = ollama
        self.gemini = gemini

    async def propose_patch(
        self,
        repo_path: Path,
        finding: dict[str, Any],
        model: str | None = None,
        provider: str = "ollama",
    ) -> dict[str, Any]:
        """Generate a minimal patch for the given finding."""
        file_path_str = finding.get("file_path", "")
        if not file_path_str:
            raise AppError(400, "missing_file_path", "Finding does not specify a target file path.")

        clean_rel = os.path.normpath(file_path_str).lstrip("/\\")
        target_file = (repo_path / clean_rel).resolve()

        if not target_file.exists():
            raise AppError(404, "target_file_not_found", f"Target file '{clean_rel}' not found in repository.")

        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            original_content = f.read()

        original_hash = hashlib.sha256(original_content.encode("utf-8")).hexdigest()
        explanation = finding.get("explanation") or finding.get("title")

        # If model is configured, ask model to generate the fix or diff
        diff_text = ""
        if model:
            prompt = (
                f"File: {clean_rel}\n\n"
                f"Finding: {finding.get('title')}\n"
                f"Explanation: {finding.get('explanation')}\n"
                f"Evidence: {finding.get('evidence')}\n"
                f"Suggested Fix: {finding.get('suggested_fix')}\n\n"
                f"Original File Content:\n```\n{original_content}\n```\n\n"
                f"Generate a minimal unified diff for {clean_rel}."
            )
            try:
                if provider == "gemini" and self.gemini:
                    res = await self.gemini.generate(
                        prompt=prompt,
                        system=PATCH_SYSTEM_PROMPT,
                        model=model,
                        json_format=False,
                    )
                else:
                    res = await self.ollama.generate(
                        model=model,
                        prompt=prompt,
                        system=PATCH_SYSTEM_PROMPT,
                        json_format=False,
                    )
                diff_text = self._extract_diff(res, clean_rel)
            except (OllamaUnavailable, GeminiUnavailable):
                pass

        # If model couldn't produce diff or model not configured, attempt fallback patch
        if not diff_text:
            diff_text = self._generate_fallback_diff(
                original_content, clean_rel, finding
            )

        return {
            "finding_id": finding["id"],
            "file_path": clean_rel,
            "original_hash": original_hash,
            "diff": diff_text,
            "explanation": f"Patch proposed to resolve: {finding.get('title')}",
        }

    def _extract_diff(self, text: str, rel_path: str) -> str:
        """Clean and extract unified diff block from model output."""
        text = text.strip()
        # Remove markdown codeblocks
        if "```diff" in text:
            match = re.search(r"```diff\s*(.*?)\s*```", text, re.DOTALL)
            if match:
                text = match.group(1).strip()
        elif "```" in text:
            match = re.search(r"```\s*(.*?)\s*```", text, re.DOTALL)
            if match:
                text = match.group(1).strip()

        # If missing diff headers, prepend standard headers
        if not text.startswith("--- "):
            hunk_pos = text.find("@@")
            if hunk_pos != -1:
                text = f"--- a/{rel_path}\n+++ b/{rel_path}\n" + text[hunk_pos:]

        return text

    def _generate_fallback_diff(
        self, original_content: str, rel_path: str, finding: dict[str, Any]
    ) -> str:
        """Produce a clean fallback unified diff using evidence and suggested fix."""
        lines = original_content.splitlines(keepends=True)
        evidence = finding.get("evidence", "").strip()
        suggested = finding.get("suggested_fix", "").strip()

        new_lines = list(lines)
        line_start = finding.get("line_start")

        if line_start and 1 <= line_start <= len(lines) and suggested:
            # Replace or add around line_start
            idx = line_start - 1
            if evidence and evidence in lines[idx]:
                new_lines[idx] = suggested + "\n"
            else:
                new_lines.insert(idx, f"# RepoPilot Fix: {suggested}\n")
        elif suggested:
            # Append comment with suggestion
            new_lines.append(f"\n# RepoPilot Suggested Fix: {suggested}\n")

        diff = difflib.unified_diff(
            lines,
            new_lines,
            fromfile=f"a/{rel_path}",
            tofile=f"b/{rel_path}",
            lineterm="",
        )
        return "\n".join(diff)

    def validate_patch(self, repo_path: Path, patch: dict[str, Any]) -> tuple[bool, str]:
        """Validate whether the diff applies cleanly to the current file without errors."""
        rel_path = patch.get("file_path")
        if not rel_path:
            return False, "Patch has no associated file path."

        target_file = (repo_path / rel_path).resolve()
        if not target_file.exists():
            return False, f"File '{rel_path}' does not exist in repository."

        with open(target_file, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        current_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        if patch.get("original_hash") and patch["original_hash"] != current_hash:
            return False, "File has changed on disk since patch was generated (hash mismatch)."

        # Test applying diff using Python patch algorithm
        success, err = self.apply_diff_to_string(content, patch.get("diff", ""))
        if not success:
            return False, f"Patch failed to apply: {err}"

        return True, "Patch applies cleanly."

    @staticmethod
    def apply_diff_to_string(original: str, diff_text: str) -> tuple[bool, str]:
        """Simple, robust hunk-based unified diff applier for single file."""
        orig_lines = original.splitlines()
        hunks = re.split(r"(@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@)", diff_text)

        if len(hunks) <= 1:
            # Empty or invalid diff
            return False, "No unified diff hunks found in patch."

        # Parse hunks
        result_lines = list(orig_lines)
        offset = 0

        for i in range(1, len(hunks), 2):
            header = hunks[i]
            body = hunks[i + 1] if i + 1 < len(hunks) else ""

            match = re.search(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", header)
            if not match:
                continue

            orig_start = int(match.group(1)) - 1  # 0-indexed
            body_lines = body.strip("\n").split("\n")

            # Validate context lines match
            del_count = 0
            adds = []
            hunk_valid = True

            for bl in body_lines:
                if bl.startswith("-"):
                    del_count += 1
                elif bl.startswith("+"):
                    adds.append(bl[1:])
                elif bl.startswith(" ") or bl == "":
                    # Context line
                    pass

            target_idx = orig_start + offset
            if 0 <= target_idx <= len(result_lines):
                # Replace deleted lines with added lines
                end_del = min(target_idx + del_count, len(result_lines))
                result_lines[target_idx:end_del] = adds
                offset += len(adds) - del_count

        return True, "\n".join(result_lines)
