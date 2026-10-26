// Inline unified-diff renderer (no external dependency). Renders what the backend sends, nothing else.
export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="overflow-x-auto rounded-md border border-ink-700 bg-ink-950 p-0 font-mono text-xs leading-5" aria-label="Unified diff">
      {lines.map((l, i) => {
        const cls = l.startsWith("+++") || l.startsWith("---") ? "text-gray-400"
          : l.startsWith("@@") ? "bg-sky-500/10 text-sky-300"
          : l.startsWith("+") ? "bg-accent/10 text-accent"
          : l.startsWith("-") ? "bg-red-500/10 text-red-300" : "text-gray-300";
        return (
          <div key={i} className={`flex ${cls}`}>
            <span className="w-10 shrink-0 select-none pr-2 text-right text-gray-600">{i + 1}</span>
            <span className="whitespace-pre px-2">{l || " "}</span>
          </div>
        );
      })}
    </pre>
  );
}
