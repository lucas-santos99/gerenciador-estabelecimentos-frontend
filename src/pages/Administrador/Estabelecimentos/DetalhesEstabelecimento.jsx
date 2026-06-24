// src/pages/Administrador/Estabelecimentos/DetalhesEstabelecimento.jsx
// Este componente foi unificado com EditarEstabelecimento via ?view=details.
// Este arquivo garante compatibilidade caso a rota /detalhes/:id seja usada diretamente.

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function DetalhesEstabelecimento() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [dados,        setDados]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [limiteEdit,   setLimiteEdit]   = useState(false);
  const [limiteVal,    setLimiteVal]    = useState(3);
  const [limiteSaving, setLimiteSaving] = useState(false);
  // Liberação de acesso
  const [modalLiberar, setModalLiberar] = useState(false);
  const [diasLiberar,  setDiasLiberar]  = useState(30);
  const [liberando,    setLiberando]    = useState(false);
  const [liberarMsg,   setLiberarMsg]   = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      setDados(resp.ok ? data : null);
      if (resp.ok) setLimiteVal(data.limite_operadores ?? 3);
    } catch { setDados(null); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [id]);

  async function restaurar() {
    if (!window.confirm("Restaurar este estabelecimento?")) return;
    const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/restaurar`, {
      method: "PUT", credentials: "include",
    });
    if (resp.ok) carregar();
    else alert("Erro ao restaurar.");
  }

  async function excluir() {
    if (!window.confirm(`Excluir "${dados?.nome_fantasia}"?`)) return;
    const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
      method: "DELETE", credentials: "include",
    });
    if (resp.ok) navigate("/admin");
    else alert("Erro ao excluir.");
  }

  async function salvarLimite() {
    setLimiteSaving(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/limite-operadores`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ limite: parseInt(limiteVal) || 0 }),
        credentials: "include",
      });
      if (resp.ok) {
        setDados(prev => ({ ...prev, limite_operadores: parseInt(limiteVal) }));
        setLimiteEdit(false);
      } else {
        alert("Erro ao salvar limite.");
      }
    } catch { alert("Erro interno."); }
    setLimiteSaving(false);
  }

  async function confirmarLiberar() {
    setLiberando(true);
    setLiberarMsg("");
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/liberar-acesso`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ dias: parseInt(diasLiberar), motivo: "Liberação manual pelo SuperAdmin" }),
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) { setLiberarMsg("❌ " + (json.error || "Erro.")); return; }
      setLiberarMsg(`✓ Liberado até ${new Date(json.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}`);
      carregar();
      setTimeout(() => { setModalLiberar(false); setLiberarMsg(""); }, 2000);
    } catch { setLiberarMsg("❌ Erro interno."); }
    setLiberando(false);
  }

  /* ── loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">
          <div className="est-loading">
            <div className="est-spinner" />
            Carregando...
          </div>
        </div>
      </LayoutAdmin>
    );
  }

  if (!dados) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">
          <div className="est-empty">
            <span className="est-empty-icon">⚠️</span>
            Estabelecimento não encontrado.
          </div>
          <button className="est-btn est-btn-ghost" onClick={() => navigate("/admin")}>
            ← Voltar
          </button>
        </div>
      </LayoutAdmin>
    );
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Estabelecimentos</span>
            <h1 className="est-page-title">
              Detalhes do <span>Estabelecimento</span>
            </h1>
          </div>
          <div className="est-page-actions">
            <button className="est-btn est-btn-ghost" onClick={() => navigate("/admin")}>
              ← Voltar ao painel
            </button>
          </div>
        </div>

        {/* HERO */}
        <div className="est-card" style={{ marginBottom: 16 }}>
          <div className="est-detail-hero">

            <div className="est-detail-logo-col">
              {dados.logo_url
                ? <img src={dados.logo_url} alt="Logo" className="est-detail-logo" />
                : (
                  <div className="est-detail-logo-placeholder">
                    {iniciais(dados.nome_fantasia)}
                  </div>
                )
              }
            </div>

            <div className="est-detail-info-col">
              <div className="est-detail-name">{dados.nome_fantasia}</div>
              {dados.email_contato && (
                <div className="est-detail-email">{dados.email_contato}</div>
              )}
              <div className="est-detail-meta">
                <span className={`est-badge est-badge-${(dados.status_assinatura || "indef").replace(/\s+/g, "-")}`}>
                  {dados.status_assinatura || "indefinido"}
                </span>
                {dados.data_vencimento && (
                  <span className="est-venc-label">
                    Vence em {dados.data_vencimento.split("-").reverse().join("/")}
                  </span>
                )}
              </div>
            </div>

            <div className="est-detail-actions-col">
              <button
                className="est-btn est-btn-outline"
                onClick={() => navigate(`/admin/estabelecimentos/${dados.id}`)}
              >
                ✏️ Editar
              </button>
              <button
                className="est-btn est-btn-blue"
                onClick={() => navigate(`/admin/estabelecimentos/${dados.id}/operadores`)}
              >
                👥 Operadores
              </button>
              {dados.status_assinatura === "excluida"
                ? <button className="est-btn est-btn-success" onClick={restaurar}>↩ Restaurar</button>
                : <button className="est-btn est-btn-danger"  onClick={excluir}>🗑 Excluir</button>
              }
            </div>

          </div>
        </div>

        {/* GRID DE INFO */}
        <div className="est-info-grid">          <div className="est-info-block">
            <div className="est-info-block-title">Dados da Empresa</div>
            {[
              { label: "CNPJ",     value: dados.cnpj,           mono: true  },
              { label: "Telefone", value: dados.telefone,        mono: true  },
              { label: "E-mail",   value: dados.email_contato,   mono: false },
            ].map(r => (
              <div className="est-info-row" key={r.label}>
                <span className="est-info-row-label">{r.label}</span>
                <span className={`est-info-row-value${r.mono ? " mono" : ""}`}>
                  {r.value || "—"}
                </span>
              </div>
            ))}
          </div>

          <div className="est-info-block">
            <div className="est-info-block-title">Endereço</div>
            <div className="est-info-row">
              <span className="est-info-row-label">Endereço</span>
              <span className="est-info-row-value">
                {dados.endereco_completo || "Não informado"}
              </span>
            </div>
          </div>

          <div className="est-info-block">
            <div className="est-info-block-title">Operadores</div>
            <div className="est-info-row" style={{ alignItems: 'center', gap: 8 }}>
              <span className="est-info-row-label">Limite</span>
              {limiteEdit ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="number"
                    min="0" max="50"
                    value={limiteVal}
                    onChange={e => setLimiteVal(e.target.value)}
                    style={{
                      width: 60, padding: '4px 8px', borderRadius: 7,
                      border: '1px solid #14b8a6', fontFamily: 'JetBrains Mono, monospace',
                      fontSize: '0.9rem', fontWeight: 700, textAlign: 'center',
                      background: 'var(--bg-input, #f8fafc)', color: 'inherit',
                    }}
                  />
                  <button className="est-btn est-btn-outline" style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    onClick={salvarLimite} disabled={limiteSaving}>
                    {limiteSaving ? '…' : '✓'}
                  </button>
                  <button className="est-btn est-btn-ghost" style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                    onClick={() => { setLimiteEdit(false); setLimiteVal(dados.limite_operadores ?? 3); }}>
                    ✕
                  </button>
                </div>
              ) : (
                <span
                  className="est-info-row-value mono"
                  style={{ cursor: 'pointer', color: 'var(--accent, #14b8a6)', textDecoration: 'underline dotted' }}
                  onClick={() => setLimiteEdit(true)}
                  title="Clique para editar"
                >
                  {dados.limite_operadores ?? 3} operador(es) ✏️
                </span>
              )}
            </div>
          </div>

          <div className="est-info-block">
            <div className="est-info-block-title">Assinatura</div>
            <div className="est-info-row">
              <span className="est-info-row-label">Status</span>
              <span className={`est-badge est-badge-${dados.status_assinatura}`}>
                {dados.status_assinatura}
              </span>
            </div>
            <div className="est-info-row" style={{ marginTop: 10 }}>
              <span className="est-info-row-label">Vencimento</span>
              <span className="est-info-row-value mono">
                {dados.data_vencimento
                  ? (() => {
                      const diff = (new Date(dados.data_vencimento + "T12:00:00") - new Date()) / (1000 * 60 * 60 * 24);
                      const dataFmt = dados.data_vencimento.split("-").reverse().join("/");
                      if (diff < 0)     return <span style={{ color: "#ef4444" }}>🔴 {dataFmt} (vencido)</span>;
                      if (diff <= 5)    return <span style={{ color: "#f59e0b" }}>🟡 {dataFmt} ({Math.ceil(diff)} dias)</span>;
                      return <span style={{ color: "#22c55e" }}>🟢 {dataFmt}</span>;
                    })()
                  : "—"}
              </span>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="est-btn est-btn-success"
                onClick={() => { setDiasLiberar(30); setLiberarMsg(""); setModalLiberar(true); }}
              >
                🔓 Liberar Acesso
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* MODAL LIBERAR ACESSO */}
      {modalLiberar && (
        <div className="est-modal-overlay" onClick={() => setModalLiberar(false)}>
          <div className="est-modal" onClick={e => e.stopPropagation()}>
            <div className="est-modal-titulo">🔓 Liberar Acesso</div>
            <div className="est-modal-subtitulo">
              <strong>{dados.nome_fantasia}</strong><br />
              Selecione por quantos dias deseja liberar o acesso.
            </div>

            <div className="est-form-group" style={{ marginTop: 16 }}>
              <label className="est-label">Período de liberação</label>
              <select
                className="est-select"
                value={diasLiberar}
                onChange={e => setDiasLiberar(e.target.value)}
                autoFocus
              >
                <option value={7}>7 dias</option>
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
                <option value={180}>6 meses</option>
                <option value={365}>1 ano</option>
              </select>
              <span className="est-label-hint" style={{ marginTop: 4 }}>
                Vencerá em: {(() => { const d = new Date(); d.setDate(d.getDate() + parseInt(diasLiberar)); return d.toLocaleDateString("pt-BR"); })()}
              </span>
            </div>

            {liberarMsg && (
              <div className={`est-alert ${liberarMsg.startsWith("✓") ? "est-alert-success" : "est-alert-error"}`} style={{ marginTop: 12 }}>
                {liberarMsg}
              </div>
            )}

            <div className="est-modal-acoes">
              <button className="est-btn est-btn-ghost" onClick={() => setModalLiberar(false)}>
                Cancelar
              </button>
              <button className="est-btn est-btn-success" onClick={confirmarLiberar} disabled={liberando}>
                {liberando ? "⏳ Liberando…" : "✓ Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </LayoutAdmin>
  );
}