import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";

export default function PainelEstabelecimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, logout } = useAuth();

  async function handleLogout() {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Erro ao sair:", err);
      alert("Erro ao encerrar sessão.");
    }
  }

  return (
    <div style={{ padding: 25 }}>
      {/* CABEÇALHO COM SAIR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>Painel do Estabelecimento</h1>

        <button
          onClick={handleLogout}
          style={{
            background: "transparent",
            border: "none",
            color: "#ff5c5c",
            fontWeight: "600",
            cursor: "pointer",
          }}
        >
          Sair
        </button>
      </div>

      <p><strong>ID da Mercearia:</strong> {id}</p>
      <p><strong>Email:</strong> {user?.email}</p>
      <p><strong>Role:</strong> {profile?.role}</p>

      <hr />

      <p>Em breve aqui teremos:</p>
      <ul>
        <li>Painel de vendas</li>
        <li>Estoque</li>
        <li>Relatórios</li>
        <li>Configurações da loja</li>
      </ul>
    </div>
  );
}
