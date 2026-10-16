import React, { useRef, useState } from "react";
import Lightbox from "../Lightbox/Lightbox";
import useMeuPerfil from "./useMeuPerfil";
import "./AvatarUsuario.css";

/** Cartão do usuário que abre a foto ampliada com as informações (e trocar/remover) — usado no menu do admin. */
export default function AvatarUsuario({ className = "" }) {
  const { perfil, enviando, trocar, remover } = useMeuPerfil();
  const [aberto, setAberto] = useState(false);
  const inputRef = useRef(null);
  if (!perfil) return null;
  const inicial = (perfil.nome || "?").trim()[0]?.toUpperCase() || "?";

  return (
    <div className={`avu ${className}`}>
      <button type="button" className={`avu-btn${enviando ? " enviando" : ""}`} onClick={(e) => { e.stopPropagation(); setAberto(true); }} aria-label="Ver a sua foto e informações">
        <span className="avu-foto">
          {perfil.foto_url ? <img src={perfil.foto_url} alt={perfil.nome} /> : <span>{inicial}</span>}
        </span>
        <span className="avu-texto">
          <span className="avu-nome">{perfil.nome}</span>
          <span className="avu-papel">{perfil.papel}</span>
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; trocar(f); }} />
      {aberto && (
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
          acoes={[
            { label: enviando ? "⏳ Enviando…" : perfil.foto_url ? "🔄 Trocar foto" : "📷 Adicionar foto", disabled: enviando, onClick: () => inputRef.current?.click() },
            ...(perfil.foto_url ? [{ label: "🗑️ Remover", perigo: true, disabled: enviando, onClick: remover }] : []),
          ]}
          onClose={() => setAberto(false)}
        />
      )}
    </div>
  );
}
