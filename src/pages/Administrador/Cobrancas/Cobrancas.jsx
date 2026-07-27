// src/pages/Administrador/Cobrancas/Cobrancas.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { supabase } from "../../../utils/supabaseClient";
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
function calcularDiff(dataStr) {
  if (!dataStr) return null;
  const venc = new Date(dataStr + "T12:00:00");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  venc.setHours(0, 0, 0, 0);
  return Math.round((venc - hoje) / (1000 * 60 * 60 * 24));
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
  if (pagamento.linkCartao)   partes.push(`💳 Cartão: ${pagamento.linkCartao}`);
  if (pagamento.pixCopiaCola) partes.push(`📱 Pix (copia e cola):\n${pagamento.pixCopiaCola}`);
  return partes.length > 0
    ? partes.join("\n\n")
    : "⚠️ Não consegui gerar o link agora — acesse o sistema e clique em \"Renovar agora\".";
}
function interpolar(template, m, diff, valorPadrao, pagamento) {
  const dias = diff === null ? "?" : Math.abs(diff);
  const valor = m.valor_mensalidade
    ? parseFloat(m.valor_mensalidade).toFixed(2).replace(".", ",")
    : (valorPadrao ? valorPadrao.toFixed(2).replace(".", ",") : "");
  return (template || "")
    .replaceAll("{nome}", m.nome_fantasia || "")
    .replaceAll("{dias}", String(dias))
    .replaceAll("{situacao}", situacaoTexto(diff))
    .replaceAll("{vencimento}", formatarData(m.data_vencimento))
    .replaceAll("{valor}", valor)
    .replaceAll("{link_pagamento}", blocoPagamento(pagamento));
}

