"""AI Change Intelligence service.

Analyzes actual Git diffs with the configured local Ollama model (e.g. gemma2:2b)
or Google Gemini API. Generates plain-English summaries, impacted functions/modules,
risk assessment, and recommended regression checks.
"""

import json
import re
from pathlib import Path
from typing import Any

from app.errors import AppError
from app.services.gemini import GeminiClient
from app.services.git_service import GitService
from app.services.ollama import OllamaClient
from app.services.repo_service import RepoService

CHANGE_ANALYSIS_SYSTEM_PROMPT = """\
You are an expert software engineer and code reviewer performing change intelligence on a Git diff.
You MUST output strictly valid JSON matching this schema:
{
  "summary": "Clear plain-English explanation of what changed, what functionality may be affected, why it matters, and the change classification.",
  "category": "feature" | "bugfix" | "refactor" | "security" | "config" | "dependency" | "chore",
  "impact": [
    "Specific functions, classes, modules, or API endpoints impacted"
  ],
  "risk_level": "Low" | "Medium" | "High" | "Unknown",
  "risk_rationale": "Concrete evidence from the diff explaining why this risk level was assigned.",
  "recommended_checks": [
    "Specific tests to execute, regression scenarios, edge cases, and manual checks"
  ],
  "limitations": [
    "What cannot be determined with certainty from this diff alone"
  ]
}
Do not include any conversational filler outside the JSON.\
"""


class ChangeIntelligenceService:
    def __init__(
        self,
        ollama: OllamaClient,
        gemini: GeminiClient | None,
        git_service: GitService,
        repo_service: RepoService,
    ):
        self.ollama = ollama
        self.gemini = gemini
        self.git_service = git_service
        self.repo_service = repo_service

    async def analyze_changes(
        self,
        repo_path: Path,
        repo_id: str,
        db: Any,
        baseline_commit: str | None = None,
        compared_commit: str | None = None,
        target_files: list[str] | None = None,
        model: str | None = None,
        provider: str = "ollama",
    ) -> dict[str, Any]:
        """Inspect Git diff and invoke AI model to generate change intelligence report."""
        self.repo_service.validate_authorized(repo_path)
        if not self.git_service.is_git_repo(repo_path):
            raise AppError(400, "not_git_repo", "Change intelligence requires an active Git repository.")

        # Get diff from GitService
        diff_data = self.git_service.get_diff(
            repo_path=repo_path,
            baseline=baseline_commit,
            target=compared_commit,
            file_path=target_files[0] if (target_files and len(target_files) == 1) else None,
        )

        diff_text = diff_data["diff"]
        if not diff_text.strip():
            # No changes detected between baseline and target
            return db.insert_change_report(
                repository_id=repo_id,
                baseline_commit=baseline_commit or "HEAD",
                compared_commit=compared_commit or "working-tree",
                model=model or "none",
                provider=provider,
                summary="No differences detected between the selected baseline and target states.",
                impact=[],
                risk_level="Low",
                risk_rationale="The diff is empty; no lines were modified, added, or removed.",
                recommended_checks=["Working tree is clean. No regression checks required."],
            )

        # Truncate diff if extremely large so model stays within context bounds
        max_diff_chars = 12000
        truncated = False
        if len(diff_text) > max_diff_chars:
            diff_text = diff_text[:max_diff_chars]
            truncated = True

        prompt = (
            f"Repository ID: {repo_id}\n"
            f"Baseline: {baseline_commit or 'HEAD'}\n"
            f"Compared: {compared_commit or 'working-tree'}\n"
            f"Files analyzed: {', '.join(target_files) if target_files else 'All changed files'}\n"
            + (f"[Note: Diff truncated to {max_diff_chars} characters for context limit]\n" if truncated else "")
            + f"\n--- GIT DIFF START ---\n{diff_text}\n--- GIT DIFF END ---\n\n"
            "Analyze this diff and produce the change intelligence report in JSON."
        )

        # Execute AI inference
        summary = ""
        impact: list[str] = []
        risk_level = "Unknown"
        risk_rationale = ""
        recommended_checks: list[str] = []

        try:
            if provider == "gemini" and self.gemini:
                raw_response = await self.gemini.generate(
                    prompt=prompt,
                    system=CHANGE_ANALYSIS_SYSTEM_PROMPT,
                    model=model or "gemini-2.5-flash",
                    json_format=True,
                )
            else:
                raw_response = await self.ollama.generate(
                    prompt=prompt,
                    system=CHANGE_ANALYSIS_SYSTEM_PROMPT,
                    model=model,
                    json_format=True,
                )

            parsed = self._extract_json(raw_response)
            summary = parsed.get("summary", "")
            impact = parsed.get("impact", [])
            risk_level = parsed.get("risk_level", "Unknown")
            risk_rationale = parsed.get("risk_rationale", "")
            recommended_checks = parsed.get("recommended_checks", [])

            # Normalize risk level
            if risk_level.capitalize() in ("Low", "Medium", "High", "Unknown"):
                risk_level = risk_level.capitalize()
            else:
                risk_level = "Medium"

        except Exception as exc:
            # Fallback static heuristics if AI inference is offline
            summary = (
                f"Static Change Summary: Diff contains {diff_data['stats'].get('insertions', 0)} additions "
                f"and {diff_data['stats'].get('deletions', 0)} deletions across {diff_data['stats'].get('lines_total', 0)} total diff lines. "
                f"(AI model analysis unavailable: {exc})"
            )
            impact = [f"Directly altered files: {diff_data.get('file_path') or 'Multiple working tree files'}"]
            risk_level = "Medium" if diff_data["stats"].get("deletions", 0) > 20 else "Low"
            risk_rationale = f"Heuristic rating based on modification volume (+{diff_data['stats'].get('insertions', 0)} / -{diff_data['stats'].get('deletions', 0)})."
            recommended_checks = [
                "Run test suite for modified modules",
                "Perform manual smoke test of altered entry points",
            ]

        # Persist report in database
        report = db.insert_change_report(
            repository_id=repo_id,
            baseline_commit=baseline_commit or "HEAD",
            compared_commit=compared_commit or "working-tree",
            model=model or "none",
            provider=provider,
            summary=summary,
            impact=impact,
            risk_level=risk_level,
            risk_rationale=risk_rationale,
            recommended_checks=recommended_checks,
        )

        return report

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        """Extract and parse JSON object from model output."""
        text = text.strip()
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if m:
            text = m.group(1).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try finding first { and matching }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {}
