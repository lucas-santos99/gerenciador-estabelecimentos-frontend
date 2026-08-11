// src/pages/Administrador/SuperAdmins/AuditoriaAdmin.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { supabase } from "../../../utils/supabaseClient";
import { MODULO_LABEL, ACAO_LABEL } from "../../../utils/auditoriaLabels";
import * as XLSX from "xlsx";
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

const TAMANHOS_PAGINA = [20, 30, 50, 100];

// Colunas que aceitam ordenação — precisa bater com a whitelist do backend
const COLUNAS = [
  { key: "criado_em",    label: "Data/Hora",       sortable: true  },
  { key: "escopo",       label: "Escopo",          sortable: true  },
  { key: "mercearia_id", label: "Estabelecimento", sortable: false }, // resolvido no cliente, não dá pra ordenar no banco
  { key: "usuario_nome", label: "Usuário",         sortable: true  },
  { key: "modulo",       label: "Módulo",          sortable: true  },
  { key: "acao",         label: "Ação",            sortable: true  },
  { key: "descricao",    label: "Descrição",       sortable: false },
];

function badgeCorEscopo(escopo) {
  if (escopo === "admin_global")    return { bg: "rgba(139,92,246,0.12)", cor: "#8b5cf6" };
  if (escopo === "login")           return { bg: "rgba(59,130,246,0.12)", cor: "#3b82f6" };
  return { bg: "rgba(20,184,166,0.12)", cor: "#14b8a6" };
}

