import { useApi } from "../hooks";
import type { Finding, HistoryEvent, Patch, Repository, TestRun } from "../types";
import { Empty, PageHeader, Skeleton } from "../components/ui";
import { CheckCircle2, Circle } from "lucide-react";
import type { Health } from "../types";

// Every metric is computed from data returned by the backend. If an endpoint is unavailable we show "—", never a made-up number.
function Metric({ label, state, count }: { label: string; state: { loading: boolean; error: unknown }; count: number | null }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{state.loading ? "…" : count === null ? "—" : count}</div>
      {!state.loading && state.error ? <div className="text-xs text-gray-500">endpoint unavailable</div> : null}
    </div>
  );
}

export default function Overview({ go, health }: { go: (r: string) => void; health: Health | null }) {
  const repos = useApi<Repository[]>("/repositories");
  const findings = useApi<Finding[]>("/findings");
  const patches = useApi<Patch[]>("/patches");
  const tests = useApi<TestRun[]>("/test-runs");
  const history = useApi<HistoryEvent[]>("/history");
  const n = <T,>(s: { data: T[] | null }) => (s.data ? s.data.length : null);
  const pending = patches.data ? patches.data.filter((p) => p.approval_status === "pending").length : null;
  const m = health?.model;
  const steps = [
    { done: !!health, label: "Backend is running", fix: "Start it: cd backend && uvicorn app.main:app", to: "settings" },
    { done: !!m?.connected, label: "Ollama is reachable", fix: "Install Ollama and run `ollama serve`", to: "settings" },
    { done: !!m?.selected_model_installed, label: "A model is selected and installed", fix: "Pick an installed model in Settings", to: "settings" },
    { done: (repos.data?.length ?? 0) > 0, label: "A repository is imported", fix: "Import a local folder or GitHub repo", to: "repositories" },
  ];
  const ready = steps.every((x) => x.done);
  return (
    <>
      <PageHeader title="Overview" subtitle="Live counts from stored application data." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Indexed repositories" state={repos} count={n(repos)} />
        <Metric label="Findings" state={findings} count={n(findings)} />
        <Metric label="Pending patch reviews" state={patches} count={pending} />
        <Metric label="Test runs" state={tests} count={n(tests)} />
      </div>
      {!ready && (
        <section className="card mt-4 p-4" aria-label="Getting started">
          <h2 className="mb-2 text-sm font-medium">Getting started</h2>
          <ul className="space-y-1.5 text-sm">{steps.map((x) => (
            <li key={x.label} className="flex items-center gap-2">
              {x.done ? <CheckCircle2 className="h-4 w-4 text-accent" /> : <Circle className="h-4 w-4 text-gray-600" />}
              <span className={x.done ? "text-gray-400" : ""}>{x.label}</span>
              {!x.done && <button className="ml-auto text-xs text-accent hover:underline" onClick={() => go(x.to)}>{x.fix}</button>}
            </li>))}</ul>
        </section>)}
      <h2 className="mb-2 mt-6 text-sm font-medium text-gray-400">Recent activity</h2>
      {history.loading ? <Skeleton /> : history.data && history.data.length > 0 ? (
        <ul className="card divide-y divide-ink-700">
          {history.data.slice(0, 10).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
              <span><span className="mr-2 font-mono text-xs text-gray-500">{e.type}</span>{e.message}</span>
              <time className="shrink-0 text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No activity yet">
          {history.error ? "The history endpoint is not available yet." : "Import a repository to get started."}
          <div className="mt-3"><button className="btn btn-primary" onClick={() => go("repositories")}>Go to Repositories</button></div>
        </Empty>
      )}
    </>
  );
}
