import { useState } from "react";
import { Check, Copy, Key, RefreshCw, Sparkles, Terminal } from "lucide-react";
import { post } from "../api";
import { useApi } from "../hooks";
import { useToast } from "../components/toast";
import type { Health, ModelInfo } from "../types";
import { Async, ErrorBox, PageHeader } from "../components/ui";

export default function Settings({ health }: { health: ReturnType<typeof useApi<Health>> }) {
  const models = useApi<{ provider?: string; models: ModelInfo[]; selected_model: string | null }>("/models");
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [busyProvider, setBusyProvider] = useState(false);

  const activeProvider = health.data?.model.provider || "ollama";

  const copy = async (name: string) => {
    await navigator.clipboard.writeText(`REPOPILOT_OLLAMA_MODEL=${name}`);
    setCopied(name);
    setTimeout(() => setCopied(null), 1500);
  };

  const switchProvider = async (provider: "ollama" | "gemini") => {
    setBusyProvider(true);
    try {
      await post("/models/provider", { provider });
      toast(`Switched provider to ${provider === "gemini" ? "Google Gemini" : "Local Ollama"}`);
      health.reload();
      models.reload();
    } catch {
      toast("Failed to switch provider", "error");
    } finally {
      setBusyProvider(false);
    }
  };

  const saveGeminiKey = async () => {
    if (!geminiKey.trim()) return;
    try {
      await post("/models/gemini-key", { api_key: geminiKey.trim() });
      toast("Gemini API Key saved");
      setGeminiKey("");
      health.reload();
      models.reload();
    } catch {
      toast("Failed to save Gemini API key", "error");
    }
  };

  const selectModel = async (name: string) => {
    try {
      await post("/models/select", { model: name });
      toast(`Selected ${name}`);
      health.reload();
      models.reload();
    } catch {
      toast("Failed to select model", "error");
    }
  };

  const refresh = () => {
    health.reload();
    models.reload();
  };

  return (
    <>
      <PageHeader
        title="Settings & AI Providers"
        subtitle="Configure local open-weight Ollama or cloud multimodal Google Gemini API."
        action={
          <button className="btn" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Re-check
          </button>
        }
      />

      {/* Provider Selector */}
      <div className="card mb-6 p-4">
        <h2 className="mb-2 text-sm font-medium text-gray-200">AI Inference Engine</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busyProvider}
            onClick={() => switchProvider("ollama")}
            className={`card flex items-start gap-3 p-3 text-left transition-colors hover:bg-ink-800 ${
              activeProvider === "ollama" ? "border-accent bg-ink-800" : ""
            }`}
          >
            <Terminal className="mt-0.5 h-5 w-5 text-accent" />
            <div>
              <div className="flex items-center gap-2 font-medium">
                Local Ollama
                {activeProvider === "ollama" && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">Active</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                100% private, offline open-weight models (e.g. Qwen, Llama, DeepSeek). No API key needed.
              </p>
            </div>
          </button>

          <button
            type="button"
            disabled={busyProvider}
            onClick={() => switchProvider("gemini")}
            className={`card flex items-start gap-3 p-3 text-left transition-colors hover:bg-ink-800 ${
              activeProvider === "gemini" ? "border-accent bg-ink-800" : ""
            }`}
          >
            <Sparkles className="mt-0.5 h-5 w-5 text-accent" />
            <div>
              <div className="flex items-center gap-2 font-medium">
                Google Gemini API
                {activeProvider === "gemini" && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">Active</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                Multimodal assistant supporting text + UI bug screenshot analysis with Gemini 2.5 Flash.
              </p>
            </div>
          </button>
        </div>

        {/* Gemini Key Config */}
        {activeProvider === "gemini" && (
          <div className="mt-4 border-t border-ink-700 pt-3">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Google AI Studio API Key
            </label>
            <div className="flex max-w-md gap-2">
              <input
                type="password"
                className="input text-xs"
                placeholder="Paste your Gemini API key (AIza...)"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <button
                className="btn btn-primary whitespace-nowrap text-xs"
                onClick={saveGeminiKey}
                disabled={!geminiKey.trim()}
              >
                <Key className="h-3.5 w-3.5" />
                Save Key
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              Get a free API key at <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-accent underline">Google AI Studio</a>.
            </p>
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-medium text-gray-400">Active Connection Status</h2>
      <Async state={health}>
        {(h) => (
          <dl className="card mb-6 grid grid-cols-[10rem_1fr] gap-y-1 p-4 text-sm">
            <dt className="text-gray-500">Backend</dt>
            <dd>
              {h.status} · v{h.app_version}
            </dd>
            <dt className="text-gray-500">Provider</dt>
            <dd className="capitalize">
              {h.model.provider} at <code className="font-mono text-xs">{h.model.base_url}</code>
            </dd>
            <dt className="text-gray-500">Connected</dt>
            <dd>
              {h.model.connected
                ? `yes (${h.model.provider === "gemini" ? "Google AI API" : `Ollama ${h.model.version || ""}`})`
                : "no"}
            </dd>
            <dt className="text-gray-500">Selected model</dt>
            <dd>
              {h.model.selected_model ?? "none"}
              {h.model.selected_model && !h.model.selected_model_installed ? " (not installed)" : ""}
            </dd>
            {h.model.detail && (
              <>
                <dt className="text-gray-500">Diagnostic</dt>
                <dd className="text-amber-300">{h.model.detail}</dd>
              </>
            )}
            {h.model.hint && (
              <>
                <dt className="text-gray-500">Next step</dt>
                <dd className="text-gray-300">{h.model.hint}</dd>
              </>
            )}
          </dl>
        )}
      </Async>

      <h2 className="mb-2 text-sm font-medium text-gray-400">Available Models</h2>
      <Async state={models}>
        {(m) =>
          m.models.length === 0 ? (
            <p className="card p-4 text-sm text-gray-400">
              {activeProvider === "gemini"
                ? "Enter your Gemini API key above to activate models."
                : "No models installed in Ollama. Pull one with `ollama pull <model>`."}
            </p>
          ) : (
            <>
              <ul className="card divide-y divide-ink-700">
                {m.models.map((x) => (
                  <li
                    key={x.name}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
                  >
                    <span>
                      <span className="font-mono font-medium">{x.name}</span>{" "}
                      <span className="text-xs text-gray-500">
                        {[x.parameter_size, x.quantization, x.family].filter(Boolean).join(" · ")}
                      </span>
                      {m.selected_model === x.name && (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
                          selected
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {m.selected_model !== x.name && (
                        <button
                          className="btn btn-primary text-xs"
                          onClick={() => selectModel(x.name)}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Select
                        </button>
                      )}
                      {activeProvider === "ollama" && (
                        <button className="btn text-xs" onClick={() => copy(x.name)}>
                          <Copy className="h-3.5 w-3.5" />
                          {copied === x.name ? "Copied" : "Copy env"}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {activeProvider === "ollama" && (
                <p className="mt-2 text-xs text-gray-500">
                  The backend reads its default local model from <code className="font-mono">REPOPILOT_OLLAMA_MODEL</code>.
                </p>
              )}
            </>
          )
        }
      </Async>
      {models.error && !models.error.notImplemented && (
        <div className="mt-3">
          <ErrorBox error={models.error} onRetry={models.reload} />
        </div>
      )}
    </>
  );
}
