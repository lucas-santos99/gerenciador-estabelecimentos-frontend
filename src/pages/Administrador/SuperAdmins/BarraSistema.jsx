// src/pages/Administrador/SuperAdmins/BarraSistema.jsx
// ============================================================
// BARRA INFERIOR DO SISTEMA (16/10/2026)
// Controla a faixa fina do rodapé do sistema dos estabelecimentos: nome da
// marca, link, logo, o que mostrar (só nome / só logo / logo + nome) e o
// tamanho da barra. Qualquer SuperAdmin edita. Salvo em
// config_sistema.barra_sistema (GET/PUT /superadmin/barra-sistema).
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { avisar, confirmar } from "../../../components/Dialogo/dialogo";
import { REDES, ORDEM_REDES } from "../../../utils/redesIcones";
import BarraInferior from "../../../components/BarraInferior/BarraInferior";
import { BARRA_PADRAO, BARRA_ALTURAS, BUILD_ID, mesclarBarra } from "../../../utils/barraSistema";
import { FONTES, estiloTexto } from "../../../components/BarraInferior/TextoBarra";
import "./SuperAdmins.css";
import "./BarraSistema.css";

const ESTILOS_WA = [
  { v: "verde", t: "Verde", c: "linear-gradient(135deg,#25d366,#0e9f6e)" },
  { v: "roxo", t: "Roxo", c: "linear-gradient(135deg,#8b5cf6,#6d28d9)" },
  { v: "azul", t: "Azul", c: "linear-gradient(135deg,#3b82f6,#1d4ed8)" },
  { v: "laranja", t: "Laranja", c: "linear-gradient(135deg,#f59e0b,#ea580c)" },
  { v: "escuro", t: "Escuro", c: "linear-gradient(135deg,#334155,#0f172a)" },
];
const EXIBICOES = [
  { v: "nome",        t: "Só o nome" },
  { v: "logo",        t: "Só a logo" },
  { v: "logo_e_nome", t: "Logo + nome" },
];
const TAMANHOS = [
  { v: "pequeno", t: "Pequena", d: "30 px" },
  { v: "medio",   t: "Média",   d: "38 px" },
  { v: "grande",  t: "Grande",  d: "48 px" },
];
const LICENCA_EXEMPLO = { tipo: "ativa", texto: "Ativa até 27/12/2026", dataFmt: "" };

const TODAS = ["marca", "mensagens", "whatsapp", "redes", "ordem", "tamanho", "versao"];

function Secao({ id, icone, titulo, resumo, abertas, alternar, children }) {
  const aberta = abertas.includes(id);
  return (
    <section className={`bs-secao${aberta ? " aberta" : ""}`}>
      <button type="button" className="bs-secao-cab" onClick={() => alternar(id)} aria-expanded={aberta}>
        <span className="bs-secao-ico">{icone}</span>
        <span className="bs-secao-tit"><b>{titulo}</b><small>{resumo}</small></span>
        <span className="bs-secao-seta" aria-hidden="true">{aberta ? "▾" : "▸"}</span>
      </button>
      {aberta && <div className="bs-secao-corpo">{children}</div>}
    </section>
  );
}

