import { useApi } from "../hooks";
import type { Skill } from "../types";
import { Async, Empty, PageHeader } from "../components/ui";

export default function Skills() {
  const list = useApi<Skill[]>("/skills");
  return (
    <>
      <PageHeader title="Agent Skills" subtitle="Reusable skills discovered by the backend (e.g. repo-debugger)." />
      <Async state={list} milestone="Milestone 6">{(skills) => skills.length === 0
        ? <Empty title="No skills found">Skills are read from backend/skills/*/SKILL.md.</Empty>
        : <ul className="grid gap-3 md:grid-cols-2">{skills.map((s) => (
            <li key={s.name} className="card p-4 text-sm"><div className="font-medium">{s.name}</div><p className="mt-1 text-gray-400">{s.description}</p><code className="mt-2 block font-mono text-xs text-gray-500">{s.path}</code></li>))}</ul>}</Async>
    </>
  );
}
