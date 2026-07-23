// ===== App.jsx — Lucas J. Systems =====
import React from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";

// Telas
import Login from "./components/Login/Login";
import TelaBloqueio from "./components/TelaBloqueio";

// Proteções
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";

// Páginas Admin
import DashboardAdmin from "./pages/Administrador/DashboardAdmin";
import SuperAdmins from "./pages/Administrador/SuperAdmins/SuperAdmins";
import AuditoriaAdmin from "./pages/Administrador/SuperAdmins/AuditoriaAdmin";
import ConfiguracoesGlobais from "./pages/Administrador/SuperAdmins/ConfiguracoesGlobais";
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

// Módulo de Operadores
import ListaOperadores from "./pages/Administrador/Operadores/ListaOperadores";
import NovoOperador from "./pages/Administrador/Operadores/NovoOperador";
import DetalhesOperador from "./pages/Administrador/Operadores/DetalhesOperador";
import EditarOperador from "./pages/Administrador/Operadores/EditarOperador";

// Contexto
import { useAuth } from "./contexts/AuthProvider";
import { redirectByRole } from "./utils/redirectByRole";

import "./App.css";

/* ── Aplica o tema ANTES do primeiro render ─────────────────
   Evita o flash de tela branca / sem variáveis CSS           */
const savedTheme = localStorage.getItem("theme") || "dark";
document.body.className = savedTheme;

/* ── Wrapper que injeta dados no TelaBloqueio ──────────── */
function TelaBloqueioWrapper() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <TelaBloqueio
      onLogout={handleLogout}
      nomeFantasia={profile?.nome || ""}
      mercearia_id={profile?.mercearia_id || null}
    />
  );
}

/* ══════════════════════════════════════════════════════════ */
function App() {
  const { profile, loading, user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  // Redirecionamento automático baseado na role
  React.useEffect(() => {
    if (loading || !user || !profile) return;
    if (location.pathname === "/") {
      navigate(redirectByRole(profile), { replace: true });
    }
  }, [profile, loading, user, location.pathname, navigate]);

  return (
    <Routes>

      {/* Públicas */}
      <Route path="/login"           element={<Login />} />
      <Route path="/recuperar-senha" element={<RecuperarSenha />} />
      <Route path="/auth/callback"   element={<AuthCallback />} />
      <Route path="/nova-senha"      element={<NovaSenha />} />

      {/* ── PAINEL ADMINISTRADOR ────────────────────────── */}

      <Route path="/admin" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <DashboardAdmin />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/superadmins" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <SuperAdmins />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/auditoria" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <AuditoriaAdmin />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/configuracoes-globais" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <ConfiguracoesGlobais />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/estabelecimentos" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <ListaEstabelecimentos />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/estabelecimentos/nova" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <NovoEstabelecimento />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/estabelecimentos/excluidas" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <Excluidas />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/estabelecimentos/:id" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <EditarEstabelecimento />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/estabelecimentos/:id/operadores" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <ListaOperadores />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/operadores/novo" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <NovoOperador />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/operadores/:id" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <DetalhesOperador />
        </RoleRoute></ProtectedRoute>
      }/>

      <Route path="/admin/operadores/editar/:id" element={
        <ProtectedRoute><RoleRoute allowedRoles={["super_admin"]}>
          <EditarOperador />
        </RoleRoute></ProtectedRoute>
      }/>

      {/* ── PAINEL ESTABELECIMENTO ──────────────────────── */}

      <Route path="/estabelecimentos/:id" element={
        <ProtectedRoute><RoleRoute allowedRoles={["merchant", "operator"]}>
          <PainelEstabelecimento />
        </RoleRoute></ProtectedRoute>
      }/>

      {/* ── ROTA RAIZ ───────────────────────────────────── */}

      <Route path="/" element={
        <ProtectedRoute>
          <div style={{ padding: 20, color: "var(--text-secondary)" }}>
            Redirecionando...
          </div>
        </ProtectedRoute>
      }/>

      {/* Auxiliares */}
      <Route path="/bloqueado"     element={<TelaBloqueioWrapper />} />
      <Route path="/unauthorized"  element={<div style={{ padding: 20 }}>Sem permissão.</div>} />
      <Route path="*"              element={<div style={{ padding: 20 }}>Página não encontrada.</div>} />

    </Routes>
  );
}

export default App;