/* ═══════════════════════════════════════════════════════════ */
export default function Cobrancas() {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [lista,   setLista]     = useState([]);
  const [config,  setConfig]    = useState(null);
  const [processando, setProcessando] = useState(null);
  const [mostrarCobrados, setMostrarCobrados] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");
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

  const [configAberta,   setConfigAberta]   = useState(false);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [msgConfig,      setMsgConfig]      = useState("");

  function mostrarToast(tipo, texto, duracao = 6000) {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), duracao);
  }

  async function carregar() {
    setLoading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL;
      const [rLista, rConfig] = await Promise.all([
        fetch(`${API_URL}/admin/estabelecimentos/listar`),
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

  const tiposDisponiveis = useMemo(() => {
    return [...new Set(lista.map(m => m.tipo_estabelecimento).filter(Boolean))].sort();
  }, [lista]);

  const { pendentes, cobradosHoje } = useMemo(() => {
    if (!config) return { pendentes: [], cobradosHoje: [] };
    const diasAviso = config.dias_aviso || 5;

    const elegiveis = lista
      .filter(m => m.status_assinatura !== "excluida")
      .filter(m => !filtroTipo || m.tipo_estabelecimento === filtroTipo)
      .map(m => ({ ...m, _diff: calcularDiff(m.data_vencimento) }))
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
      };
    } catch {
      return { linkCartao: null, pixCopiaCola: null };
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
    const telefone = (m.telefone || "").replace(/\D/g, "");
    if (!telefone) {
      alert(`"${m.nome_fantasia}" não tem telefone cadastrado.`);
      return;
    }
    setProcessando(m.id);

    const pagamento = await gerarLinkPagamento(m.id);
    const mensagem  = interpolar(config.msg_whatsapp, m, m._diff, undefined, pagamento);

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
    const assunto = interpolar(config.email_assunto, m, m._diff, undefined, pagamento);
    const corpo   = interpolar(config.email_corpo, m, m._diff, undefined, pagamento);

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

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="cob-loading"><div className="spinner" /><span>Carregando cobranças...</span></div>
      </LayoutAdmin>
    );
  }

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
            <button className="btn btn-ghost btn-sm" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="btn btn-ghost btn-sm" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
            <button className="btn btn-ghost" onClick={() => setConfigAberta(p => !p)}>
              {configAberta ? "✕ Fechar" : "⚙️ Mensagem, imagem e janela"}
            </button>
          </div>
        </div>

        {configAberta && config && (
          <div className="cob-config-box">
            <div className="cob-config-item">
              <div className="cob-config-item-info">
                <span className="cob-config-item-label">⏱ Janela de dias antes do vencimento</span>
                <span className="cob-config-item-desc">Vale pros dois: o botão de renovar antecipado no estabelecimento e essa lista aqui.</span>
              </div>
              <div className="cob-config-item-control">
                <input className="cob-config-input" type="number" min={1} max={60} style={{ width: 70 }}
                  value={config.dias_aviso} onChange={e => setConfig(prev => ({ ...prev, dias_aviso: e.target.value }))} />
                <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>dias</span>
              </div>
            </div>

            <div className="cob-config-variaveis">
              Variáveis disponíveis: <code>{"{nome}"}</code> <code>{"{situacao}"}</code> <code>{"{dias}"}</code>{" "}
              <code>{"{vencimento}"}</code> <code>{"{valor}"}</code> <code>{"{link_pagamento}"}</code>
              <div style={{ marginTop: 6 }}>
                <code>{"{situacao}"}</code> se ajusta sozinho ("vence em 3 dias" / "vence hoje" / "venceu há 2 dias").{" "}
                <code>{"{link_pagamento}"}</code> gera o link do cartão + o Pix copia-e-cola na hora de cobrar, prontos pra pagar sem precisar entrar no sistema.
              </div>
            </div>

            <div className="cob-config-item cob-config-item--full">
              <span className="cob-config-item-label">💬 Mensagem do WhatsApp</span>
              <textarea className="cob-config-input" rows={5}
                value={config.msg_whatsapp} onChange={e => setConfig(prev => ({ ...prev, msg_whatsapp: e.target.value }))} />
            </div>

            <div className="cob-config-item cob-config-item--full">
              <span className="cob-config-item-label">✉️ Assunto do e-mail</span>
              <input className="cob-config-input"
                value={config.email_assunto} onChange={e => setConfig(prev => ({ ...prev, email_assunto: e.target.value }))} />
            </div>

            <div className="cob-config-item cob-config-item--full">
              <span className="cob-config-item-label">✉️ Corpo do e-mail</span>
              <textarea className="cob-config-input" rows={5}
                value={config.email_corpo} onChange={e => setConfig(prev => ({ ...prev, email_corpo: e.target.value }))} />
            </div>

            <div className="cob-config-item cob-config-item--full">
              <span className="cob-config-item-label">🖼️ Imagem padrão (opcional)</span>
              <span className="cob-config-item-desc" style={{ marginBottom: 4 }}>
                Não anexa sozinha no link do WhatsApp — mas ao clicar em "Cobrar WhatsApp" ela já vai copiada pra área de transferência (Ctrl+V no WhatsApp Web depois do texto).
              </span>
              {config.imagem_url ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img src={config.imagem_url} alt="Imagem da cobrança" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)" }} />
                  <button className="btn btn-ghost btn-sm" onClick={removerImagem}>🗑 Remover</button>
                </div>
              ) : (
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Nenhuma imagem definida ainda.</span>
              )}
              <label className="btn btn-ghost btn-sm" style={{ width: "fit-content", cursor: "pointer", marginTop: 6 }}>
                {enviandoImagem ? "⏳ Enviando…" : (config.imagem_url ? "🔄 Trocar imagem" : "+ Enviar imagem")}
                <input type="file" accept="image/*" onChange={enviarImagem} disabled={enviandoImagem} style={{ display: "none" }} />
              </label>
            </div>

            {msgConfig && <div className={`cob-config-msg ${msgConfig.startsWith("✓") ? "sucesso" : "erro"}`}>{msgConfig}</div>}
            <button className="cob-btn-salvar" onClick={salvarConfig} disabled={salvandoConfig}>
              {salvandoConfig ? "⏳ Salvando…" : "✓ Salvar configurações"}
            </button>
          </div>
        )}

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
                    {m.telefone && <span>📱 {m.telefone}</span>}
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

      {toast && (
        <div className={`cob-toast cob-toast--${toast.tipo}`}>{toast.texto}</div>
      )}
    </LayoutAdmin>
  );
}