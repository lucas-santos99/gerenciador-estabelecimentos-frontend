// src/pages/Administrador/Cobrancas/Cobrancas.jsx
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { supabase } from "../../../utils/supabaseClient";
import { TIMEZONE_PADRAO, hojeStrTZ, diasEntre } from "../../../utils/fusoHorario";
import "./Cobrancas.css";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

/* ── helpers de data/texto ────────────────────────────────── */
function formatarData(dataStr) {
  if (!dataStr) return "—";
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}
// Dias até o vencimento, calculado no fuso OFICIAL de cada estabelecimento
// (mercearias.timezone) — antes usava setHours(0,0,0,0) no fuso de quem
// está logado como SuperAdmin, o que podia mostrar a contagem errada por
// até algumas horas perto da virada do dia.
function calcularDiff(dataStr, timezone) {
  if (!dataStr) return null;
  return diasEntre(hojeStrTZ(timezone || TIMEZONE_PADRAO), dataStr);
}
function mesmoDia(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString();
}
function classVenc(diff) {
  if (diff === null) return "cob-nd";
  if (diff < 0)  return "cob-vencido";
  if (diff <= 2) return "cob-urgente";
  return "cob-alerta";
}
function textoDias(diff) {
  if (diff === null) return "Sem vencimento";
  if (diff === 0)    return "Vence hoje";
  if (diff < 0)      return `Vencido há ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? "s" : ""}`;
  return `Vence em ${diff} dia${diff > 1 ? "s" : ""}`;
}
function situacaoTexto(diff) {
  if (diff === null) return "vence em breve";
  if (diff === 0)    return "vence hoje";
  if (diff < 0)      return `venceu há ${Math.abs(diff)} dia${Math.abs(diff) > 1 ? "s" : ""}`;
  return `vence em ${diff} dia${diff > 1 ? "s" : ""}`;
}
function blocoPagamento(pagamento) {
  if (!pagamento) return "";
  const partes = [];
  if (pagamento.pixCopiaCola) partes.push(`📱 COPIE A CHAVE PIX (copia e cola) PARA PAGAR NO SEU BANCO:\n${pagamento.pixCopiaCola}`);
  if (pagamento.linkCartao)   partes.push(`💳 CLIQUE AQUI PARA PAGAR COM CARTÃO DE CRÉDITO: ${pagamento.linkCartao}`);
  return partes.length > 0
    ? partes.join("\n\n")
    : "⚠️ Não consegui gerar o link agora — acesse o sistema e clique em \"Renovar agora\".";
}
function interpolar(template, m, diff, pagamento) {
  const dias = diff === null ? "?" : Math.abs(diff);
  const valorNum = pagamento?.valor ?? m.valor_mensalidade ?? null;
  const valor = valorNum !== null ? parseFloat(valorNum).toFixed(2).replace(".", ",") : "";
  return (template || "")
    .replaceAll("{nome}", m.nome_fantasia || "")
    .replaceAll("{dias}", String(dias))
    .replaceAll("{situacao}", situacaoTexto(diff))
    .replaceAll("{vencimento}", formatarData(m.data_vencimento))
    .replaceAll("{valor}", valor)
    .replaceAll("{link_pagamento}", blocoPagamento(pagamento));
}

// Fontes/tamanhos oferecidos no editor da mensagem da notificação de
// canto de tela — mesmo mecanismo de Comunicados.jsx (execCommand),
// reimplementado aqui em vez de importado, porque CSS/handlers desse
// editor não são compartilhados entre páginas neste projeto.
const NOTIF_FONTES_DISPONIVEIS = [
  { valor: "inherit",              label: "Padrão" },
  { valor: "Arial, sans-serif",    label: "Arial" },
  { valor: "Georgia, serif",       label: "Georgia (serifa)" },
  { valor: "'Courier New', monospace", label: "Monoespaçada" },
  { valor: "Verdana, sans-serif",  label: "Verdana" },
];
const NOTIF_TAMANHOS_FONTE = [12, 14, 16, 18, 20, 24, 28, 32, 40];

