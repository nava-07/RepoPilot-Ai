import { useState, type FormEvent } from "react";
import { ChevronRight, File as FileIcon, Folder, Download } from "lucide-react";
import { ApiError, api, post } from "../api";
import { useApi } from "../hooks";
import { useToast } from "../components/toast";
import type { Repository } from "../types";
import { Async, Empty, ErrorBox, PageHeader, Skeleton } from "../components/ui";

interface TreeNode { name: string; path: string; type: "file" | "dir"; children?: TreeNode[] }
interface FileContent { path: string; content: string; language?: string; truncated?: boolean; skipped_reason?: string | null }

function Node({ n, depth, onOpen, active }: { n: TreeNode; depth: number; onOpen: (p: string) => void; active: string | null }) {
  const [open, setOpen] = useState(depth < 1);
  const pad = { paddingLeft: depth * 12 + 8 };
  if (n.type === "dir") return (
    <li>
      <button className="flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-ink-800" style={pad} onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} /><Folder className="h-3.5 w-3.5 text-gray-400" />{n.name}
      </button>
      {open && <ul>{n.children?.map((c) => <Node key={c.path} n={c} depth={depth + 1} onOpen={onOpen} active={active} />)}</ul>}
    </li>
  );
  return (
    <li><button className={`flex w-full items-center gap-1 py-0.5 text-left text-sm hover:bg-ink-800 ${active === n.path ? "bg-ink-700" : ""}`} style={{ ...pad, paddingLeft: depth * 12 + 24 }} onClick={() => onOpen(n.path)}>
      <FileIcon className="h-3.5 w-3.5 text-gray-500" />{n.name}
    </button></li>
  );
}

function Explorer({ repo }: { repo: Repository }) {
  const tree = useApi<TreeNode>(`/repositories/${repo.id}/tree`);
  const [path, setPath] = useState<string | null>(null);
  const [file, setFile] = useState<FileContent | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async (p: string) => {
    setPath(p); setBusy(true); setErr(null); setFile(null);
    try { setFile(await api<FileContent>(`/repositories/${repo.id}/files?path=${encodeURIComponent(p)}`)); }
    catch (e) { setErr(e as ApiError); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[18rem_1fr]">
      <div className="card max-h-[32rem] overflow-auto py-2">
        <Async state={tree} milestone="Milestone 2">{(t) => <ul role="tree">{(t.children ?? [t]).map((c) => <Node key={c.path} n={c} depth={0} onOpen={open} active={path} />)}</ul>}</Async>
      </div>
      <div className="card min-w-0 overflow-hidden">
        <div className="border-b border-ink-700 px-3 py-1.5 font-mono text-xs text-gray-400">{path ?? "Select a file"}</div>
        {busy && <div className="p-3"><Skeleton rows={6} /></div>}
        {err && <div className="p-3"><ErrorBox error={err} onRetry={() => path && open(path)} /></div>}
        {file && (file.skipped_reason
          ? <p className="p-4 text-sm text-amber-300">File not shown: {file.skipped_reason}</p>
          : <pre className="max-h-[30rem] overflow-auto p-0 font-mono text-xs leading-5">{file.content.split("\n").map((l, i) => (
              <div key={i} className="flex"><span className="w-12 shrink-0 select-none pr-3 text-right text-gray-600">{i + 1}</span><span className="whitespace-pre">{l || " "}</span></div>))}</pre>)}
        {file?.truncated && <p className="border-t border-ink-700 px-3 py-1 text-xs text-amber-300">Truncated to the configured size limit.</p>}
      </div>
    </div>
  );
}

export default function Repositories() {
  const toast = useToast();
  const repos = useApi<Repository[]>("/repositories");
  const [source, setSource] = useState<"local" | "github">("local");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [selected, setSelected] = useState<Repository | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await post("/repositories/import", { source_type: source, location: location.trim() }); setLocation(""); repos.reload(); toast("Repository imported"); }
    catch (x) { setErr(x as ApiError); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Repositories" subtitle="Import an authorized local folder or a public GitHub repository." />
      <form onSubmit={submit} className="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-sm"><span className="mb-1 block text-gray-400">Source</span>
          <select className="input" value={source} onChange={(e) => setSource(e.target.value as "local" | "github")}>
            <option value="local">Local folder</option><option value="github">GitHub URL</option></select></label>
        <label className="min-w-[16rem] flex-1 text-sm"><span className="mb-1 block text-gray-400">{source === "local" ? "Absolute path" : "https://github.com/owner/repo"}</span>
          <input className="input" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder={source === "local" ? "/home/me/projects/app" : "https://github.com/owner/repo"} /></label>
        <button className="btn btn-primary" disabled={busy || !location.trim()}><Download className="h-3.5 w-3.5" />{busy ? "Importing…" : "Import"}</button>
      </form>
      {err && <div className="mb-4"><ErrorBox error={err} milestone="Milestone 2" /></div>}
      <Async state={repos} milestone="Milestone 2">{(list) => list.length === 0
        ? <Empty title="No repositories yet">Import a repository above. Nothing is shown until the backend has actually indexed it.</Empty>
        : <ul className="mb-4 grid gap-2 md:grid-cols-2">{list.map((r) => (
            <li key={r.id}><button onClick={() => setSelected(r)} className={`card w-full p-3 text-left hover:bg-ink-800 ${selected?.id === r.id ? "border-accent-dim" : ""}`}>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-gray-400">{r.source_type} · {r.default_branch ?? "branch unknown"} · {r.file_count ?? "?"} files · {(r.languages ?? []).join(", ") || "languages unknown"}</div>
            </button></li>))}</ul>}</Async>
      {selected && <Explorer repo={selected} />}
    </>
  );
}
