import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiFetch } from "../../utils/api";
import { confirmar, avisar } from "../Dialogo/dialogo";
import Lightbox from "../Lightbox/Lightbox";
import "./AvatarUsuario.css";

/**
 * Linha do usuário logado (dono, operador ou administrador): foto + nome + papel.
 * Clique → menu: ver foto e informações, trocar, remover. A foto passa pela otimização do servidor
 * (padrão avatar: ~400 px, ≤ 80 KB), igual ao resto do sistema.
 */
export default function AvatarUsuario({ className = "" }) {
  const [perfil, setPerfil] = useState(null);
  const [menu, setMenu] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const carregar = useCallback(async () => {
    try {
      const resp = await apiFetch("/api/meu-perfil");
      if (resp.ok) setPerfil(await resp.json());
    } catch { /* o menu só não aparece */ }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!menu) return;
    const fora = (e) => { if (!wrapRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [menu]);

  async function trocar(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) { avisar("Selecione um arquivo de imagem."); return; }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("foto", arquivo);
      const resp = await apiFetch("/api/meu-perfil/foto", { method: "POST", body: fd });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || "Erro ao enviar a foto.");
      setPerfil(p => ({ ...p, foto_url: d.foto_url }));
    } catch (err) {
      avisar(err.message || "Erro ao enviar a foto.");
    } finally { setEnviando(false); }
  }

  async function remover() {
    if (!(await confirmar({ titulo: "Remover a sua foto?", perigo: true, botao: "Remover" }))) return;
    setEnviando(true);
    try {
      const resp = await apiFetch("/api/meu-perfil/foto", { method: "DELETE" });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || "Erro ao remover."); }
      setPerfil(p => ({ ...p, foto_url: null }));
    } catch (err) {
      avisar(err.message || "Erro ao remover a foto.");
    } finally { setEnviando(false); }
  }

  if (!perfil) return null;
  const inicial = (perfil.nome || "?").trim()[0]?.toUpperCase() || "?";

  return (
    <div className={`avu ${className}`} ref={wrapRef}>
      <button type="button" className={`avu-btn${enviando ? " enviando" : ""}`} onClick={(e) => { e.stopPropagation(); setMenu(m => !m); }} aria-label="Opções do seu perfil">
        <span className="avu-foto">
          {perfil.foto_url ? <img src={perfil.foto_url} alt={perfil.nome} /> : <span>{inicial}</span>}
        </span>
        <span className="avu-texto">
          <span className="avu-nome">{perfil.nome}</span>
          <span className="avu-papel">{perfil.papel}</span>
        </span>
      </button>

      {menu && (
        <div className="avu-menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => { setMenu(false); setAmpliada(true); }}>🔍 Ver foto e informações</button>
          <button type="button" disabled={enviando} onClick={() => { setMenu(false); inputRef.current?.click(); }}>
            {perfil.foto_url ? "🔄 Trocar foto" : "📷 Adicionar foto"}
          </button>
          {perfil.foto_url && <button type="button" className="avu-perigo" disabled={enviando} onClick={() => { setMenu(false); remover(); }}>🗑️ Remover foto</button>}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={trocar} />

      {ampliada && (
        <Lightbox
          url={perfil.foto_url || ""}
          alt={perfil.nome}
          titulo={perfil.nome}
          subtitulo={perfil.papel}
          infos={[
            { label: "E-mail", valor: perfil.email },
            { label: "Telefone", valor: perfil.telefone },
            { label: "Loja", valor: perfil.loja },
          ]}
          onClose={() => setAmpliada(false)}
        />
      )}
    </div>
  );
}
