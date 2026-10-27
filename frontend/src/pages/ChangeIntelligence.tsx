import { useState, useEffect } from "react";
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  CheckCircle,
  FileCode,
  History,
  Layers,
  ListChecks,
} from "lucide-react";
import { api, post, type ApiError } from "../api";
import { useRepo } from "../context/RepoContext";
import type { ChangeReport, GitCommit } from "../types";
import { PageHeader, Skeleton, Empty, ErrorBox } from "../components/ui";

export default function ChangeIntelligence({ go }: { go: (route: string) => void }) {
  const { activeRepo, repos } = useRepo();

  const [reports, setReports] = useState<ChangeReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ChangeReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Analyze parameters
  const [baselineCommit, setBaselineCommit] = useState<string>("");
  const [comparedCommit, setComparedCommit] = useState<string>("");
  const [commits, setCommits] = useState<GitCommit[]>([]);

  const fetchReports = async () => {
    if (!activeRepo) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<ChangeReport[]>(`/repositories/${activeRepo.id}/git/change-reports?limit=25`);
      setReports(data);
      if (data.length > 0 && !selectedReport) {
        setSelectedReport(data[0]);
      }
    } catch (e: any) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommits = async () => {
    if (!activeRepo) return;
    try {
      const data = await api<GitCommit[]>(`/repositories/${activeRepo.id}/git/commits?limit=30`);
      setCommits(data);
    } catch {
      // Non-git repo or error
    }
  };

  useEffect(() => {
    if (activeRepo) {
      setSelectedReport(null);
      fetchReports();
      fetchCommits();
    }
  }, [activeRepo?.id]);

  const handleRunAnalysis = async () => {
    if (!activeRepo) return;
    setAnalyzing(true);
    setError(null);
    try {
      const report = await post<ChangeReport>(`/repositories/${activeRepo.id}/git/analyze-changes`, {
        baseline_commit: baselineCommit || undefined,
        compared_commit: comparedCommit || undefined,
      });
      setReports((prev) => [report, ...prev]);
      setSelectedReport(report);
    } catch (e: any) {
      setError(e);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!activeRepo) {
    return (
      <>
        <PageHeader
          title="AI Change Intelligence"
          subtitle="Semantic change summaries, impact graph, risk assessment, and recommended regression checks."
        />
        <Empty title="No active repository selected">
          {repos.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">Select a repository from your registry to run change intelligence.</p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Select a Repository
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">Import a repository to get started.</p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Import Repository
              </button>
            </div>
          )}
        </Empty>
      </>
    );
  }

  const renderRiskBadge = (level: string) => {
    const l = level.toLowerCase();
    if (l === "high") {
      return (
        <span className="flex items-center gap-1.5 rounded-full bg-rose-950 px-3 py-1 text-xs font-semibold text-rose-300 border border-rose-800">
          <ShieldAlert className="h-3.5 w-3.5" /> High Risk
        </span>
      );
    }
    if (l === "medium") {
      return (
        <span className="flex items-center gap-1.5 rounded-full bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-800">
          <ShieldAlert className="h-3.5 w-3.5" /> Medium Risk
        </span>
      );
    }
    if (l === "low") {
      return (
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-950 px-3 py-1 text-xs font-semibold text-emerald-300 border border-emerald-800">
          <ShieldCheck className="h-3.5 w-3.5" /> Low Risk
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1 text-xs font-semibold text-gray-300 border border-ink-700">
        <ShieldQuestion className="h-3.5 w-3.5" /> Unknown Risk
      </span>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="AI Change Intelligence"
          subtitle={`Reasoning on actual Git diffs for ${activeRepo.name} using local open-weight model.`}
        />
        <button
          className="btn btn-primary"
          onClick={handleRunAnalysis}
          disabled={analyzing}
        >
          <Sparkles className="h-4 w-4" />
          {analyzing ? "Analyzing diff with AI…" : "Analyze Working-Tree Diff"}
        </button>
      </div>

      {error && <ErrorBox error={error} />}

      {/* Scope Selector Bar */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs font-semibold uppercase text-gray-400">Analysis Scope:</span>
        <select
          className="input text-xs font-mono"
          value={baselineCommit}
          onChange={(e) => setBaselineCommit(e.target.value)}
        >
          <option value="">Baseline: HEAD (latest commit)</option>
          {commits.map((c) => (
            <option key={c.hash} value={c.hash}>
              {c.short_hash} — {c.message.slice(0, 35)}
            </option>
          ))}
        </select>
        <select
          className="input text-xs font-mono"
          value={comparedCommit}
          onChange={(e) => setComparedCommit(e.target.value)}
        >
          <option value="">Compared: Working tree (current uncommitted files)</option>
          {commits.map((c) => (
            <option key={c.hash} value={c.hash}>
              {c.short_hash} — {c.message.slice(0, 35)}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={handleRunAnalysis}
          disabled={analyzing}
        >
          {analyzing ? "Running…" : "Run Custom Comparison"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* Reports History Sidebar */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <History className="h-3.5 w-3.5" /> Previous Analysis Reports
          </div>
          {loading ? (
            <Skeleton rows={5} />
          ) : reports.length === 0 ? (
            <div className="card p-4 text-center text-xs text-gray-500">
              No change reports yet. Click "Analyze Working-Tree Diff" to run your first analysis.
            </div>
          ) : (
            <div className="card divide-y divide-ink-700 max-h-[36rem] overflow-auto">
              {reports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedReport(r)}
                  className={`cursor-pointer p-3 transition-colors ${
                    selectedReport?.id === r.id ? "bg-ink-700" : "hover:bg-ink-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono text-gray-400">{r.model || r.provider}</span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-200">{r.summary}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`text-[10px] font-semibold uppercase ${
                        r.risk_level === "High"
                          ? "text-rose-400"
                          : r.risk_level === "Medium"
                          ? "text-amber-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {r.risk_level} Risk
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {r.baseline_commit?.slice(0, 7)}..{r.compared_commit?.slice(0, 7) || "tree"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Report Detail View */}
        <div className="space-y-4">
          {analyzing ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center">
              <Sparkles className="h-10 w-10 text-accent animate-pulse mb-3" />
              <p className="text-base font-semibold text-gray-200">Analyzing Git changes…</p>
              <p className="mt-1 text-xs text-gray-400">
                The local model is evaluating code diffs, semantic impact, and regression risks.
              </p>
            </div>
          ) : !selectedReport ? (
            <div className="card flex flex-col items-center justify-center p-12 text-center text-gray-500">
              <FileCode className="h-10 w-10 opacity-30 mb-2" />
              <p className="text-sm">Select an analysis report on the left or run a new diff analysis.</p>
            </div>
          ) : (
            <>
              {/* Report Header Card */}
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-white">Change Summary</h2>
                      {renderRiskBadge(selectedReport.risk_level)}
                    </div>
                    <p className="mt-1 text-xs text-gray-400 font-mono">
                      Analyzed by {selectedReport.model} ({selectedReport.provider}) •{" "}
                      {new Date(selectedReport.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded bg-ink-800 px-3 py-1 font-mono text-xs text-gray-300">
                    {selectedReport.baseline_commit?.slice(0, 7) || "HEAD"} →{" "}
                    {selectedReport.compared_commit?.slice(0, 7) || "working tree"}
                  </div>
                </div>

                <div className="mt-4 text-sm leading-6 text-gray-200">
                  <p className="whitespace-pre-line">{selectedReport.summary}</p>
                </div>
              </div>

              {/* Risk Assessment Card */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="h-5 w-5 text-amber-400" />
                  <h3 className="text-sm font-semibold text-white">Risk Assessment & Evidence</h3>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed bg-ink-900/60 rounded-md p-3 border border-ink-700">
                  {selectedReport.risk_rationale || "No specific risk anomalies flagged for this diff."}
                </p>
              </div>

              {/* Impact Analysis & Recommended Checks Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Impact Analysis */}
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="h-4 w-4 text-blue-400" />
                    <h3 className="text-sm font-semibold text-white">Potentially Affected Components</h3>
                  </div>
                  {selectedReport.impact.length === 0 ? (
                    <p className="text-xs text-gray-500">No components flagged in impact analysis.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedReport.impact.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Recommended Checks */}
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-sm font-semibold text-white">Recommended Regression Checks</h3>
                  </div>
                  {selectedReport.recommended_checks.length === 0 ? (
                    <p className="text-xs text-gray-500">No regression checks required.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedReport.recommended_checks.map((chk, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                          <CheckCircle className="mt-0.5 h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span>{chk}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
