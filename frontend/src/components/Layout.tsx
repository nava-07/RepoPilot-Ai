import { Activity, Boxes, Bug, FlaskConical, FolderGit2, GitPullRequest, LayoutDashboard, Plus, Search, Settings as Cog, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { Health } from "../types";

export const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "repositories", label: "Repositories", icon: FolderGit2 },
  { id: "investigations", label: "Investigations", icon: Search },
  { id: "findings", label: "Findings", icon: Bug },
  { id: "patches", label: "Patch Reviews", icon: GitPullRequest },
  { id: "tests", label: "Test Runs", icon: FlaskConical },
  { id: "skills", label: "Agent Skills", icon: Boxes },
  { id: "settings", label: "Settings", icon: Cog },
];

export function Layout({ route, go, health, children }: { route: string; go: (r: string) => void; health: { data: Health | null; loading: boolean; error: boolean }; children: ReactNode }) {
  const m = health.data?.model;
  const ok = !!m?.connected && m.selected_model_installed;
  const label = health.loading ? "Checking model…" : health.error ? "Backend offline"
    : !m?.connected ? "Ollama offline" : !m.selected_model ? "No model selected" : !m.selected_model_installed ? "Model not installed" : m.selected_model;
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-ink-700 bg-ink-900 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-3 font-semibold"><Sparkles className="h-4 w-4 text-accent" />RepoPilot AI</div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} aria-current={route === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm ${route === id ? "bg-ink-700 text-white" : "text-gray-400 hover:bg-ink-800 hover:text-gray-200"}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-ink-700 px-4 py-2 text-sm">
          <span className="text-gray-400">Understand the code. Find the problem. Verify the fix.</span>
          <div className="ml-auto flex items-center gap-3">
            <button className="btn" onClick={() => go("investigations")}><Plus className="h-3.5 w-3.5" />New investigation</button>
            <button className="btn" onClick={() => go("settings")} title="Model connection status" aria-label={`Model status: ${label}`}>
              <Activity className={`h-3.5 w-3.5 ${ok ? "text-accent" : "text-amber-400"}`} />{label}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
