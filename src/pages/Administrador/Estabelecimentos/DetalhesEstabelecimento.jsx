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

  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      setDados(resp.ok ? data : null);
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
        <div className="est-info-grid">
          <div className="est-info-block">
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
                  ? dados.data_vencimento.split("-").reverse().join("/")
                  : "—"}
              </span>
            </div>
          </div>
        </div>

      </div>
    </LayoutAdmin>
  );
}