import { useState, type FormEvent, type ChangeEvent } from "react";
import { ImagePlus, Play, X } from "lucide-react";
import { ApiError, post } from "../api";
import { useApi } from "../hooks";
import type { Investigation, Repository } from "../types";
import { Async, Badge, Empty, ErrorBox, PageHeader } from "../components/ui";

export default function Investigations({ go }: { go: (r: string) => void }) {
  const list = useApi<Investigation[]>("/investigations");
  const repos = useApi<Repository[]>("/repositories");
  const [repoId, setRepoId] = useState("");
  const [question, setQuestion] = useState("");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImageBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageBase64(null);
    setImageName(null);
  };

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await post(`/repositories/${repoId}/analyze`, {
        question,
        image_data: imageBase64,
      });
      setQuestion("");
      removeImage();
      list.reload();
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const noRepos = !repos.loading && (!repos.data || repos.data.length === 0);

  return (
    <>
      <PageHeader
        title="Investigations"
        subtitle="Ask a question, describe a bug, or attach a UI screenshot. Multimodal analysis uses your configured model."
      />
      <form onSubmit={run} className="card mb-4 space-y-3 p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-gray-400">Repository</span>
          <select
            className="input"
            required
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            disabled={noRepos}
          >
            <option value="">{noRepos ? "No repositories imported" : "Select…"}</option>
            {repos.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-gray-400">Question or bug description</span>
          <textarea
            className="input min-h-[5rem]"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. discount_total returns the wrong value when quantity is 0, or inspect the error shown in the screenshot"
          />
        </label>

        {/* Multimodal Screenshot Attachment */}
        <div className="space-y-1.5 text-sm">
          <span className="block text-gray-400">Visual Evidence (Optional Multimodal Screenshot)</span>
          {!imageBase64 ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-ink-600 bg-ink-950 px-3 py-2 text-xs text-gray-400 hover:border-accent hover:text-gray-200">
              <ImagePlus className="h-4 w-4 text-accent" />
              <span>Attach error screenshot, console log image, or UI bug image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-ink-700 bg-ink-950 p-2">
              <img
                src={imageBase64}
                alt="Screenshot preview"
                className="h-12 w-12 rounded object-cover border border-ink-700"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-gray-200">{imageName}</div>
                <div className="text-[10px] text-accent">Multimodal visual attachment ready</div>
              </div>
              <button
                type="button"
                onClick={removeImage}
                className="btn p-1 text-gray-400 hover:text-red-400"
                title="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            className="btn btn-primary"
            disabled={busy || !repoId || !question.trim()}
          >
            <Play className="h-3.5 w-3.5" />
            {busy ? "Analyzing…" : "Run investigation"}
          </button>
          {noRepos && (
            <button type="button" className="btn" onClick={() => go("repositories")}>
              Import a repository first
            </button>
          )}
        </div>
      </form>

      {err && (
        <div className="mb-4">
          <ErrorBox error={err} milestone="Milestone 3" />
        </div>
      )}

      <Async state={list} milestone="Milestone 3">
        {(items) =>
          items.length === 0 ? (
            <Empty title="No investigations yet">
              Completed investigations are stored locally and listed here.
            </Empty>
          ) : (
            <ul className="card divide-y divide-ink-700">
              {items.map((i) => (
                <li key={i.id} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{i.question}</span>
                    <Badge>{i.status}</Badge>
                  </div>
                  <div className="text-xs text-gray-400">
                    {i.provider} / {i.model} · started {new Date(i.started_at).toLocaleString()}
                  </div>
                  {i.limitations?.map((l, k) => (
                    <div key={k} className="text-xs text-amber-300">
                      Limitation: {l}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </>
  );
}
