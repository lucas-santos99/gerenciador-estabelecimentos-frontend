import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export const BARRA_PADRAO = { mostrar_marca: true, nome: "Lucas J. Systems", link: "", logo_url: "", exibicao: "nome", tamanho: "medio" };
// Altura da barra (px) por tamanho — também usada pra descontar do conteúdo da tela.
export const BARRA_ALTURAS = { pequeno: 30, medio: 38, grande: 48 };

let cache = null;

/** Configuração da barra inferior (marca, link, tamanho) definida pelo admin do sistema. */
export function useBarraSistema() {
  const [cfg, setCfg] = useState(cache || BARRA_PADRAO);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const resp = await apiFetch("/superadmin/barra-sistema");
        if (!resp.ok) return;
        const d = await resp.json();
        cache = { ...BARRA_PADRAO, ...d };
        if (vivo) setCfg(cache);
      } catch { /* mantém o padrão */ }
    })();
    return () => { vivo = false; };
  }, []);
  return cfg;
}
