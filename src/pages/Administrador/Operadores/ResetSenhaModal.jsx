// src/pages/Administrador/Operadores/ResetSenhaModal.jsx
import React, { useState } from "react";
import "./Operadores.css";
import { apiFetch } from "../../../utils/api";
import { erroSenhaFraca } from '../../../utils/senha';

export default function ResetSenhaModal({ id, onClose }) {
  const [senha,    setSenha]    = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  async function enviar() {
    setErro("");
    const erroSenha = erroSenhaFraca(senha);
    if (erroSenha) { setErro(erroSenha); return; }
    if (senha !== confirmar) {
      setErro("As senhas não conferem.");
      return;
    }
    setSalvando(true);
    try {
      const resp = await apiFetch(`/admin/operadores/${id}/reset-senha`, {
        method: "POST",
        body:   JSON.stringify({ senha }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok) onClose();
      else setErro(json.error || "Erro ao redefinir senha.");
    } catch { setErro("Erro interno ao resetar senha."); }
    setSalvando(false);
  }

  return (
    <div className="op-modal-overlay" onClick={onClose}>
      <div className="op-modal" onClick={e => e.stopPropagation()}>

        <span className="op-modal-icon">🔑</span>
        <div className="op-modal-title">Resetar Senha</div>
        <div className="op-modal-subtitle">
          Defina uma nova senha para este operador.
        </div>

        {erro && (
          <div className="op-alert op-alert-error" style={{ marginBottom: 16 }}>
            ⚠️ {erro}
          </div>
        )}

        <div className="op-modal-form">
          <div className="op-form-group">
            <label className="op-label">Nova senha</label>
            <input maxLength={72}
              className="op-input"
              type="password"
              placeholder="Mínimo 8, com letras e números"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              disabled={salvando}
            />
          </div>
          <div className="op-form-group">
            <label className="op-label">Confirmar senha</label>
            <input maxLength={72}
              className="op-input"
              type="password"
              placeholder="Repita a senha"
              value={confirmar}
              onChange={e => setConfirmar(e.target.value)}
              disabled={salvando}
            />
          </div>
        </div>

        <div className="op-modal-actions">
          <button
            className="op-btn op-btn-ghost"
            onClick={onClose}
            disabled={salvando}
          >
            Cancelar
          </button>
          <button
            className="op-btn op-btn-primary"
            onClick={enviar}
            disabled={salvando}
          >
            {salvando ? "⏳ Salvando…" : "✓ Resetar Senha"}
          </button>
        </div>

      </div>
    </div>
  );
}