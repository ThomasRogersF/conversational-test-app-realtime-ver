import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ScenarioMenu } from "./pages/ScenarioMenu.js";
import { CallScreen } from "./pages/CallScreen.js";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScenarioMenu />} />
        <Route path="/call" element={<CallScreen />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
