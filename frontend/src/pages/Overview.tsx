import { useApi } from "../hooks";
import { useRepo } from "../context/RepoContext";
import type { Finding, HistoryEvent, Patch, TestRun, Health } from "../types";
import { Empty, PageHeader, Skeleton } from "../components/ui";
import {
  CheckCircle2,
  Circle,
  FolderGit2,
  GitBranch,
  GitCommit,
  Search,
  Bug,
  GitPullRequest,
  BrainCircuit,
  ArrowRight,
} from "lucide-react";

function Metric({
  label,
  state,
  count,
}: {
  label: string;
  state: { loading: boolean; error: unknown };
  count: number | null;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-white">
        {state.loading ? "…" : count === null ? "—" : count}
      </div>
      {!state.loading && state.error ? (
        <div className="text-xs text-gray-500">endpoint unavailable</div>
      ) : null}
    </div>
  );
}

export default function Overview({
  go,
  health,
}: {
  go: (r: string) => void;
  health: Health | null;
}) {
  const { activeRepo, repos } = useRepo();

  const repoQuery = activeRepo ? `?repository_id=${activeRepo.id}` : "";
  const findings = useApi<Finding[]>(`/findings${repoQuery}`);
  const patches = useApi<Patch[]>(`/patches${repoQuery}`);
  const tests = useApi<TestRun[]>(`/test-runs${repoQuery}`);
  const history = useApi<HistoryEvent[]>(`/history${repoQuery}`);

  const n = <T,>(s: { data: T[] | null }) => (s.data ? s.data.length : null);
  const pending = patches.data
    ? patches.data.filter((p) => p.approval_status === "pending").length
    : null;

  const m = health?.model;
  const steps = [
    {
      done: !!health,
      label: "Backend is running",
      fix: "Start it: cd backend && uvicorn app.main:app",
      to: "settings",
    },
    {
      done: !!m?.connected,
      label: "Ollama is reachable",
      fix: "Install Ollama and run `ollama serve`",
      to: "settings",
    },
    {
      done: !!m?.selected_model_installed,
      label: "A model is selected and installed",
      fix: "Pick an installed model in Settings",
      to: "settings",
    },
    {
      done: !!activeRepo,
      label: "A repository is active",
      fix: "Select or import a repository",
      to: "repositories",
    },
  ];
  const ready = steps.every((x) => x.done);

  if (!activeRepo) {
    return (
      <>
        <PageHeader
          title="Overview"
          subtitle="Real-time repository intelligence and automated verification dashboard."
        />
        <Empty title="No repository selected">
          {repos.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">
                You have {repos.length} repository registered. Choose one to view its intelligence overview.
              </p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Select an Active Repository
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">
                Import an authorized local directory or a public GitHub repository to begin.
              </p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Go to Repositories
              </button>
            </div>
          )}
        </Empty>
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Overview"
          subtitle={`Live operational telemetry for ${activeRepo.name}.`}
        />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-ink-800 px-3 py-1.5 font-mono text-xs text-gray-300">
            <FolderGit2 className="h-3.5 w-3.5 text-accent" />
            <span className="text-white font-medium">{activeRepo.name}</span>
            {activeRepo.default_branch && (
              <span className="text-gray-500">({activeRepo.default_branch})</span>
            )}
          </span>
          <button className="btn" onClick={() => go("repositories")}>
            Switch Repo
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="Indexed Files"
          state={{ loading: false, error: null }}
          count={activeRepo.file_count ?? 0}
        />
        <Metric label="Open Findings" state={findings} count={n(findings)} />
        <Metric label="Pending Patch Reviews" state={patches} count={pending} />
        <Metric label="Test Runs" state={tests} count={n(tests)} />
      </div>

      {/* Active Repo Quick Action Hub */}
      <div className="mt-4 card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Repository Context:</span>
              <span className="font-mono text-xs text-accent">{activeRepo.local_path}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {activeRepo.default_branch && (
                <span className="flex items-center gap-1 font-mono">
                  <GitBranch className="h-3 w-3 text-accent" />
                  {activeRepo.default_branch}
                </span>
              )}
              {activeRepo.current_commit && (
                <span className="font-mono">
                  commit: {activeRepo.current_commit.slice(0, 7)}
                </span>
              )}
              {activeRepo.languages && activeRepo.languages.length > 0 && (
                <span>• {activeRepo.languages.join(", ")}</span>
              )}
            </div>
          </div>
          <button
            className="btn btn-primary text-xs"
            onClick={() => go("investigations")}
          >
            <Search className="h-3.5 w-3.5" /> Start Investigation
          </button>
        </div>

        {/* Navigation shortcuts */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            onClick={() => go("tracker")}
            className="flex items-center justify-between rounded bg-ink-800/60 p-2.5 text-left text-xs transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <GitCommit className="h-4 w-4 text-blue-400" />
              <span className="font-medium text-gray-200">Change Tracker</span>
            </div>
            <ArrowRight className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={() => go("intelligence")}
            className="flex items-center justify-between rounded bg-ink-800/60 p-2.5 text-left text-xs transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-accent" />
              <span className="font-medium text-gray-200">Change Intelligence</span>
            </div>
            <ArrowRight className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={() => go("findings")}
            className="flex items-center justify-between rounded bg-ink-800/60 p-2.5 text-left text-xs transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-amber-400" />
              <span className="font-medium text-gray-200">View Findings</span>
            </div>
            <ArrowRight className="h-3 w-3 text-gray-500" />
          </button>
          <button
            onClick={() => go("patches")}
            className="flex items-center justify-between rounded bg-ink-800/60 p-2.5 text-left text-xs transition-colors hover:bg-ink-800"
          >
            <div className="flex items-center gap-2">
              <GitPullRequest className="h-4 w-4 text-purple-400" />
              <span className="font-medium text-gray-200">Review Patches</span>
            </div>
            <ArrowRight className="h-3 w-3 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Getting Started Checklist */}
      {!ready && (
        <section className="card mt-4 p-4" aria-label="Getting started">
          <h2 className="mb-2 text-sm font-medium">Getting started</h2>
          <ul className="space-y-1.5 text-sm">
            {steps.map((x) => (
              <li key={x.label} className="flex items-center gap-2">
                {x.done ? (
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-600" />
                )}
                <span className={x.done ? "text-gray-400" : ""}>{x.label}</span>
                {!x.done && (
                  <button
                    className="ml-auto text-xs text-accent hover:underline"
                    onClick={() => go(x.to)}
                  >
                    {x.fix}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent Activity */}
      <h2 className="mb-2 mt-6 text-sm font-medium text-gray-400">Recent Activity</h2>
      {history.loading ? (
        <Skeleton rows={4} />
      ) : history.data && history.data.length > 0 ? (
        <ul className="card divide-y divide-ink-700">
          {history.data.slice(0, 10).map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span>
                <span className="mr-2 font-mono text-xs text-gray-500">{e.type}</span>
                <span className="text-gray-200">{e.message}</span>
              </span>
              <time className="shrink-0 text-xs text-gray-500">
                {new Date(e.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No activity recorded for this repository yet">
          Run an investigation or inspect changes in the Change Tracker.
        </Empty>
      )}
    </>
  );
}
