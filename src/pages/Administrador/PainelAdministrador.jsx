// ===== PainelAdministrador.jsx (CORRIGIDO) =====
import React from "react";
import { useAuth } from "../../contexts/AuthProvider";
import LayoutAdmin from "./Painel/LayoutAdmin";
import { Link } from "react-router-dom";

export default function PainelAdministrador() {
  const { user, profile } = useAuth();

  return (
    <LayoutAdmin>
      <h1>Bem-vindo, Administrador</h1>
      <p>Email: {user?.email}</p>
      <p>Role: {profile?.role}</p>

      <hr />

      <h2>Atalhos</h2>
      <ul>
        <li>
          <Link to="/admin/estabelecimentos">Gerenciar Estabelecimentos</Link>
        </li>

        <li>
          <Link to="/admin/estabelecimentos/excluidas">Estabelecimentos Excluídas</Link>
        </li>

        <li>
          {/* este não tem rota global ainda, então removemos */}
          {/* operadores ficam dentro do estabelecimento */}
          Operadores → abra um estabelecimento para gerenciar
        </li>

        <li>
          <Link to="/admin/config">Configurações da Conta</Link>
        </li>
      </ul>
    </LayoutAdmin>
  );
}
