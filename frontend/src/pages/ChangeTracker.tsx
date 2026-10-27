import { useState, useEffect } from "react";
import {
  GitCommit as GitCommitIcon,
  GitBranch,
  RefreshCw,
  Clock,
  FileCode,
  FilePlus,
  FileMinus,
  FileQuestion,
  CheckCircle2,
  AlertCircle,
  GitCompare,
  ArrowRight,
} from "lucide-react";
import { api, type ApiError } from "../api";
import { useRepo } from "../context/RepoContext";
import type {
  GitWorkingTreeStatus,
  GitCommit,
  GitDiffResponse,
  TimelineEvent,
  GitFileChange,
} from "../types";
import { PageHeader, Skeleton, Empty, ErrorBox } from "../components/ui";

export default function ChangeTracker({ go }: { go: (route: string) => void }) {
  const { activeRepo, repos } = useRepo();

  const [activeTab, setActiveTab] = useState<"working-tree" | "commits" | "timeline">("working-tree");
  const [status, setStatus] = useState<GitWorkingTreeStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Selected file for diff viewer
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<GitDiffResponse | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Commit compare state
  const [compareCommitA, setCompareCommitA] = useState<string>("");
  const [compareCommitB, setCompareCommitB] = useState<string>("");
  const [comparing, setComparing] = useState(false);
  const [compareDiff, setCompareDiff] = useState<GitDiffResponse | null>(null);

  const fetchStatus = async () => {
    if (!activeRepo) return;
    setLoadingStatus(true);
    setError(null);
    try {
      const data = await api<GitWorkingTreeStatus>(`/repositories/${activeRepo.id}/git/status`);
      setStatus(data);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoadingStatus(false);
    }
  };

  const fetchCommits = async () => {
    if (!activeRepo) return;
    setLoadingCommits(true);
    try {
      const data = await api<GitCommit[]>(`/repositories/${activeRepo.id}/git/commits?limit=40`);
      setCommits(data);
      if (data.length >= 2 && !compareCommitA && !compareCommitB) {
        setCompareCommitA(data[1].hash);
        setCompareCommitB(data[0].hash);
      }
    } catch (e: any) {
      setError(e);
    } finally {
      setLoadingCommits(false);
    }
  };

  const fetchTimeline = async () => {
    if (!activeRepo) return;
    setLoadingTimeline(true);
    try {
      const data = await api<TimelineEvent[]>(`/repositories/${activeRepo.id}/git/timeline`);
      setTimeline(data);
    } catch (e: any) {
      setError(e);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const loadFileDiff = async (filePath: string) => {
    if (!activeRepo) return;
    setSelectedFile(filePath);
    setLoadingDiff(true);
    try {
      const data = await api<GitDiffResponse>(
        `/repositories/${activeRepo.id}/git/diff?file_path=${encodeURIComponent(filePath)}`
      );
      setSelectedDiff(data);
    } catch {
      setSelectedDiff(null);
    } finally {
      setLoadingDiff(false);
    }
  };

  const runCommitCompare = async () => {
    if (!activeRepo || !compareCommitA || !compareCommitB) return;
    setComparing(true);
    try {
      const data = await api<GitDiffResponse>(
        `/repositories/${activeRepo.id}/git/diff?baseline=${compareCommitA}&target=${compareCommitB}`
      );
      setCompareDiff(data);
    } catch (e: any) {
      setError(e);
    } finally {
      setComparing(false);
    }
  };

  useEffect(() => {
    if (activeRepo) {
      setSelectedFile(null);
      setSelectedDiff(null);
      setCompareDiff(null);
      fetchStatus();
      if (activeTab === "commits") fetchCommits();
      if (activeTab === "timeline") fetchTimeline();
    }
  }, [activeRepo?.id, activeTab]);

  if (!activeRepo) {
    return (
      <>
        <PageHeader
          title="Change Tracker"
          subtitle="Git working-tree status, commit history, and unified chronological event timeline."
        />
        <Empty title="No active repository selected">
          {repos.length > 0 ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">Select a repository from your registry to inspect changes.</p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Select a Repository
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-gray-400">Import a local folder or public GitHub repository to get started.</p>
              <button className="btn btn-primary" onClick={() => go("repositories")}>
                Import Repository
              </button>
            </div>
          )}
        </Empty>
      </>
    );
  }

  const renderFileBadge = (file: GitFileChange) => {
    const isAdded = file.status === "added";
    const isDeleted = file.status === "deleted";
    return (
      <div
        key={file.path}
        onClick={() => loadFileDiff(file.path)}
        className={`flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm transition-colors ${
          selectedFile === file.path ? "bg-ink-700" : "hover:bg-ink-800"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {isAdded ? (
            <FilePlus className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : isDeleted ? (
            <FileMinus className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <FileCode className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span className="truncate font-mono text-xs text-gray-200">{file.path}</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          {file.insertions > 0 && <span className="text-emerald-400">+{file.insertions}</span>}
          {file.deletions > 0 && <span className="text-rose-400">-{file.deletions}</span>}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-semibold ${
              isAdded
                ? "bg-emerald-950/60 text-emerald-300"
                : isDeleted
                ? "bg-rose-950/60 text-rose-300"
                : "bg-amber-950/60 text-amber-300"
            }`}
          >
            {file.status}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <PageHeader
            title="Change Tracker"
            subtitle={`Inspecting live changes in ${activeRepo.name}`}
          />
        </div>
        <div className="flex items-center gap-2">
          {status?.branch && (
            <div className="flex items-center gap-1.5 rounded-md bg-ink-800 px-2.5 py-1 text-xs text-gray-300 font-mono">
              <GitBranch className="h-3.5 w-3.5 text-accent" />
              <span>{status.branch}</span>
            </div>
          )}
          <button
            className="btn"
            onClick={() => {
              fetchStatus();
              if (activeTab === "commits") fetchCommits();
              if (activeTab === "timeline") fetchTimeline();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => go("intelligence")}>
            AI Change Intelligence
          </button>
        </div>
      </div>

      {error && <ErrorBox error={error} />}

      {/* Tabs */}
      <div className="mb-4 flex border-b border-ink-700">
        <button
          onClick={() => setActiveTab("working-tree")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "working-tree"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <FileCode className="h-4 w-4" /> Working-Tree Changes
          {status && !status.clean && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent font-mono">
              {status.staged_files.length + status.unstaged_files.length + status.untracked_files.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setActiveTab("commits");
            fetchCommits();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "commits"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <GitCommitIcon className="h-4 w-4" /> Commit History & Compare
        </button>
        <button
          onClick={() => {
            setActiveTab("timeline");
            fetchTimeline();
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "timeline"
              ? "border-accent text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          <Clock className="h-4 w-4" /> Change Timeline
        </button>
      </div>

      {/* TAB 1: WORKING TREE */}
      {activeTab === "working-tree" && (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-4">
            {loadingStatus ? (
              <Skeleton rows={6} />
            ) : !status?.is_git ? (
              <div className="card p-4 text-sm text-gray-400">
                <AlertCircle className="mb-2 h-5 w-5 text-amber-400" />
                <p className="font-semibold text-gray-200">Not a Git repository</p>
                <p className="mt-1 text-xs">
                  This repository does not have a .git folder. Initialize Git (`git init`) to track commits and staged changes.
                </p>
              </div>
            ) : status.clean ? (
              <div className="card flex flex-col items-center p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-gray-200">Working tree clean</p>
                <p className="text-xs text-gray-400 mt-1">No modified, added, or deleted files detected.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Staged files */}
                {status.staged_files.length > 0 && (
                  <div className="card p-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-emerald-400">
                      <span>Staged Changes ({status.staged_files.length})</span>
                    </div>
                    <div className="space-y-1">{status.staged_files.map(renderFileBadge)}</div>
                  </div>
                )}

                {/* Unstaged files */}
                {status.unstaged_files.length > 0 && (
                  <div className="card p-3">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase text-amber-400">
                      <span>Unstaged Changes ({status.unstaged_files.length})</span>
                    </div>
                    <div className="space-y-1">{status.unstaged_files.map(renderFileBadge)}</div>
                  </div>
                )}

                {/* Untracked files */}
                {status.untracked_files.length > 0 && (
                  <div className="card p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-gray-400">
                      Untracked Files ({status.untracked_files.length})
                    </div>
                    <div className="space-y-1">
                      {status.untracked_files.map((file) => (
                        <div
                          key={file}
                          className="flex items-center gap-2 rounded px-3 py-1.5 text-xs font-mono text-gray-400 hover:bg-ink-800"
                        >
                          <FileQuestion className="h-3.5 w-3.5 text-gray-500" />
                          <span className="truncate">{file}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diff Viewer panel */}
          <div className="card min-h-[24rem] overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-700 bg-ink-900/60 px-4 py-2">
              <span className="font-mono text-xs text-gray-300">
                {selectedFile ? `Diff: ${selectedFile}` : "Select a changed file to view diff"}
              </span>
              {selectedDiff?.stats && (
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-emerald-400">+{selectedDiff.stats.insertions ?? 0}</span>
                  <span className="text-rose-400">-{selectedDiff.stats.deletions ?? 0}</span>
                </div>
              )}
            </div>
            {loadingDiff ? (
              <div className="p-4">
                <Skeleton rows={8} />
              </div>
            ) : selectedDiff?.diff ? (
              <pre className="max-h-[36rem] overflow-auto p-4 font-mono text-xs leading-5">
                {selectedDiff.diff.split("\n").map((line, i) => {
                  const isAdd = line.startsWith("+") && !line.startsWith("+++");
                  const isDel = line.startsWith("-") && !line.startsWith("---");
                  const isHunk = line.startsWith("@@");
                  return (
                    <div
                      key={i}
                      className={`whitespace-pre px-2 py-0.5 ${
                        isAdd
                          ? "bg-emerald-950/40 text-emerald-300"
                          : isDel
                          ? "bg-rose-950/40 text-rose-300"
                          : isHunk
                          ? "bg-blue-950/30 text-blue-300 font-bold"
                          : "text-gray-300"
                      }`}
                    >
                      {line || " "}
                    </div>
                  );
                })}
              </pre>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center p-6 text-center text-gray-500">
                <FileCode className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Click any changed file on the left to inspect its unified diff.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMMITS & COMPARE */}
      {activeTab === "commits" && (
        <div className="space-y-4">
          {/* Commit Compare Bar */}
          <div className="card flex flex-wrap items-center gap-3 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-300">
              <GitCompare className="h-4 w-4 text-accent" />
              <span>Compare Commits:</span>
            </div>
            <select
              className="input text-xs font-mono"
              value={compareCommitA}
              onChange={(e) => setCompareCommitA(e.target.value)}
            >
              <option value="">Baseline Commit</option>
              {commits.map((c) => (
                <option key={c.hash} value={c.hash}>
                  {c.short_hash} — {c.message.slice(0, 40)}
                </option>
              ))}
            </select>
            <ArrowRight className="h-4 w-4 text-gray-500" />
            <select
              className="input text-xs font-mono"
              value={compareCommitB}
              onChange={(e) => setCompareCommitB(e.target.value)}
            >
              <option value="">Target Commit</option>
              {commits.map((c) => (
                <option key={c.hash} value={c.hash}>
                  {c.short_hash} — {c.message.slice(0, 40)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary text-xs"
              onClick={runCommitCompare}
              disabled={!compareCommitA || !compareCommitB || comparing}
            >
              {comparing ? "Comparing…" : "Compare"}
            </button>
          </div>

          {/* Compared Diff Viewer */}
          {compareDiff && (
            <div className="card overflow-hidden">
              <div className="border-b border-ink-700 bg-ink-900/60 px-4 py-2 font-mono text-xs text-gray-300">
                Diff comparison: {compareDiff.baseline?.slice(0, 7)}..{compareDiff.target?.slice(0, 7)}
              </div>
              <pre className="max-h-[30rem] overflow-auto p-4 font-mono text-xs leading-5">
                {compareDiff.diff ? (
                  compareDiff.diff.split("\n").map((line, i) => {
                    const isAdd = line.startsWith("+") && !line.startsWith("+++");
                    const isDel = line.startsWith("-") && !line.startsWith("---");
                    const isHunk = line.startsWith("@@");
                    return (
                      <div
                        key={i}
                        className={`whitespace-pre px-2 py-0.5 ${
                          isAdd
                            ? "bg-emerald-950/40 text-emerald-300"
                            : isDel
                            ? "bg-rose-950/40 text-rose-300"
                            : isHunk
                            ? "bg-blue-950/30 text-blue-300 font-bold"
                            : "text-gray-300"
                        }`}
                      >
                        {line || " "}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500">No diff differences between selected commits.</p>
                )}
              </pre>
            </div>
          )}

          {/* Commits List */}
          {loadingCommits ? (
            <Skeleton rows={6} />
          ) : commits.length === 0 ? (
            <Empty title="No commits found">No Git commits recorded in this repository.</Empty>
          ) : (
            <div className="card divide-y divide-ink-700">
              {commits.map((c) => (
                <div key={c.hash} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <GitCommitIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <div>
                      <div className="text-sm font-medium text-gray-200">{c.message}</div>
                      <div className="text-xs text-gray-400">
                        <span>{c.author}</span> • <time>{new Date(c.date).toLocaleString()}</time>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3 sm:mt-0">
                    <span className="font-mono text-xs text-gray-500">{c.files_changed} files</span>
                    {c.insertions > 0 && <span className="font-mono text-xs text-emerald-400">+{c.insertions}</span>}
                    {c.deletions > 0 && <span className="font-mono text-xs text-rose-400">-{c.deletions}</span>}
                    <span className="rounded bg-ink-800 px-2 py-0.5 font-mono text-xs text-gray-300">
                      {c.short_hash}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TIMELINE */}
      {activeTab === "timeline" && (
        <div className="space-y-3">
          {loadingTimeline ? (
            <Skeleton rows={8} />
          ) : timeline.length === 0 ? (
            <Empty title="No timeline events recorded">Timeline events will appear as you work with the repo.</Empty>
          ) : (
            <div className="card divide-y divide-ink-700">
              {timeline.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 text-sm">
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase font-bold ${
                      event.source === "git"
                        ? "bg-blue-950 text-blue-300 border border-blue-800"
                        : "bg-purple-950 text-purple-300 border border-purple-800"
                    }`}
                  >
                    {event.source}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-gray-200">{event.title}</p>
                      <time className="shrink-0 text-xs text-gray-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
