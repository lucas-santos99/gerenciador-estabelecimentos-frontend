// src/pages/Administrador/Painel/LayoutAdmin.jsx
import React, { useState, useEffect } from "react";
import Sidebar from "../Componentes/Sidebar";
import "./LayoutAdmin.css";

const SIDEBAR_KEY = "sidebar_collapsed";

export default function LayoutAdmin({ children }) {
  // Lê o mesmo localStorage que a Sidebar usa
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  });

  // Escuta mudanças no localStorage (quando Sidebar altera o valor)
  useEffect(() => {
    function handleStorage() {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "true");
    }

    // Polling leve — sincroniza com o estado interno da Sidebar
    const interval = setInterval(() => {
      const current = localStorage.getItem(SIDEBAR_KEY) === "true";
      setCollapsed(prev => (prev !== current ? current : prev));
    }, 100);

    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <div className="admin-container">
      <Sidebar />

      <div className={`admin-content${collapsed ? " sidebar-collapsed" : ""}`}>
        {children}
      </div>
    </div>
  );
}