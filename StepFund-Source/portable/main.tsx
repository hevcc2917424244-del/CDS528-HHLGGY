import React from "react";
import { createRoot } from "react-dom/client";
import StepFund from "../components/stepfund/app";
import "../app/globals.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StepFund />
  </React.StrictMode>,
);
