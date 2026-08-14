// src/contexts/AuthProvider.jsx
/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../utils/supabaseClient";

const AuthContext = createContext();

// Chaves de sessionStorage usadas pela personificação (impersonation) do
// SuperAdmin master. sessionStorage (não localStorage) de propósito — a
// sessão "emprestada" do admin não deve sobreviver a fechar a aba/navegador,
// só a um F5 dentro da mesma sessão de personificação.
const CHAVE_SESSAO_ADMIN   = "personificacao_sessao_admin";
const CHAVE_ALVO_INFO      = "personificacao_alvo_info";

export function AuthProvider({ children }) {
  const [session,    setSession]    = useState(null);
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  // Preenchido só quando o SuperAdmin master está "personificando"
  // (logado como outro usuário usando a própria senha) — { nome, role }.
  const [personificando, setPersonificando] = useState(() => {
    try {
      const raw = sessionStorage.getItem(CHAVE_ALVO_INFO);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // --- 1) Carregar sessão inicial ---
useEffect(() => {
  let isMounted = true;

  async function init() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!isMounted) return;

    setSession(session);
    setUser(session?.user ?? null);
  }

  init();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!isMounted) return;

    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false); // 🔥 só libera aqui
  });

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);

  // --- 3) Carregar perfil do banco ---
  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!cancelled) {
        if (!error) {
          setProfile(data);

        } else {
          setProfile(null);
        }
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [user?.id]);

  // --- 4) Funções públicas ---
  const login = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Registra o login na auditoria — best-effort, nunca bloqueia o login
    const token = data.session?.access_token;
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL}/api/auditoria/login`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }

    return data;
  }, []);

  const logout = useCallback(async () => {
    // Se estava personificando, desfaz o "disfarce" primeiro pra não deixar
    // lixo no sessionStorage nem confundir o próximo login nesse navegador.
    sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
    sessionStorage.removeItem(CHAVE_ALVO_INFO);
    setPersonificando(null);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

  // --- Personificação (impersonation) ---
  // O master já provou a própria senha no backend (rota /superadmin/
  // personificar/...); aqui só trocamos a sessão ativa do supabase-js
  // pela do usuário alvo, usando o token_hash de um magic link gerado
  // no backend — nunca vimos nem pedimos a senha do usuário alvo.
  const iniciarPersonificacao = useCallback(async ({ email, tokenHash, alvo }) => {
    // Guarda a sessão do master ANTES de trocar — é o que permite voltar
    // depois. supabase-js só mantém UMA sessão por client, então trocar
    // de sessão aqui substitui a do master (inclusive no localStorage).
    const { data: sessionAtual } = await supabase.auth.getSession();
    if (sessionAtual?.session) {
      sessionStorage.setItem(CHAVE_SESSAO_ADMIN, JSON.stringify({
        access_token:  sessionAtual.session.access_token,
        refresh_token: sessionAtual.session.refresh_token,
      }));
    }

    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error) {
      sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
      throw error;
    }

    sessionStorage.setItem(CHAVE_ALVO_INFO, JSON.stringify(alvo));
    setPersonificando(alvo);
  }, []);

  const encerrarPersonificacao = useCallback(async () => {
    const raw = sessionStorage.getItem(CHAVE_SESSAO_ADMIN);
    sessionStorage.removeItem(CHAVE_SESSAO_ADMIN);
    sessionStorage.removeItem(CHAVE_ALVO_INFO);
    setPersonificando(null);

    if (!raw) {
      // Sem sessão de admin salva pra restaurar (aba nova, sessionStorage
      // limpo, etc.) — mais seguro deslogar tudo do que deixar alguém
      // "preso" na sessão personificada sem saber como sair.
      await logout();
      return;
    }

    const { access_token, refresh_token } = JSON.parse(raw);
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      await logout();
    }
  }, [logout]);

 if (loading) {
  return <div>Carregando sistema...</div>;
}

return (
  <AuthContext.Provider
    value={{
      session, user, profile, loading, login, logout,
      personificando, iniciarPersonificacao, encerrarPersonificacao,
    }}
  >
    {children}
  </AuthContext.Provider>
);
}

export function useAuth() {
  return useContext(AuthContext);
}