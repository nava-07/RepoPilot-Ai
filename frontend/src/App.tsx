import { useApi, useRoute } from "./hooks";
import type { Health } from "./types";
import { Layout, NAV } from "./components/Layout";
import { RepoProvider } from "./context/RepoContext";
import Overview from "./pages/Overview";
import Repositories from "./pages/Repositories";
import ChangeTracker from "./pages/ChangeTracker";
import Investigations from "./pages/Investigations";
import Findings from "./pages/Findings";
import Patches from "./pages/Patches";
import TestRuns from "./pages/TestRuns";
import ChangeIntelligence from "./pages/ChangeIntelligence";
import Skills from "./pages/Skills";
import Settings from "./pages/Settings";

function AppContent() {
  const [route, go] = useRoute();
  const health = useApi<Health>("/health");
  const page = NAV.some((n) => n.id === route) ? route : "overview";

  return (
    <Layout
      route={page}
      go={go}
      health={{ data: health.data, loading: health.loading, error: !!health.error }}
    >
      {page === "overview" && <Overview go={go} health={health.data} />}
      {page === "repositories" && <Repositories go={go} />}
      {page === "tracker" && <ChangeTracker go={go} />}
      {page === "investigations" && <Investigations go={go} />}
      {page === "findings" && <Findings go={go} />}
      {page === "patches" && <Patches />}
      {page === "tests" && <TestRuns />}
      {page === "intelligence" && <ChangeIntelligence go={go} />}
      {page === "skills" && <Skills />}
      {page === "settings" && <Settings health={health} />}
    </Layout>
  );
}

export default function App() {
  return (
    <RepoProvider>
      <AppContent />
    </RepoProvider>
  );
}
