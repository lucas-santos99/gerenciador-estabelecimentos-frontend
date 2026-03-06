// src/pages/Administrador/Estabelecimentoss/DetalhesEstabelecimento.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

export default function DetalhesEstabelecimento() {
  const { id } = useParams();
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL;

  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        { credentials: "include" }
      );

      const data = await resp.json();

      if (resp.ok) {
        setDados(data);
      } else {
        setDados(null);
      }
    } catch (e) {
      console.error("Erro carregar detalhes:", e);
      setDados(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Restaurar (se estiver excluída)
  async function restaurar() {
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
        alert("Restaurada com sucesso!");
        carregar();
      } else {
        alert("Erro ao restaurar.");
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao restaurar.");
    }
  }

  // Soft delete
  async function excluir() {
    if (!window.confirm("Tem certeza que quer excluir este estabelecimento?")) return;

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      if (resp.ok) {
        alert("Excluída!");
        navigate("/admin");
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
        <div className="merc-wrapper">
          <p>Carregando...</p>
        </div>
      </LayoutAdmin>
    );
  }

  if (!dados) {
    return (
      <LayoutAdmin>
        <div className="merc-wrapper">
          <p>Erro ao carregar informações.</p>
          <Link to="/admin/estabelecimentos" className="btn-voltar">
            Voltar
          </Link>
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Detalhes do Estabelecimento</h1>
          <Link to="/admin/estabelecimentos" className="btn-voltar">← Voltar</Link>
        </div>

        <div className="premium-card" style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          <div style={{ minWidth: 180 }}>
            <div className="premium-logo-box">
              {dados.logo_url ? (
                <img src={dados.logo_url} alt="Logo" className="premium-logo" />
              ) : (
                <div className="premium-logo placeholder">SEM LOGO</div>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
              <div>
                <h2 style={{ margin: 0 }}>{dados.nome_fantasia}</h2>
                <p style={{ margin: "6px 0 0 0", color: "#555" }}>
                  {dados.email_contato || "-"}
                </p>

                <div style={{ marginTop: 8 }}>
                  <span className={`badge status-${(dados.status_assinatura || "indef").replace(/\s+/g, "-")}`}>
                    {dados.status_assinatura || "indefinido"}
                  </span>
                </div>

                <p style={{ marginTop: 10, color: "#666" }}>
                  <strong>Vencimento:</strong> {dados.data_vencimento || "-"}
                </p>
              </div>
            </div>

            <div className="premium-info-grid" style={{ marginTop: 20 }}>
              <div className="premium-info-card">
                <h3>Informações Gerais</h3>
                <p><strong>Nome:</strong> {dados.nome_fantasia}</p>
                <p><strong>CNPJ:</strong> {dados.cnpj || "-"}</p>
                <p><strong>Email:</strong> {dados.email_contato || "-"}</p>
                <p><strong>Telefone:</strong> {dados.telefone || "-"}</p>
              </div>

              <div className="premium-info-card">
                <h3>Endereço</h3>
                <p>{dados.endereco_completo || "Não informado"}</p>
              </div>
            </div>

            <div className="premium-actions" style={{ marginTop: 22 }}>
              <Link to={`/admin/estabelecimentos/${dados.id}`} className="btn-edit">
                Editar Dados
              </Link>

              {dados.status_assinatura === "excluida" ? (
                <button className="btn-primary" onClick={restaurar}>
                  Restaurar
                </button>
              ) : (
                <button className="btn-danger" onClick={excluir}>
                  Excluir
                </button>
              )}

              <button
                className="btn-primary"
                onClick={() => navigate(`/admin/estabelecimentos/${dados.id}/operadores`)}
                style={{ marginLeft: 6 }}
              >
                Operadores do Estabelecimento
              </button>
            </div>
          </div>
        </div>
      </div>
    </LayoutAdmin>
  );
}