/* ═══════════════════════════════════════════════════════════ */
export default function Cobrancas() {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [lista,   setLista]     = useState([]);
  // Número escolhido pra cobrança de WhatsApp, por estabelecimento —
  // chave = mercearia_id, valor = telefone selecionado. Sem entrada
  // aqui = usa o telefone principal (comportamento padrão).
  const [telefoneEscolhido, setTelefoneEscolhido] = useState({});
  const [config,  setConfig]    = useState(null);
  const [processando, setProcessando] = useState(null);
  const [mostrarCobrados, setMostrarCobrados] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [tela, setTela] = useState("lista"); // 'lista' | 'config'
  const [fontScale, setFontScale] = useState(() => {
    const s = localStorage.getItem("cob-font-scale");
    return s ? parseFloat(s) : 1;
  });

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem("cob-font-scale", next);
      return next;
    });
  }

  const [imagemBlob, setImagemBlob] = useState(null);
  const [toast, setToast] = useState(null);

  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [msgConfig,      setMsgConfig]      = useState("");

  // ── Editor de texto rico da notificação de cobrança (canto de tela) ──
  // Título e mensagem têm cada um seu próprio contentEditable/toolbar —
  // mesma mecânica dos dois em Comunicados.jsx (editorTituloRef/editorRef).
  const notifEditorTituloRef = useRef(null);
  const notifSelecaoTituloRef = useRef(null);
  function notifSalvarSelecaoTitulo() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && notifEditorTituloRef.current?.contains(sel.anchorNode)) {
      notifSelecaoTituloRef.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function notifRestaurarSelecaoTitulo() {
    notifEditorTituloRef.current?.focus();
    const range = notifSelecaoTituloRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function notifAoDigitarTitulo() {
    if (!notifEditorTituloRef.current) return;
    setConfig(prev => ({
      ...prev,
      notif_titulo_html: notifEditorTituloRef.current.innerHTML,
      notif_titulo:       notifEditorTituloRef.current.innerText,
    }));
  }
  function notifAoColarTitulo(e) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, texto);
    notifAoDigitarTitulo();
  }
  // Título é uma linha só — Enter não deve quebrar linha dentro dele.
  function notifAoTeclarTitulo(e) {
    if (e.key === "Enter") e.preventDefault();
  }
  function notifAplicarFormatoTitulo(comando, valor) {
    notifRestaurarSelecaoTitulo();
    document.execCommand(comando, false, valor);
    notifAoDigitarTitulo();
  }

  const notifEditorRef = useRef(null);
  const notifSelecaoRef = useRef(null);
  function notifSalvarSelecao() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && notifEditorRef.current?.contains(sel.anchorNode)) {
      notifSelecaoRef.current = sel.getRangeAt(0).cloneRange();
    }
  }
  function notifRestaurarSelecao() {
    notifEditorRef.current?.focus();
    const range = notifSelecaoRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function notifAoDigitar() {
    if (!notifEditorRef.current) return;
    setConfig(prev => ({
      ...prev,
      notif_mensagem_html: notifEditorRef.current.innerHTML,
      notif_mensagem:       notifEditorRef.current.innerText,
    }));
  }
  // Cola sempre como texto puro — evita HTML/scripts colados entrando
  // no conteúdo salvo (mesma regra do editor de Comunicados).
  function notifAoColar(e) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, texto);
    notifAoDigitar();
  }
  function notifAplicarFormato(comando, valor) {
    notifRestaurarSelecao();
    document.execCommand(comando, false, valor);
    notifAoDigitar();
  }
  // Tamanho de fonte (título ou mensagem) — mesmo truque de sempre:
  // execCommand('fontSize') só aceita os 7 tamanhos relativos antigos,
  // então aplica "7" como marcador e troca cada <font size="7"> por um
  // <span style="font-size:Npx"> de verdade.
  function notifAplicarTamanhoFonte(px, opcoes = {}) {
    const doTitulo = !!opcoes.titulo;
    const ref = doTitulo ? notifEditorTituloRef : notifEditorRef;
    if (doTitulo) notifRestaurarSelecaoTitulo(); else notifRestaurarSelecao();
    document.execCommand("fontSize", false, "7");
    ref.current?.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute("size");
      f.style.fontSize = `${px}px`;
    });
    if (doTitulo) notifAoDigitarTitulo(); else notifAoDigitar();
  }

  function mostrarToast(tipo, texto, duracao = 6000) {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), duracao);
  }

  async function carregar() {
    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL;
      const [rLista, rConfig] = await Promise.all([
        apiFetch(`/admin/estabelecimentos/listar`),
        apiFetch("/superadmin/config-cobranca"),
      ]);
      const listaData  = (await rLista.json()) || [];
      const configData = rConfig.ok ? await rConfig.json() : null;
      setLista(listaData);
      setConfig(configData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!config?.imagem_url) { setImagemBlob(null); return; }
    fetch(config.imagem_url)
      .then(r => r.blob())
      .then(setImagemBlob)
      .catch(() => setImagemBlob(null));
  }, [config?.imagem_url]);

  // Sincroniza o conteúdo do editor rico da notificação sempre que a
  // tela de config abre — só nessa hora, mesmo motivo de Comunicados.jsx
  // (o editor vira a fonte da verdade do próprio conteúdo depois de aberto).
  useEffect(() => {
    if (tela !== "config" || !config || !notifEditorRef.current) return;
    notifEditorRef.current.innerHTML = config.notif_mensagem_html
      || (config.notif_mensagem ? config.notif_mensagem.replace(/\n/g, "<br>") : "");
    if (notifEditorTituloRef.current) {
      if (config.notif_titulo_html) notifEditorTituloRef.current.innerHTML = config.notif_titulo_html;
      else notifEditorTituloRef.current.textContent = config.notif_titulo || "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, !!config]);

  const tiposDisponiveis = useMemo(() => {
    return [...new Set(lista.map(m => m.tipo_estabelecimento).filter(Boolean))].sort();
  }, [lista]);

  const { pendentes, cobradosHoje } = useMemo(() => {
    if (!config) return { pendentes: [], cobradosHoje: [] };
    const diasAviso = config.dias_aviso || 5;

    const elegiveis = lista
      .filter(m => m.status_assinatura !== "excluida")
      .filter(m => !filtroTipo || m.tipo_estabelecimento === filtroTipo)
      .map(m => ({ ...m, _diff: calcularDiff(m.data_vencimento, m.timezone) }))
      .filter(m => m._diff !== null && m._diff <= diasAviso);

    const pend = elegiveis
      .filter(m => !mesmoDia(m.cobranca_manual_em))
      .sort((a, b) => a._diff - b._diff);

    const cobrados = elegiveis
      .filter(m => mesmoDia(m.cobranca_manual_em))
      .sort((a, b) => a._diff - b._diff);

    return { pendentes: pend, cobradosHoje: cobrados };
  }, [lista, config, filtroTipo]);

  async function copiarImagemClipboard() {
    if (!imagemBlob) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ [imagemBlob.type]: imagemBlob })]);
      return true;
    } catch {
      return false;
    }
  }

  async function gerarLinkPagamento(merceariaId) {
    try {
      const [respCartao, respPix] = await Promise.all([
        apiFetch(`/api/asaas/gerar-cobranca/${merceariaId}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plano: "mensal" }),
        }),
        apiFetch(`/api/efi/gerar-cobranca-pix/${merceariaId}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plano: "mensal" }),
        }),
      ]);
      const dataCartao = await respCartao.json().catch(() => ({}));
      const dataPix     = await respPix.json().catch(() => ({}));
      return {
        linkCartao:   dataCartao.invoice_url_cartao || null,
        pixCopiaCola: dataPix.pix_copy_paste || null,
        valor:        dataPix.valor ?? dataCartao.valor ?? null,
      };
    } catch {
      return { linkCartao: null, pixCopiaCola: null, valor: null };
    }
  }

  async function marcarCobrado(id, canal, desfazer = false) {
    try {
      const resp = await apiFetch(`/admin/estabelecimentos/${id}/marcar-cobrado`, {
        method: "POST",
        body:   JSON.stringify({ canal, desfazer }),
      });
      const json = await resp.json();
      if (resp.ok) {
        setLista(prev => prev.map(m => m.id === id ? { ...m, cobranca_manual_em: json.cobranca_manual_em } : m));
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function cobrarWhatsapp(m) {
    // Usa o número escolhido no seletor (se houver mais de um cadastrado);
    // sem escolha explícita, cai no telefone principal — comportamento
    // igual ao de antes, quando só existia um telefone por estabelecimento.
    const numeroEscolhido = telefoneEscolhido[m.id] || m.telefone;
    const telefone = (numeroEscolhido || "").replace(/\D/g, "");
    if (!telefone) {
      alert(`"${m.nome_fantasia}" não tem telefone cadastrado.`);
      return;
    }
    setProcessando(m.id);

    const pagamento = await gerarLinkPagamento(m.id);
    const mensagem  = interpolar(config.msg_whatsapp, m, m._diff, pagamento);

    if (!pagamento.linkCartao && !pagamento.pixCopiaCola) {
      mostrarToast("aviso", "⚠️ Não consegui gerar o link de pagamento agora — a mensagem foi montada sem ele. Tente cobrar de novo em instantes.");
    } else if (imagemBlob) {
      const copiou = await copiarImagemClipboard();
      mostrarToast(copiou ? "ok" : "aviso", copiou
        ? "📋 Imagem copiada! No WhatsApp, cole com Ctrl+V (ou toque e segure → Colar) depois de mandar o texto."
        : "⚠️ Não deu pra copiar a imagem automaticamente nesse navegador — anexe ela manualmente se quiser.");
    }

    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
    await marcarCobrado(m.id, "whatsapp");
    setProcessando(null);
  }

  async function cobrarEmail(m) {
    if (!m.email_contato) {
      alert(`"${m.nome_fantasia}" não tem e-mail cadastrado.`);
      return;
    }
    setProcessando(m.id);

    const pagamento = await gerarLinkPagamento(m.id);
    const assunto = interpolar(config.email_assunto, m, m._diff, pagamento);
    const corpo   = interpolar(config.email_corpo, m, m._diff, pagamento);

    if (!pagamento.linkCartao && !pagamento.pixCopiaCola) {
      mostrarToast("aviso", "⚠️ Não consegui gerar o link de pagamento agora — o e-mail foi montado sem ele. Tente cobrar de novo em instantes.");
    }

    window.location.href = `mailto:${m.email_contato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    await marcarCobrado(m.id, "email");
    setProcessando(null);
  }

  async function salvarConfig() {
    setSalvandoConfig(true);
    setMsgConfig("");
    try {
      const resp = await apiFetch("/superadmin/config-cobranca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dias_aviso:    parseInt(config.dias_aviso),
          msg_whatsapp:  config.msg_whatsapp,
          email_assunto: config.email_assunto,
          email_corpo:   config.email_corpo,
          notif_ativo:                 !!config.notif_ativo,
          notif_titulo:                config.notif_titulo,
          notif_titulo_html:           config.notif_titulo_html,
          notif_mensagem:              config.notif_mensagem,
          notif_mensagem_html:         config.notif_mensagem_html,
          notif_frequencia_tipo:       config.notif_frequencia_tipo,
          notif_frequencia_quantidade: parseInt(config.notif_frequencia_quantidade) || 1,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");
      setMsgConfig("✓ Salvo!");
      setTimeout(() => setMsgConfig(""), 3000);
    } catch (e) { setMsgConfig("❌ " + e.message); }
    setSalvandoConfig(false);
  }

  async function enviarImagem(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setEnviandoImagem(true);
    setMsgConfig("");
    try {
      const token = await getToken();
      const API_URL = import.meta.env.VITE_API_URL;
      const formData = new FormData();
      formData.append("imagem", file);
      const resp = await fetch(`${API_URL}/superadmin/config-cobranca/imagem`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao enviar imagem.");
      setConfig(prev => ({ ...prev, imagem_url: json.imagem_url }));
    } catch (e) { setMsgConfig("❌ " + e.message); }
    setEnviandoImagem(false);
    e.target.value = "";
  }

  async function removerImagem() {
    if (!window.confirm("Remover a imagem padrão da cobrança?")) return;
    try {
      await apiFetch("/superadmin/config-cobranca/imagem", { method: "DELETE" });
      setConfig(prev => ({ ...prev, imagem_url: "" }));
    } catch { alert("Erro ao remover imagem."); }
  }

  /* ── loading ──────────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="cob-loading"><div className="spinner" /><span>Carregando cobranças...</span></div>
      </LayoutAdmin>
    );
  }

  /* ── botões de zoom (reaproveitados nas duas telas) ─────── */
  const ZoomBtns = () => (
    <>
      <button className="cob-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
      <button className="cob-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
    </>
  );

  /* ══════════════════════════════════════════════════════════
     TELA DE CONFIGURAÇÃO — separada da lista, tela cheia
  ══════════════════════════════════════════════════════════ */
  if (tela === "config" && config) {
    return (
      <LayoutAdmin>
        <div className="cob-wrapper" style={{ "--cob-font-scale": fontScale }}>

          <div className="cob-header">
            <div className="cob-header-left">
              <span className="cob-breadcrumb">💳 Painel Administrativo · Cobranças</span>
              <h1 className="cob-title">Configurações de <span>Cobrança</span></h1>
              <p className="cob-subtitle">
                Mensagem, imagem padrão e janela de dias usadas tanto na lista de cobranças quanto no banner de renovação antecipada do estabelecimento.
              </p>
            </div>
            <div className="cob-header-actions">
              <ZoomBtns />
              <button className="cob-btn-voltar" onClick={() => setTela("lista")}>← Voltar pra lista</button>
            </div>
          </div>

          <div className="cob-config-grid">

            <div className="cob-config-col">
              <div className="cob-config-card">
                <div className="cob-config-card-titulo">⏱ Janela de dias</div>
                <p className="cob-config-card-desc">
                  Quantos dias antes do vencimento o estabelecimento já vê o botão de renovar antecipado, e a partir de quando ele entra na lista de cobranças.
                </p>
                <div className="cob-config-dias-control">
                  <input className="cob-config-input cob-config-input--dias" type="number" min={1} max={60}
                    value={config.dias_aviso} onChange={e => setConfig(prev => ({ ...prev, dias_aviso: e.target.value }))} />
                  <span>dias antes do vencimento</span>
                </div>
              </div>

              <div className="cob-config-card">
                <div className="cob-config-card-titulo">🧩 Variáveis disponíveis</div>
                <div className="cob-config-var-lista">
                  <div><code>{"{nome}"}</code><span>Nome do estabelecimento</span></div>
                  <div><code>{"{situacao}"}</code><span>Se ajusta sozinho: "vence em 3 dias" / "vence hoje" / "venceu há 2 dias"</span></div>
                  <div><code>{"{dias}"}</code><span>Só o número de dias</span></div>
                  <div><code>{"{vencimento}"}</code><span>Data de vencimento (DD/MM/AAAA)</span></div>
                  <div><code>{"{valor}"}</code><span>Valor da mensalidade</span></div>
                  <div><code>{"{link_pagamento}"}</code><span>Gera o link do cartão + Pix copia-e-cola na hora de cobrar</span></div>
                </div>
              </div>

              <div className="cob-config-card">
                <div className="cob-config-card-titulo">🖼️ Imagem padrão (opcional)</div>
                <p className="cob-config-card-desc">
                  O link do WhatsApp não anexa imagem sozinho — mas ao clicar em "Cobrar WhatsApp" ela já vai copiada pra área de transferência (Ctrl+V no WhatsApp Web depois do texto).
                </p>
                {config.imagem_url ? (
                  <div className="cob-config-imagem-preview">
                    <img src={config.imagem_url} alt="Imagem da cobrança" />
                    <button className="cob-btn-ghost-sm" onClick={removerImagem}>🗑 Remover</button>
                  </div>
                ) : (
                  <span className="cob-config-sem-imagem">Nenhuma imagem definida ainda.</span>
                )}
                <label className="cob-btn-ghost-sm" style={{ cursor: "pointer", marginTop: 10, width: "fit-content" }}>
                  {enviandoImagem ? "⏳ Enviando…" : (config.imagem_url ? "🔄 Trocar imagem" : "+ Enviar imagem")}
                  <input type="file" accept="image/*" onChange={enviarImagem} disabled={enviandoImagem} style={{ display: "none" }} />
                </label>
              </div>
            </div>

            <div className="cob-config-col">
              <div className="cob-config-card">
                <div className="cob-config-card-titulo">💬 Mensagem do WhatsApp</div>
                <textarea maxLength={2000} className="cob-config-input cob-config-textarea" rows={7}
                  value={config.msg_whatsapp} onChange={e => setConfig(prev => ({ ...prev, msg_whatsapp: e.target.value }))} />
              </div>

              <div className="cob-config-card">
                <div className="cob-config-card-titulo">✉️ E-mail</div>
                <label className="cob-config-sublabel">Assunto</label>
                <input maxLength={200} className="cob-config-input" style={{ marginBottom: 12 }}
                  value={config.email_assunto} onChange={e => setConfig(prev => ({ ...prev, email_assunto: e.target.value }))} />
                <label className="cob-config-sublabel">Corpo</label>
                <textarea maxLength={3000} className="cob-config-input cob-config-textarea" rows={7}
                  value={config.email_corpo} onChange={e => setConfig(prev => ({ ...prev, email_corpo: e.target.value }))} />
              </div>
            </div>

            <div className="cob-config-col">
              <div className="cob-config-card">
                <div className="cob-config-card-titulo">🔔 Notificação no canto de tela</div>
                <p className="cob-config-card-desc">
                  Igual em Comunicados: um card pequeno aparece no canto da tela do
                  comerciante (junto com o banner "Renovar Antecipado" já existente),
                  avisando que o vencimento está próximo. Ao clicar, abre a tela de
                  pagamento (Pix/cartão) — a mesma já usada na renovação antecipada.
                  Usa a mesma imagem padrão configurada aqui em cima.
                </p>

                <label className="cob-config-toggle">
                  <input type="checkbox" checked={!!config.notif_ativo}
                    onChange={e => setConfig(prev => ({ ...prev, notif_ativo: e.target.checked }))} />
                  <span>Ativar notificação no canto de tela</span>
                </label>

                {config.notif_ativo && (
                  <>
                    <label className="cob-config-sublabel" style={{ marginTop: 14 }}>Título</label>
                    <div className="cob-editor-toolbar">
                      <button type="button" className="cob-editor-btn"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => notifAplicarFormatoTitulo("bold")} title="Negrito"
                      ><b>B</b></button>
                      <button type="button" className="cob-editor-btn"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => notifAplicarFormatoTitulo("italic")} title="Itálico"
                      ><i>I</i></button>
                      <span className="cob-editor-separador" />
                      <input type="color" className="cob-editor-cor" title="Cor do texto"
                        defaultValue="#1a1a1a"
                        onMouseDown={notifSalvarSelecaoTitulo}
                        onChange={e => notifAplicarFormatoTitulo("foreColor", e.target.value)} />
                      <select className="cob-editor-fonte" title="Fonte" defaultValue=""
                        onMouseDown={notifSalvarSelecaoTitulo}
                        onChange={e => { if (e.target.value) notifAplicarFormatoTitulo("fontName", e.target.value); e.target.value = ""; }}
                      >
                        <option value="">Fonte…</option>
                        {NOTIF_FONTES_DISPONIVEIS.map(f => (
                          <option key={f.valor} value={f.valor}>{f.label}</option>
                        ))}
                      </select>
                      <select className="cob-editor-fonte" title="Tamanho" defaultValue=""
                        onMouseDown={notifSalvarSelecaoTitulo}
                        onChange={e => { if (e.target.value) notifAplicarTamanhoFonte(Number(e.target.value), { titulo: true }); e.target.value = ""; }}
                      >
                        <option value="">Tamanho…</option>
                        {NOTIF_TAMANHOS_FONTE.map(t => (
                          <option key={t} value={t}>{t}px</option>
                        ))}
                      </select>
                    </div>
                    <div
                      ref={notifEditorTituloRef}
                      className="cob-editor-conteudo cob-editor-conteudo-titulo"
                      contentEditable
                      data-placeholder="Ex: Sua assinatura está vencendo"
                      onInput={notifAoDigitarTitulo}
                      onPaste={notifAoColarTitulo}
                      onKeyDown={notifAoTeclarTitulo}
                      onMouseUp={notifSalvarSelecaoTitulo}
                      onKeyUp={notifSalvarSelecaoTitulo}
                    />

                    <label className="cob-config-sublabel" style={{ marginTop: 14 }}>Mensagem</label>
                    <div className="cob-editor-toolbar">
                      <button type="button" className="cob-editor-btn"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => notifAplicarFormato("bold")} title="Negrito"
                      ><b>B</b></button>
                      <button type="button" className="cob-editor-btn"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => notifAplicarFormato("italic")} title="Itálico"
                      ><i>I</i></button>
                      <span className="cob-editor-separador" />
                      <input type="color" className="cob-editor-cor" title="Cor do texto"
                        defaultValue="#1a1a1a"
                        onMouseDown={notifSalvarSelecao}
                        onChange={e => notifAplicarFormato("foreColor", e.target.value)} />
                      <select className="cob-editor-fonte" title="Fonte" defaultValue=""
                        onMouseDown={notifSalvarSelecao}
                        onChange={e => { if (e.target.value) notifAplicarFormato("fontName", e.target.value); e.target.value = ""; }}
                      >
                        <option value="">Fonte…</option>
                        {NOTIF_FONTES_DISPONIVEIS.map(f => (
                          <option key={f.valor} value={f.valor}>{f.label}</option>
                        ))}
                      </select>
                      <select className="cob-editor-fonte" title="Tamanho" defaultValue=""
                        onMouseDown={notifSalvarSelecao}
                        onChange={e => { if (e.target.value) notifAplicarTamanhoFonte(Number(e.target.value)); e.target.value = ""; }}
                      >
                        <option value="">Tamanho…</option>
                        {NOTIF_TAMANHOS_FONTE.map(t => (
                          <option key={t} value={t}>{t}px</option>
                        ))}
                      </select>
                    </div>
                    <div
                      ref={notifEditorRef}
                      className="cob-editor-conteudo"
                      contentEditable
                      data-placeholder="Ex: Sua assinatura vence em breve. Renove agora pra continuar sem interrupção."
                      onInput={notifAoDigitar}
                      onPaste={notifAoColar}
                      onMouseUp={notifSalvarSelecao}
                      onKeyUp={notifSalvarSelecao}
                    />

                    <label className="cob-config-sublabel" style={{ marginTop: 14 }}>Frequência de exibição</label>
                    <select className="cob-config-input"
                      value={config.notif_frequencia_tipo || "sempre"}
                      onChange={e => setConfig(prev => ({ ...prev, notif_frequencia_tipo: e.target.value }))}
                    >
                      <option value="uma_vez">Mostrar só uma vez</option>
                      <option value="quantidade">Mostrar algumas vezes</option>
                      <option value="sempre">Mostrar sempre (todo login, enquanto durar o aviso)</option>
                    </select>
                    {config.notif_frequencia_tipo === "quantidade" && (
                      <div className="cob-config-dias-control" style={{ marginTop: 8 }}>
                        <input className="cob-config-input cob-config-input--dias" type="number" min={1} max={99}
                          value={config.notif_frequencia_quantidade || 1}
                          onChange={e => setConfig(prev => ({ ...prev, notif_frequencia_quantidade: e.target.value }))} />
                        <span>vezes</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="cob-config-footer">
            {msgConfig && <div className={`cob-config-msg ${msgConfig.startsWith("✓") ? "sucesso" : "erro"}`}>{msgConfig}</div>}
            <button className="cob-btn-salvar" onClick={salvarConfig} disabled={salvandoConfig}>
              {salvandoConfig ? "⏳ Salvando…" : "✓ Salvar configurações"}
            </button>
          </div>

        </div>

        {toast && <div className={`cob-toast cob-toast--${toast.tipo}`}>{toast.texto}</div>}
      </LayoutAdmin>
    );
  }

  /* ══════════════════════════════════════════════════════════
     TELA DE LISTA — cobranças pendentes
  ══════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="cob-wrapper" style={{ "--cob-font-scale": fontScale }}>

        <div className="cob-header">
          <div className="cob-header-left">
            <span className="cob-breadcrumb">💳 Painel Administrativo</span>
            <h1 className="cob-title">Cobranças <span>Pendentes</span></h1>
            <p className="cob-subtitle">
              Estabelecimentos com vencimento em até <strong>{config?.dias_aviso || 5} dia(s)</strong> — ordenados do mais urgente pro menos.
            </p>
          </div>
          <div className="cob-header-actions">
            {tiposDisponiveis.length > 0 && (
              <select className="cob-filtro-tipo" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                <option value="">Todos os tipos</option>
                {tiposDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <ZoomBtns />
            <button className="cob-btn-voltar" onClick={() => setTela("config")}>⚙️ Configurações</button>
          </div>
        </div>

        {pendentes.length === 0 ? (
          <div className="cob-empty">
            <span className="cob-empty-icon">✅</span>
            <p>Nenhuma cobrança pendente no momento.</p>
            <small>A lista mostra estabelecimentos que vencem em até {config?.dias_aviso || 5} dia(s) e ainda não foram cobrados hoje.</small>
          </div>
        ) : (
          <div className="cob-lista">
            {pendentes.map(m => (
              <div key={m.id} className={`cob-item ${classVenc(m._diff)}`}>
                <div className="cob-item-dot" />

                <div className="cob-item-info">
                  <div className="cob-item-nome-linha">
                    <span className="cob-item-nome">{m.nome_fantasia}</span>
                    {m.tipo_estabelecimento && <span className="cob-item-tipo">{m.tipo_estabelecimento}</span>}
                    <span className={`cob-item-badge ${classVenc(m._diff)}`}>{textoDias(m._diff)}</span>
                  </div>
                  <div className="cob-item-detalhes">
                    <span>📅 {formatarData(m.data_vencimento)}</span>
                    {m.telefone && !m.telefones_extras?.length && <span>📱 {m.telefone}</span>}
                    {m.telefone && m.telefones_extras?.length > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        📱
                        <select
                          className="cob-select-telefone"
                          value={telefoneEscolhido[m.id] || m.telefone}
                          onChange={e => setTelefoneEscolhido(prev => ({ ...prev, [m.id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: "inherit", padding: "1px 4px" }}
                          title="Escolher pra qual número enviar a cobrança"
                        >
                          <option value={m.telefone}>{m.telefone} (principal)</option>
                          {m.telefones_extras.map((tel, idx) => (
                            <option key={idx} value={tel}>{tel}</option>
                          ))}
                        </select>
                      </span>
                    )}
                    {m.email_contato && <span>✉️ {m.email_contato}</span>}
                    {m.valor_mensalidade && <span>💰 R$ {parseFloat(m.valor_mensalidade).toFixed(2).replace(".", ",")}</span>}
                  </div>
                </div>

                <div className="cob-item-acoes">
                  <button
                    className="cob-btn cob-btn--whatsapp"
                    disabled={processando === m.id || !m.telefone}
                    onClick={() => cobrarWhatsapp(m)}
                    title={m.telefone ? "Gera o link de pagamento e abre o WhatsApp com a mensagem pronta" : "Sem telefone cadastrado"}
                  >
                    {processando === m.id ? "⏳ Gerando…" : "💬 Cobrar WhatsApp"}
                  </button>
                  <button
                    className="cob-btn cob-btn--email"
                    disabled={processando === m.id || !m.email_contato}
                    onClick={() => cobrarEmail(m)}
                    title={m.email_contato ? "Gera o link de pagamento e abre seu app de e-mail com a mensagem pronta" : "Sem e-mail cadastrado"}
                  >
                    {processando === m.id ? "⏳ Gerando…" : "✉️ Cobrar E-mail"}
                  </button>
                  <button
                    className="cob-btn cob-btn--ghost"
                    onClick={() => navigate(`/admin/estabelecimentos/${m.id}`)}
                    title="Ver/editar estabelecimento"
                  >
                    👁
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {cobradosHoje.length > 0 && (
          <div className="cob-cobrados-box">
            <button className="cob-cobrados-toggle" onClick={() => setMostrarCobrados(p => !p)}>
              {mostrarCobrados ? "▼" : "▶"} Já cobrados hoje ({cobradosHoje.length})
            </button>
            {mostrarCobrados && (
              <div className="cob-lista" style={{ marginTop: 10 }}>
                {cobradosHoje.map(m => (
                  <div key={m.id} className="cob-item cob-item--feito">
                    <div className="cob-item-dot" />
                    <div className="cob-item-info">
                      <div className="cob-item-nome-linha">
                        <span className="cob-item-nome">{m.nome_fantasia}</span>
                        {m.tipo_estabelecimento && <span className="cob-item-tipo">{m.tipo_estabelecimento}</span>}
                        <span className="cob-item-badge cob-feito">✓ Cobrado hoje</span>
                      </div>
                      <div className="cob-item-detalhes">
                        <span>📅 {formatarData(m.data_vencimento)}</span>
                        <span>{textoDias(m._diff)}</span>
                      </div>
                    </div>
                    <div className="cob-item-acoes">
                      <button
                        className="cob-btn cob-btn--ghost"
                        onClick={() => marcarCobrado(m.id, "desfeito", true)}
                        title="Volta pra lista de pendentes (útil se clicou sem querer)"
                      >
                        ↺ Desfazer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {toast && <div className={`cob-toast cob-toast--${toast.tipo}`}>{toast.texto}</div>}
    </LayoutAdmin>
  );
}