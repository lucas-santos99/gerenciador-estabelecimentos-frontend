// src/pages/Administrador/Estabelecimentos/ListaEstabelecimentos.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function ListaEstabelecimentos() {
  const API_URL  = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  const [lista,   setLista]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca,   setBusca]   = useState("");

  async function carregarEstabelecimentos() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/listar`, {
        credentials: "include",
      });
      const data = await resp.json();
      setLista(data.filter(m => m.status_assinatura !== "excluida"));
    } catch (err) {
      console.error("Erro ao carregar:", err);
    }
    setLoading(false);
  }

  useEffect(() => { carregarEstabelecimentos(); }, []);

  async function excluirEstabelecimento(id, nome) {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) carregarEstabelecimentos();
      else {
        const json = await resp.json();
        alert("Erro: " + json.error);
      }
    } catch { alert("Erro ao excluir."); }
  }

  const listaFiltrada = busca
    ? lista.filter(m =>
        (m.nome_fantasia || "").toLowerCase().includes(busca.toLowerCase()) ||
        (m.cnpj || "").toLowerCase().includes(busca.toLowerCase())
      )
    : lista;

  /* ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Administração</span>
            <h1 className="est-page-title">Estabelecimentos</h1>
          </div>
          <div className="est-page-actions">
            <Link
              className="est-btn est-btn-ghost"
              to="/admin/estabelecimentos/excluidas"
            >
              🗑 Ver Excluídas
            </Link>
            <Link
              className="est-btn est-btn-primary"
              to="/admin/estabelecimentos/nova"
            >
              + Novo Estabelecimento
            </Link>
          </div>
        </div>

        {/* BUSCA */}
        <div style={{ marginBottom: 12, maxWidth: 340 }}>
          <div className="search-wrap" style={{ maxWidth: "100%" }}>
            <span className="search-icon">🔍</span>
            <input
              className="dash-input"
              placeholder="Buscar por nome ou CNPJ…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* TABELA */}
        <div className="est-table-box">
          <div className="est-table-box-header">
            <span className="est-table-box-title">Lista de Estabelecimentos</span>
            <span className="est-count-badge">{listaFiltrada.length}</span>
          </div>

          {loading ? (
            <div className="est-loading">
              <div className="est-spinner" />
              Carregando...
            </div>
          ) : listaFiltrada.length === 0 ? (
            <div className="est-empty">
              <span className="est-empty-icon">🏢</span>
              {busca
                ? "Nenhum resultado para a busca."
                : "Nenhum estabelecimento cadastrado."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="est-table">
                <thead>
                  <tr>
                    <th>Logo</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>CNPJ</th>
                    <th>Telefone</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.map(m => (
                    <tr key={m.id}>
                      <td>
                        {m.logo_url
                          ? <img src={m.logo_url} alt="Logo" className="est-logo-mini" />
                          : <div className="est-logo-placeholder-mini">{iniciais(m.nome_fantasia)}</div>
                        }
                      </td>
                      <td className="est-td-nome">{m.nome_fantasia}</td>
                      <td>
                        <span className="est-badge-tipo">
                          {m.tipo_estabelecimento
                            ? m.tipo_estabelecimento.charAt(0).toUpperCase() + m.tipo_estabelecimento.slice(1)
                            : "—"}
                        </span>
                      </td>
                      <td className="est-td-mono">{m.cnpj || "—"}</td>
                      <td>{m.telefone || "—"}</td>
                      <td>
                        <div className="est-acoes">
                          <Link
                            className="est-btn est-btn-ghost est-btn-sm"
                            to={`/admin/estabelecimentos/${m.id}?view=details`}
                          >
                            👁 Detalhes
                          </Link>
                          <Link
                            className="est-btn est-btn-outline est-btn-sm"
                            to={`/admin/estabelecimentos/${m.id}`}
                          >
                            ✏️ Editar
                          </Link>
                          <button
                            className="est-btn est-btn-danger est-btn-sm"
                            onClick={() => excluirEstabelecimento(m.id, m.nome_fantasia)}
                          >
                            🗑 Excluir
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