import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  // 🔒 Aguarda o AuthProvider terminar
  if (loading) {
    return null;
  }

  // 🔒 Só redireciona se NÃO tiver usuário depois do loading
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}