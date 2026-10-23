import ReactDOM from "react-dom/client";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import { AppShell } from "./app/App";
import "./design-system/styles.css";
import "./design-system/ux.css";
import "./design-system/comparison-workspace.css";
import "./design-system/mission.css";
import "./design-system/agent.css";
if (import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
ReactDOM.createRoot(document.getElementById("root")!).render(<AppShell />);
