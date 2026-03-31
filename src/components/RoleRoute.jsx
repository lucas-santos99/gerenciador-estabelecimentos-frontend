import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export default function RoleRoute({ children, allowedRoles }) {
  const { profile, loading } = useAuth();

  // 🔒 ESPERA carregar tudo
  if (loading) return null;

  // 🔒 ainda não carregou profile → NÃO BLOQUEIA AINDA
  if (!profile) return null;

  // 🔒 sem permissão
  if (!allowedRoles.includes(profile.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}