import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { CDPReactProvider } from "@coinbase/cdp-react";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CDPReactProvider
      config={{
        projectId: "14a891b6-8f77-4469-9a2e-a99cce877fa1",
        ethereum: {
          createOnLogin: "eoa",
        },
      }}
    >
      <App />
    </CDPReactProvider>
  </StrictMode>
);
