// src/components/Notificacoes/Dica.jsx
// Ícone "?" que explica um campo ao passar o mouse (ou focar com Tab / tocar).
// O balão vai direto no <body> (portal, "fixed"), pra não ser cortado por
// modal ou card com rolagem.
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Dica({ texto, children }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!aberto) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const largura = Math.min(280, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - largura / 2), window.innerWidth - largura - 8);
    const acima = r.top > 140;
    setPos({ left, width: largura, top: acima ? r.top - 8 : r.bottom + 8, acima });
  }, [aberto]);

  const conteudo = texto || children;
  return (
    <>
      <span
        ref={ref}
        className="ntf-dica-q"
        tabIndex={0}
        role="button"
        aria-label={typeof conteudo === 'string' ? conteudo : 'Ajuda'}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAberto(a => !a); }}
      >?</span>
      {aberto && pos && createPortal(
        <div className={`ntf-dica-balao${pos.acima ? ' acima' : ''}`} role="tooltip"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {conteudo}
        </div>,
        document.body
      )}
    </>
  );
}
