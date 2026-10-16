// src/pages/Administrador/SuperAdmins/BarraSistema.jsx
// ============================================================
// BARRA INFERIOR DO SISTEMA (16/10/2026)
// Controla a faixa fina do rodapé do sistema dos estabelecimentos: nome da
// marca, link, logo, o que mostrar (só nome / só logo / logo + nome) e o
// tamanho da barra. Qualquer SuperAdmin edita. Salvo em
// config_sistema.barra_sistema (GET/PUT /superadmin/barra-sistema).
// ============================================================
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { avisar, confirmar } from "../../../components/Dialogo/dialogo";
import { REDES, ORDEM_REDES } from "../../../utils/redesIcones";
import BarraInferior from "../../../components/BarraInferior/BarraInferior";
import { BARRA_PADRAO, BARRA_ALTURAS } from "../../../utils/barraSistema";
import "./SuperAdmins.css";
import "./BarraSistema.css";

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

export default function BarraSistema() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState(BARRA_PADRAO);
  const [original, setOriginal] = useState(JSON.stringify(BARRA_PADRAO));
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [previaEscura, setPreviaEscura] = useState(false);
  const logoRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await apiFetch("/superadmin/barra-sistema");
        if (resp.ok) {
          const j = await resp.json();
          const d = { ...BARRA_PADRAO, ...j, redes: { ...BARRA_PADRAO.redes, ...(j.redes || {}) } };
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
  const NOMES_BLOCOS = { licenca: "Situação da licença", marca: "Marca do sistema (Desenvolvido por…)", redes: "Redes sociais" };
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
      const novo = { ...BARRA_PADRAO, ...d.config, redes: { ...BARRA_PADRAO.redes, ...(d.config?.redes || {}) } };
      setCfg(novo); setOriginal(JSON.stringify(novo));
      avisar("Barra salva. Quem está com o sistema aberto vê a mudança ao recarregar a página.");
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
                    <div className="sa-config-title">Marca e tamanho</div>
                    <div className="sa-config-subtitle">A barra fica no rodapé do sistema de todos os estabelecimentos, junto com a licença, o Fale Conosco, o tema e o Sair.</div>
                  </div>
                </div>
              </div>
              <div className="sa-config-body bs-corpo">
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

                <div className="bs-campo">
                  <span className="sa-config-item-label">Tamanho da barra</span>
                  <div className="bs-opcoes">
                    {TAMANHOS.map(o => (
                      <button key={o.v} type="button" className={`bs-opcao${cfg.tamanho === o.v ? " ativo" : ""}`} onClick={() => set("tamanho", o.v)}>
                        {o.t}<small>{o.d}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">Ordem na barra (da esquerda para a direita)</span>
                  {cfg.ordem_blocos.map((b, i) => (
                    <div key={b} className="bs-ordem-item">
                      <span className="bs-ordem-n">{i + 1}</span><span className="bs-ordem-txt">{NOMES_BLOCOS[b]}</span>
                      <Setas campo="ordem_blocos" i={i} total={cfg.ordem_blocos.length} />
                    </div>
                  ))}
                  <span className="sa-config-hint">Os botões Fale Conosco, Modo escuro e Sair ficam sempre no canto direito.</span>
                </div>

                <div className="bs-campo">
                  <span className="sa-config-item-label">Redes sociais (use as setas para mudar a ordem dos ícones)</span>
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
                <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setPreviaEscura(v => !v)}>{previaEscura ? "☀️ Claro" : "🌙 Escuro"}</button>
              </div>
              <div className="sa-config-body">
                <div className={`bs-previa ${previaEscura ? "escuro" : "claro"}`} style={{ "--est-barra-h": `${BARRA_ALTURAS[cfg.tamanho] || 38}px` }}>
                  <div className="bs-previa-tela">Tela do sistema</div>
                  <BarraInferior cfg={cfg} licenca={LICENCA_EXEMPLO} isDark={previaEscura} onFaleConosco={() => {}} onTema={() => setPreviaEscura(v => !v)} onSair={() => {}} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </LayoutAdmin>
  );
}
