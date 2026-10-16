import React from "react";
import { BUILD_ID } from "../../utils/barraSistema";

export const FONTES = {
  padrao:      { nome: "Padrão",       css: "inherit" },
  serifada:    { nome: "Serifada",     css: "Georgia, 'Times New Roman', serif" },
  mono:        { nome: "Máquina de escrever", css: "'Courier New', ui-monospace, monospace" },
  cursiva:     { nome: "Manuscrita",   css: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive" },
  arredondada: { nome: "Arredondada",  css: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif" },
  condensada:  { nome: "Condensada",   css: "'Arial Narrow', 'Roboto Condensed', Impact, sans-serif" },
};

export function estiloTexto(t, isDark) {
  const cor = (isDark && t.cor_escuro) ? t.cor_escuro : t.cor;
  return {
    fontFamily: (FONTES[t.fonte] || FONTES.padrao).css,
    fontSize: `${t.tamanho || 12}px`,
    fontWeight: t.negrito ? 800 : 500,
    fontStyle: t.italico ? "italic" : "normal",
    textDecoration: t.sublinhado ? "underline" : "none",
    color: cor || undefined,
  };
}

const primeiroNome = (n) => String(n || "").trim().split(/\s+/)[0] || "";

/** Mensagem personalizada (boas-vindas ou texto livre). {nome} vira o primeiro nome de quem está logado. */
export function TextoBarra({ item, nome, isDark, className = "" }) {
  if (!item?.ativa || !item.texto) return null;
  const txt = item.texto.replace(/\{nome\}/gi, primeiroNome(nome)).replace(/\s+,/g, ",").replace(/\s+!/g, "!").trim();
  const st = estiloTexto(item, isDark);
  return item.link
    ? <a className={`bar-texto ${className}`} style={st} href={item.link} target="_blank" rel="noopener noreferrer" title={txt}>{txt}</a>
    : <span className={`bar-texto ${className}`} style={st} title={txt}>{txt}</span>;
}

export function VersaoBarra({ cfg, className = "" }) {
  if (!cfg.mostrar_versao) return null;
  const v = cfg.versao ? (/^v/i.test(cfg.versao) ? cfg.versao : `v${cfg.versao}`) : (BUILD_ID ? `Build ${BUILD_ID}` : "");
  if (!v) return null;
  return <span className={`bar-versao ${className}`} title="Versão do sistema">{v}</span>;
}

/** Conjunto usado no rodapé do menu lateral (celular), na mesma ordem da barra. */
export function TextosMenu({ cfg, nome, isDark }) {
  const ordem = Array.isArray(cfg.ordem_blocos) ? cfg.ordem_blocos : [];
  const itens = ordem.map(id => id === "boas_vindas" || id === "livre"
    ? <TextoBarra key={id} item={cfg.textos?.[id]} nome={nome} isDark={isDark} className="bar-texto--menu" />
    : id === "versao" ? <VersaoBarra key={id} cfg={cfg} className="bar-versao--menu" /> : null).filter(Boolean);
  return itens.length ? <div className="textos--menu">{itens}</div> : null;
}