function EditorTexto({ titulo, dica, item, onChange, previaEscura }) {
  const cor = previaEscura ? "cor_escuro" : "cor";
  return (
    <div className="bs-texto">
      <label className="bs-chave">
        <input type="checkbox" checked={!!item.ativa} onChange={e => onChange("ativa", e.target.checked)} />
        <span><b>{titulo}</b></span>
      </label>
      {item.ativa && (
        <>
          <input className="sa-config-textfield" maxLength={140} value={item.texto} placeholder="Digite a mensagem" onChange={e => onChange("texto", e.target.value)} />
          <span className="sa-config-hint">{dica}</span>
          <input className="sa-config-textfield" maxLength={300} value={item.link} placeholder="Link ao clicar (opcional): https://…" onChange={e => onChange("link", e.target.value)} />
          <div className="bs-fmt">
            <select className="sa-config-textfield bs-fmt-fonte" value={item.fonte} onChange={e => onChange("fonte", e.target.value)} style={{ fontFamily: FONTES[item.fonte]?.css }}>
              {Object.entries(FONTES).map(([k, f]) => <option key={k} value={k} style={{ fontFamily: f.css }}>{f.nome}</option>)}
            </select>
            <div className="bs-fmt-tam">
              <button type="button" disabled={item.tamanho <= 10} onClick={() => onChange("tamanho", item.tamanho - 1)} title="Letra menor">A−</button>
              <span>{item.tamanho}px</span>
              <button type="button" disabled={item.tamanho >= 20} onClick={() => onChange("tamanho", item.tamanho + 1)} title="Letra maior">A+</button>
            </div>
            <button type="button" className={`bs-fmt-btn${item.negrito ? " on" : ""}`} onClick={() => onChange("negrito", !item.negrito)} title="Negrito"><b>N</b></button>
            <button type="button" className={`bs-fmt-btn${item.italico ? " on" : ""}`} onClick={() => onChange("italico", !item.italico)} title="Itálico"><i>I</i></button>
            <button type="button" className={`bs-fmt-btn${item.sublinhado ? " on" : ""}`} onClick={() => onChange("sublinhado", !item.sublinhado)} title="Sublinhado"><u>S</u></button>
          </div>
          <div className="bs-cor">
            <span>Cor no tema {previaEscura ? "escuro" : "claro"}:</span>
            <input type="color" value={item[cor] || (previaEscura ? "#e5e7eb" : "#374151")} onChange={e => onChange(cor, e.target.value)} />
            {item[cor] ? <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => onChange(cor, "")}>Usar a cor padrão</button> : <small>cor padrão do tema</small>}
          </div>
          <div className="bs-texto-previa" style={estiloTexto(item, previaEscura)}>{item.texto || "…"}</div>
        </>
      )}
    </div>
  );
}

function SeletorWa({ valor, onChange }) {
  return (
    <label className="bs-wa-sel">Ver como dono:
      <select value={valor} onChange={e => onChange(e.target.value)}>
        <option value="nenhum">sem WhatsApp</option>
        <option value="pendente">pedido pendente</option>
        <option value="ativo">com WhatsApp ativo</option>
      </select>
    </label>
  );
}

