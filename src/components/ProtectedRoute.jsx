// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

// 🔒 SEGURA enquanto ainda está carregando sessão
if (loading) return null;

// 🔒 SÓ redireciona se tiver CERTEZA que não tem usuário
if (!user) {
  return <Navigate to="/login" replace />;
}

return children;
}
