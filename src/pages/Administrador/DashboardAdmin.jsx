import React, { useEffect, useState } from "react";
import LayoutAdmin from "./Painel/LayoutAdmin";
import "./DashboardAdmin.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";
import { supabase } from "../../utils/supabaseClient";
import { apiFetch } from "../../utils/api";

/* ── ícones inline leves (sem dep. extra) ─────────────────── */
const Icon = {
  Building:    () => <span>🏢</span>,
  Check:       () => <span>✓</span>,
  Pause:       () => <span>⏸</span>,
  Trash:       () => <span>🗑</span>,
  Plus:        () => <span>+</span>,
  Crown:       () => <span>👑</span>,
  Eye:         () => <span>👁</span>,
  Search:      () => <span style={{ fontSize:"0.8rem" }}>🔍</span>,
  Bell:        () => <span>🔔</span>,
  ChevronUp:   () => <span style={{ fontSize:"0.7rem" }}>▲</span>,
  ChevronDown: () => <span style={{ fontSize:"0.7rem" }}>▼</span>,
  Sort:        () => <span style={{ fontSize:"0.65rem", opacity:0.6 }}>⬍</span>,
  Edit:        () => <span>✏️</span>,
  Users:       () => <span>👥</span>,
  Config:      () => <span>⚙️</span>,
};

