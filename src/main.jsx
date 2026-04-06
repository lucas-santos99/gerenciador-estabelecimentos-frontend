// ===== src/main.jsx =====
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { AuthProvider } from "./contexts/AuthProvider";
import { BrowserRouter } from "react-router-dom";

import "./index.css";

/* ── Aplica o tema ANTES do React montar ────────────────────
   Garante que body.dark ou body.light esteja ativo desde o
   primeiro pixel renderizado — sem flash de tela branca.     */
const tema = localStorage.getItem("theme") || "dark";
document.body.className = tema;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);