import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import type { Repository } from "../types";

interface RepoContextValue {
  activeRepoId: string | null;
  activeRepo: Repository | null;
  setActiveRepoId: (id: string | null) => void;
  repos: Repository[];
  loading: boolean;
  refreshRepos: () => Promise<void>;
}

const RepoContext = createContext<RepoContextValue | null>(null);

const STORAGE_KEY = "repopilot_active_repo_id";

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRepoId, setActiveRepoIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const loadRepos = async () => {
    try {
      setLoading(true);
      const data = await api<Repository[]>("/repositories");
      setRepos(data);
      // If we had a stored repo ID, check if it still exists
      if (activeRepoId) {
        const exists = data.some((r) => r.id === activeRepoId);
        if (!exists) {
          if (data.length > 0) {
            setActiveRepoIdState(data[0].id);
            localStorage.setItem(STORAGE_KEY, data[0].id);
          } else {
            setActiveRepoIdState(null);
            localStorage.removeItem(STORAGE_KEY);
          }
        }
      } else if (data.length > 0) {
        // Auto-select first repository if none selected
        setActiveRepoIdState(data[0].id);
        localStorage.setItem(STORAGE_KEY, data[0].id);
      }
    } catch {
      // Backend may be offline
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const setActiveRepoId = (id: string | null) => {
    setActiveRepoIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? null;

  return (
    <RepoContext.Provider
      value={{
        activeRepoId,
        activeRepo,
        setActiveRepoId,
        repos,
        loading,
        refreshRepos: loadRepos,
      }}
    >
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo() {
  const ctx = useContext(RepoContext);
  if (!ctx) {
    throw new Error("useRepo must be used within a RepoProvider");
  }
  return ctx;
}