/* ── helpers ──────────────────────────────────────────────── */
function formatarData(dataStr) {
  if (!dataStr) return null;
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

function calcularDiff(dataStr) {
  if (!dataStr) return null;
  const venc = new Date(dataStr + "T12:00:00");
  return (venc - new Date()) / (1000 * 60 * 60 * 24);
}

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

/* ═══════════════════════════════════════════════════════════ */
export default function DashboardAdmin() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const API_URL    = import.meta.env.VITE_API_URL;

  /* ── state ─────────────────────────────────────────────── */
  const [loading,          setLoading]          = useState(true);
  const [nomeUsuario,      setNomeUsuario]       = useState("");
  const [todasLista,       setTodasLista]        = useState([]);
  const [qtdExcluidas,     setQtdExcluidas]      = useState(0);
  const [filtro,           setFiltro]            = useState("");
  const [busca,            setBusca]             = useState("");
  const [filtroTipo,       setFiltroTipo]        = useState("");
  const [mostrarAlertas,   setMostrarAlertas]    = useState(true);
  const [ordenacao,        setOrdenacao]         = useState({ campo: "", direcao: "asc" });

  // Modal liberação de acesso manual
  const [modalLiberar,     setModalLiberar]      = useState(null); // { id, nome }
  const [diasLiberar,      setDiasLiberar]       = useState(30);
  const [formaPgto,        setFormaPgto]         = useState("dinheiro");
  const [motivoLiberar,    setMotivoLiberar]     = useState("");
  const [liberando,        setLiberando]         = useState(false);
  const [liberarMsg,       setLiberarMsg]        = useState("");
  // Modal bloqueio de acesso manual
  const [modalBloquear,    setModalBloquear]     = useState(null); // { id, nome }
  const [motivoBloquear,   setMotivoBloquear]    = useState("");
  const [bloqueando,       setBloqueando]        = useState(false);
  const [bloquearMsg,      setBloquearMsg]       = useState("");
  const [fontScale,        setFontScale]         = useState(() => {
    const s = localStorage.getItem('dash-font-scale');
    return s ? parseFloat(s) : 1;
  });

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('dash-font-scale', next);
      return next;
    });
  }
  /* ── carregar dados ─────────────────────────────────────── */
  async function carregarDados() {
    try {
      setLoading(true);
      const [r1, r2] = await Promise.all([
        fetch(`${API_URL}/admin/estabelecimentos/listar`),
        fetch(`${API_URL}/admin/estabelecimentos/excluidas`),
      ]);
      const lista    = (await r1.json()) || [];
      const excluidas = (await r2.json()) || [];
      setTodasLista(lista);
      setQtdExcluidas(excluidas.length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, []);

  useEffect(() => {
    async function buscarNome() {
      if (!user?.id) return;
      const { data } = await supabase
        .from("profiles").select("nome").eq("id", user.id).single();
      setNomeUsuario(data?.nome || user.email);
    }
    buscarNome();
  }, [user]);

  /* ── ordenação ──────────────────────────────────────────── */
  function ordenar(campo) {
    const direcao =
      ordenacao.campo === campo && ordenacao.direcao === "asc" ? "desc" : "asc";
    setOrdenacao({ campo, direcao });

    const sorted = [...todasLista].sort((a, b) => {
      let vA, vB;
      if (campo === "vencimento") {
        vA = a.data_vencimento ? new Date(a.data_vencimento + "T12:00:00") : new Date(0);
        vB = b.data_vencimento ? new Date(b.data_vencimento + "T12:00:00") : new Date(0);
      } else {
        vA = (a[campo] || "").toString().toLowerCase();
        vB = (b[campo] || "").toString().toLowerCase();
      }
      if (vA < vB) return direcao === "asc" ? -1 : 1;
      if (vA > vB) return direcao === "asc" ? 1  : -1;
      return 0;
    });
    setTodasLista(sorted);
  }

  function iconSort(campo) {
    if (ordenacao.campo !== campo) return <Icon.Sort />;
    return ordenacao.direcao === "asc"
      ? <Icon.ChevronUp />
      : <Icon.ChevronDown />;
  }

  /* ── alertas ────────────────────────────────────────────── */
  const alertas = todasLista.reduce(
    (acc, m) => {
      const diff = calcularDiff(m.data_vencimento);
      if (diff === null) return acc;
      if (diff < 0)      acc.vencidos++;
      else if (diff <= 5) acc.proximos++;
      return acc;
    },
    { vencidos: 0, proximos: 0 }
  );

  /* ── stats ──────────────────────────────────────────────── */
  const base = filtroTipo
    ? todasLista.filter(m => m.tipo_estabelecimento === filtroTipo)
    : todasLista;

  const stats = {
    total:     base.length,
    ativas:    base.filter(m => m.status_assinatura === "ativa").length,
    inativas:  base.filter(m => ["inativa","bloqueada"].includes(m.status_assinatura)).length,
    excluidas: qtdExcluidas,
  };

  /* ── lista filtrada ─────────────────────────────────────── */
  const listaFiltrada = todasLista.filter(m => {
    if (filtroTipo && m.tipo_estabelecimento !== filtroTipo) return false;
    if (filtro === "vencidas") {
      const diff = calcularDiff(m.data_vencimento);
      return diff !== null && diff < 0;
    }
    if (filtro === "proximos") {
      const diff = calcularDiff(m.data_vencimento);
      return diff !== null && diff >= 0 && diff <= 5;
    }
    if (filtro === "inativas") {
      if (!["inativa", "bloqueada"].includes(m.status_assinatura)) return false;
    } else if (filtro && m.status_assinatura !== filtro) {
      return false;
    }
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      (m.nome_fantasia || "").toLowerCase().includes(q) ||
      (m.cnpj || "").toLowerCase().includes(q)
    );
  });

  const tiposUnicos = [...new Set(todasLista.map(m => m.tipo_estabelecimento).filter(Boolean))];

  /* ── excluir ────────────────────────────────────────────── */
  async function excluir(id, nome) {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    await apiFetch(`/admin/estabelecimentos/${id}`, { method: "DELETE" });
    carregarDados();
  }

  async function confirmarBloquear() {
    if (!modalBloquear) return;
    const motivo = motivoBloquear.trim();
    if (motivo.length < 3) {
      setBloquearMsg("❌ Informe o motivo do bloqueio (mínimo 3 caracteres).");
      return;
    }
    setBloqueando(true);
    setBloquearMsg("");
    try {
      const resp = await apiFetch(`/admin/estabelecimentos/${modalBloquear.id}/bloquear-acesso`, {
        method: "POST",
        body:   JSON.stringify({ motivo }),
      });
      const json = await resp.json();
      if (!resp.ok) { setBloquearMsg("❌ " + (json.error || "Erro ao bloquear.")); return; }
      setBloquearMsg("✓ Acesso bloqueado.");
      carregarDados();
      setTimeout(() => { setModalBloquear(null); setBloquearMsg(""); }, 1500);
    } catch { setBloquearMsg("❌ Erro interno."); }
    setBloqueando(false);
  }

  async function confirmarLiberar() {
    if (!modalLiberar) return;
    setLiberando(true);
    setLiberarMsg("");
    try {
      const resp = await apiFetch(`/admin/estabelecimentos/${modalLiberar.id}/liberar-acesso`, {
        method: "POST",
        body:   JSON.stringify({
          dias:            parseInt(diasLiberar) || 30,
          forma_pagamento: formaPgto,
          motivo:          motivoLiberar.trim() || null,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) { setLiberarMsg("❌ " + (json.error || "Erro ao liberar.")); return; }
      setLiberarMsg(`✓ Liberado até ${new Date(json.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}`);
      carregarDados();
      setTimeout(() => { setModalLiberar(null); setLiberarMsg(""); }, 2000);
    } catch { setLiberarMsg("❌ Erro interno."); }
    setLiberando(false);
  }

  /* ── cor de vencimento ──────────────────────────────────── */
  function classVenc(dataStr) {
    const diff = calcularDiff(dataStr);
    if (diff === null) return "venc-nd";
    if (diff < 0)      return "venc-vencido";
    if (diff <= 5)     return "venc-alerta";
    return "venc-ok";
  }

  /* ── loading ────────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="dash-loading">
          <div className="spinner" />
          <span>Carregando painel...</span>
        </div>
      </LayoutAdmin>
    );
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="dash-wrapper" style={{ "--dash-font-scale": fontScale }}>

        {/* ── HEADER ─────────────────────────────────────── */}
        <div className="dash-header">
          <div className="dash-header-left">
            <span className="dash-saudacao">
              👋 Olá, {nomeUsuario}
            </span>
            <h1 className="dash-title">
              Painel <span>Administrativo</span>
            </h1>
          </div>

          <div className="dash-actions">
            <button
              className="btn btn-teal"
              onClick={() => navigate("/admin/estabelecimentos/nova")}
            >
              <Icon.Plus /> Novo Estabelecimento
            </button>

            <button
              className="btn btn-purple"
              onClick={() => navigate("/admin/superadmins")}
            >
              <Icon.Crown /> Novo SuperAdmin
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/admin/estabelecimentos/excluidas")}
            >
              <Icon.Trash /> Ver Excluídas
            </button>
            <button className="btn btn-ghost btn-sm dash-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="btn btn-ghost btn-sm dash-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
          </div>
        </div>

        {/* ── ALERTAS ────────────────────────────────────── */}
        <div className="dash-alertas-toggle">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setMostrarAlertas(p => !p)}
          >
            <Icon.Bell />
            {mostrarAlertas ? "Ocultar alertas" : "Mostrar alertas"}
            {mostrarAlertas ? <Icon.ChevronUp /> : <Icon.ChevronDown />}
          </button>
        </div>

        {mostrarAlertas && (alertas.vencidos > 0 || alertas.proximos > 0) && (
          <div className="dash-alertas-box">
            {alertas.vencidos > 0 && (
              <div
                className="alerta-item alerta-danger"
                onClick={() => { setFiltro("vencidas"); setFiltroTipo(""); }}
                style={{ cursor: "pointer" }}
                title="Ver estabelecimentos com assinatura vencida"
              >
                🔴 {alertas.vencidos} estabelecimento{alertas.vencidos > 1 ? "s" : ""} com assinatura vencida
              </div>
            )}
            {alertas.proximos > 0 && (
              <div
                className="alerta-item alerta-warning"
                onClick={() => { setFiltro("proximos"); setFiltroTipo(""); }}
                style={{ cursor: "pointer" }}
                title="Ver estabelecimentos vencendo em breve"
              >
                🟡 {alertas.proximos} vencendo nos próximos 5 dias
              </div>
            )}
          </div>
        )}

        {/* ── STAT CARDS ─────────────────────────────────── */}
        <div className="dash-cards">
          <div
            className="dash-stat-card card-total"
            onClick={() => { setFiltro(""); setFiltroTipo(""); setBusca(""); }}
            style={{ cursor: "pointer" }}
            title="Ver todos os estabelecimentos"
          >
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Total</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-icon"><Icon.Building /></div>
            </div>
          </div>

          <div
            className="dash-stat-card card-ativas"
            onClick={() => { setFiltro("ativa"); setFiltroTipo(""); }}
            style={{ cursor: "pointer" }}
            title="Ver estabelecimentos ativos"
          >
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Ativas</span>
                <span className="stat-value">{stats.ativas}</span>
              </div>
              <div className="stat-icon"><Icon.Check /></div>
            </div>
          </div>

          <div
            className="dash-stat-card card-inativas"
            onClick={() => { setFiltro("inativas"); setFiltroTipo(""); }}
            style={{ cursor: "pointer" }}
            title="Ver estabelecimentos inativos ou bloqueados"
          >
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Inativas</span>
                <span className="stat-value">{stats.inativas}</span>
              </div>
              <div className="stat-icon"><Icon.Pause /></div>
            </div>
          </div>

          <div
            className="dash-stat-card card-excluidas"
            onClick={() => navigate("/admin/estabelecimentos/excluidas")}
            style={{ cursor: "pointer" }}
            title="Ver estabelecimentos excluídos"
          >
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Excluídas</span>
                <span className="stat-value">{stats.excluidas}</span>
              </div>
              <div className="stat-icon"><Icon.Trash /></div>
            </div>
          </div>
        </div>

        {/* ── FILTROS ────────────────────────────────────── */}
        <div className="dash-filters">
          <div className="search-wrap">
            <span className="search-icon"><Icon.Search /></span>
            <input
              className="dash-input"
              placeholder="Buscar por nome ou CPF/CNPJ..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          <select
            className="dash-select"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="ativa">Ativa 🟢</option>
            <option value="inativa">Inativa 🟡</option>
            <option value="bloqueada">Bloqueada 🟠</option>
            <option value="inativas">Inativas + Bloqueadas 🟡🟠</option>
            <option value="vencidas">Vencidas 🔴</option>
            <option value="proximos">Vencendo em breve 🟡</option>
          </select>

          <select
            className="dash-select"
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
          >
            <option value="">Todos os tipos</option>
            {tiposUnicos.map((tipo, i) => (
              <option key={i} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>

        {/* ── TABELA ─────────────────────────────────────── */}
        <div className="dash-box">
          <div className="dash-box-header">
            <span className="dash-box-title">Estabelecimentos</span>
            <span className="dash-count-badge">{listaFiltrada.length}</span>
          </div>

          {listaFiltrada.length === 0 ? (
            <div className="dash-empty">
              Nenhum estabelecimento encontrado com os filtros aplicados.
            </div>
          ) : (
            <>
              {/* Ordenação por campo */}
              <div className="dash-sort-bar">
                <span className="dash-sort-label">Ordenar:</span>
                {[
                  { key: "nome_fantasia", label: "Nome" },
                  { key: "status_assinatura", label: "Status" },
                  { key: "vencimento", label: "Vencimento" },
                  { key: "tipo_estabelecimento", label: "Tipo" },
                ].map(s => (
                  <button
                    key={s.key}
                    className={`dash-sort-btn${ordenacao.campo === s.key ? " ativo" : ""}`}
                    onClick={() => ordenar(s.key)}
                  >
                    {s.label} {iconSort(s.key)}
                  </button>
                ))}
              </div>

              <div className="dash-cards-grid">
                {listaFiltrada.map(m => (
                  <div key={m.id} className={`dash-est-card dash-est-card--${m.status_assinatura}`}>

                    {/* Topo: logo + nome + tipo + status */}
                    <div className="dash-est-card-topo">
                      <div className="dash-est-card-logo">
                        {m.logo_url
                          ? <img src={m.logo_url} className="logo-mini" alt={m.nome_fantasia} />
                          : <div className="logo-placeholder">{iniciais(m.nome_fantasia)}</div>
                        }
                      </div>
                      <div className="dash-est-card-identidade">
                        <span className="dash-est-card-nome">{m.nome_fantasia}</span>
                        <div className="dash-est-card-badges">
                          <span className="badge-tipo">{m.tipo_estabelecimento || "—"}</span>
                          <span className={`badge badge-${m.status_assinatura}`}>{m.status_assinatura}</span>
                        </div>
                      </div>
                    </div>

                    {/* Infos secundárias */}
                    <div className="dash-est-card-infos">
                      {m.telefone && (
                        <span className="dash-est-card-info">
                          <span className="dash-est-card-info-label">Tel</span> {m.telefone}
                        </span>
                      )}
                      {m.cnpj && (
                        <span className="dash-est-card-info mono">
                          <span className="dash-est-card-info-label">CPF/CNPJ</span> {m.cnpj}
                        </span>
                      )}
                      <span className={`dash-est-card-info venc-text ${classVenc(m.data_vencimento)}`}>
                        <span className="dash-est-card-info-label">Venc.</span> {formatarData(m.data_vencimento) || "Sem vencimento"}
                      </span>
                    </div>

                    {/* Ações */}
                    <div className="dash-est-card-acoes">
                      <div className="dash-card-acoes-linha">
                        <button
                          className="dash-card-btn dash-card-btn--ghost"
                          onClick={() => navigate(`/admin/estabelecimentos/${m.id}?view=details`)}
                        >👁 Detalhes</button>
                        <button
                          className="dash-card-btn dash-card-btn--outline"
                          onClick={() => navigate(`/admin/estabelecimentos/${m.id}`)}
                        >✏️ Editar</button>
                        <button
                          className="dash-card-btn dash-card-btn--blue"
                          onClick={() => navigate(`/admin/estabelecimentos/${m.id}/operadores`)}
                        >👥 Operadores</button>
                      </div>
                      <div className="dash-card-acoes-linha">
                        <button
                          className="dash-card-btn dash-card-btn--green"
                          onClick={() => { setDiasLiberar(30); setFormaPgto("dinheiro"); setMotivoLiberar(""); setLiberarMsg(""); setModalLiberar({ id: m.id, nome: m.nome_fantasia }); }}
                        >🔓 Liberar</button>
                        {m.status_assinatura === "ativa" && (
                          <button
                            className="dash-card-btn dash-card-btn--warning"
                            onClick={() => { setMotivoBloquear(""); setBloquearMsg(""); setModalBloquear({ id: m.id, nome: m.nome_fantasia }); }}
                            title="Bloquear acesso"
                          >🔴 Bloquear</button>
                        )}
                        <button
                          className="dash-card-btn dash-card-btn--danger"
                          onClick={() => excluir(m.id, m.nome_fantasia)}
                        >🗑 Excluir</button>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── MODAL LIBERAR ACESSO ───────────────────────────── */}
      {modalLiberar && (
        <div className="dash-modal-overlay" onClick={() => setModalLiberar(null)}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-icon" style={{ background: "rgba(34,197,94,0.12)", fontSize: "1.4rem" }}>🔓</div>
            <div className="dash-modal-title">Liberar Acesso</div>
            <div className="dash-modal-subtitle">
              <strong>{modalLiberar.nome}</strong> — selecione por quantos dias liberar.
            </div>

            {/* Período */}
            <div className="dash-config-label" style={{ fontSize: "0.78rem", marginBottom: 6 }}>⏱ Período de liberação</div>
            <div className="dash-dias-atalhos" style={{ marginBottom: 8 }}>
              {[7, 15, 30, 60, 90, 180, 365].map(d => (
                <button key={d} type="button"
                  className={`dash-dias-btn${parseInt(diasLiberar) === d ? " ativo" : ""}`}
                  onClick={() => setDiasLiberar(d)}>
                  {d === 365 ? "1 ano" : d === 180 ? "6 meses" : `${d}d`}
                </button>
              ))}
            </div>
            <div className="dash-dias-input-row" style={{ marginBottom: 16 }}>
              <input className="dash-config-input" type="number" min={1} max={3650}
                value={diasLiberar} onChange={e => setDiasLiberar(e.target.value)}
                autoFocus style={{ width: 80 }} />
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>dias</span>
              <span style={{ fontSize: "0.82rem", color: "var(--text-accent)", fontWeight: 600 }}>
                → {(() => { const d = new Date(); d.setDate(d.getDate() + (parseInt(diasLiberar) || 0)); return d.toLocaleDateString("pt-BR"); })()}
              </span>
            </div>

            {/* Forma de pagamento */}
            <div className="dash-config-label" style={{ fontSize: "0.78rem", marginBottom: 6 }}>💰 Forma de pagamento</div>
            <div className="dash-dias-atalhos" style={{ marginBottom: 16 }}>
              {[
                { key: "dinheiro",  label: "💵 Dinheiro" },
                { key: "pix",       label: "📱 Pix" },
                { key: "cartao",    label: "💳 Cartão" },
                { key: "cortesia",  label: "🎁 Cortesia" },
                { key: "manual",    label: "📋 Outro" },
              ].map(f => (
                <button key={f.key} type="button"
                  className={`dash-dias-btn${formaPgto === f.key ? " ativo" : ""}`}
                  onClick={() => setFormaPgto(f.key)}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Motivo */}
            <div className="dash-config-label" style={{ fontSize: "0.78rem", marginBottom: 6 }}>📝 Motivo <span style={{ opacity: 0.5, fontWeight: 400 }}>(opcional)</span></div>
            <textarea
              className="dash-config-input"
              rows={2}
              placeholder="Ex: Pagou em dinheiro na visita, período de teste, cortesia..."
              value={motivoLiberar}
              onChange={e => setMotivoLiberar(e.target.value)}
              style={{ width: "100%", resize: "none", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: "0.82rem", padding: "8px 10px", borderRadius: 8, boxSizing: "border-box", marginBottom: 4 }}
            />

            {liberarMsg && (
              <div className={`dash-config-msg ${liberarMsg.startsWith("✓") ? "sucesso" : "erro"}`}>
                {liberarMsg}
              </div>
            )}

            <div className="dash-modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalLiberar(null)}>Cancelar</button>
              <button className="btn btn-teal" onClick={confirmarLiberar} disabled={liberando || !diasLiberar}>
                {liberando ? "⏳ Liberando…" : "🔓 Confirmar Liberação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL BLOQUEAR ACESSO ──────────────────────────── */}
      {modalBloquear && (
        <div className="dash-modal-overlay" onClick={() => setModalBloquear(null)}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-icon" style={{ background: "rgba(239,68,68,0.12)", fontSize: "1.4rem" }}>🔴</div>
            <div className="dash-modal-title">Bloquear Acesso</div>
            <div className="dash-modal-subtitle">
              <strong>{modalBloquear.nome}</strong> ficará sem acesso ao sistema até ser liberado novamente.
            </div>

            {/* Motivo — obrigatório */}
            <div className="dash-config-label" style={{ fontSize: "0.78rem", marginBottom: 6 }}>
              📝 Motivo <span style={{ color: "var(--text-danger)", fontWeight: 700 }}>*</span>
            </div>
            <textarea
              className="dash-config-input"
              rows={3}
              placeholder="Ex: Inadimplência, solicitação do cliente, teste encerrado..."
              value={motivoBloquear}
              onChange={e => setMotivoBloquear(e.target.value)}
              autoFocus
              style={{ width: "100%", resize: "none", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: "0.82rem", padding: "8px 10px", borderRadius: 8, boxSizing: "border-box", marginBottom: 4 }}
            />

            {bloquearMsg && (
              <div className={`dash-config-msg ${bloquearMsg.startsWith("✓") ? "sucesso" : "erro"}`}>
                {bloquearMsg}
              </div>
            )}

            <div className="dash-modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalBloquear(null)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: "linear-gradient(135deg, #991b1b, #ef4444)", color: "#fff" }}
                onClick={confirmarBloquear}
                disabled={bloqueando || motivoBloquear.trim().length < 3}
              >
                {bloqueando ? "⏳ Bloqueando…" : "🔴 Confirmar Bloqueio"}
              </button>
            </div>
          </div>
        </div>
      )}

    </LayoutAdmin>
  );
}