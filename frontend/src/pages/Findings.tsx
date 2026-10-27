import { useMemo, useState } from "react";
import { Wrench, AlertTriangle, Layers, Lightbulb, FileCode } from "lucide-react";
import { ApiError, post } from "../api";
import { useApi } from "../hooks";
import { useRepo } from "../context/RepoContext";
import type { Finding } from "../types";
import { Async, Badge, Empty, ErrorBox, PageHeader } from "../components/ui";

const SEV = ["all", "critical", "high", "medium", "low", "info"];

export default function Findings({ go }: { go: (r: string) => void }) {
  const { activeRepo } = useRepo();
  const endpoint = activeRepo ? `/findings?repository_id=${activeRepo.id}` : "/findings";
  const list = useApi<Finding[]>(endpoint);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [sev, setSev] = useState("all");
  const [q, setQ] = useState("");

  const propose = async (id: string) => {
    setBusyId(id);
    setErr(null);
    try {
      await post(`/findings/${id}/propose-patch`);
      go("patches");
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusyId(null);
    }
  };

  const shown = useMemo(
    () =>
      (list.data ?? []).filter(
        (f) =>
          (sev === "all" || f.severity.toLowerCase() === sev) &&
          (!q || `${f.title} ${f.file_path} ${f.category} ${f.root_cause || ""}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [list.data, sev, q]
  );

  return (
    <>
      <PageHeader
        title="Findings"
        subtitle={
          activeRepo
            ? `Identified code issues and root-cause analyses for ${activeRepo.name}.`
            : "Model hypotheses backed by evidence. A finding is not a confirmed bug until verified."
        }
      />

      {list.data && list.data.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            className="input max-w-xs text-xs"
            placeholder="Filter by title, file, category or root cause"
            aria-label="Filter findings"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex gap-1" role="group" aria-label="Severity">
            {SEV.map((s) => (
              <button
                key={s}
                aria-pressed={sev === s}
                onClick={() => setSev(s)}
                className={`btn text-xs capitalize ${
                  sev === s ? "border-accent-dim text-accent bg-ink-800" : ""
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <div className="mb-4">
          <ErrorBox error={err} />
        </div>
      )}

      <Async state={list} milestone="Milestone 3">
        {(items) =>
          items.length === 0 ? (
            <Empty title="No findings recorded for this repository">
              Findings appear after running an investigation. If the model determines no issues exist in the selected context, it will state so honestly without inventing false bugs.
            </Empty>
          ) : shown.length === 0 ? (
            <Empty title="Nothing matches those filters" />
          ) : (
            <ul className="space-y-4">
              {shown.map((f) => (
                <li key={f.id} className="card space-y-3 p-5 text-sm">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 pb-3">
                    <div className="flex items-center gap-2">
                      <Badge>{f.severity}</Badge>
                      <span className="font-semibold text-white">{f.title}</span>
                    </div>
                    <span className="rounded bg-ink-800 px-2 py-0.5 text-xs text-gray-400 font-mono">
                      {f.category}
                    </span>
                  </div>

                  {/* File & Line Info */}
                  <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
                    <FileCode className="h-3.5 w-3.5 text-accent" />
                    <span>{f.file_path}</span>
                    <span className="text-gray-500">
                      {f.line_start
                        ? `:${f.line_start}${f.line_end && f.line_end !== f.line_start ? `-${f.line_end}` : ""}`
                        : " (line inferred)"}
                    </span>
                  </div>

                  {/* Explanation */}
                  {f.explanation && (
                    <p className="text-xs leading-relaxed text-gray-300">{f.explanation}</p>
                  )}

                  {/* Root Cause Panel */}
                  {f.root_cause && (
                    <div className="rounded-md border border-amber-900/50 bg-amber-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 mb-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <span>Root-Cause Analysis</span>
                      </div>
                      <p className="text-xs text-gray-300 leading-relaxed">{f.root_cause}</p>
                    </div>
                  )}

                  {/* Impact */}
                  {f.impact && (
                    <div className="rounded-md border border-blue-900/40 bg-blue-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 mb-1">
                        <Layers className="h-3.5 w-3.5" />
                        <span>Impact Scope</span>
                      </div>
                      <p className="text-xs text-gray-300">{f.impact}</p>
                    </div>
                  )}

                  {/* Evidence snippet */}
                  {f.evidence && (
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Code Evidence
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-ink-950 p-3 font-mono text-xs text-gray-300 border border-ink-800">
                        {f.evidence}
                      </pre>
                    </div>
                  )}

                  {/* Suggested fix */}
                  {f.suggested_fix && (
                    <div className="rounded-md bg-ink-900/60 p-3 border border-ink-700/80">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1">
                        <Lightbulb className="h-3.5 w-3.5" />
                        <span>Suggested Fix</span>
                      </div>
                      <pre className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
                        {f.suggested_fix}
                      </pre>
                    </div>
                  )}

                  {/* Footer & Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 pt-3 text-xs text-gray-400">
                    <div className="flex items-center gap-3">
                      <span>Confidence: <strong className="text-gray-200 capitalize">{f.confidence}</strong></span>
                      <span>Review: <strong className="text-gray-200 capitalize">{f.review_status}</strong></span>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={busyId === f.id}
                      onClick={() => propose(f.id)}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      {busyId === f.id ? "Synthesizing minimal patch…" : "Propose Patch"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </>
  );
}
