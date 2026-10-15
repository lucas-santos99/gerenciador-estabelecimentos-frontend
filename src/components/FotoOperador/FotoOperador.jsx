import React, { useRef, useState } from "react";
import { apiFetch } from "../../utils/api";
import { confirmar } from "../Dialogo/dialogo";
import Lightbox from "../Lightbox/Lightbox";
import "./FotoOperador.css";

/**
 * Foto do operador: escolher / trocar / remover. Sobe na hora (o servidor reduz a imagem
 * pra ~400 px e ≤ 80 KB, então não precisa se preocupar com o tamanho da foto do celular).
 *  - dono da loja:  POST/DELETE /api/operadores/:id/foto
 *  - administrador: POST /admin/operadores/:id/upload-foto  |  DELETE .../remover-foto
 */
export default function FotoOperador({ operadorId, nome, fotoUrl, admin = false, onChange, desabilitado = false }) {
  const inputRef = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [ampliada, setAmpliada] = useState(false);

  const urlEnviar  = admin ? `/admin/operadores/${operadorId}/upload-foto` : `/api/operadores/${operadorId}/foto`;
  const urlRemover = admin ? `/admin/operadores/${operadorId}/remover-foto` : `/api/operadores/${operadorId}/foto`;

  async function escolher(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) { setErro("Selecione um arquivo de imagem."); return; }
    setErro(""); setEnviando(true);
    try {
      const fd = new FormData();
      fd.append(admin ? "foto" : "foto", arquivo);
      const resp = await apiFetch(urlEnviar, { method: "POST", body: fd });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Erro ao enviar a foto.");
      onChange?.(data.foto_url);
    } catch (err) {
      setErro(err.message || "Erro ao enviar a foto.");
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!(await confirmar({ titulo: "Remover a foto?", perigo: true, botao: "Remover" }))) return;
    setErro(""); setEnviando(true);
    try {
      const resp = await apiFetch(urlRemover, { method: "DELETE" });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || "Erro ao remover a foto."); }
      onChange?.(null);
    } catch (err) {
      setErro(err.message || "Erro ao remover a foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fotoop">
      <div
        className={`fotoop-avatar${fotoUrl ? " fotoop-avatar--zoom" : ""}`}
        onClick={() => fotoUrl && setAmpliada(true)}
        title={fotoUrl ? "Clique para ampliar" : undefined}
      >
        {fotoUrl
          ? <img src={fotoUrl} alt={nome || "Foto"} loading="lazy" decoding="async" />
          : <span>{(nome || "?")[0]?.toUpperCase()}</span>}
      </div>
      {ampliada && <Lightbox url={fotoUrl} alt={nome || "Foto"} onClose={() => setAmpliada(false)} />}
      <div className="fotoop-acoes">
        <button type="button" className="fotoop-btn" onClick={() => inputRef.current?.click()} disabled={enviando || desabilitado}>
          {enviando ? "⏳ Enviando…" : fotoUrl ? "🔄 Trocar foto" : "📷 Adicionar foto"}
        </button>
        {fotoUrl && !enviando && (
          <button type="button" className="fotoop-btn fotoop-btn--remover" onClick={remover} disabled={desabilitado}>Remover</button>
        )}
        <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={escolher} />
        {erro && <span className="fotoop-erro">⚠️ {erro}</span>}
      </div>
    </div>
  );
}
