import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { bootstrapSession } from "./api/auth";
import App from "./App";
import "./index.css";

const rootEl = document.getElementById("root")!;

void bootstrapSession().finally(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
});
