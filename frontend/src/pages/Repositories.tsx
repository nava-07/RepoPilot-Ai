import { useState, type FormEvent } from "react";
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  Download,
  FolderGit2,
  RefreshCw,
  Search,
  Trash2,
  GitBranch,
  Bug,
  GitPullRequest,
  FlaskConical,
  GitCommit,
  CheckCircle2,
} from "lucide-react";
import { ApiError, api, post, del } from "../api";
import { useToast } from "../components/toast";
import { useRepo } from "../context/RepoContext";
import type { Repository } from "../types";
import { Empty, ErrorBox, PageHeader, Skeleton } from "../components/ui";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

interface FileContent {
  path: string;
  content: string;
  language?: string;
  truncated?: boolean;
  skipped_reason?: string | null;
}

function Node({
  n,
  depth,
  onOpen,
  active,
}: {
  n: TreeNode;
  depth: number;
  onOpen: (p: string) => void;
  active: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: depth * 12 + 8 };
  if (n.type === "dir")
    return (
      <li>
        <button
          className="flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-ink-800"
          style={pad}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          <Folder className="h-3.5 w-3.5 text-gray-400" />
          {n.name}
        </button>
        {open && (
          <ul>
            {n.children?.map((c) => (
              <Node key={c.path} n={c} depth={depth + 1} onOpen={onOpen} active={active} />
            ))}
          </ul>
        )}
      </li>
    );
  return (
    <li>
      <button
        className={`flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-ink-800 ${
          active === n.path ? "bg-ink-700" : ""
        }`}
        style={{ ...pad, paddingLeft: depth * 12 + 24 }}
        onClick={() => onOpen(n.path)}
      >
        <FileIcon className="h-3.5 w-3.5 text-gray-500" />
        {n.name}
      </button>
    </li>
  );
}

function Explorer({ repo }: { repo: Repository }) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loadingTree, setLoadingTree] = useState(true);
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchTree = async () => {
    setLoadingTree(true);
    try {
      const data = await api<TreeNode>(`/repositories/${repo.id}/tree`);
      setTree(data);
    } catch (e: any) {
      setErr(e);
    } finally {
      setLoadingTree(false);
    }
  };

  useState(() => {
    fetchTree();
  });

  const open = async (p: string) => {
    setPath(p);
    setBusy(true);
    setErr(null);
    setFile(null);
    try {
      setFile(await api<FileContent>(`/repositories/${repo.id}/files?path=${encodeURIComponent(p)}`));
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-[18rem_1fr]">
      <div className="card max-h-[32rem] overflow-auto py-2">
        <div className="border-b border-ink-700 px-3 pb-2 text-xs font-semibold uppercase text-gray-400">
          Source Files ({repo.file_count ?? 0})
        </div>
        {loadingTree ? (
          <div className="p-3">
            <Skeleton rows={6} />
          </div>
        ) : tree ? (
          <ul role="tree">
            {(tree.children ?? [tree]).map((c) => (
              <Node key={c.path} n={c} depth={0} onOpen={open} active={path} />
            ))}
          </ul>
        ) : (
          <div className="p-3 text-xs text-gray-500">Unable to load directory tree.</div>
        )}
      </div>
      <div className="card min-w-0 overflow-hidden">
        <div className="border-b border-ink-700 px-3 py-1.5 font-mono text-xs text-gray-400">
          {path ?? "Select a file to inspect source"}
        </div>
        {busy && (
          <div className="p-3">
            <Skeleton rows={6} />
          </div>
        )}
        {err && (
          <div className="p-3">
            <ErrorBox error={err} onRetry={() => path && open(path)} />
          </div>
        )}
        {file &&
          (file.skipped_reason ? (
            <p className="p-4 text-sm text-amber-300">File not shown: {file.skipped_reason}</p>
          ) : (
            <pre className="max-h-[30rem] overflow-auto p-0 font-mono text-xs leading-5">
              {file.content.split("\n").map((l, i) => (
                <div key={i} className="flex">
                  <span className="w-12 shrink-0 select-none pr-3 text-right text-gray-600">
                    {i + 1}
                  </span>
                  <span className="whitespace-pre">{l || " "}</span>
                </div>
              ))}
            </pre>
          ))}
        {file?.truncated && (
          <p className="border-t border-ink-700 px-3 py-1 text-xs text-amber-300">
            Truncated to the configured size limit.
          </p>
        )}
      </div>
    </div>
  );
}

