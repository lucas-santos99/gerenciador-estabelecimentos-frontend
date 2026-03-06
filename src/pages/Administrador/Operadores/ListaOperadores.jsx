// src/pages/Administrador/Operadores/ListaOperadores.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Operadores.css";

export default function ListaOperadores() {
  const { id: estabelecimentoId } = useParams();
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL;

  const [operadores, setOperadores] = useState([]);
  const [estabelecimento, setEstabelecimento] = useState(null);
  const [loading, setLoading] = useState(true);

  // =============================
  // CARREGAR OPERADORES + estabelecimento
  // =============================
  async function carregar() {
    setLoading(true);

    try {
      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      // Buscar dados do estabelecimento
      const respM = await fetch(
        `${API_URL}/admin/estabelecimentos/${estabelecimentoId}`,
        { credentials: "include" }
      );
      const dataM = await respM.json();
      if (respM.ok) setEstabelecimento(dataM);

      // Buscar operadores
      const resp = await fetch(
        `${API_URL}/admin/operadores/${estabelecimentoId}`,
        { credentials: "include" }
      );
      const data = await resp.json();

      setOperadores(resp.ok ? data : []);
    } catch (err) {
      console.error("Erro carregar operadores:", err);
      setOperadores([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, [estabelecimentoId]);

  // =============================
  // EXCLUIR OPERADOR
  // =============================
  async function excluir(id) {
    if (!window.confirm("Deseja realmente excluir este operador?")) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/operadores/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (resp.ok) {
        alert("Operador excluído!");
        carregar();
      } else {
        alert("Erro ao excluir operador.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro interno.");
    }
  }

  // =============================
  // RENDER
  // =============================
  return (
    <LayoutAdmin>
      <div className="op-wrapper">
        <div className="op-top">
          <div>
            <h1>
              Operadores{" "}
              {estabelecimento ? `— ${estabelecimento.nome_fantasia}` : ""}
            </h1>
            <p className="op-subtitle">
              Gerencie os operadores deste estabelecimento
            </p>
          </div>

          <button
            className="btn-primary"
            onClick={() =>
              navigate(`/admin/operadores/novo?estabelecimento=${estabelecimentoId}`)
            }
          >
            + Novo Operador
          </button>
        </div>

        {loading ? (
          <p>Carregando operadores...</p>
        ) : operadores.length === 0 ? (
          <p className="sem-operadores">
            Nenhum operador encontrado.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="op-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {operadores.map((op) => (
                  <tr key={op.id}>
                    <td>
                      <div className="op-avatar placeholder">
                        {(op.nome || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    </td>

                    <td
                      className="op-nome"
                      onClick={() =>
                        navigate(`/admin/operadores/${op.id}`)
                      }
                    >
                      {op.nome}
                    </td>

                    <td>{op.email}</td>

                    <td>{op.telefone || "-"}</td>

                    <td>
                      <span
                        className={`badge-op status-${op.status}`}
                      >
                        {op.status}
                      </span>
                    </td>

                    <td>
                      <button
                        className="btn-primary"
                        onClick={() =>
                          navigate(`/admin/operadores/${op.id}`)
                        }
                      >
                        Detalhes
                      </button>

                      <button
                        className="btn-danger"
                        onClick={() => excluir(op.id)}
                        style={{ marginLeft: 8 }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          className="btn-secondary"
          onClick={() => navigate("/admin")}
          style={{ marginTop: 20 }}
        >
          Voltar ao Dashboard
        </button>
      </div>
    </LayoutAdmin>
  );
}
