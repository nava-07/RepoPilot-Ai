import {
  Activity,
  Boxes,
  BrainCircuit,
  Bug,
  ChevronDown,
  FlaskConical,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitPullRequest,
  LayoutDashboard,
  Plus,
  Search,
  Settings as Cog,
  Sparkles,
} from "lucide-react";
import { useState, useRef, useEffect, type ReactNode } from "react";
import type { Health } from "../types";
import { useRepo } from "../context/RepoContext";

export const NAV = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "repositories", label: "Repositories", icon: FolderGit2 },
  { id: "tracker", label: "Change Tracker", icon: GitCommit },
  { id: "investigations", label: "Investigations", icon: Search },
  { id: "findings", label: "Findings", icon: Bug },
  { id: "patches", label: "Patch Reviews", icon: GitPullRequest },
  { id: "tests", label: "Test Runs", icon: FlaskConical },
  { id: "intelligence", label: "Change Intelligence", icon: BrainCircuit },
  { id: "skills", label: "Agent Skills", icon: Boxes },
  { id: "settings", label: "Settings", icon: Cog },
];

export function Layout({
  route,
  go,
  health,
  children,
}: {
  route: string;
  go: (r: string) => void;
  health: { data: Health | null; loading: boolean; error: boolean };
  children: ReactNode;
}) {
  const { activeRepo, repos, setActiveRepoId } = useRepo();
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const m = health.data?.model;
  const ok = !!m?.connected && m.selected_model_installed;
  const label = health.loading
    ? "Checking model…"
    : health.error
    ? "Backend offline"
    : !m?.connected
    ? "Ollama offline"
    : !m.selected_model
    ? "No model selected"
    : !m.selected_model_installed
    ? "Model not installed"
    : m.selected_model;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-ink-700 bg-ink-900 md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-3 font-semibold">
          <Sparkles className="h-4 w-4 text-accent" />
          RepoPilot AI
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={route === id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                route === id
                  ? "bg-ink-700 text-white font-medium"
                  : "text-gray-400 hover:bg-ink-800 hover:text-gray-200"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-2.5 text-sm">
          {/* Active Repository Selector */}
          <div className="relative" ref={dropdownRef}>
            {activeRepo ? (
              <button
                onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-800/80 px-2.5 py-1.5 text-xs text-gray-200 transition-colors hover:border-ink-600 hover:bg-ink-800"
              >
                <FolderGit2 className="h-3.5 w-3.5 text-accent" />
                <span className="font-semibold text-white">{activeRepo.name}</span>
                {activeRepo.default_branch && (
                  <span className="flex items-center gap-0.5 rounded bg-ink-700 px-1.5 py-0.5 font-mono text-[10px] text-gray-300">
                    <GitBranch className="h-2.5 w-2.5" />
                    {activeRepo.default_branch}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 text-gray-400" />
              </button>
            ) : (
              <button
                onClick={() => go("repositories")}
                className="flex items-center gap-1.5 rounded-md border border-dashed border-amber-600/50 bg-amber-950/20 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40"
              >
                <FolderGit2 className="h-3.5 w-3.5" />
                <span>No active repository — Click to select</span>
              </button>
            )}

            {/* Repository switcher dropdown menu */}
            {repoDropdownOpen && (
              <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-ink-700 bg-ink-900 py-1 shadow-xl">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Switch Active Repository
                </div>
                <div className="max-h-48 overflow-auto">
                  {repos.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setActiveRepoId(r.id);
                        setRepoDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-ink-800 ${
                        activeRepo?.id === r.id ? "bg-ink-800 text-white font-medium" : "text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FolderGit2 className="h-3 w-3 shrink-0 text-accent" />
                        <span className="truncate">{r.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-gray-500">{r.source_type}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-ink-800 pt-1">
                  <button
                    onClick={() => {
                      setRepoDropdownOpen(false);
                      go("repositories");
                    }}
                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-accent hover:bg-ink-800"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Manage / Import repositories…</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => go("investigations")}>
              <Plus className="h-3.5 w-3.5" />
              New investigation
            </button>
            <button
              className="btn"
              onClick={() => go("settings")}
              title="Model connection status"
              aria-label={`Model status: ${label}`}
            >
              <Activity className={`h-3.5 w-3.5 ${ok ? "text-accent" : "text-amber-400"}`} />
              <span className="max-w-[10rem] truncate">{label}</span>
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