export default function Repositories({ go }: { go?: (r: string) => void }) {
  const toast = useToast();
  const { activeRepoId, setActiveRepoId, repos, refreshRepos, loading } = useRepo();

  const [source, setSource] = useState<"local" | "github">("local");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const imported = await post<Repository>("/repositories/import", {
        source_type: source,
        location: location.trim(),
      });
      setLocation("");
      await refreshRepos();
      setActiveRepoId(imported.id);
      toast("Repository imported successfully");
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async (repoId: string) => {
    setRefreshingId(repoId);
    try {
      await post<Repository>(`/repositories/${repoId}/refresh`);
      await refreshRepos();
      toast("Repository refreshed and re-indexed");
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (repo: Repository) => {
    if (
      !confirm(
        `Remove "${repo.name}" from RepoPilot's registry?\n\nNOTE: Original files on disk will NOT be deleted.`
      )
    ) {
      return;
    }
    try {
      await del(`/repositories/${repo.id}`);
      await refreshRepos();
      if (activeRepoId === repo.id) {
        const remaining = repos.filter((r) => r.id !== repo.id);
        setActiveRepoId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast("Repository removed from registry");
    } catch (x) {
      setErr(x as ApiError);
    }
  };

  const activeRepo = repos.find((r) => r.id === activeRepoId) || null;

  return (
    <>
      <PageHeader
        title="Repositories"
        subtitle="Manage dynamic repository contexts, track Git branches, and re-scan codebase state."
      />

      {/* Import Form */}
      <form onSubmit={submit} className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-sm">
          <span className="mb-1 block text-gray-400">Source Type</span>
          <select
            className="input"
            value={source}
            onChange={(e) => setSource(e.target.value as "local" | "github")}
          >
            <option value="local">Local Folder</option>
            <option value="github">GitHub URL</option>
          </select>
        </label>
        <label className="min-w-[18rem] flex-1 text-sm">
          <span className="mb-1 block text-gray-400">
            {source === "local" ? "Absolute Directory Path" : "https://github.com/owner/repo"}
          </span>
          <input
            className="input font-mono text-xs"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={source === "local" ? "D:/Project/MyRepo" : "https://github.com/owner/repo"}
          />
        </label>
        <button className="btn btn-primary" disabled={busy || !location.trim()}>
          <Download className="h-3.5 w-3.5" />
          {busy ? "Importing & Indexing…" : "Import Repository"}
        </button>
      </form>

      {err && (
        <div className="mb-4">
          <ErrorBox error={err} />
        </div>
      )}

      {/* Repositories Cards Grid */}
      {loading ? (
        <Skeleton rows={6} />
      ) : repos.length === 0 ? (
        <Empty title="No repositories imported yet">
          Import a local directory or public GitHub repository using the form above.
        </Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            {repos.map((r) => {
              const isActive = r.id === activeRepoId;
              return (
                <div
                  key={r.id}
                  className={`card p-4 transition-all ${
                    isActive ? "border-accent ring-1 ring-accent" : "hover:border-ink-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <FolderGit2 className="h-4 w-4 shrink-0 text-accent" />
                        <h3 className="truncate font-semibold text-white">{r.name}</h3>
                        <span className="rounded bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-400 uppercase">
                          {r.source_type}
                        </span>
                        {isActive && (
                          <span className="flex items-center gap-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                            <CheckCircle2 className="h-3 w-3" /> Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-gray-400">
                        {r.local_path}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        title="Re-scan and detect changes"
                        className="btn p-1.5 text-gray-400 hover:text-white"
                        onClick={() => handleRefresh(r.id)}
                        disabled={refreshingId === r.id}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${refreshingId === r.id ? "animate-spin text-accent" : ""}`}
                        />
                      </button>
                      <button
                        title="Remove repository from registry (preserves files)"
                        className="btn p-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                        onClick={() => handleDelete(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Git and Scan metadata */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    {r.default_branch && (
                      <span className="flex items-center gap-1 rounded bg-ink-800 px-2 py-0.5 font-mono text-gray-300">
                        <GitBranch className="h-3 w-3 text-accent" />
                        {r.default_branch}
                      </span>
                    )}
                    {r.current_commit && (
                      <span className="rounded bg-ink-800 px-2 py-0.5 font-mono text-gray-400">
                        {r.current_commit.slice(0, 7)}
                      </span>
                    )}
                    <span className="font-mono text-gray-400">
                      {r.file_count ?? 0} files
                    </span>
                    {r.last_scan_at && (
                      <span className="text-[11px] text-gray-500">
                        Scanned {new Date(r.last_scan_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>

                  {/* Languages */}
                  {r.languages && r.languages.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.languages.slice(0, 4).map((lang) => (
                        <span
                          key={lang}
                          className="rounded bg-ink-800/80 px-1.5 py-0.5 text-[10px] text-gray-300"
                        >
                          {lang}
                        </span>
                      ))}
                      {r.languages.length > 4 && (
                        <span className="text-[10px] text-gray-500">
                          +{r.languages.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Live Stats Derivation */}
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-800 pt-3 text-center text-xs">
                    <div className="rounded bg-ink-900/50 p-1.5">
                      <div className="font-mono text-sm font-semibold text-amber-400">
                        {r.open_findings_count ?? 0}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">Open Findings</div>
                    </div>
                    <div className="rounded bg-ink-900/50 p-1.5">
                      <div className="font-mono text-sm font-semibold text-blue-400">
                        {r.pending_patches_count ?? 0}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">Pending Patches</div>
                    </div>
                    <div className="rounded bg-ink-900/50 p-1.5">
                      <div className="font-mono text-xs font-semibold text-gray-300 capitalize">
                        {r.latest_test_status || "—"}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase">Latest Test</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
                    {!isActive ? (
                      <button
                        className="btn btn-primary text-xs"
                        onClick={() => setActiveRepoId(r.id)}
                      >
                        Set as Active
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-400 font-medium px-2 py-1">
                        Currently Active
                      </span>
                    )}

                    {go && (
                      <>
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            setActiveRepoId(r.id);
                            go("tracker");
                          }}
                        >
                          <GitCommit className="h-3 w-3" /> Changes
                        </button>
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            setActiveRepoId(r.id);
                            go("investigations");
                          }}
                        >
                          <Search className="h-3 w-3" /> Investigate
                        </button>
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            setActiveRepoId(r.id);
                            go("findings");
                          }}
                        >
                          <Bug className="h-3 w-3" /> Findings
                        </button>
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            setActiveRepoId(r.id);
                            go("patches");
                          }}
                        >
                          <GitPullRequest className="h-3 w-3" /> Patches
                        </button>
                        <button
                          className="btn text-xs"
                          onClick={() => {
                            setActiveRepoId(r.id);
                            go("tests");
                          }}
                        >
                          <FlaskConical className="h-3 w-3" /> Tests
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Repository Explorer */}
          {activeRepo && (
            <div className="mt-6 border-t border-ink-700 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    File Tree Explorer: {activeRepo.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">{activeRepo.local_path}</p>
                </div>
              </div>
              <Explorer key={activeRepo.id} repo={activeRepo} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
