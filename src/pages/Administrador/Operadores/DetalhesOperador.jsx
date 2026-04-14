// src/pages/Administrador/Operadores/DetalhesOperador.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import ResetSenhaModal from "./ResetSenhaModal";
import "./Operadores.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function DetalhesOperador() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [op,         setOp]         = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showReset,  setShowReset]  = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/detalhes/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      setOp(resp.ok ? data : null);
    } catch { setOp(null); }
    setLoading(false);
  }


  useEffect(() => { carregar(); }, [id]);

  async function toggleStatus() {
    if (!op) return;
    const novoStatus = op.status === "ativo" ? "inativo" : "ativo";
    if (!window.confirm(`Alterar status para "${novoStatus}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}/status`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: novoStatus }),
        credentials: "include",
      });
      if (resp.ok) carregar();
      else alert("Erro ao alterar status.");
    } catch { alert("Erro ao alterar status."); }
  }

  async function excluir() {
    if (!window.confirm(`Excluir operador "${op?.nome}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) navigate(-1);
      else alert("Erro ao excluir operador.");
    } catch { alert("Erro ao excluir operador."); }
  }

  /* ── loading ────────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="op-wrapper">
          <div className="op-loading"><div className="op-spinner" /> Carregando operador...</div>
        </div>
      </LayoutAdmin>
    );
  }

  if (!op) {
    return (
      <LayoutAdmin>
        <div className="op-wrapper">
          <div className="op-empty">
            <span className="op-empty-icon">⚠️</span>
            Operador não encontrado.
          </div>
          <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
            ← Voltar
          </button>
        </div>
      </LayoutAdmin>
    );
  }

  const isAtivo = op.status === "ativo";

  return (
    <LayoutAdmin>
      <div className="op-wrapper">

        {/* HEADER */}
        <div className="op-page-header">
          <div className="op-page-header-left">
            <span className="op-breadcrumb">👥 Operadores</span>
            <h1 className="op-page-title">Detalhes do <span>Operador</span></h1>
          </div>
          <div className="op-page-actions">
            <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
              ← Voltar
            </button>
          </div>
        </div>

        {/* HERO CARD */}
        <div className="op-detail-hero">
          {/* Avatar / Foto */}
          {op.foto_url
            ? <img src={op.foto_url} alt="Foto" className="op-avatar-foto" />
            : <div className="op-avatar-lg">{iniciais(op.nome)}</div>
          }

          {/* Info */}
          <div className="op-detail-info">
            <div className="op-detail-name">{op.nome}</div>
            <div className="op-detail-email">{op.email}</div>
            <div className="op-detail-meta">
              <span className={`op-badge op-badge-${op.status}`}>
                {op.status}
              </span>
            </div>
          </div>

          {/* Ações */}
          <div className="op-detail-actions">
            <button
              className="op-btn op-btn-outline op-btn-sm"
              onClick={() => navigate(`/admin/operadores/editar/${id}`)}
            >
              ✏️ Editar
            </button>
            <button
              className="op-btn op-btn-primary op-btn-sm"
              onClick={() => setShowReset(true)}
            >
              🔑 Resetar Senha
            </button>
            <button
              className={`op-btn op-btn-sm ${isAtivo ? "op-btn-warning" : "op-btn-success"}`}
              onClick={toggleStatus}
            >
              {isAtivo ? "⏸ Inativar" : "▶ Ativar"}
            </button>
            <button
              className="op-btn op-btn-danger op-btn-sm"
              onClick={excluir}
            >
              🗑 Excluir
            </button>
          </div>
        </div>

        {/* INFO GRID */}
        <div className="op-info-grid">
          <div className="op-info-block">
            <div className="op-info-block-title">Contato</div>
            <div className="op-info-row">
              <span className="op-info-label">E-mail</span>
              <span className="op-info-value mono">{op.email || "—"}</span>
            </div>
            <div className="op-info-row">
              <span className="op-info-label">Telefone</span>
              <span className="op-info-value mono">{op.telefone || "—"}</span>
            </div>
          </div>

          <div className="op-info-block">
            <div className="op-info-block-title">Situação</div>
            <div className="op-info-row">
              <span className="op-info-label">Status</span>
              <span className={`op-badge op-badge-${op.status}`}>{op.status}</span>
            </div>
            <div className="op-info-row" style={{ marginTop: 10 }}>
              <span className="op-info-label">ID do sistema</span>
              <span className="op-info-value mono" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                {op.id}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL RESET SENHA */}
      {showReset && (
        <ResetSenhaModal id={id} onClose={() => setShowReset(false)} />
      )}
    </LayoutAdmin>
  );
}