function PreviaReal({ cfg, escura, setEscura, previaWa, setPreviaWa, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className="bs-real-fundo" onClick={onClose}>
      <div className="bs-real" onClick={e => e.stopPropagation()}>
        <div className="bs-real-topo">
          <b>Prévia em tamanho real</b>
          <span>Como a barra aparece em um computador. No celular os textos e as redes vão para o fim do menu.</span>
          <SeletorWa valor={previaWa} onChange={setPreviaWa} />
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setEscura(v => !v)}>{escura ? "☀️ Claro" : "🌙 Escuro"}</button>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onClose}>✕ Fechar</button>
        </div>
        <div className={`bs-previa ${escura ? "escuro" : "claro"}`} style={{ "--est-barra-h": `${BARRA_ALTURAS[cfg.tamanho] || 38}px` }}>
          <div className="bs-previa-tela">Tela do sistema</div>
          <BarraInferior cfg={cfg} nome="Maria Souza" whatsapp={previaWa} onWhatsApp={() => {}} licenca={LICENCA_EXEMPLO} isDark={escura} onFaleConosco={() => {}} onTema={() => setEscura(v => !v)} onSair={() => {}} />
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function BarraSistema() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(BARRA_PADRAO);
  const [original, setOriginal] = useState(JSON.stringify(BARRA_PADRAO));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [previaEscura, setPreviaEscura] = useState(false);
  const logoRef = useRef(null);
  const [abertas, setAbertas] = useState(["marca"]);
  const [ampliada, setAmpliada] = useState(false);
  const [previaWa, setPreviaWa] = useState("nenhum");
  const alternar = (id) => setAbertas(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await apiFetch("/superadmin/barra-sistema");
        if (resp.ok) {
          const d = mesclarBarra(await resp.json());
          setCfg(d); setOriginal(JSON.stringify(d));
        }
      } catch { /* mantém o padrão */ }
      setCarregando(false);
    })();
  }, []);

  const set = (campo, v) => setCfg(c => ({ ...c, [campo]: v }));
  const setRede = (r, v) => setCfg(c => ({ ...c, redes: { ...c.redes, [r]: v } }));
  const mover = (campo, i, d) => setCfg(c => {
    const l = [...c[campo]]; const j = i + d;
    if (j < 0 || j >= l.length) return c;
    [l[i], l[j]] = [l[j], l[i]];
    return { ...c, [campo]: l };
  });
  const NOMES_BLOCOS = { licenca: "Situação da licença", boas_vindas: "Mensagem de boas-vindas", marca: "Marca do sistema (Desenvolvido por…)", redes: "Redes sociais", livre: "Texto livre / link", versao: "Versão do sistema", whatsapp: "Chamada do assistente de WhatsApp" };
  const setWa = (campo, v) => setCfg(c => ({ ...c, whatsapp_cta: { ...c.whatsapp_cta, [campo]: v } }));
  const setWaItem = (k, campo, v) => setCfg(c => ({ ...c, whatsapp_cta: { ...c.whatsapp_cta, [k]: { ...c.whatsapp_cta[k], [campo]: v } } }));
  const setPos = (b, v) => setCfg(c => ({ ...c, posicoes: { ...c.posicoes, [b]: v } }));
  const setTexto = (k, campo, v) => setCfg(c => ({ ...c, textos: { ...c.textos, [k]: { ...c.textos[k], [campo]: v } } }));
  const NOMES_BOTOES = { fale_conosco: "Fale Conosco", tema: "Modo escuro / claro", sair: "Sair" };
  const Setas = ({ campo, i, total }) => (
    <span className="bs-setas">
      <button type="button" disabled={i === 0} onClick={() => mover(campo, i, -1)} title="Subir (mais à esquerda)" aria-label="Mover para antes">▲</button>
      <button type="button" disabled={i === total - 1} onClick={() => mover(campo, i, 1)} title="Descer (mais à direita)" aria-label="Mover para depois">▼</button>
    </span>
  );
  const DICAS = { instagram: "@seuusuario ou link", facebook: "nome da página ou link", whatsapp: "(53) 99999-9999", twitter: "@seuusuario ou link" };
  const mudou = JSON.stringify(cfg) !== original;

  async function enviarLogo(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("imagem", f);
      const resp = await apiFetch("/superadmin/barra-sistema/logo", { method: "POST", body: fd });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || "Erro ao enviar a logo.");
      setCfg(c => ({ ...c, logo_url: d.url, exibicao: c.exibicao === "nome" ? "logo_e_nome" : c.exibicao }));
    } catch (err) { avisar(err.message || "Erro ao enviar a logo."); }
    setEnviando(false);
  }

  async function removerLogo() {
    if (!(await confirmar({ titulo: "Tirar a logo da barra?", texto: "A logo só sai de verdade quando você clicar em Salvar.", botao: "Tirar" }))) return;
    setCfg(c => ({ ...c, logo_url: "", exibicao: "nome" }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const resp = await apiFetch("/superadmin/barra-sistema", { method: "PUT", body: JSON.stringify(cfg) });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || "Erro ao salvar.");
      const novo = mesclarBarra(d.config);
      setCfg(novo); setOriginal(JSON.stringify(novo));
      avisar({ titulo: "Barra salva", texto: "Quem está com o sistema aberto vê a mudança ao recarregar a página.", tom: "ok" });
    } catch (err) { avisar(err.message || "Erro ao salvar."); }
    setSalvando(false);
  }

  return (
    <LayoutAdmin>
      <div className="sa-wrapper">
        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">⚙️ Painel Administrativo</span>
            <h1 className="sa-page-title">Barra do <span>Sistema</span></h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>← Voltar ao painel</button>
          </div>
        </div>

        {carregando ? (
          <div className="sa-loading"><div className="sa-spinner" /> Carregando...</div>
        ) : (
          <div className="bs-grade">
            <div className="sa-config-box">
              <div className="sa-config-header">
                <div className="sa-config-header-left">
                  <span className="sa-config-icon">🧭</span>
                  <div>
                    <div className="sa-config-title">Configurações da barra</div>
                    <div className="sa-config-subtitle">A barra fica no rodapé do sistema de todos os estabelecimentos, junto com a licença, o Fale Conosco, o tema e o Sair.</div>
                  </div>
                </div>
              </div>
              <div className="sa-config-body bs-corpo">
                <div className="bs-barra-acoes">
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAbertas(TODAS)}>Expandir tudo</button>
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAbertas([])}>Recolher tudo</button>
                </div>
                <Secao id="marca" icone="🏷️" titulo="Marca e logo" resumo="Nome, link, logo e o texto “Desenvolvido por”" abertas={abertas} alternar={alternar}>
                <label className="bs-chave">
                  <input type="checkbox" checked={!!cfg.mostrar_marca} onChange={e => set("mostrar_marca", e.target.checked)} />
                  <span>Mostrar a marca do sistema na barra</span>
                </label>

                <label className="bs-chave">
                  <input type="checkbox" checked={!!cfg.mostrar_prefixo} onChange={e => set("mostrar_prefixo", e.target.checked)} />
                  <span>Mostrar texto antes da marca</span>
                </label>
                {cfg.mostrar_prefixo && (
                  <div className="bs-campo">
                    <span className="sa-config-item-label">Texto antes da marca</span>
                    <input className="sa-config-textfield" maxLength={30} value={cfg.prefixo} placeholder="Desenvolvido por" onChange={e => set("prefixo", e.target.value)} />
                  </div>
                )}

                <div className="bs-campo">
                  <span className="sa-config-item-label">Nome</span>
                  <input className="sa-config-textfield" maxLength={60} value={cfg.nome} placeholder="Lucas J. Systems" onChange={e => set("nome", e.target.value)} />
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">Link (opcional)</span>
                  <input className="sa-config-textfield" maxLength={300} value={cfg.link} placeholder="https://seusite.com.br" onChange={e => set("link", e.target.value)} />
                  <span className="sa-config-hint">Ao clicar na marca, abre este endereço em uma nova aba. Em branco, a marca fica sem clique.</span>
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">Logo</span>
                  <div className="bs-logo">
                    <div className="bs-logo-prev">{cfg.logo_url ? <img src={cfg.logo_url} alt="Logo da barra" /> : <span>Sem logo</span>}</div>
                    <div className="bs-logo-botoes">
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={enviando} onClick={() => logoRef.current?.click()}>{enviando ? "⏳ Enviando…" : cfg.logo_url ? "🔄 Trocar logo" : "📷 Enviar logo"}</button>
                      {cfg.logo_url && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={removerLogo}>🗑️ Tirar</button>}
                      <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }} onChange={enviarLogo} />
                    </div>
                    <span className="sa-config-hint">PNG, JPG, WEBP ou GIF até 5 MB. O servidor reduz e otimiza a imagem sozinho.</span>
                  </div>
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">O que aparece</span>
                  <div className="bs-opcoes">
                    {EXIBICOES.map(o => (
                      <button key={o.v} type="button"
                        className={`bs-opcao${cfg.exibicao === o.v ? " ativo" : ""}`}
                        disabled={o.v !== "nome" && !cfg.logo_url}
                        title={o.v !== "nome" && !cfg.logo_url ? "Envie uma logo primeiro" : undefined}
                        onClick={() => set("exibicao", o.v)}>{o.t}</button>
                    ))}
                  </div>
                </div>

                </Secao>
                <Secao id="mensagens" icone="💬" titulo="Mensagens" resumo="Boas-vindas e texto livre, com fonte, cor e link" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <EditorTexto titulo="Mensagem de boas-vindas" dica="Use {nome} para o primeiro nome de quem entrou. Ex.: Bem-vindo, {nome}!" item={cfg.textos.boas_vindas} onChange={(c, v) => setTexto("boas_vindas", c, v)} previaEscura={previaEscura} />
                  <EditorTexto titulo="Texto livre / link" dica="Um aviso, uma promoção, um link de suporte… o que você quiser." item={cfg.textos.livre} onChange={(c, v) => setTexto("livre", c, v)} previaEscura={previaEscura} />
                  <span className="sa-config-hint">As cores mudam conforme o tema da prévia (use o botão Claro/Escuro ao lado). No celular, as mensagens aparecem no fim do menu.</span>
                </div>

                </Secao>
                <Secao id="whatsapp" icone="🤖" titulo="Chamada do WhatsApp" resumo="Convida a contratar e mostra o agente para quem já assina" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <label className="bs-chave">
                    <input type="checkbox" checked={!!cfg.whatsapp_cta.ativo} onChange={e => setWa("ativo", e.target.checked)} />
                    <span><b>Mostrar a chamada do WhatsApp na barra</b></span>
                  </label>
                  <span className="sa-config-hint">Aparece só para o dono do estabelecimento (quem pode contratar). Clicar leva direto à tela do WhatsApp dele. Escolha o lado da barra em “Ordem e posição”. No celular vira só o ícone.</span>
                </div>
                {cfg.whatsapp_cta.ativo && (
                  <>
                    <label className="bs-chave">
                      <input type="checkbox" checked={!!cfg.whatsapp_cta.animar} onChange={e => setWa("animar", e.target.checked)} />
                      <span>Botão pulsando (chama mais atenção) nos convites</span>
                    </label>
                    {[
                      ["contratar", "Ainda não contratou", "Convite para contratar. Ícone do WhatsApp."],
                      ["pendente", "Pediu e falta concluir", "Plano pedido, aguardando ativação ou pagamento."],
                      ["assinante", "Já assina (agente ativo)", "Mostra o robô com uma bolinha de “ativo”."],
                    ].map(([k, titulo, dica]) => (
                      <div key={k} className="bs-texto">
                        <label className="bs-chave">
                          <input type="checkbox" checked={!!cfg.whatsapp_cta[k].ativa} onChange={e => setWaItem(k, "ativa", e.target.checked)} />
                          <span><b>{titulo}</b></span>
                        </label>
                        {cfg.whatsapp_cta[k].ativa && (
                          <>
                            <input className="sa-config-textfield" maxLength={50} value={cfg.whatsapp_cta[k].texto} onChange={e => setWaItem(k, "texto", e.target.value)} />
                            <span className="sa-config-hint">{dica}</span>
                            <div className="bs-estilos">
                              {ESTILOS_WA.map(o => (
                                <button key={o.v} type="button" className={cfg.whatsapp_cta[k].estilo === o.v ? "on" : ""} style={{ background: o.c }} onClick={() => setWaItem(k, "estilo", o.v)} title={o.t} aria-label={o.t} />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </>
                )}
                </Secao>
                <Secao id="redes" icone="🔗" titulo="Redes sociais" resumo="Instagram, Facebook, WhatsApp e X" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <span className="sa-config-hint">Use as setas ▲ ▼ para mudar a ordem dos ícones.</span>
                  {cfg.ordem_redes.map((r, i) => (
                    <div key={r} className="bs-rede">
                      <span className="bs-rede-ico" style={{ color: REDES[r].cor }} title={REDES[r].nome}>
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={REDES[r].path} /></svg>
                      </span>
                      <input className="sa-config-textfield" maxLength={300} value={cfg.redes?.[r] || ""} placeholder={`${REDES[r].nome}: ${DICAS[r]}`} onChange={e => setRede(r, e.target.value)} />
                      <Setas campo="ordem_redes" i={i} total={cfg.ordem_redes.length} />
                    </div>
                  ))}
                  <span className="sa-config-hint">Aceita link, @usuário ou (no WhatsApp) só o número. Em branco, o ícone não aparece. No celular, os ícones ficam no fim do menu.</span>
                </div>

                </Secao>
                <Secao id="ordem" icone="↔️" titulo="Ordem e posição na barra" resumo="O que vem primeiro e em que lado fica" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <span className="sa-config-hint">Use as setas para mudar a ordem. Em cada item, escolha em qual parte da barra ele fica: esquerda, centro ou direita.</span>
                  {cfg.ordem_blocos.map((b, i) => (
                    <div key={b} className="bs-ordem-item">
                      <span className="bs-ordem-n">{i + 1}</span><span className="bs-ordem-txt">{NOMES_BLOCOS[b]}</span>
                      <span className="bs-pos" role="group" aria-label="Posição na barra">
                        {[["esq", "Esquerda"], ["centro", "Centro"], ["dir", "Direita"]].map(([v, t]) => (
                          <button key={v} type="button" className={cfg.posicoes?.[b] === v ? "on" : ""} onClick={() => setPos(b, v)} title={`Colocar na ${t.toLowerCase()}`}>{t}</button>
                        ))}
                      </span>
                      <Setas campo="ordem_blocos" i={i} total={cfg.ordem_blocos.length} />
                    </div>
                  ))}
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">Botões do canto direito</span>
                  {cfg.ordem_botoes.map((b, i) => (
                    <div key={b} className="bs-ordem-item">
                      <span className="bs-ordem-n">{i + 1}</span><span className="bs-ordem-txt">{NOMES_BOTOES[b]}</span>
                      <Setas campo="ordem_botoes" i={i} total={cfg.ordem_botoes.length} />
                    </div>
                  ))}
                  <span className="sa-config-hint">Os botões ficam sempre juntos, no canto direito da barra.</span>
                </div>
                </Secao>
                <Secao id="tamanho" icone="📐" titulo="Tamanho da barra" resumo="Pequena, média ou grande" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <div className="bs-opcoes">
                    {TAMANHOS.map(o => (
                      <button key={o.v} type="button" className={`bs-opcao${cfg.tamanho === o.v ? " ativo" : ""}`} onClick={() => set("tamanho", o.v)}>
                        {o.t}<small>{o.d}</small>
                      </button>
                    ))}
                  </div>
                </div>

                </Secao>
                <Secao id="versao" icone="🔖" titulo="Versão do sistema" resumo="Mostrar ou não a versão" abertas={abertas} alternar={alternar}>
                <div className="bs-campo">
                  <label className="bs-chave">
                    <input type="checkbox" checked={!!cfg.mostrar_versao} onChange={e => set("mostrar_versao", e.target.checked)} />
                    <span>Mostrar a versão na barra</span>
                  </label>
                  {cfg.mostrar_versao && (
                    <>
                      <input className="sa-config-textfield" maxLength={30} value={cfg.versao} placeholder={`Ex.: 1.4.0 (em branco = automático: ${BUILD_ID || "data do build"})`} onChange={e => set("versao", e.target.value)} />
                      <span className="sa-config-hint">Em branco, mostra a data e o código da última atualização do sistema, que muda sozinha a cada publicação.</span>
                    </>
                  )}
                </div>

                </Secao>

                <div className="bs-acoes">
                  <button type="button" className="sa-btn sa-btn-ghost" disabled={!mudou || salvando} onClick={() => setCfg(JSON.parse(original))}>Desfazer</button>
                  <button type="button" className="sa-btn sa-btn-purple" disabled={!mudou || salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button>
                </div>
              </div>
            </div>

            <div className="sa-config-box bs-previa-box">
              <div className="sa-config-header">
                <div className="sa-config-header-left">
                  <span className="sa-config-icon">👁️</span>
                  <div>
                    <div className="sa-config-title">Prévia</div>
                    <div className="sa-config-subtitle">Como a barra aparece para o estabelecimento.</div>
                  </div>
                </div>
                <div className="bs-previa-botoes">
                  <SeletorWa valor={previaWa} onChange={setPreviaWa} />
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setAmpliada(true)}>⤢ Ampliar</button>
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setPreviaEscura(v => !v)}>{previaEscura ? "☀️ Claro" : "🌙 Escuro"}</button>
                </div>
              </div>
              <div className="sa-config-body">
                <div className={`bs-previa bs-previa--mini ${previaEscura ? "escuro" : "claro"}`} onClick={() => setAmpliada(true)} title="Clique para ver em tamanho real" style={{ "--est-barra-h": `${BARRA_ALTURAS[cfg.tamanho] || 38}px` }}>
                  <div className="bs-previa-tela">Tela do sistema</div>
                  <BarraInferior cfg={cfg} nome="Maria Souza" whatsapp={previaWa} onWhatsApp={() => {}} licenca={LICENCA_EXEMPLO} isDark={previaEscura} onFaleConosco={() => {}} onTema={() => setPreviaEscura(v => !v)} onSair={() => {}} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {ampliada && (
        <PreviaReal cfg={cfg} escura={previaEscura} setEscura={setPreviaEscura} previaWa={previaWa} setPreviaWa={setPreviaWa} onClose={() => setAmpliada(false)} />
      )}
    </LayoutAdmin>
  );
}
