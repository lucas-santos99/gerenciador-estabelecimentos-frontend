// src/components/PersonificarModal.jsx
// Modal de confirmação pra o SuperAdmin master "entrar como" outro
// usuário (estabelecimento/operador) usando a PRÓPRIA senha — nunca a
// senha do usuário alvo. Reaproveitado nas telas de Detalhes de
// Estabelecimento e Detalhes de Operador.
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";
import { useAuth } from "../contexts/AuthProvider";

/**
 * @param {"usuario"|"estabelecimento"} tipo - qual rota de personificação usar
 * @param {string} id - id do profile (tipo="usuario") ou id da mercearia (tipo="estabelecimento")
 * @param {string} nomeExibicao - nome mostrado no modal ("Entrar como <nomeExibicao>")
 * @param {() => void} onClose
 */
export default function PersonificarModal({ tipo, id, nomeExibicao, onClose }) {
  const { iniciarPersonificacao } = useAuth();
  const navigate = useNavigate();

  const [senha,      setSenha]      = useState("");
  const [enviando,   setEnviando]   = useState(false);
  const [erro,       setErro]       = useState("");

  async function confirmar() {
    if (!senha) {
      setErro("Digite sua senha pra confirmar.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const resp = await apiFetch(`/superadmin/personificar/${tipo}/${id}`, {
        method: "POST",
        body:   JSON.stringify({ senha }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErro(json.error || "Erro ao personificar.");
        setEnviando(false);
        return;
      }

      await iniciarPersonificacao({
        email:     json.email,
        tokenHash: json.token_hash,
        alvo:      json.alvo,
      });

      onClose();
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setErro("Erro interno ao personificar.");
      setEnviando(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-card, #fff)", color: "inherit",
          borderRadius: 14, padding: 24, width: "min(420px, 92vw)",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 6 }}>
          🔑 Entrar como {nomeExibicao}
        </div>
        <div style={{ fontSize: "0.85rem", opacity: 0.75, marginBottom: 16, lineHeight: 1.4 }}>
          Você vai acessar o sistema com a visão e as permissões dessa conta.
          Confirme sua própria senha de master pra continuar — sua sessão de
          admin fica salva e você pode voltar a qualquer momento pela faixa
          roxa no topo da tela.
        </div>

        <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
          Sua senha (master)
        </label>
        <input
          type="password"
          maxLength={72}
          autoFocus
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !enviando) confirmar(); }}
          placeholder="••••••••"
          style={{
            width: "100%", boxSizing: "border-box", padding: "10px 12px",
            borderRadius: 8, border: "1px solid var(--border, #e5e7eb)",
            background: "var(--bg-input, #f8fafc)", color: "inherit",
            fontSize: "0.9rem",
          }}
        />

        {erro && (
          <div style={{
            marginTop: 10, padding: "8px 10px", borderRadius: 8,
            background: "rgba(239,68,68,0.1)", color: "#ef4444",
            fontSize: "0.8rem", fontWeight: 600,
          }}>
            ❌ {erro}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={enviando}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border, #e5e7eb)",
              background: "transparent", color: "inherit", fontWeight: 600, cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={enviando}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer",
            }}
          >
            {enviando ? "⏳ Entrando…" : "🔑 Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
