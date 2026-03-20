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

  function ordenarPorVencimento() {
    const ordenada = [...stats.todas].sort((a, b) => {
      const da = a.data_vencimento ? new Date(a.data_vencimento) : new Date(0);
      const db = b.data_vencimento ? new Date(b.data_vencimento) : new Date(0);
      return da - db;
    });

    setStats(prev => ({ ...prev, todas: ordenada }));
  }

  // 🔥 ALERTAS
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

  const listaFiltrada = stats.todas.filter((m) => {
    const hoje = new Date();

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
          <h1>Dashboard</h1>

          <div className="dash-actions">
            <button
              className="btn-primary"
              onClick={() => navigate("/admin/estabelecimentos/nova")}
            >
              + Novo Estabelecimento
            </button>

            <button
              className="btn-secondary"
              onClick={() => navigate("/admin/estabelecimentos/excluidas")}
            >
              Ver Excluídas
            </button>
          </div>
        </div>

        {/* 🔴 ALERTAS */}
        {(vencidos > 0 || proximos > 0) && (
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

        {/* CARDS */}
        <div className="dash-cards">
          <div className="dash-card green">
            <h2>{stats.total}</h2>
            <p>Total</p>
          </div>

          <div className="dash-card blue">
            <h2>{stats.ativas}</h2>
            <p>Ativas</p>
          </div>

          <div className="dash-card yellow">
            <h2>{stats.inativas}</h2>
            <p>Inativas</p>
          </div>

          <div className="dash-card red">
            <h2>{stats.excluidas}</h2>
            <p>Excluídas</p>
          </div>
        </div>

        {/* FILTROS */}
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
        </div>

        {/* TABELA */}
        <div className="dash-box">
          <h3>Estabelecimentos</h3>

          <table className="dash-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nome</th>
                <th>Tipo</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th onClick={ordenarPorVencimento} style={{ cursor: "pointer" }}>
                  Vencimento ⬍
                </th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {listaFiltrada.map((m) => {
                const hoje = new Date();
                const venc = m.data_vencimento ? new Date(m.data_vencimento) : null;

                let cor = "#999";
                if (venc) {
                  const diff = (venc - hoje) / (1000 * 60 * 60 * 24);
                  if (diff < 0) cor = "#dc2626";
                  else if (diff <= 5) cor = "#f59e0b";
                  else cor = "#16a34a";
                }

                return (
                  <tr key={m.id}>
                    <td>
                      {m.logo_url ? (
                        <img src={m.logo_url} width={40} />
                      ) : (
                        "-"
                      )}
                    </td>

                    <td>{m.nome_fantasia}</td>

                    <td>
                      <span className="badge-tipo">
                        {m.tipo_estabelecimento || "-"}
                      </span>
                    </td>

                    <td>{m.cnpj}</td>
                    <td>{m.telefone || "-"}</td>

                    <td style={{ color: cor, fontWeight: "bold" }}>
                      {m.data_vencimento
                        ? new Date(m.data_vencimento).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>

                    <td>
                      <span className={`badge-status status-${m.status_assinatura}`}>
                        {m.status_assinatura}
                      </span>
                    </td>

                    <td className="acoes-col">
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          navigate(`/admin/estabelecimentos/${m.id}?view=details`)
                        }
                      >
                        Detalhes
                      </button>

                      <button
                        className="btn-primary"
                        onClick={() =>
                          navigate(`/admin/estabelecimentos/${m.id}`)
                        }
                      >
                        Editar
                      </button>

                      <button
                        className="btn-danger"
                        onClick={() => excluir(m.id)}
                      >
                        Excluir
                      </button>

                      <button
                        className="btn-operators"
                        onClick={() =>
                          navigate(`/admin/estabelecimentos/${m.id}/operadores`)
                        }
                      >
                        Operadores
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </LayoutAdmin>
  );
}