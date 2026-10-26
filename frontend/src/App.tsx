import { useApi, useRoute } from "./hooks";
import type { Health } from "./types";
import { Layout, NAV } from "./components/Layout";
import Overview from "./pages/Overview";
import Repositories from "./pages/Repositories";
import Investigations from "./pages/Investigations";
import Findings from "./pages/Findings";
import Patches from "./pages/Patches";
import TestRuns from "./pages/TestRuns";
import Skills from "./pages/Skills";
import Settings from "./pages/Settings";

export default function App() {
  const [route, go] = useRoute();
  const health = useApi<Health>("/health");
  const page = NAV.some((n) => n.id === route) ? route : "overview";
  return (
    <Layout route={page} go={go} health={{ data: health.data, loading: health.loading, error: !!health.error }}>
      {page === "overview" && <Overview go={go} health={health.data} />}
      {page === "repositories" && <Repositories />}
      {page === "investigations" && <Investigations go={go} />}
      {page === "findings" && <Findings go={go} />}
      {page === "patches" && <Patches />}
      {page === "tests" && <TestRuns />}
      {page === "skills" && <Skills />}
      {page === "settings" && <Settings health={health} />}
    </Layout>
  );
}
