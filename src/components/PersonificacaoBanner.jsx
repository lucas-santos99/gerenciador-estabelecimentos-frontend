// src/components/PersonificacaoBanner.jsx
// Faixa fixa no topo da tela, visível em QUALQUER página enquanto o
// SuperAdmin master estiver "personificando" (logado como outro usuário
// usando a própria senha). Existe pra nunca deixar o master esquecido
// dentro da conta de outra pessoa sem perceber.
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

const ROTULO_ROLE = {
  merchant: "dono do estabelecimento",
  operator: "operador",
  super_admin: "superadmin",
};

export default function PersonificacaoBanner() {
  const { personificando, encerrarPersonificacao } = useAuth();
  const navigate = useNavigate();

  if (!personificando) return null;

  async function voltar() {
    await encerrarPersonificacao();
    navigate("/admin", { replace: true });
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 16px",
        background: "#7c3aed",
        color: "#fff",
        fontFamily: "Plus Jakarta Sans, sans-serif",
        fontSize: "0.85rem",
        fontWeight: 600,
        boxShadow: "0 2px 8px rgba(124,58,237,0.35)",
      }}
    >
      <span>
        🔎 Você está personificando <strong>{personificando.nome}</strong>
        {personificando.role ? ` (${ROTULO_ROLE[personificando.role] || personificando.role})` : ""}
      </span>
      <button
        onClick={voltar}
        style={{
          padding: "4px 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.6)",
          background: "rgba(255,255,255,0.12)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.8rem",
          cursor: "pointer",
        }}
      >
        ← Voltar para administração
      </button>
    </div>
  );
}
