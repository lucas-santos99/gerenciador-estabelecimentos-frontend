// ===== App.jsx — Rotas Reais + ProtectedRoute + RoleRoute + Redirecionamento Global =====
import React from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";

// Telas
import Login from "./components/Login/Login";
import TelaBloqueio from "./components/TelaBloqueio";

// Proteções
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

// Dashboard correto do Admin
import DashboardAdmin from "./pages/Administrador/DashboardAdmin";

import SuperAdmins from "./pages/Administrador/SuperAdmins/SuperAdmins";

import RecuperarSenha from "./pages/RecuperarSenha/RecuperarSenha";

// Painéis
import PainelEstabelecimento from "./pages/Estabelecimento/PainelEstabelecimento";

import NovaSenha from "./pages/NovaSenha/NovaSenha";

import AuthCallback from "./pages/AuthCallback/AuthCallback";

// Módulo de Estabelecimentos
import ListaEstabelecimentos from "./pages/Administrador/Estabelecimentos/ListaEstabelecimentos";
import NovoEstabelecimento from "./pages/Administrador/Estabelecimentos/NovoEstabelecimento";
import EditarEstabelecimento from "./pages/Administrador/Estabelecimentos/EditarEstabelecimento";
import Excluidas from "./pages/Administrador/Estabelecimentos/Excluidas";

// Módulo de Operadores (Admin)
import ListaOperadores from "./pages/Administrador/Operadores/ListaOperadores";
import NovoOperador from "./pages/Administrador/Operadores/NovoOperador";
import DetalhesOperador from "./pages/Administrador/Operadores/DetalhesOperador";
import EditarOperador from "./pages/Administrador/Operadores/EditarOperador";

// Contexto + Redirecionamento Automático
import { useAuth } from "./contexts/AuthProvider";
import { redirectByRole } from "./utils/redirectByRole";

import "./App.css";

function App() {
  const { profile, loading, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirecionamento automático baseado na ROLE
  React.useEffect(() => {
    if (loading) return;
    if (!user || !profile) return;

    if (location.pathname === "/") {
      const destino = redirectByRole(profile);
      navigate(destino, { replace: true });
    }
  }, [profile, loading, user, location.pathname, navigate]);

  return (
    <Routes>

      {/* Tela de Login */}
      <Route path="/login" element={<Login />} />

      {/* Recuperação de senha */}
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/nova-senha" element={<NovaSenha />} />

      {/* ============================ */}
      {/* PAINEL ADMINISTRADOR */}
      {/* ============================ */}

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <DashboardAdmin />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/superadmins"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <SuperAdmins />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* CRUD DE ESTABELECIMENTOS */}

      <Route
        path="/admin/estabelecimentos"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <ListaEstabelecimentos />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/estabelecimentos/nova"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <NovoEstabelecimento />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/estabelecimentos/excluidas"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <Excluidas />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/estabelecimentos/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <EditarEstabelecimento />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* OPERADORES */}

      <Route
        path="/admin/estabelecimentos/:id/operadores"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <ListaOperadores />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/operadores/novo"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <NovoOperador />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/operadores/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <DetalhesOperador />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/operadores/editar/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["super_admin"]}>
              <EditarOperador />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* ============================ */}
      {/* PAINEL ESTABELECIMENTO */}
      {/* ============================ */}

      <Route
        path="/estabelecimentos/:id"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={["merchant", "operator"]}>
              <PainelEstabelecimento />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* ============================ */}
      {/* ROTA RAIZ */}
      {/* ============================ */}

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div style={{ padding: 20 }}>Redirecionando...</div>
          </ProtectedRoute>
        }
      />

      {/* Telas auxiliares */}
      <Route path="/bloqueado" element={<TelaBloqueio />} />

      <Route
        path="/unauthorized"
        element={<div>Sem permissão para acessar esta página.</div>}
      />

      {/* 404 */}
      <Route path="*" element={<div>Página não encontrada</div>} />

    </Routes>
  );
}

export default App;