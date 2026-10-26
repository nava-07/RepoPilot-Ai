import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError } from "../api";

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-ink-800" />)}
    </div>
  );
}

export function ErrorBox({ error, onRetry, milestone }: { error: ApiError; onRetry?: () => void; milestone?: string }) {
  const planned = error.notImplemented;
  return (
    <div role="alert" className="card flex gap-3 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1 space-y-1">
        <p className="font-medium">{planned ? `Not available yet${milestone ? ` (planned: ${milestone})` : ""}` : error.message}</p>
        {planned
          ? <p className="text-gray-400">The backend does not implement this endpoint in the current build.</p>
          : error.hint && <p className="text-gray-400">{error.hint}</p>}
      </div>
      {onRetry && <button className="btn self-start" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" />Retry</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <Inbox className="h-6 w-6 text-gray-500" />
      <p className="font-medium">{title}</p>
      <div className="max-w-md text-sm text-gray-400">{children}</div>
    </div>
  );
}

const tone: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300", high: "bg-red-500/15 text-red-300", medium: "bg-amber-500/15 text-amber-300",
  low: "bg-sky-500/15 text-sky-300", info: "bg-gray-500/15 text-gray-300",
  passed: "bg-accent/15 text-accent", approved: "bg-accent/15 text-accent", valid: "bg-accent/15 text-accent",
  failed: "bg-red-500/15 text-red-300", rejected: "bg-red-500/15 text-red-300", invalid: "bg-red-500/15 text-red-300",
};
export function Badge({ children }: { children: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tone[children.toLowerCase()] ?? "bg-ink-700 text-gray-300"}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-lg font-semibold">{title}</h1>{subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

/** Generic async section: loading skeleton, error + retry, or content. */
export function Async<T>({ state, milestone, children }: {
  state: { data: T | null; error: ApiError | null; loading: boolean; reload: () => void };
  milestone?: string; children: (d: T) => ReactNode;
}) {
  if (state.loading) return <Skeleton />;
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} milestone={milestone} />;
  return <>{state.data !== null && children(state.data)}</>;
}
