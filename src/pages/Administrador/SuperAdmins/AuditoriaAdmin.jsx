// src/pages/Administrador/SuperAdmins/AuditoriaAdmin.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { supabase } from "../../../utils/supabaseClient";
import "./AuditoriaAdmin.css";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

const ESCOPOS = [
  { value: "",                 label: "Todos os escopos" },
  { value: "admin_global",     label: "🛠️ Ações do painel admin" },
  { value: "estabelecimento",  label: "🏢 Ações dentro do estabelecimento" },
  { value: "login",            label: "🔑 Logins" },
];

function badgeCorEscopo(escopo) {
  if (escopo === "admin_global")    return { bg: "rgba(139,92,246,0.12)", cor: "#8b5cf6" };
  if (escopo === "login")           return { bg: "rgba(59,130,246,0.12)", cor: "#3b82f6" };
  return { bg: "rgba(20,184,166,0.12)", cor: "#14b8a6" };
}

const LIMIT = 30;

export default function AuditoriaAdmin() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [registros,   setRegistros]   = useState([]);
  const [total,        setTotal]       = useState(0);
  const [loading,      setLoading]     = useState(true);
  const [erro,         setErro]        = useState("");
  const [estabs,       setEstabs]      = useState([]);
  const [pagina,       setPagina]      = useState(0);

  // Filtros — inicializados a partir da URL (permite chegar aqui já filtrado)
  const [escopo,       setEscopo]      = useState(params.get("escopo") || "");
  const [merceariaId,  setMerceariaId] = useState(params.get("mercearia_id") || "");
  const [acao,         setAcao]        = useState(params.get("acao") || "");
  const [dataInicio,   setDataInicio]  = useState("");
  const [dataFim,      setDataFim]     = useState("");

  /* ── carregar lista de estabelecimentos p/ filtro ────────── */
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const resp = await fetch(`${API_URL}/api/auditoria/admin/estabelecimentos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) setEstabs(await resp.json());
      } catch { /* silencioso — filtro é acessório */ }
    })();
  }, [API_URL]);

  /* ── carregar registros ───────────────────────────────────── */
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const token = await getToken();
      const qs = new URLSearchParams();
      if (escopo)      qs.set("escopo", escopo);
      if (merceariaId) qs.set("mercearia_id", merceariaId);
      if (acao)        qs.set("acao", acao);
      if (dataInicio)  qs.set("data_inicio", dataInicio);
      if (dataFim)      qs.set("data_fim", dataFim);
      qs.set("limit", LIMIT);
      qs.set("offset", pagina * LIMIT);

      const resp = await fetch(`${API_URL}/api/auditoria/admin/geral?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (!resp.ok) { setErro(json.error || "Erro ao buscar auditoria."); return; }
      setRegistros(json.registros || []);
      setTotal(json.total || 0);
    } catch {
      setErro("Erro interno ao buscar auditoria.");
    }
    setLoading(false);
  }, [API_URL, escopo, merceariaId, acao, dataInicio, dataFim, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── reflete filtros na URL (pra poder compartilhar/voltar) ── */
  useEffect(() => {
    const next = {};
    if (escopo)      next.escopo = escopo;
    if (merceariaId) next.mercearia_id = merceariaId;
    if (acao)        next.acao = acao;
    setParams(next, { replace: true });
    setPagina(0);

  }, [escopo, merceariaId, acao]);

  function nomeEstab(id) {
    return estabs.find(e => e.id === id)?.nome_fantasia || (id ? id.slice(0, 8) + "…" : "—");
  }

  function limparFiltros() {
    setEscopo(""); setMerceariaId(""); setAcao(""); setDataInicio(""); setDataFim("");
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <LayoutAdmin>
      <div className="aud-wrapper">

        <div className="aud-page-header">
          <div className="aud-page-header-left">
            <span className="aud-breadcrumb">🔍 Painel Administrativo</span>
            <h1 className="aud-page-title">Auditoria <span>Geral</span></h1>
            <p className="aud-page-subtitle">
              Histórico de tudo que administradores e superadmins alteram no sistema — estabelecimentos, operadores, configurações e logins.
            </p>
          </div>
          <div className="aud-page-actions">
            <button className="aud-btn aud-btn-ghost" onClick={() => navigate("/admin")}>← Voltar ao painel</button>
          </div>
        </div>

        {/* FILTROS */}
        <div className="aud-filters-box">
          <div className="aud-filter-group">
            <label className="aud-filter-label">Escopo</label>
            <select className="aud-select" value={escopo} onChange={e => setEscopo(e.target.value)}>
              {ESCOPOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Estabelecimento</label>
            <select className="aud-select" value={merceariaId} onChange={e => setMerceariaId(e.target.value)}>
              <option value="">Todos</option>
              {estabs.map(e => <option key={e.id} value={e.id}>{e.nome_fantasia}</option>)}
            </select>
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Ação</label>
            <input className="aud-input" placeholder="ex: login, bloquear_acesso..." value={acao} onChange={e => setAcao(e.target.value)} />
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">De</label>
            <input className="aud-input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Até</label>
            <input className="aud-input" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>

          <button className="aud-btn aud-btn-ghost" onClick={limparFiltros}>✕ Limpar</button>
        </div>

        {/* LISTA */}
        <div className="aud-list-box">
          <div className="aud-list-header">
            <span className="aud-list-title">Registros</span>
            <span className="aud-count-badge">{total}</span>
          </div>

          {erro && <div className="aud-empty" style={{ color: "var(--text-danger)" }}>{erro}</div>}

          {loading ? (
            <div className="aud-loading"><div className="aud-spinner" /> Carregando...</div>
          ) : registros.length === 0 ? (
            <div className="aud-empty">Nenhum registro encontrado com esses filtros.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="aud-table">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Escopo</th>
                    <th>Estabelecimento</th>
                    <th>Usuário</th>
                    <th>Módulo</th>
                    <th>Ação</th>
                    <th>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => {
                    const cor = badgeCorEscopo(r.escopo);
                    return (
                      <tr key={r.id}>
                        <td className="mono nowrap">
                          {new Date(r.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td>
                          <span className="aud-badge" style={{ background: cor.bg, color: cor.cor }}>
                            {r.escopo || "estabelecimento"}
                          </span>
                        </td>
                        <td className="nowrap">{r.mercearia_id ? nomeEstab(r.mercearia_id) : "—"}</td>
                        <td className="nowrap">{r.usuario_nome || "Sistema"}</td>
                        <td>{r.modulo}</td>
                        <td className="mono">{r.acao}</td>
                        <td className="aud-desc">{r.descricao}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINAÇÃO */}
          {!loading && total > LIMIT && (
            <div className="aud-pagination">
              <button className="aud-btn aud-btn-ghost aud-btn-sm" disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))}>← Anterior</button>
              <span className="aud-page-info">Página {pagina + 1} de {totalPaginas}</span>
              <button className="aud-btn aud-btn-ghost aud-btn-sm" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(p => p + 1)}>Próxima →</button>
            </div>
          )}
        </div>

      </div>
    </LayoutAdmin>
  );
}