// src/pages/Administrador/Operadores/ResetSenhaModal.jsx
import React, { useState } from "react";
import "./Operadores.css";
import { apiFetch } from "../../../utils/api";
import { erroSenhaFraca } from '../../../utils/senha';

// Serve para operador (padrão) e para o dono do estabelecimento:
//   <ResetSenhaModal id={id} onClose={…} />                       → operador
//   <ResetSenhaModal id={lojaId} quem="dono" onClose={…} />       → dono
export default function ResetSenhaModal({ id, onClose, quem = "operador" }) {
  const ehDono   = quem === "dono";
  const endpoint = ehDono ? `/admin/estabelecimentos/${id}/reset-senha-dono` : `/admin/operadores/${id}/reset-senha`;
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
      const resp = await apiFetch(endpoint, {
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
        <div className="op-modal-title">Alterar senha</div>
        <div className="op-modal-subtitle">
          {ehDono
            ? "Defina uma nova senha para o dono deste estabelecimento. Você não precisa da senha antiga. Ela passa a valer na hora e ele não é avisado: repasse a senha nova a ele."
            : "Defina uma nova senha para este operador. Ela passa a valer na hora e ele não é avisado: repasse a senha nova a ele."}
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
            {salvando ? "⏳ Salvando…" : "✓ Alterar senha"}
          </button>
        </div>

      </div>
    </div>
  );
}