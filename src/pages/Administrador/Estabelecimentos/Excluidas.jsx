// src/pages/Administrador/Estabelecimentos/Excluidas.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

export default function Excluidas() {
  const API_URL = import.meta.env.VITE_API_URL;

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);

  // Controle do modal
  const [modalAtivo, setModalAtivo] = useState(false);
  const [idSelecionado, setIdSelecionado] = useState(null);
  const [nomeSelecionado, setNomeSelecionado] = useState("");

  async function carregar() {
    try {
      setLoading(true);

      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/excluidas`,
        { credentials: "include" }
      );

      if (!resp.ok) {
        throw new Error("Erro ao buscar excluídas");
      }

      const data = await resp.json();
      setLista(data || []);
    } catch (err) {
      console.error("Erro ao carregar excluídas:", err);
      setLista([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function restaurar(id) {
    if (!window.confirm("Restaurar este estabelecimento?")) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}/restaurar`,
        {
          method: "PUT",
          credentials: "include",
        }
      );

      if (resp.ok) {
        alert("Estabelecimento restaurado!");
        carregar();
      } else {
        const json = await resp.json();
        alert("Erro: " + json.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao restaurar estabelecimento.");
    }
  }

  async function excluirDefinitivo() {
    if (!idSelecionado) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${idSelecionado}/apagar-definitivo`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (resp.ok) {
        alert("Estabelecimento removido definitivamente!");
        setModalAtivo(false);
        carregar();
      } else {
        const json = await resp.json();
        alert("Erro: " + json.error);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir definitivamente.");
    }
  }

  function abrirModal(id, nome) {
    setIdSelecionado(id);
    setNomeSelecionado(nome);
    setModalAtivo(true);
  }

  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <div className="merc-topo-excluidas">
          <h1>Estabelecimentos Excluídos</h1>

          <Link className="btn-voltar" to="/admin">
            ← Voltar
          </Link>
        </div>

        {loading ? (
          <p className="carregando">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="sem-registro">Nenhum estabelecimento excluída.</p>
        ) : (
          <div className="cards-container">
            {lista.map((m) => (
              <div key={m.id} className="card-mercearia-excluida">
                <div className="card-header">
                  <div className="badge-excluida">EXCLUÍDA</div>
                  <h3>{m.nome_fantasia}</h3>
                </div>

                <p><strong>CNPJ:</strong> {m.cnpj || "-"}</p>
                <p><strong>Telefone:</strong> {m.telefone || "-"}</p>

                <div className="card-acoes">
                  <button
                    className="btn-restaurar"
                    onClick={() => restaurar(m.id)}
                  >
                    Restaurar
                  </button>

                  <button
                    className="btn-excluir-def"
                    onClick={() => abrirModal(m.id, m.nome_fantasia)}
                  >
                    Excluir Definitivamente
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO */}
        {modalAtivo && (
          <div className="modal-overlay">
            <div className="modal-box">
              <h2>Excluir Permanentemente</h2>
              <p>
                Tem certeza que deseja remover{" "}
                <strong>{nomeSelecionado}</strong>{" "}
                permanentemente? Esta ação não pode ser desfeita.
              </p>

              <div className="modal-acoes">
                <button
                  className="btn-cancelar"
                  onClick={() => setModalAtivo(false)}
                >
                  Cancelar
                </button>

                <button
                  className="btn-confirmar"
                  onClick={excluirDefinitivo}
                >
                  Sim, excluir definitivamente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutAdmin>
  );
}