export default function AuditoriaAdmin() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [registros,   setRegistros]   = useState([]);
  const [total,        setTotal]       = useState(0);
  const [loading,      setLoading]     = useState(true);
  const [exportando,   setExportando]  = useState(false);
  const [erro,         setErro]        = useState("");
  const [estabs,       setEstabs]      = useState([]);
  const [opcoesFiltro, setOpcoesFiltro] = useState({ acoes: [], usuarios: [] });
  const [pagina,       setPagina]      = useState(0);
  const [tamanhoPagina, setTamanhoPagina] = useState(30);

  // Ordenação
  const [sortBy,    setSortBy]    = useState("criado_em");
  const [sortOrder, setSortOrder] = useState("desc");

  // Filtros — inicializados a partir da URL (permite chegar aqui já filtrado)
  const [escopo,       setEscopo]      = useState(params.get("escopo") || "");
  const [merceariaId,  setMerceariaId] = useState(params.get("mercearia_id") || "");
  const [acao,         setAcao]        = useState(params.get("acao") || "");
  const [usuario,      setUsuario]     = useState(params.get("usuario") || "");
  const [busca,        setBusca]       = useState(params.get("busca") || "");
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

  /* ── carregar opções de Usuário/Ação — dependem do estabelecimento
     e escopo selecionados, pra só mostrar o que existe de verdade ── */
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const qs = new URLSearchParams();
        if (merceariaId) qs.set("mercearia_id", merceariaId);
        if (escopo)      qs.set("escopo", escopo);
        const resp = await fetch(`${API_URL}/api/auditoria/admin/filtros?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) setOpcoesFiltro(await resp.json());
      } catch { /* silencioso — filtro é acessório */ }
    })();
  }, [API_URL, merceariaId, escopo]);

  /* ── monta query string com os filtros/ordenação atuais ──── */
  function montarQuery({ semPaginacao = false } = {}) {
    const qs = new URLSearchParams();
    if (escopo)      qs.set("escopo", escopo);
    if (merceariaId) qs.set("mercearia_id", merceariaId);
    if (acao)        qs.set("acao", acao);
    if (usuario)      qs.set("usuario", usuario);
    if (busca)        qs.set("busca", busca.trim());
    if (dataInicio)  qs.set("data_inicio", dataInicio);
    if (dataFim)      qs.set("data_fim", dataFim);
    qs.set("sort_by", sortBy);
    qs.set("sort_order", sortOrder);
    if (semPaginacao) {
      qs.set("limit", 1000);
      qs.set("offset", 0);
    } else {
      qs.set("limit", tamanhoPagina);
      qs.set("offset", pagina * tamanhoPagina);
    }
    return qs;
  }

  /* ── carregar registros (página atual) ───────────────────── */
  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const token = await getToken();
      const qs = montarQuery();
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
   
  }, [API_URL, escopo, merceariaId, acao, usuario, busca, dataInicio, dataFim, sortBy, sortOrder, pagina, tamanhoPagina]);

  useEffect(() => { carregar(); }, [carregar]);

  /* ── ao trocar o estabelecimento, os usuários/ações disponíveis
     mudam — limpa a seleção pra não ficar um valor "fantasma"
     (mas não na primeira renderização, senão perde o filtro que
     veio de um link tipo ?mercearia_id=X&acao=login) ── */
  const primeiraRenderMerceariaRef = React.useRef(true);
  useEffect(() => {
    if (primeiraRenderMerceariaRef.current) {
      primeiraRenderMerceariaRef.current = false;
      return;
    }
    setUsuario("");
    setAcao("");
  }, [merceariaId]);

  /* ── reflete filtros na URL (pra poder compartilhar/voltar) ── */
  useEffect(() => {
    const next = {};
    if (escopo)      next.escopo = escopo;
    if (merceariaId) next.mercearia_id = merceariaId;
    if (acao)        next.acao = acao;
    if (usuario)      next.usuario = usuario;
    if (busca)        next.busca = busca;
    setParams(next, { replace: true });
    setPagina(0);

  }, [escopo, merceariaId, acao, usuario, busca]);

  function nomeEstab(id) {
    return estabs.find(e => e.id === id)?.nome_fantasia || (id ? id.slice(0, 8) + "…" : "—");
  }

  function limparFiltros() {
    setEscopo(""); setMerceariaId(""); setAcao(""); setUsuario(""); setBusca(""); setDataInicio(""); setDataFim("");
  }

  /* ── ordenação por coluna ─────────────────────────────────── */
  function ordenarPor(coluna) {
    if (sortBy === coluna) {
      setSortOrder(o => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(coluna);
      setSortOrder("desc");
    }
    setPagina(0);
  }

  /* ── busca TODOS os registros que batem no filtro (até um limite
     de segurança), usada pelas exportações ─────────────────── */
  async function buscarTodosParaExportar(maxRegistros = 3000) {
    const token = await getToken();
    let todos = [];
    let offset = 0;
    const lote = 1000;
    while (todos.length < maxRegistros) {
      const qs = montarQuery({ semPaginacao: true });
      qs.set("limit", lote);
      qs.set("offset", offset);
      const resp = await fetch(`${API_URL}/api/auditoria/admin/geral?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao exportar.");
      todos = todos.concat(json.registros || []);
      if ((json.registros || []).length < lote || todos.length >= (json.total || 0)) break;
      offset += lote;
    }
    return { registros: todos.slice(0, maxRegistros), truncado: todos.length >= maxRegistros };
  }

  function formatarLinhaExport(r) {
    return {
      "Data/Hora":       new Date(r.criado_em).toLocaleString("pt-BR"),
      "Escopo":          r.escopo || "estabelecimento",
      "Estabelecimento": r.mercearia_id ? nomeEstab(r.mercearia_id) : "—",
      "Usuário":         r.usuario_nome || "Sistema",
      "Módulo":          (MODULO_LABEL[r.modulo] || r.modulo || ""),
      "Ação":            (ACAO_LABEL[r.acao] || r.acao || ""),
      "Descrição":       r.descricao || "",
    };
  }

  async function exportarExcel() {
    setExportando(true);
    try {
      const { registros: todos, truncado } = await buscarTodosParaExportar();
      const linhas = todos.map(formatarLinhaExport);
      const ws = XLSX.utils.json_to_sheet(linhas);
      ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 24 }, { wch: 16 }, { wch: 22 }, { wch: 50 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
      XLSX.writeFile(wb, `auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`);
      if (truncado) alert("A exportação trouxe os primeiros 3.000 registros que batem no filtro. Refine o período pra exportar tudo.");
    } catch (e) {
      alert("Erro ao exportar: " + (e.message || "erro desconhecido"));
    }
    setExportando(false);
  }

  async function exportarPDF() {
    setExportando(true);
    try {
      const { registros: todos, truncado } = await buscarTodosParaExportar();
      const linhas = todos.map(formatarLinhaExport);

      const html = `
        <html><head><title>Auditoria</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          p.sub { color: #666; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
          th { background: #f0f0f0; }
          tr:nth-child(even) { background: #fafafa; }
        </style>
        </head><body>
        <h1>Auditoria Geral — Lucas J. Systems</h1>
        <p class="sub">Exportado em ${new Date().toLocaleString("pt-BR")} — ${linhas.length} registro(s)${truncado ? " (limitado a 3.000)" : ""}</p>
        <table>
          <thead><tr>${Object.keys(linhas[0] || { "Sem dados": "" }).map(k => `<th>${k}</th>`).join("")}</tr></thead>
          <tbody>
            ${linhas.map(l => `<tr>${Object.values(l).map(v => `<td>${String(v).replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
        </body></html>
      `;

      const win = window.open("", "_blank");
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    } catch (e) {
      alert("Erro ao exportar: " + (e.message || "erro desconhecido"));
    }
    setExportando(false);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));

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
            <button className="aud-btn aud-btn-ghost" onClick={exportarExcel} disabled={exportando || total === 0}>
              {exportando ? "⏳…" : "📊 Excel"}
            </button>
            <button className="aud-btn aud-btn-ghost" onClick={exportarPDF} disabled={exportando || total === 0}>
              {exportando ? "⏳…" : "🖨️ PDF"}
            </button>
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
            <label className="aud-filter-label">Usuário</label>
            <select className="aud-select" value={usuario} onChange={e => setUsuario(e.target.value)}>
              <option value="">Todos</option>
              {opcoesFiltro.usuarios.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Ação</label>
            <select className="aud-select" value={acao} onChange={e => setAcao(e.target.value)}>
              <option value="">Todas</option>
              {opcoesFiltro.acoes.map(a => <option key={a} value={a}>{ACAO_LABEL[a] || a}</option>)}
            </select>
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Buscar</label>
            <input
              className="aud-input"
              type="text"
              placeholder="Palavra na descrição…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { setPagina(0); carregar(); } }}
              title="Busca dentro da descrição do registro, em todos os estabelecimentos — ex: uma tentativa de nome/marca com palavra proibida"
            />
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">De</label>
            <input className="aud-input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Até</label>
            <input className="aud-input" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>

          <div className="aud-filter-group">
            <label className="aud-filter-label">Por página</label>
            <select className="aud-select" value={tamanhoPagina} onChange={e => { setTamanhoPagina(parseInt(e.target.value)); setPagina(0); }}>
              {TAMANHOS_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
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
                    {COLUNAS.map(col => (
                      <th
                        key={col.key}
                        className={col.sortable ? "aud-th-sortable" : ""}
                        onClick={() => col.sortable && ordenarPor(col.key)}
                        title={col.sortable ? "Clique para ordenar" : undefined}
                      >
                        {col.label}
                        {col.sortable && sortBy === col.key && (
                          <span className="aud-sort-arrow">{sortOrder === "asc" ? " ▲" : " ▼"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.map(r => {
                    const cor = badgeCorEscopo(r.escopo);
                    const bloqueado = r.acao === "produto_bloqueado_palavra";
                    return (
                      <tr key={r.id} style={bloqueado ? { background: "rgba(220,38,38,0.06)" } : undefined}>
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
                        <td className="nowrap">{MODULO_LABEL[r.modulo] || r.modulo}</td>
                        <td className="nowrap">{ACAO_LABEL[r.acao] || r.acao}</td>
                        <td className="aud-desc">{r.descricao}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* PAGINAÇÃO */}
          {!loading && total > tamanhoPagina && (
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