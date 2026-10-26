import { useApi } from "../hooks";
import type { TestRun } from "../types";
import { Async, Empty, PageHeader } from "../components/ui";
import { TestSummary } from "./Patches";

export default function TestRuns() {
  const list = useApi<TestRun[]>("/test-runs");
  return (
    <>
      <PageHeader title="Test Runs" subtitle="Real command output captured from isolated runs." />
      <Async state={list} milestone="Milestone 5">{(runs) => runs.length === 0
        ? <Empty title="No test runs">Run tests from a patch review. Results are stored exactly as produced.</Empty>
        : <ul className="space-y-3">{runs.map((r) => <li key={r.id}><TestSummary run={r} /></li>)}</ul>}</Async>
    </>
  );
}
