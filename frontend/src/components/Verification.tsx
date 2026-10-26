import { CheckCircle2, Circle, CircleSlash, XCircle } from "lucide-react";
import type { Patch, TestRun } from "../types";

type S = "done" | "fail" | "todo" | "na";
const icon = { done: <CheckCircle2 className="h-4 w-4 text-accent" />, fail: <XCircle className="h-4 w-4 text-red-400" />, todo: <Circle className="h-4 w-4 text-gray-600" />, na: <CircleSlash className="h-4 w-4 text-amber-400" /> };

/** Separate statuses, per the spec: generated, validated, tests, approval. "Verified" only means tests passed; approval is the human's call. */
export function Verification({ patch, run }: { patch: Patch; run?: TestRun }) {
  const v = patch.validation_status.toLowerCase();
  const t = run?.status.toLowerCase();
  const steps: { label: string; note: string; s: S }[] = [
    { label: "Patch generated", note: "Model suggestion, not yet trusted", s: "done" },
    { label: "Applies to temporary workspace", note: v === "valid" ? "Validated against original file hash" : v === "invalid" ? "Rejected by validation" : "Not validated yet", s: v === "valid" ? "done" : v === "invalid" ? "fail" : "todo" },
    { label: "Tests", note: !run ? "Not run" : t === "passed" ? "Passed" : t === "failed" ? "Failed" : "Unavailable for this repository", s: !run ? "todo" : t === "passed" ? "done" : t === "failed" ? "fail" : "na" },
    { label: "Your approval", note: patch.approval_status === "pending" ? "Waiting for you" : patch.approval_status, s: patch.approval_status === "approved" ? "done" : patch.approval_status === "rejected" ? "fail" : "todo" },
  ];
  const verified = v === "valid" && t === "passed";
  return (
    <div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((st) => (
          <li key={st.label} className="flex items-start gap-2 rounded-md border border-ink-700 p-2 text-xs">
            <span className="mt-0.5">{icon[st.s]}</span>
            <span><span className="block font-medium text-gray-200">{st.label}</span><span className="text-gray-500">{st.note}</span></span>
          </li>
        ))}
      </ol>
      <p className={`mt-2 text-xs ${verified ? "text-accent" : "text-amber-300"}`}>
        {verified ? "Tests passed on a temporary copy. Source files are unchanged until you approve." : "Verification incomplete. Treat this patch as a suggestion."}
      </p>
    </div>
  );
}
