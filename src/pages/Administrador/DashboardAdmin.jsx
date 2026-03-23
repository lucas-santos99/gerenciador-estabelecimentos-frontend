import React, { useEffect, useState } from "react";
import LayoutAdmin from "./Painel/LayoutAdmin";
import "./DashboardAdmin.css";
import { useNavigate } from "react-router-dom";

export default function DashboardAdmin() {
  const API_URL = import.meta.env.VITE_API_URL;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    ativas: 0,
    inativas: 0,
    excluidas: 0,
    todas: [],
  });

  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");

  // 🔥 NOVO
  const [filtroTipo, setFiltroTipo] = useState("");

  const [mostrarAlertas, setMostrarAlertas] = useState(true);

  const [ordenacao, setOrdenacao] = useState({
    campo: "",
    direcao: "asc",
  });

  const navigate = useNavigate();

  async function carregarDados() {
    try {
      setLoading(true);

      const resp1 = await fetch(`${API_URL}/admin/estabelecimentos/listar`);
      const lista = (await resp1.json()) || [];

      const resp2 = await fetch(`${API_URL}/admin/estabelecimentos/excluidas`);
      const excluidas = (await resp2.json()) || [];

      const ativas = lista.filter(m => m.status_assinatura === "ativa").length;

      const inativas = lista.filter(
        m => m.status_assinatura === "inativa" || m.status_assinatura === "bloqueada"
      ).length;

      setStats({
        total: lista.length,
        ativas,
        inativas,
        excluidas: excluidas.length,
        todas: lista,
      });

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function ordenar(campo) {
    let direcao = "asc";

    if (ordenacao.campo === campo && ordenacao.direcao === "asc") {
      direcao = "desc";
    }

    setOrdenacao({ campo, direcao });

    const ordenada = [...stats.todas].sort((a, b) => {
      let valorA, valorB;

      if (campo === "vencimento") {
        valorA = a.data_vencimento ? new Date(a.data_vencimento) : new Date(0);
        valorB = b.data_vencimento ? new Date(b.data_vencimento) : new Date(0);
      } else {
        valorA = (a[campo] || "").toString().toLowerCase();
        valorB = (b[campo] || "").toString().toLowerCase();
      }

      if (valorA < valorB) return direcao === "asc" ? -1 : 1;
      if (valorA > valorB) return direcao === "asc" ? 1 : -1;
      return 0;
    });

    setStats(prev => ({ ...prev, todas: ordenada }));
  }

  function calcularAlertas() {
    const hoje = new Date();

    let vencidos = 0;
    let proximos = 0;

    stats.todas.forEach(m => {
      if (!m.data_vencimento) return;

      const venc = new Date(m.data_vencimento);
      const diff = (venc - hoje) / (1000 * 60 * 60 * 24);

      if (diff < 0) vencidos++;
      else if (diff <= 5) proximos++;
    });

    return { vencidos, proximos };
  }

  const { vencidos, proximos } = calcularAlertas();

  // 🔥 TIPOS DINÂMICOS
  const tiposUnicos = [
    ...new Set(stats.todas.map(m => m.tipo_estabelecimento).filter(Boolean))
  ];

  // 🔥 BASE PARA CARDS
  const listaBase = stats.todas.filter(m => {
    if (filtroTipo && m.tipo_estabelecimento !== filtroTipo) return false;
    return true;
  });

  const total = listaBase.length;
  const ativas = listaBase.filter(m => m.status_assinatura === "ativa").length;
  const inativas = listaBase.filter(
    m => m.status_assinatura === "inativa" || m.status_assinatura === "bloqueada"
  ).length;
  const excluidas = stats.excluidas;

  const listaFiltrada = stats.todas.filter((m) => {
    const hoje = new Date();

    if (filtroTipo && m.tipo_estabelecimento !== filtroTipo) return false;

    if (filtro === "vencidas") {
      if (!m.data_vencimento) return false;
      return new Date(m.data_vencimento) < hoje;
    }

    if (filtro && m.status_assinatura !== filtro) return false;

    if (!busca) return true;

    const q = busca.toLowerCase();
    return (
      (m.nome_fantasia || "").toLowerCase().includes(q) ||
      (m.cnpj || "").toLowerCase().includes(q)
    );
  });

  async function excluir(id) {
    if (!window.confirm("Excluir este estabelecimento?")) return;

    await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
      method: "DELETE",
    });

    carregarDados();
  }

  if (loading) return <div>Carregando...</div>;

  return (
    <LayoutAdmin>
      <div className="dash-wrapper">

        <div className="dash-header">
          <h1>Painel Administrativo</h1>

          <div className="dash-actions">
            <button className="btn-primary" onClick={() => navigate("/admin/estabelecimentos/nova")}>
              + Novo Estabelecimento
            </button>

            <button className="btn-secondary" onClick={() => navigate("/admin/estabelecimentos/excluidas")}>
              Ver Excluídas
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <button className="btn-secondary" onClick={() => setMostrarAlertas(!mostrarAlertas)}>
            {mostrarAlertas ? "Ocultar alertas ▲" : "Mostrar alertas ▼"}
          </button>
        </div>

        {mostrarAlertas && (vencidos > 0 || proximos > 0) && (
          <div style={{ marginTop: 16 }}>
            {vencidos > 0 && (
              <div style={{ color: "#dc2626", fontWeight: "bold" }}>
                🔴 {vencidos} estabelecimento(s) vencido(s)
              </div>
            )}
            {proximos > 0 && (
              <div style={{ color: "#f59e0b", fontWeight: "bold" }}>
                🟡 {proximos} vencendo nos próximos 5 dias
              </div>
            )}
          </div>
        )}

        {/* 🔥 CARDS DINÂMICOS */}
        <div className="dash-cards">
          <div className="dash-card green">
            <h2>{total}</h2>
            <p>Total</p>
          </div>

          <div className="dash-card blue">
            <h2>{ativas}</h2>
            <p>Ativas</p>
          </div>

          <div className="dash-card yellow">
            <h2>{inativas}</h2>
            <p>Inativas</p>
          </div>

          <div className="dash-card red">
            <h2>{excluidas}</h2>
            <p>Excluídas</p>
          </div>
        </div>

        {/* 🔥 FILTROS */}
        <div className="dash-filters">
          <input
            placeholder="Buscar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="bloqueada">Bloqueada</option>
            <option value="vencidas">Vencidas 🔴</option>
          </select>

          {/* 🔥 NOVO FILTRO */}
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tiposUnicos.map((tipo, i) => (
              <option key={i} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>

        {/* RESTO IGUAL (TABELA, BOTÕES, ETC) */}
        <div className="dash-box">
          <h3>Estabelecimentos</h3>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th onClick={() => ordenar("nome_fantasia")} style={{ cursor: "pointer" }}>Nome ⬍</th>
                <th onClick={() => ordenar("tipo_estabelecimento")} style={{ cursor: "pointer" }}>Tipo ⬍</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th onClick={() => ordenar("vencimento")} style={{ cursor: "pointer" }}>Vencimento ⬍</th>
                <th onClick={() => ordenar("status_assinatura")} style={{ cursor: "pointer" }}>Status ⬍</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {listaFiltrada.map((m) => (
                <tr key={m.id}>
                  <td>{m.logo_url ? <img src={m.logo_url} width={40} /> : "-"}</td>
                  <td>{m.nome_fantasia}</td>
                  <td><span className="badge-tipo">{m.tipo_estabelecimento || "-"}</span></td>
                  <td>{m.cnpj}</td>
                  <td>{m.telefone || "-"}</td>
                  <td>{m.data_vencimento ? new Date(m.data_vencimento).toLocaleDateString("pt-BR") : "-"}</td>
                  <td><span className={`badge-status status-${m.status_assinatura}`}>{m.status_assinatura}</span></td>

                  <td className="acoes-col" style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
                    <button className="btn-secondary" onClick={() => navigate(`/admin/estabelecimentos/${m.id}?view=details`)}>Detalhes</button>
                    <button className="btn-primary" onClick={() => navigate(`/admin/estabelecimentos/${m.id}`)}>Editar</button>
                    <button className="btn-danger" onClick={() => excluir(m.id)}>Excluir</button>
                    <button className="btn-operators" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => navigate(`/admin/estabelecimentos/${m.id}/operadores`)}>Operadores</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </LayoutAdmin>
  );
}