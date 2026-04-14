// src/pages/Administrador/Operadores/ListaOperadores.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Operadores.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function ListaOperadores() {
  const { id: estabelecimentoId } = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [operadores,      setOperadores]      = useState([]);
  const [estabelecimento, setEstabelecimento] = useState(null);
  const [loading,         setLoading]         = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      const [respM, respOp] = await Promise.all([
        fetch(`${API_URL}/admin/estabelecimentos/${estabelecimentoId}`, { credentials: "include" }),
        fetch(`${API_URL}/admin/operadores/${estabelecimentoId}`,       { credentials: "include" }),
      ]);
      const [dataM, dataOp] = await Promise.all([respM.json(), respOp.json()]);
      if (respM.ok)  setEstabelecimento(dataM);
      setOperadores(respOp.ok ? dataOp : []);
    } catch (err) {
      console.error(err);
      setOperadores([]);
    }
    setLoading(false);
  }


  useEffect(() => { carregar(); }, [estabelecimentoId]);

  async function excluir(id, nome) {
    if (!window.confirm(`Excluir operador "${nome}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) carregar();
      else alert("Erro ao excluir operador.");
    } catch { alert("Erro interno."); }
  }

  return (
    <LayoutAdmin>
      <div className="op-wrapper">

        {/* HEADER */}
        <div className="op-page-header">
          <div className="op-page-header-left">
            <span className="op-breadcrumb">
              👥 {estabelecimento?.nome_fantasia || "Estabelecimento"}
            </span>
            <h1 className="op-page-title">
              Operadores<span>.</span>
            </h1>
            <p className="op-page-subtitle">
              Gerencie os operadores deste estabelecimento
            </p>
          </div>
          <div className="op-page-actions">
            <button
              className="op-btn op-btn-ghost"
              onClick={() => navigate("/admin")}
            >
              ← Voltar ao painel
            </button>
            <button
              className="op-btn op-btn-primary"
              onClick={() => navigate(`/admin/operadores/novo?estabelecimento=${estabelecimentoId}`)}
            >
              + Novo Operador
            </button>
          </div>
        </div>

        {/* TABELA */}
        <div className="op-table-box">
          <div className="op-table-box-header">
            <span className="op-table-box-title">Lista de Operadores</span>
            <span className="op-count-badge">{operadores.length}</span>
          </div>

          {loading ? (
            <div className="op-loading">
              <div className="op-spinner" />
              Carregando operadores...
            </div>
          ) : operadores.length === 0 ? (
            <div className="op-empty">
              <span className="op-empty-icon">👥</span>
              Nenhum operador cadastrado neste estabelecimento.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="op-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {operadores.map(op => (
                    <tr key={op.id}>
                      <td>
                        <div className="op-avatar">{iniciais(op.nome)}</div>
                      </td>
                      <td
                        className="op-nome-clickable"
                        onClick={() => navigate(`/admin/operadores/${op.id}`)}
                      >
                        {op.nome}
                      </td>
                      <td className="op-td-mono">{op.email}</td>
                      <td>{op.telefone || "—"}</td>
                      <td>
                        <span className={`op-badge op-badge-${op.status}`}>
                          {op.status}
                        </span>
                      </td>
                      <td>
                        <div className="op-acoes">
                          <button
                            className="op-btn op-btn-ghost op-btn-sm"
                            onClick={() => navigate(`/admin/operadores/${op.id}`)}
                          >
                            👁 Detalhes
                          </button>
                          <button
                            className="op-btn op-btn-danger op-btn-sm"
                            onClick={() => excluir(op.id, op.nome)}
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