import React from "react";
import { REDES } from "../../utils/redesIcones";

const IcoRobo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v3"/><circle cx="12" cy="2.6" r=".9" fill="currentColor"/>
    <rect x="4" y="6.5" width="16" height="12" rx="4"/>
    <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/>
    <path d="M9.5 15.5h5"/><path d="M2 11.5v3M22 11.5v3"/>
  </svg>
);
const IcoWa = () => (<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={REDES.whatsapp.path} /></svg>);

/**
 * Chamada destacada do assistente de WhatsApp na barra (só para o dono da loja).
 *  situacao: "nenhum" → convida a contratar · "pendente" → conclua a contratação · "ativo" → agente ativo (robô)
 * Cada estado liga/desliga e tem texto e cor próprios, definidos pelo admin (cfg.whatsapp_cta).
 */
export default function ChamadaWhatsApp({ cfg, situacao, onAbrir, className = "" }) {
  const cta = cfg?.whatsapp_cta;
  if (!cta?.ativo || !situacao) return null;
  const chave = situacao === "ativo" ? "assinante" : situacao === "pendente" ? "pendente" : "contratar";
  const item = cta[chave];
  if (!item?.ativa || !item.texto) return null;
  return (
    <button type="button" onClick={onAbrir} title={situacao === "ativo" ? `${item.texto} — abrir a conversa no WhatsApp` : item.texto}
      className={`bar-wa bar-wa--${item.estilo}${cta.animar && situacao !== "ativo" ? " bar-wa--pulsa" : ""} ${className}`}>
      <span className="bar-wa-ico">{situacao === "ativo" ? <IcoRobo /> : <IcoWa />}</span>
      <span className="bar-wa-txt">{item.texto}</span>
      {situacao === "ativo" ? <span className="bar-wa-dot" aria-label="ativo" /> : <span className="bar-wa-seta" aria-hidden="true">→</span>}
    </button>
  );
}
