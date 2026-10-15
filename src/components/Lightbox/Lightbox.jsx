import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "./Lightbox.css";

/** Imagem ampliada em tela cheia. Fecha com clique fora, no ✕ ou Esc. */
export default function Lightbox({ url, alt = "Imagem", onClose }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [url, onClose]);

  if (!url) return null;
  return createPortal(
    <div className="lbx-overlay" onClick={onClose} role="dialog" aria-label={alt}>
      <button type="button" className="lbx-fechar" onClick={onClose} aria-label="Fechar">✕</button>
      <img src={url} alt={alt} className="lbx-img" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body
  );
}
