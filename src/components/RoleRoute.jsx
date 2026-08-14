import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export default function RoleRoute({ children, allowedRoles }) {
  const { profile, loading, user } = useAuth();

  // 🔒 ESPERA carregar tudo
  if (loading) return null;

  // 🔒 ainda não carregou profile → NÃO BLOQUEIA AINDA
  // 🔒 profile.id !== user.id → profile é de um usuário ANTERIOR (troca de
  // sessão em andamento, ex: personificação) — espera o profile certo
  // chegar em vez de decidir permissão com dado desatualizado.
  if (!profile || profile.id !== user?.id) return null;

  // 🔒 sem permissão
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}