"""Repository analysis engine with bounded discovery, AST analysis, and AI reasoning."""

import ast
import json
import os
import re
from pathlib import Path
from typing import Any

from app.services.gemini import GeminiClient, GeminiUnavailable
from app.services.ollama import OllamaClient, OllamaUnavailable
from app.services.repo_service import IGNORED_DIRS, SENSITIVE_NAMES, BINARY_EXTENSIONS

ANALYSIS_SYSTEM_PROMPT = """\
You are an expert repository-aware code analyst and software engineer.
You are inspecting a codebase to answer a developer query or diagnose a bug.
You MUST respond with valid JSON matching this schema:
{
  "findings": [
    {
      "title": "Short title describing the issue",
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "category": "bug" | "security" | "logic" | "performance" | "style",
      "file_path": "path/to/file.ext",
      "line_start": 12,
      "line_end": 15,
      "evidence": "Exact code snippet showing the issue",
      "explanation": "Clear explanation of what is wrong and why",
      "suggested_fix": "Smallest reasonable correction",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "limitations": [
    "Any caveat or uncertainty if code context was insufficient"
  ]
}
If no bug or issue is found, return {"findings": [], "limitations": ["No verifiable issue found in selected context."]}.\
Do not invent line numbers or fabricate bugs. If uncertain, set confidence to 'low' and explain why.\
"""


