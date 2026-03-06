// src/pages/Administrador/Estabelecimentos/ListaEstabelecimentos.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

export default function ListaEstabelecimentos() {
  const API_URL = import.meta.env.VITE_API_URL;

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);

  async function carregarEstabelecimentos() {
    setLoading(true);

    try {
      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resposta = await fetch(
        `${API_URL}/admin/estabelecimentos/listar`,
        { credentials: "include" }
      );

      const data = await resposta.json();

      console.log("📌 ESTABELECIMENTOS DO BACKEND:", data);

      // Filtro simples: remove somente as excluídas
      const filtradas = data.filter(
        (m) => m.status_assinatura !== "excluida"
      );

      setLista(filtradas);
    } catch (error) {
      console.error("Erro ao carregar estabelecimento:", error);
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarEstabelecimentos();
  }, []);

  async function excluirEstabelecimento(id) {
    if (!window.confirm("Excluir este estabelecimento?")) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (resp.ok) {
        alert("Estabelecimento excluído com sucesso.");
        carregarEstabelecimentos();
      } else {
        const json = await resp.json();
        alert("Erro: " + json.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir.");
    }
  }

  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <h1>Estabelecimentos</h1>

        <div className="merc-top">
          <Link className="btn-primary" to="/admin/estabelecimentos/nova">
            + Novo Estabelecimento
          </Link>
        </div>

        <Link className="btn-secondary" to="/admin/estabelecimentos/excluidas">
          Ver Excluídas
        </Link>

        {loading ? (
          <p>Carregando...</p>
        ) : lista.length === 0 ? (
          <p>Nenhum estabelecimento cadastrado.</p>
        ) : (
          <table className="merc-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nome</th>
                <th>CNPJ</th>
                <th>Telefone</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.logo_url ? (
                      <img
                        src={m.logo_url}
                        alt="Logo"
                        style={{
                          width: 50,
                          height: 50,
                          objectFit: "cover",
                          borderRadius: 6,
                          border: "1px solid #ccc",
                        }}
                      />
                    ) : (
                      <span style={{ opacity: 0.5 }}>Sem logo</span>
                    )}
                  </td>

                  <td>{m.nome_fantasia}</td>
                  <td>{m.cnpj || "-"}</td>
                  <td>{m.telefone || "-"}</td>

                  <td>
                    {/* 🔹 Detalhes */}
                    <Link
                      className="btn-secondary"
                      to={`/admin/estabelecimentos/${m.id}?view=details`}
                      style={{ marginRight: 10 }}
                    >
                      Detalhes
                    </Link>

                    {/* 🔹 Editar */}
                    <Link
                      className="btn-edit"
                      to={`/admin/estabelecimentos/${m.id}`}
                    >
                      Editar
                    </Link>

                    {/* 🔹 Excluir */}
                    <button
                      className="btn-delete"
                      onClick={() => excluirEstabelecimento(m.id)}
                      style={{ marginLeft: 10 }}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </LayoutAdmin>
  );
}
