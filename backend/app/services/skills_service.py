"""Skills discovery service: scans backend/skills directory for Agent Skills standard definitions."""

import re
from pathlib import Path
from typing import Any


class SkillsService:
    def __init__(self, skills_dir: Path):
        self.skills_dir = skills_dir

    def list_skills(self) -> list[dict[str, Any]]:
        """Find and parse all SKILL.md files."""
        skills = []
        if not self.skills_dir.exists():
            return skills

        for skill_file in self.skills_dir.glob("*/SKILL.md"):
            try:
                content = skill_file.read_text(encoding="utf-8")
                meta = self._parse_frontmatter(content)
                rel_path = str(skill_file.relative_to(self.skills_dir.parent)).replace("\\", "/")
                skills.append({
                    "name": meta.get("name", skill_file.parent.name),
                    "description": meta.get("description", "Agent skill definition"),
                    "path": rel_path,
                })
            except Exception:
                continue

        return skills

    @staticmethod
    def _parse_frontmatter(text: str) -> dict[str, str]:
        """Extract YAML frontmatter between --- blocks."""
        meta = {}
        match = re.match(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
        if match:
            for line in match.group(1).splitlines():
                if ":" in line:
                    key, val = line.split(":", 1)
                    meta[key.strip()] = val.strip().strip("\"'")
        return meta
