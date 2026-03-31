// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthProvider";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  // Não está logado? → Volta para login
if (!user && !loading) {
  return <Navigate to="/login" replace />;
}

  return children;
}
