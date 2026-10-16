import React from "react";
import { REDES, ORDEM_REDES } from "../../utils/redesIcones";

/** Ícones oficiais das redes configuradas pelo admin. Só aparecem as que têm link. */
export default function RedesSociais({ redes, ordem, className = "" }) {
  const base = Array.isArray(ordem) && ordem.length ? [...ordem, ...ORDEM_REDES.filter(r => !ordem.includes(r))] : ORDEM_REDES;
  const lista = base.filter(r => redes?.[r]);
  if (!lista.length) return null;
  return (
    <div className={`redes ${className}`}>
      {lista.map(r => (
        <a key={r} className="redes-link" href={redes[r]} target="_blank" rel="noopener noreferrer"
           title={REDES[r].nome} aria-label={REDES[r].nome} style={{ "--rede-cor": REDES[r].cor }}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={REDES[r].path} /></svg>
        </a>
      ))}
    </div>
  );
}
