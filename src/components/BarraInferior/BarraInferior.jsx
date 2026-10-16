import React from "react";
import RedesSociais from "./RedesSociais";
import { TextoBarra, VersaoBarra } from "./TextoBarra";
import "./BarraInferior.css";

const IcoChat = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IcoSol = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>);
const IcoLua = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>);
const IcoSair = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);

/**
 * Barra fina no rodapé do sistema: licença · marca do sistema · Fale Conosco · tema · Sair.
 * A marca (nome/logo/link) e o tamanho vêm da configuração do admin (useBarraSistema).
 */
export default function BarraInferior({ cfg, licenca, isDark, nome, onFaleConosco, onTema, onSair }) {
  const mostrarLogo = cfg.mostrar_marca && cfg.logo_url && (cfg.exibicao === "logo" || cfg.exibicao === "logo_e_nome");
  const mostrarNome = cfg.mostrar_marca && cfg.nome && (cfg.exibicao === "nome" || cfg.exibicao === "logo_e_nome" || !cfg.logo_url);
  const marca = (
    <>
      {mostrarLogo ? <img className="bar-marca-logo" src={cfg.logo_url} alt={cfg.nome || "Logo"} /> : <span className="bar-marca-dot" />}
      {mostrarNome && <span className="bar-marca-nome">{cfg.nome}</span>}
    </>
  );

  const base = Array.isArray(cfg.ordem_blocos) ? cfg.ordem_blocos : [];
  const ordem = [...base, ...["licenca", "boas_vindas", "marca", "redes", "livre", "versao"].filter(x => !base.includes(x))];

  const bb = Array.isArray(cfg.ordem_botoes) ? cfg.ordem_botoes : [];
  const botoes = [...bb, ...["fale_conosco", "tema", "sair"].filter(x => !bb.includes(x))];

  return (
    <footer className={`bar-inferior bar-${cfg.tamanho || "medio"}`}>
      {ordem.map(id => (
        <React.Fragment key={id}>
          {id === "licenca" && (
            licenca && (
          <div className={`bar-licenca bar-licenca--${licenca.tipo}`} title={licenca.dataFmt ? `${licenca.texto} · ${licenca.dataFmt}` : licenca.texto}>
            <span className="bar-licenca-dot" />
            <span className="bar-licenca-txt">{licenca.texto}{licenca.dataFmt ? <em> · {licenca.dataFmt}</em> : null}</span>
          </div>
        )
          )}
          {id === "marca" && (
            cfg.mostrar_marca && (mostrarLogo || mostrarNome) && (
          <span className="bar-marca-bloco">
            {cfg.mostrar_prefixo && cfg.prefixo && <span className="bar-prefixo">{cfg.prefixo}</span>}
            {cfg.link
              ? <a className="bar-marca" href={cfg.link} target="_blank" rel="noopener noreferrer" title={cfg.nome}>{marca}</a>
              : <span className="bar-marca bar-marca--sem-link" title={cfg.nome}>{marca}</span>}
          </span>
        )
          )}
          {(id === "boas_vindas" || id === "livre") && <TextoBarra item={cfg.textos?.[id]} nome={nome} isDark={isDark} className="bar-texto--barra" />}
          {id === "versao" && <VersaoBarra cfg={cfg} className="bar-versao--barra" />}
          {id === "redes" && <RedesSociais redes={cfg.redes} ordem={cfg.ordem_redes} className="redes--barra" />}
        </React.Fragment>
      ))}

      <span className="bar-espaco" />

      {botoes.map(id => id === "fale_conosco" ? (
        <button key={id} type="button" className="bar-btn" onClick={onFaleConosco} title="Fale Conosco">
          <span className="bar-ico"><IcoChat /></span><span className="bar-rot">Fale Conosco</span>
        </button>
      ) : id === "tema" ? (
        <button key={id} type="button" className="bar-btn" onClick={onTema} title={isDark ? "Modo claro" : "Modo escuro"}>
          <span className="bar-ico">{isDark ? <IcoSol /> : <IcoLua />}</span><span className="bar-rot">{isDark ? "Modo claro" : "Modo escuro"}</span>
        </button>
      ) : (
        <button key={id} type="button" className="bar-btn bar-btn--sair" onClick={onSair} title="Sair">
          <span className="bar-ico"><IcoSair /></span><span className="bar-rot">Sair</span>
        </button>
      ))}
    </footer>
  );
}