class AnalysisService:
    def __init__(self, ollama: OllamaClient, gemini: GeminiClient | None = None):
        self.ollama = ollama
        self.gemini = gemini

    async def analyze(
        self,
        repo_path: Path,
        question: str,
        model: str | None = None,
        provider: str = "ollama",
        image_data: str | None = None,
    ) -> dict[str, Any]:
        """Run bounded analysis: Discover -> Context Selection -> Static AST -> AI Reasoning."""
        # 1. Discover & select relevant files
        context_files = self._select_context_files(repo_path, question)
        limitations: list[str] = []

        if not context_files:
            return {
                "findings": [],
                "limitations": ["No relevant source files could be found matching the query."],
            }

        # 2. Static AST check for Python files
        ast_findings = self._static_python_ast_check(repo_path, context_files)

        # 3. Model inference (if model configured and reachable)
        findings: list[dict[str, Any]] = list(ast_findings)

        if not model:
            limitations.append("No AI model configured. Showing static analysis results only.")
            return {"findings": findings, "limitations": limitations}

        # Format context for model
        snippets_text = []
        for rel_path, content in context_files.items():
            lines = content.splitlines()
            numbered = "\n".join(f"{i+1:4d} | {line}" for i, line in enumerate(lines[:300]))
            snippets_text.append(f"### File: {rel_path}\n```\n{numbered}\n```")

        prompt = (
            f"User Question / Bug Report:\n{question}\n\n"
            + (f"[Multimodal Attachment]: A bug screenshot or visual diagnostic was provided by the user.\n\n" if image_data else "")
            + f"Relevant Code Context:\n" + "\n\n".join(snippets_text) + "\n\n"
            "Analyze the code and any visual screenshot provided to identify issues related to the question. Respond in JSON."
        )

        try:
            if provider == "gemini" and self.gemini:
                raw_response = await self.gemini.generate(
                    prompt=prompt,
                    system=ANALYSIS_SYSTEM_PROMPT,
                    image_base64=image_data,
                    model=model,
                    json_format=True,
                )
            else:
                raw_response = await self.ollama.generate(
                    model=model,
                    prompt=prompt,
                    system=ANALYSIS_SYSTEM_PROMPT,
                    json_format=True,
                )
            parsed = self._parse_model_response(raw_response)
            for f in parsed.get("findings", []):
                # Ensure path is valid relative path
                if f.get("file_path") and f.get("file_path") not in context_files:
                    fname = Path(f["file_path"]).name
                    matched = next((k for k in context_files if Path(k).name == fname), None)
                    if matched:
                        f["file_path"] = matched
                findings.append(f)
            limitations.extend(parsed.get("limitations", []))
        except (OllamaUnavailable, GeminiUnavailable) as exc:
            limitations.append(f"AI model inference unavailable ({exc}). Used static checks only.")
        except Exception as exc:
            limitations.append(f"Model response validation error: {exc}")

        return {"findings": findings, "limitations": limitations}

    def _select_context_files(self, repo_path: Path, question: str) -> dict[str, str]:
        """Rank and select up to 5 source files relevant to the question keywords."""
        keywords = set(re.findall(r"\w+", question.lower()))
        # Filter common stop words
        stop_words = {"the", "is", "at", "which", "on", "a", "an", "and", "or", "in", "to", "for", "with", "bug", "why"}
        keywords = {k for k in keywords if len(k) > 2 and k not in stop_words}

        scored_files: list[tuple[int, str, str]] = []

        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
            for f in files:
                if f.startswith(".") or f in SENSITIVE_NAMES:
                    continue
                ext = Path(f).suffix.lower()
                if ext in BINARY_EXTENSIONS:
                    continue

                full_path = Path(root) / f
                rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")

                # Read preview
                try:
                    with open(full_path, "r", encoding="utf-8", errors="ignore") as fp:
                        content = fp.read(40000)
                except Exception:
                    continue

                score = 0
                rel_lower = rel_path.lower()
                content_lower = content.lower()

                for kw in keywords:
                    if kw in rel_lower:
                        score += 15
                    count = content_lower.count(kw)
                    score += min(count * 2, 20)

                # Prioritize test files if question mentions test or fix
                if ("test" in question.lower() or "fix" in question.lower()) and "test" in rel_lower:
                    score += 5

                # Prioritize files in root or src
                if "src" in rel_lower or "app" in rel_lower or "/" not in rel_path:
                    score += 2

                if score > 0:
                    scored_files.append((score, rel_path, content))

        # If no score match, pick the top source files (e.g. .py, .ts, .js)
        if not scored_files:
            for root, dirs, files in os.walk(repo_path):
                dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
                for f in sorted(files):
                    ext = Path(f).suffix.lower()
                    if ext in {".py", ".ts", ".js", ".go", ".rs", ".java"}:
                        full_path = Path(root) / f
                        rel_path = str(full_path.relative_to(repo_path)).replace("\\", "/")
                        try:
                            with open(full_path, "r", encoding="utf-8", errors="ignore") as fp:
                                scored_files.append((1, rel_path, fp.read(40000)))
                        except Exception:
                            continue
                    if len(scored_files) >= 5:
                        break
                if scored_files:
                    break

        scored_files.sort(key=lambda x: x[0], reverse=True)
        return {rel_path: content for _, rel_path, content in scored_files[:5]}

    def _static_python_ast_check(
        self, repo_path: Path, context_files: dict[str, str]
    ) -> list[dict[str, Any]]:
        """Perform deterministic syntax and AST error checks on Python files."""
        findings = []
        for rel_path, content in context_files.items():
            if not rel_path.endswith(".py"):
                continue
            try:
                ast.parse(content, filename=rel_path)
            except SyntaxError as exc:
                findings.append({
                    "title": f"Python SyntaxError in {rel_path}",
                    "severity": "critical",
                    "category": "bug",
                    "file_path": rel_path,
                    "line_start": exc.lineno,
                    "line_end": exc.lineno,
                    "evidence": exc.text.strip() if exc.text else str(exc),
                    "explanation": f"Syntax error: {exc.msg} at line {exc.lineno}:{exc.offset}",
                    "suggested_fix": "Fix python syntax at indicated line.",
                    "confidence": "high",
                })
        return findings

    def _parse_model_response(self, text: str) -> dict[str, Any]:
        """Validate and sanitize JSON output from the AI model."""
        text = text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n?", "", text)
            text = re.sub(r"\n?```$", "", text).strip()

        try:
            data = json.loads(text)
        except Exception:
            # Fallback regex extraction of JSON object
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
            else:
                return {"findings": [], "limitations": ["Model did not return valid JSON format."]}

        findings = []
        raw_findings = data.get("findings", [])
        if isinstance(raw_findings, list):
            for item in raw_findings:
                if not isinstance(item, dict):
                    continue
                title = str(item.get("title", "")).strip() or "Untitled Finding"
                severity = str(item.get("severity", "medium")).lower()
                if severity not in {"critical", "high", "medium", "low", "info"}:
                    severity = "medium"
                category = str(item.get("category", "bug")).lower()
                confidence = str(item.get("confidence", "medium")).lower()
                if confidence not in {"high", "medium", "low"}:
                    confidence = "medium"

                findings.append({
                    "title": title,
                    "severity": severity,
                    "category": category,
                    "file_path": str(item.get("file_path", "")).strip(),
                    "line_start": item.get("line_start"),
                    "line_end": item.get("line_end"),
                    "evidence": str(item.get("evidence", "")).strip(),
                    "explanation": str(item.get("explanation", "")).strip() or None,
                    "suggested_fix": str(item.get("suggested_fix", "")).strip() or None,
                    "confidence": confidence,
                })

        limitations = data.get("limitations", [])
        if not isinstance(limitations, list):
            limitations = [str(limitations)]

        return {"findings": findings, "limitations": limitations}
