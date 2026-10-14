// src/utils/api.js
// Helper para fazer fetch autenticado com o token do Supabase

import { supabase } from "./supabaseClient";

/**
 * Faz uma requisição autenticada passando o JWT do usuário logado.
 * Usa o mesmo padrão que o backend espera: Authorization: Bearer <token>
 */
let renovando = null;

// Renova a sessão uma única vez mesmo com várias requisições falhando juntas.
function renovarSessao() {
  if (!renovando) {
    renovando = supabase.auth.refreshSession()
      .then(({ data, error }) => (error ? null : data?.session?.access_token || null))
      .catch(() => null)
      .finally(() => { renovando = null; });
  }
  return renovando;
}

async function chamar(path, options, token) {
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...options, headers });
}

export async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData?.session?.access_token;

  let resp = await chamar(path, options, token);

  // 503 = Auth do Supabase com soluço: tenta de novo uma vez.
  if (resp.status === 503) {
    await new Promise(r => setTimeout(r, 800));
    resp = await chamar(path, options, token);
  }

  // 401 = token vencido/revogado: renova a sessão e repete UMA vez. Se
  // ainda assim não valer, a sessão morreu de vez → volta pro login
  // (antes a tela ficava com "Erro ao buscar produtos" até deslogar).
  if (resp.status === 401 && token) {
    const novo = await renovarSessao();
    if (novo) {
      token = novo;
      resp = await chamar(path, options, token);
    }
    if (resp.status === 401) {
      try { await supabase.auth.signOut(); } catch { /* ignora */ }
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign("/login");
      }
    }
  }

  return resp;
}
