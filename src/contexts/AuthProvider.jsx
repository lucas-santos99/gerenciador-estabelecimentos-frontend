// src/contexts/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../utils/supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- 1) Carregar sessão inicial ---
useEffect(() => {
  let isMounted = true;

  async function loadSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!isMounted) return;

    setSession(session);
    setUser(session?.user ?? null);

    // ⚠️ NÃO FINALIZA AQUI ainda!
  }

  loadSession();

  // 🔥 CRÍTICO: escutar mudanças (isso resolve o F5)
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false); // ✅ AGORA sim finaliza
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
        if (!error) setProfile(data);
        else setProfile(null);
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [user?.id]);

  // --- 4) Funções públicas ---
  const login = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }, []);

 if (loading) {
  return <div>Carregando sistema...</div>;
}

return (
  <AuthContext.Provider
    value={{ session, user, profile, loading, login, logout }}
  >
    {children}
  </AuthContext.Provider>
);
}

export function useAuth() {
  return useContext(AuthContext);
}
