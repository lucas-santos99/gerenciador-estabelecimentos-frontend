import React, { useEffect, useState } from "react";
import LayoutAdmin from "./Painel/LayoutAdmin";
import "./DashboardAdmin.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";
import { supabase } from "../../utils/supabaseClient";

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
  const [loading,        setLoading]        = useState(true);
  const [nomeUsuario,    setNomeUsuario]     = useState("");
  const [todasLista,     setTodasLista]      = useState([]);
  const [qtdExcluidas,   setQtdExcluidas]    = useState(0);
  const [filtro,         setFiltro]          = useState("");
  const [busca,          setBusca]           = useState("");
  const [filtroTipo,     setFiltroTipo]      = useState("");
  const [mostrarAlertas, setMostrarAlertas]  = useState(true);
  const [ordenacao,      setOrdenacao]       = useState({ campo: "", direcao: "asc" });

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
    if (filtro && m.status_assinatura !== filtro) return false;
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
    await fetch(`${API_URL}/admin/estabelecimentos/${id}`, { method: "DELETE" });
    carregarDados();
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
      <div className="dash-wrapper">

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
              <div className="alerta-item alerta-danger">
                🔴 {alertas.vencidos} estabelecimento{alertas.vencidos > 1 ? "s" : ""} com assinatura vencida
              </div>
            )}
            {alertas.proximos > 0 && (
              <div className="alerta-item alerta-warning">
                🟡 {alertas.proximos} vencendo nos próximos 5 dias
              </div>
            )}
          </div>
        )}

        {/* ── STAT CARDS ─────────────────────────────────── */}
        <div className="dash-cards">
          <div className="dash-stat-card card-total">
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Total</span>
                <span className="stat-value">{stats.total}</span>
              </div>
              <div className="stat-icon"><Icon.Building /></div>
            </div>
          </div>

          <div className="dash-stat-card card-ativas">
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Ativas</span>
                <span className="stat-value">{stats.ativas}</span>
              </div>
              <div className="stat-icon"><Icon.Check /></div>
            </div>
          </div>

          <div className="dash-stat-card card-inativas">
            <div className="stat-card-inner">
              <div className="stat-info">
                <span className="stat-label">Inativas</span>
                <span className="stat-value">{stats.inativas}</span>
              </div>
              <div className="stat-icon"><Icon.Pause /></div>
            </div>
          </div>

          <div className="dash-stat-card card-excluidas">
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
              placeholder="Buscar por nome ou CNPJ..."
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
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="bloqueada">Bloqueada</option>
            <option value="vencidas">Vencidas 🔴</option>
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
            <div style={{ overflowX: "auto" }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Logo</th>
                    <th className="sortable" onClick={() => ordenar("nome_fantasia")}>
                      Nome {iconSort("nome_fantasia")}
                    </th>
                    <th className="sortable" onClick={() => ordenar("tipo_estabelecimento")}>
                      Tipo {iconSort("tipo_estabelecimento")}
                    </th>
                    <th>CNPJ</th>
                    <th>Telefone</th>
                    <th className="sortable" onClick={() => ordenar("vencimento")}>
                      Vencimento {iconSort("vencimento")}
                    </th>
                    <th className="sortable" onClick={() => ordenar("status_assinatura")}>
                      Status {iconSort("status_assinatura")}
                    </th>
                    <th>Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {listaFiltrada.map(m => (
                    <tr key={m.id}>
                      {/* Logo */}
                      <td>
                        {m.logo_url
                          ? <img src={m.logo_url} className="logo-mini" alt={m.nome_fantasia} />
                          : <div className="logo-placeholder">{iniciais(m.nome_fantasia)}</div>
                        }
                      </td>

                      {/* Nome */}
                      <td className="td-nome">{m.nome_fantasia}</td>

                      {/* Tipo */}
                      <td>
                        <span className="badge-tipo">
                          {m.tipo_estabelecimento || "—"}
                        </span>
                      </td>

                      {/* CNPJ */}
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
                        {m.cnpj || "—"}
                      </td>

                      {/* Telefone */}
                      <td>{m.telefone || "—"}</td>

                      {/* Vencimento */}
                      <td>
                        <span className={`venc-text ${classVenc(m.data_vencimento)}`}>
                          {formatarData(m.data_vencimento) || "—"}
                        </span>
                      </td>

                      {/* Status */}
                      <td>
                        <span className={`badge badge-${m.status_assinatura}`}>
                          {m.status_assinatura}
                        </span>
                      </td>

                      {/* Ações */}
                      <td>
                        <div className="acoes-col">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/admin/estabelecimentos/${m.id}?view=details`)}
                            title="Detalhes"
                          >
                            <Icon.Eye /> Detalhes
                          </button>

                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => navigate(`/admin/estabelecimentos/${m.id}`)}
                            title="Editar"
                          >
                            <Icon.Edit /> Editar
                          </button>

                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => excluir(m.id, m.nome_fantasia)}
                            title="Excluir"
                          >
                            <Icon.Trash /> Excluir
                          </button>

                          <button
                            className="btn btn-blue btn-sm"
                            onClick={() => navigate(`/admin/estabelecimentos/${m.id}/operadores`)}
                            title="Operadores"
                          >
                            <Icon.Users /> Operadores
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </LayoutAdmin>
  );
}