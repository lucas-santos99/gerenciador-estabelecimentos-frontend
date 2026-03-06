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
    ultimas: [],
    todas: [],
  });

  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [apenasAtivas, setApenasAtivas] = useState(false);

  const navigate = useNavigate();

  async function carregarDados() {
    try {
      setLoading(true);

      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resp1 = await fetch(
        `${API_URL}/admin/estabelecimentos/listar`
      );
      const lista = (await resp1.json()) || [];

      const resp2 = await fetch(
        `${API_URL}/admin/estabelecimentos/excluidas`
      );
      const excluidas = (await resp2.json()) || [];

      const ativas = lista.filter(
        (m) => m.status_assinatura === "ativa"
      ).length;

      const inativas = lista.filter(
        (m) =>
          m.status_assinatura === "inativa" ||
          m.status_assinatura === "bloqueada"
      ).length;

      setStats({
        total: lista.length,
        ativas,
        inativas,
        excluidas: excluidas.length,
        ultimas: lista.slice(0, 5),
        todas: lista,
      });
    } catch (err) {
      console.error("Erro ao carregar dashboard admin:", err);
      alert("Erro ao carregar dados do dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const listaFiltrada = stats.todas.filter((m) => {
    if (apenasAtivas && m.status_assinatura !== "ativa") return false;
    if (filtro && m.status_assinatura !== filtro) return false;
    if (!busca) return true;

    const q = busca.toLowerCase();
    return (
      (m.nome_fantasia || "").toLowerCase().includes(q) ||
      (m.cnpj || "").toLowerCase().includes(q)
    );
  });

  async function excluir(id) {
    if (!window.confirm("Tem certeza que deseja excluir este estabelecimento?")) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        { method: "DELETE" }
      );

      if (resp.ok) {
        alert("Estabelecimento excluído.");
        carregarDados();
      } else {
        alert("Erro ao excluir.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir.");
    }
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="dash-wrapper">
          <h1>Dashboard</h1>
          <p>Carregando dados...</p>
        </div>
      </LayoutAdmin>
    );
  }

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

        {/* CARDS */}
        <div className="dash-cards">
          <div className="dash-card green">
            <h2>{stats.total}</h2>
            <p>Total de Estabelecimentos</p>
          </div>

          <div className="dash-card blue">
            <h2>{stats.ativas}</h2>
            <p>Ativas</p>
          </div>

          <div className="dash-card yellow">
            <h2>{stats.inativas}</h2>
            <p>Inativas / Bloqueadas</p>
          </div>

          <div className="dash-card red">
            <h2>{stats.excluidas}</h2>
            <p>Excluídas</p>
          </div>
        </div>

        {/* FILTROS */}
        <div className="dash-filters">
          <input
            placeholder="Buscar por nome ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="bloqueada">Bloqueada</option>
          </select>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={apenasAtivas}
              onChange={() => setApenasAtivas((s) => !s)}
            />
            Apenas ativas
          </label>
        </div>

        {/* LISTA */}
        <div className="dash-box">
          <h3>Estabelecimentos</h3>

          <table className="dash-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {listaFiltrada.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.logo_url ? (
                      <img
                        src={m.logo_url}
                        alt="logo"
                        style={{ width: 46, height: 46, borderRadius: 8 }}
                      />
                    ) : (
                      <div className="dash-logo-placeholder">
                        {m.nome_fantasia.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </td>

                  <td>{m.nome_fantasia}</td>
                  <td>{m.cnpj}</td>
                  <td>{m.telefone || "-"}</td>

                  <td>
                    <span
                      className={`badge-status status-${m.status_assinatura}`}
                    >
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
              ))}

              {listaFiltrada.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: 20 }}>
                    Nenhum estabelecimento encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </LayoutAdmin>
  );
}
