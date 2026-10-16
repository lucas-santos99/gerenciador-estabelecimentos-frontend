import { useEffect, useState } from "react";
import { apiFetch } from "./api";

const textoPadrao = (t) => ({ ativa: false, texto: t, link: "", fonte: "padrao", tamanho: 12, negrito: false, italico: false, sublinhado: false, cor: "", cor_escuro: "" });
export const BARRA_PADRAO = { mostrar_marca: true, nome: "Lucas J. Systems", link: "", logo_url: "", exibicao: "nome", tamanho: "medio", mostrar_prefixo: true, prefixo: "Desenvolvido por", redes: { instagram: "", facebook: "", whatsapp: "", twitter: "" }, ordem_blocos: ["licenca", "boas_vindas", "marca", "redes", "livre", "versao"], ordem_redes: ["instagram", "facebook", "whatsapp", "twitter"], ordem_botoes: ["fale_conosco", "tema", "sair"],
  textos: { boas_vindas: textoPadrao("Bem-vindo, {nome}!"), livre: textoPadrao("") }, mostrar_versao: false, versao: "" };
/** Junta o que veio do servidor com o padrão (inclusive dentro de redes e textos). */
export function mesclarBarra(d = {}) {
  return {
    ...BARRA_PADRAO, ...d,
    redes: { ...BARRA_PADRAO.redes, ...(d.redes || {}) },
    textos: {
      boas_vindas: { ...BARRA_PADRAO.textos.boas_vindas, ...(d.textos?.boas_vindas || {}) },
      livre: { ...BARRA_PADRAO.textos.livre, ...(d.textos?.livre || {}) },
    },
  };
}
/** Identificação automática do sistema (data do build + commit). */
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";
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
        cache = mesclarBarra(d);
        if (vivo) setCfg(cache);
      } catch { /* mantém o padrão */ }
    })();
    return () => { vivo = false; };
  }, []);
  return cfg;
}
