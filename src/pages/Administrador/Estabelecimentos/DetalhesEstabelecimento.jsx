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
  const [modalLiberar,  setModalLiberar]  = useState(false);
  const [diasLiberar,   setDiasLiberar]   = useState(30);
  const [formaPgto,     setFormaPgto]     = useState("dinheiro");
  const [motivoLiberar, setMotivoLiberar] = useState("");
  const [liberando,     setLiberando]     = useState(false);
  const [liberarMsg,    setLiberarMsg]    = useState("");
  // Histórico de liberações
  const [historico,     setHistorico]     = useState([]);
  const [loadHistorico, setLoadHistorico] = useState(false);

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

  useEffect(() => { carregar(); carregarHistorico(); }, [id]);

  async function carregarHistorico() {
    setLoadHistorico(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/liberacoes`, {
        credentials: "include",
      });
      if (resp.ok) setHistorico(await resp.json());
    } catch {}
    setLoadHistorico(false);
  }

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
        body:    JSON.stringify({
          dias:            parseInt(diasLiberar),
          forma_pagamento: formaPgto,
          motivo:          motivoLiberar.trim() || null,
          liberado_por:    "SuperAdmin",
        }),
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) { setLiberarMsg("❌ " + (json.error || "Erro.")); return; }
      setLiberarMsg(`✓ Liberado até ${new Date(json.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}`);
      carregar();
      carregarHistorico();
      setTimeout(() => { setModalLiberar(false); setLiberarMsg(""); setMotivoLiberar(""); setFormaPgto("dinheiro"); }, 2000);
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
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="est-btn est-btn-success"
                onClick={() => { setDiasLiberar(30); setFormaPgto("dinheiro"); setMotivoLiberar(""); setLiberarMsg(""); setModalLiberar(true); }}
              >
                🔓 Liberar Acesso
              </button>
              {dados.status_assinatura === "ativa" && (
                <button
                  className="est-btn est-btn-danger"
                  onClick={async () => {
                    if (!window.confirm(`Bloquear acesso de "${dados.nome_fantasia}"?`)) return;
                    const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/bloquear-acesso`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ motivo: "Bloqueio manual pelo SuperAdmin" }),
                      credentials: "include",
                    });
                    if (resp.ok) carregar();
                    else alert("Erro ao bloquear.");
                  }}
                >
                  🔴 Bloquear Acesso
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* HISTÓRICO DE LIBERAÇÕES */}
      <div className="est-card" style={{ marginTop: 16 }}>
        <div className="est-info-block-title" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
          📋 Histórico de Liberações
        </div>
        {loadHistorico ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: "0.85rem" }}>Carregando...</div>
        ) : historico.length === 0 ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: "0.85rem" }}>Nenhuma liberação registrada.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="est-table" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Período</th>
                  <th>Vencimento</th>
                  <th>Pagamento</th>
                  <th>Motivo</th>
                  <th>Liberado por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
                      {new Date(h.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace" }}>{h.dias}d</td>
                    <td style={{ fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>
                      {h.data_vencimento?.split("-").reverse().join("/")}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: 999,
                        fontSize: "0.72rem", fontWeight: 700,
                        background: h.forma_pagamento === "cortesia" ? "rgba(245,158,11,0.12)" :
                                    h.forma_pagamento === "pix"      ? "rgba(20,184,166,0.12)" :
                                    h.forma_pagamento === "cartao"   ? "rgba(99,102,241,0.12)" :
                                    "rgba(107,114,128,0.12)",
                        color: h.forma_pagamento === "cortesia" ? "#b45309" :
                               h.forma_pagamento === "pix"      ? "#0d9488" :
                               h.forma_pagamento === "cartao"   ? "#4338ca" :
                               "#6b7280",
                      }}>
                        {h.forma_pagamento}
                      </span>
                    </td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.motivo || <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td>{h.liberado_por}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

            {/* Período */}
            <div className="est-form-group" style={{ marginTop: 4 }}>
              <label className="est-label">⏱ Período de liberação</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "6px 0" }}>
                {[7,15,30,60,90,180,365].map(d => (
                  <button key={d} type="button"
                    onClick={() => setDiasLiberar(d)}
                    style={{
                      padding: "4px 10px", borderRadius: 20, border: "1px solid",
                      borderColor: parseInt(diasLiberar) === d ? "#14b8a6" : "var(--border, #e5e7eb)",
                      background: parseInt(diasLiberar) === d ? "#14b8a6" : "transparent",
                      color: parseInt(diasLiberar) === d ? "#fff" : "inherit",
                      fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                    }}>
                    {d === 365 ? "1 ano" : d === 180 ? "6 meses" : `${d}d`}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input className="est-input" type="number" min={1} max={3650}
                  value={diasLiberar} onChange={e => setDiasLiberar(e.target.value)}
                  style={{ width: 80 }} autoFocus />
                <span style={{ fontSize: "0.8rem" }}>dias</span>
                <span style={{ fontSize: "0.8rem", color: "#14b8a6", fontWeight: 600 }}>
                  → {(() => { const d = new Date(); d.setDate(d.getDate() + (parseInt(diasLiberar)||0)); return d.toLocaleDateString("pt-BR"); })()}
                </span>
              </div>
            </div>

            {/* Forma de pagamento */}
            <div className="est-form-group">
              <label className="est-label">💰 Forma de pagamento</label>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                {[
                  { key: "dinheiro", label: "💵 Dinheiro" },
                  { key: "pix",      label: "📱 Pix" },
                  { key: "cartao",   label: "💳 Cartão" },
                  { key: "cortesia", label: "🎁 Cortesia" },
                  { key: "manual",   label: "📋 Outro" },
                ].map(f => (
                  <button key={f.key} type="button" onClick={() => setFormaPgto(f.key)}
                    style={{
                      padding: "4px 10px", borderRadius: 20, border: "1px solid",
                      borderColor: formaPgto === f.key ? "#14b8a6" : "var(--border, #e5e7eb)",
                      background: formaPgto === f.key ? "#14b8a6" : "transparent",
                      color: formaPgto === f.key ? "#fff" : "inherit",
                      fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                      fontFamily: "Plus Jakarta Sans, sans-serif",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Motivo */}
            <div className="est-form-group">
              <label className="est-label">📝 Motivo <span style={{ opacity: 0.5, fontWeight: 400 }}>(opcional)</span></label>
              <textarea className="est-input" rows={2}
                placeholder="Ex: Pagou em dinheiro, período de teste, cortesia..."
                value={motivoLiberar} onChange={e => setMotivoLiberar(e.target.value)}
                style={{ resize: "none", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: "0.85rem" }} />
            </div>

            {liberarMsg && (
              <div className={`est-alert ${liberarMsg.startsWith("✓") ? "est-alert-success" : "est-alert-error"}`}>
                {liberarMsg}
              </div>
            )}

            <div className="est-modal-acoes">
              <button className="est-btn est-btn-ghost" onClick={() => setModalLiberar(false)}>Cancelar</button>
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