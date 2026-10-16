import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import "./Lightbox.css";

/**
 * Imagem ampliada em tela cheia. Fecha com clique fora, no ✕ ou Esc.
 * Opcional: `titulo` e `infos` ([{ label, valor }]) mostram um cartão de informações sob a imagem.
 */
export default function Lightbox({ url, alt = "Imagem", titulo = "", subtitulo = "", infos = [], acoes = [], onClose }) {
  useEffect(() => {
    if (!url && !titulo) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [url, titulo, onClose]);

  if (!url && !titulo) return null;
  const linhas = (infos || []).filter(i => i && i.valor);
  const comCartao = !!titulo || linhas.length > 0 || acoes.length > 0;
  return createPortal(
    <div className="lbx-overlay" onClick={onClose} role="dialog" aria-label={alt}>
      <button type="button" className="lbx-fechar" onClick={onClose} aria-label="Fechar">✕</button>
      <div className="lbx-conteudo" onClick={(e) => e.stopPropagation()}>
        {url && <img src={url} alt={alt} className={`lbx-img${comCartao ? " lbx-img--com-cartao" : ""}`} />}
        {comCartao && (
          <div className="lbx-cartao">
            {titulo && <div className="lbx-cartao-titulo">{titulo}</div>}
            {subtitulo && <div className="lbx-cartao-sub">{subtitulo}</div>}
            {linhas.map(i => (
              <div className="lbx-cartao-linha" key={i.label}>
                <span className="lbx-cartao-label">{i.label}</span>
                <span className="lbx-cartao-valor">{i.valor}</span>
              </div>
            ))}
            {acoes.length > 0 && (
              <div className="lbx-acoes">
                {acoes.map(a => (
                  <button key={a.label} type="button" className={`lbx-acao${a.perigo ? " lbx-acao--perigo" : ""}`} disabled={a.disabled} onClick={a.onClick}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
