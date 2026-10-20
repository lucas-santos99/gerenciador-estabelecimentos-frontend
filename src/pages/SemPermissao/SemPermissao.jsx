import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";
import { redirectByRole } from "../../utils/redirectByRole";
import "./SemPermissao.css";

// Aparece quando alguém tenta abrir uma tela que o perfil dele não acessa
// (ex.: SuperAdmin digitando o endereço de uma loja; operador abrindo o admin).
export default function SemPermissao() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const destino = redirectByRole(profile);
  const logado = !!profile;

  return (
    <div className="semperm-root">
      <div className="semperm-card" role="alert">
        <div className="semperm-icone">🔒</div>
        <h1 className="semperm-titulo">Sem permissão</h1>
        <p className="semperm-texto">
          Seu usuário não tem acesso a esta página.
          {profile?.role === "super_admin" && " Para ver uma loja, abra ela pelo painel administrativo."}
        </p>
        <div className="semperm-acoes">
          <button className="semperm-btn" onClick={() => navigate(destino, { replace: true })}>
            {logado ? "Ir para o meu painel" : "Ir para o login"}
          </button>
          <button className="semperm-btn sec" onClick={() => navigate(-1)}>Voltar</button>
        </div>
      </div>
    </div>
  );
}
