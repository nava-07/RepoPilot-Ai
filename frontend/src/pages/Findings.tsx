import { useMemo, useState } from "react";
import { Wrench } from "lucide-react";
import { ApiError, post } from "../api";
import { useApi } from "../hooks";
import type { Finding } from "../types";
import { Async, Badge, Empty, ErrorBox, PageHeader } from "../components/ui";

const SEV = ["all", "critical", "high", "medium", "low", "info"];

export default function Findings({ go }: { go: (r: string) => void }) {
  const list = useApi<Finding[]>("/findings");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [sev, setSev] = useState("all");
  const [q, setQ] = useState("");
  const propose = async (id: string) => {
    setBusyId(id); setErr(null);
    try { await post(`/findings/${id}/propose-patch`); go("patches"); }
    catch (x) { setErr(x as ApiError); } finally { setBusyId(null); }
  };
  const shown = useMemo(() => (list.data ?? []).filter((f) =>
    (sev === "all" || f.severity.toLowerCase() === sev) &&
    (!q || `${f.title} ${f.file_path} ${f.category}`.toLowerCase().includes(q.toLowerCase()))), [list.data, sev, q]);
  return (
    <>
      <PageHeader title="Findings" subtitle="Model hypotheses backed by evidence. A finding is not a confirmed bug until verified." />
      {list.data && list.data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Filter by title, file or category" aria-label="Filter findings" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-1" role="group" aria-label="Severity">
            {SEV.map((s) => <button key={s} aria-pressed={sev === s} onClick={() => setSev(s)} className={`btn capitalize ${sev === s ? "border-accent-dim text-accent" : ""}`}>{s}</button>)}
          </div>
        </div>)}
      {err && <div className="mb-4"><ErrorBox error={err} milestone="Milestone 4" /></div>}
      <Async state={list} milestone="Milestone 3">{(items) => items.length === 0
        ? <Empty title="No findings">Findings appear after a completed investigation. An empty result can be valid: the model is allowed to say it is unsure.</Empty>
        : shown.length === 0 ? <Empty title="Nothing matches those filters" />
        : <ul className="space-y-3">{shown.map((f) => (
            <li key={f.id} className="card space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge>{f.severity}</Badge><span className="font-medium">{f.title}</span><span className="ml-auto text-xs text-gray-500">{f.category}</span></div>
              <div className="font-mono text-xs text-gray-400">{f.file_path}{f.line_start ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}` : " (line not confirmed)"}</div>
              {f.explanation && <p className="text-gray-300">{f.explanation}</p>}
              <pre className="overflow-x-auto rounded-md bg-ink-950 p-2 font-mono text-xs">{f.evidence}</pre>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                <span>Confidence: {f.confidence}</span><span>Review: {f.review_status}</span>
                <button className="btn ml-auto" disabled={busyId === f.id} onClick={() => propose(f.id)}><Wrench className="h-3.5 w-3.5" />{busyId === f.id ? "Generating…" : "Propose patch"}</button>
              </div>
            </li>))}</ul>}</Async>
    </>
  );
}
