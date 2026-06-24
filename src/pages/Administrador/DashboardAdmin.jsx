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

  // Modal configurações globais
  const [modalConfig,      setModalConfig]       = useState(false);
  // Modal liberação de acesso manual
  const [modalLiberar,     setModalLiberar]      = useState(null); // { id, nome }
  const [diasLiberar,      setDiasLiberar]       = useState(30);
  const [liberando,        setLiberando]         = useState(false);
  const [liberarMsg,       setLiberarMsg]        = useState("");
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
  const [limiteGlobal,     setLimiteGlobal]      = useState(3);
  const [limiteInput,      setLimiteInput]       = useState(3);
  const [salvandoConfig,   setSalvandoConfig]    = useState(false);
  const [configMsg,        setConfigMsg]         = useState("");

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

  async function abrirConfig() {
    setConfigMsg("");
    // Busca o valor antes de abrir para evitar piscar o padrão 3
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const resp = await fetch(`${API_URL}/superadmin/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const d = await resp.json();
        const val = d.limite_operadores_padrao ?? 3;
        setLimiteGlobal(val);
        setLimiteInput(val);
      }
    } catch (err) { console.error(err); }
    setModalConfig(true);
  }

  async function salvarConfig() {
    const val = parseInt(limiteInput);
    if (isNaN(val) || val < 0 || val > 50) {
      setConfigMsg("❌ Valor inválido (0–50)");
      return;
    }
    setSalvandoConfig(true);
    setConfigMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const resp = await fetch(`${API_URL}/superadmin/config`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ limite_operadores_padrao: val }),
      });
      const json = await resp.json();
      if (!resp.ok) { setConfigMsg("❌ " + (json.error || "Erro ao salvar")); return; }
      setLimiteGlobal(val);
      setConfigMsg("✓ Salvo! Novos estabelecimentos herdarão este limite.");
      setTimeout(() => setConfigMsg(""), 4000);
    } catch { setConfigMsg("❌ Erro interno"); }
    setSalvandoConfig(false);
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

  /* ── liberar acesso manual ──────────────────────────────── */
  async function confirmarLiberar() {
    if (!modalLiberar) return;
    setLiberando(true);
    setLiberarMsg("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${modalLiberar.id}/liberar-acesso`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ dias: parseInt(diasLiberar), motivo: "Liberação manual pelo SuperAdmin" }),
        }
      );
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
              className="btn btn-config"
              onClick={abrirConfig}
              title="Configurações globais do sistema"
            >
              <Icon.Config /> Configurações
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
                          <span className="dash-est-card-info-label">CNPJ</span> {m.cnpj}
                        </span>
                      )}
                      <span className={`dash-est-card-info venc-text ${classVenc(m.data_vencimento)}`}>
                        <span className="dash-est-card-info-label">Venc.</span> {formatarData(m.data_vencimento) || "Sem vencimento"}
                      </span>
                    </div>

                    {/* Ações */}
                    <div className="dash-est-card-acoes">
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
                      <button
                        className="dash-card-btn dash-card-btn--green"
                        onClick={() => { setDiasLiberar(30); setLiberarMsg(""); setModalLiberar({ id: m.id, nome: m.nome_fantasia }); }}
                        title="Liberar acesso"
                      >🔓 Liberar</button>
                      <button
                        className="dash-card-btn dash-card-btn--danger"
                        onClick={() => excluir(m.id, m.nome_fantasia)}
                        title="Excluir"
                      >🗑</button>
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
            <div className="dash-modal-icon">🔓</div>
            <div className="dash-modal-title">Liberar Acesso</div>
            <div className="dash-modal-subtitle">
              <strong>{modalLiberar.nome}</strong><br />
              Selecione por quantos dias deseja liberar o acesso.
              O sistema ativará o estabelecimento automaticamente.
            </div>

            <div className="dash-config-item">
              <div className="dash-config-info">
                <span className="dash-config-label">⏱ Período de liberação</span>
                <span className="dash-config-desc">
                  A data de vencimento será atualizada a partir de hoje.
                </span>
              </div>
              <div className="dash-config-control">
                <select
                  className="dash-config-input"
                  style={{ width: "auto", padding: "6px 10px" }}
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
                <span className="dash-config-unit" style={{ marginLeft: 8, fontSize: "0.8rem", opacity: 0.7 }}>
                  até {(() => { const d = new Date(); d.setDate(d.getDate() + parseInt(diasLiberar)); return d.toLocaleDateString("pt-BR"); })()}
                </span>
              </div>
            </div>

            {liberarMsg && (
              <div className={`dash-config-msg ${liberarMsg.startsWith("✓") ? "sucesso" : "erro"}`}>
                {liberarMsg}
              </div>
            )}

            <div className="dash-modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalLiberar(null)}>
                Cancelar
              </button>
              <button
                className="btn btn-teal"
                onClick={confirmarLiberar}
                disabled={liberando}
              >
                {liberando ? "⏳ Liberando…" : "🔓 Confirmar Liberação"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIG GLOBAL ────────────────────────────── */}
      {modalConfig && (
        <div className="dash-modal-overlay" onClick={() => setModalConfig(false)}>
          <div className="dash-modal" onClick={e => e.stopPropagation()}>
            <div className="dash-modal-icon">⚙️</div>
            <div className="dash-modal-title">Configurações Globais</div>
            <div className="dash-modal-subtitle">
              Parâmetros padrão aplicados a <strong>novos</strong> estabelecimentos.
              Estabelecimentos existentes não são afetados.
            </div>

            <div className="dash-config-item">
              <div className="dash-config-info">
                <span className="dash-config-label">👥 Limite padrão de operadores</span>
                <span className="dash-config-desc">
                  Novos estabelecimentos criados herdarão este limite automaticamente.
                  Para alterar individualmente, use ✏️ Editar no estabelecimento.
                </span>
              </div>
              <div className="dash-config-control">
                <input
                  className="dash-config-input"
                  type="number"
                  min="0"
                  max="50"
                  value={limiteInput}
                  onChange={e => setLimiteInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && salvarConfig()}
                  autoFocus
                />
                <span className="dash-config-unit">operadores</span>
              </div>
            </div>

            {configMsg && (
              <div className={`dash-config-msg ${configMsg.startsWith('✓') ? 'sucesso' : 'erro'}`}>
                {configMsg}
              </div>
            )}

            <div className="dash-modal-actions">
              <button className="btn btn-ghost" onClick={() => setModalConfig(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-teal"
                onClick={salvarConfig}
                disabled={salvandoConfig || parseInt(limiteInput) === limiteGlobal}
              >
                {salvandoConfig ? "⏳ Salvando…" : "✓ Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

    </LayoutAdmin>
  );
}