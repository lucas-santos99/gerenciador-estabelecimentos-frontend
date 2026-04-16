// src/utils/api.js
// Helper para fazer fetch autenticado com o token do Supabase

import { supabase } from "./supabaseClient";

/**
 * Faz uma requisição autenticada passando o JWT do usuário logado.
 * Usa o mesmo padrão que o backend espera: Authorization: Bearer <token>
 */
export async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const API_URL = import.meta.env.VITE_API_URL;

  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  return resp;
}