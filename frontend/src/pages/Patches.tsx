import { useState } from "react";
import { Check, FlaskConical, ShieldCheck, X, Download } from "lucide-react";
import { ApiError, post } from "../api";
import { useApi } from "../hooks";
import type { Patch, TestRun } from "../types";
import { Async, Badge, Empty, ErrorBox, PageHeader } from "../components/ui";
import { DiffView } from "../components/DiffView";
import { Verification } from "../components/Verification";
import { useToast } from "../components/toast";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/x-diff" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name }); a.click(); URL.revokeObjectURL(url);
}

export default function Patches() {
  const list = useApi<Patch[]>("/patches");
  const toast = useToast();
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, TestRun>>({});
  const act = async (p: Patch, action: "validate" | "test" | "approve" | "reject") => {
    setBusy(`${p.id}:${action}`); setErr(null);
    try {
      const r = await post<TestRun | Patch>(`/patches/${p.id}/${action}`);
      if (action === "test") setLastRun((m) => ({ ...m, [p.id]: r as TestRun }));
      list.reload();
      toast(action === "test" ? "Test run finished" : `Patch ${action === "validate" ? "validated" : action + "d"}`);
    } catch (x) { setErr(x as ApiError); toast((x as ApiError).message, "error"); } finally { setBusy(null); }
  };
  return (
    <>
      <PageHeader title="Patch Reviews" subtitle="Generated patches are suggestions. Approval and verification are tracked separately." />
      {err && <div className="mb-4"><ErrorBox error={err} milestone="Milestone 4/5" /></div>}
      <Async state={list} milestone="Milestone 4">{(items) => items.length === 0
        ? <Empty title="No patches">Propose a patch from a finding. Source files are never modified until you explicitly accept a patch.</Empty>
        : <ul className="space-y-4">{items.map((p) => {
            const run = lastRun[p.id]; const b = (a: string) => busy === `${p.id}:${a}`;
            return (
              <li key={p.id} className="card space-y-3 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">patch {p.id}</span>
                  <span className="text-xs text-gray-500">validation</span><Badge>{p.validation_status}</Badge>
                  <span className="text-xs text-gray-500">approval</span><Badge>{p.approval_status}</Badge>
                </div>
                {p.explanation && <p className="text-gray-300">{p.explanation}</p>}
                <Verification patch={p} run={run} />
                <DiffView diff={p.diff} />
                <div className="flex flex-wrap gap-2">
                  <button className="btn" disabled={!!busy} onClick={() => act(p, "validate")}><ShieldCheck className="h-3.5 w-3.5" />{b("validate") ? "Validating…" : "Validate"}</button>
                  <button className="btn" disabled={!!busy} onClick={() => act(p, "test")}><FlaskConical className="h-3.5 w-3.5" />{b("test") ? "Running tests…" : "Run tests (isolated)"}</button>
                  <button className="btn btn-primary" disabled={!!busy || p.approval_status === "approved"} onClick={() => act(p, "approve")}><Check className="h-3.5 w-3.5" />Approve</button>
                  <button className="btn" disabled={!!busy || p.approval_status === "rejected"} onClick={() => act(p, "reject")}><X className="h-3.5 w-3.5" />Reject</button>
                  <button className="btn ml-auto" onClick={() => { download(`repopilot-${p.id}.diff`, p.diff); toast("Diff exported"); }}><Download className="h-3.5 w-3.5" />Export diff</button>
                </div>
                {run && <TestSummary run={run} />}
              </li>);
          })}</ul>}</Async>
    </>
  );
}

export function TestSummary({ run }: { run: TestRun }) {
  return (
    <div className="rounded-md border border-ink-700 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <Badge>{run.status}</Badge><code className="font-mono">{run.command}</code>
        <span>exit {run.exit_code ?? "n/a"}</span>{run.duration_ms != null && <span>{(run.duration_ms / 1000).toFixed(2)}s</span>}
      </div>
      <pre className="max-h-60 overflow-auto rounded bg-ink-950 p-2 font-mono text-xs">{run.output || "(no output captured)"}</pre>
    </div>
  );
}
