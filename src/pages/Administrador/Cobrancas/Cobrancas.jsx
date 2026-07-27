// src/pages/Administrador/Cobrancas/Cobrancas.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import "./Cobrancas.css";

/* ── helpers ──────────────────────────────────────────────── */
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
function interpolar(template, m, diff, valorPadrao) {
  const dias = diff === null ? "?" : Math.abs(diff);
  const valor = m.valor_mensalidade
    ? parseFloat(m.valor_mensalidade).toFixed(2).replace(".", ",")
    : (valorPadrao ? valorPadrao.toFixed(2).replace(".", ",") : "");
  return (template || "")
    .replaceAll("{nome}", m.nome_fantasia || "")
    .replaceAll("{dias}", String(dias))
    .replaceAll("{vencimento}", formatarData(m.data_vencimento))
    .replaceAll("{valor}", valor);
}

/* ═══════════════════════════════════════════════════════════ */
export default function Cobrancas() {
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [lista,   setLista]     = useState([]);
  const [config,  setConfig]    = useState(null);
  const [processando, setProcessando] = useState(null); // id em andamento
  const [mostrarCobrados, setMostrarCobrados] = useState(false);
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

  /* ── separação pendentes / já cobrados hoje ──────────────── */
  const { pendentes, cobradosHoje } = useMemo(() => {
    if (!config) return { pendentes: [], cobradosHoje: [] };
    const diasAviso = config.dias_aviso || 5;

    const elegiveis = lista
      .filter(m => m.status_assinatura !== "excluida")
      .map(m => ({ ...m, _diff: calcularDiff(m.data_vencimento) }))
      .filter(m => m._diff !== null && m._diff <= diasAviso);

    const pend = elegiveis
      .filter(m => !mesmoDia(m.cobranca_manual_em))
      .sort((a, b) => a._diff - b._diff);

    const cobrados = elegiveis
      .filter(m => mesmoDia(m.cobranca_manual_em))
      .sort((a, b) => a._diff - b._diff);

    return { pendentes: pend, cobradosHoje: cobrados };
  }, [lista, config]);

  /* ── copiar imagem padrão pra área de transferência ──────── */
  async function copiarImagemClipboard() {
    if (!config?.imagem_url) return false;
    try {
      const resp = await fetch(config.imagem_url);
      const blob = await resp.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      return true;
    } catch {
      // Navegador não suporta (Firefox/Safari) ou permissão negada —
      // segue sem travar o fluxo, só não cola a imagem sozinho.
      return false;
    }
  }

  async function marcarCobrado(id, canal, desfazer = false) {
    setProcessando(id);
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
    setProcessando(null);
  }

  async function cobrarWhatsapp(m) {
    const mensagem = interpolar(config.msg_whatsapp, m, m._diff);
    const telefone = (m.telefone || "").replace(/\D/g, "");
    if (!telefone) {
      alert(`"${m.nome_fantasia}" não tem telefone cadastrado.`);
      return;
    }
    if (config.imagem_url) await copiarImagemClipboard();
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
    marcarCobrado(m.id, "whatsapp");
  }

  function cobrarEmail(m) {
    const assunto = interpolar(config.email_assunto, m, m._diff);
    const corpo   = interpolar(config.email_corpo, m, m._diff);
    if (!m.email_contato) {
      alert(`"${m.nome_fantasia}" não tem e-mail cadastrado.`);
      return;
    }
    window.location.href = `mailto:${m.email_contato}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
    marcarCobrado(m.id, "email");
  }

  /* ── loading ──────────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="cob-loading"><div className="spinner" /><span>Carregando cobranças...</span></div>
      </LayoutAdmin>
    );
  }

  /* ══════════════════════════════════════════════════════════ */
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
            <button className="btn btn-ghost btn-sm" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="btn btn-ghost btn-sm" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
            <button className="btn btn-ghost" onClick={() => navigate("/admin/configuracoes-globais")}>⚙️ Editar mensagem/imagem</button>
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
                    title={m.telefone ? "Abre o WhatsApp com a mensagem pronta" : "Sem telefone cadastrado"}
                  >
                    💬 Cobrar WhatsApp
                  </button>
                  <button
                    className="cob-btn cob-btn--email"
                    disabled={processando === m.id || !m.email_contato}
                    onClick={() => cobrarEmail(m)}
                    title={m.email_contato ? "Abre seu app de e-mail com a mensagem pronta" : "Sem e-mail cadastrado"}
                  >
                    ✉️ Cobrar E-mail
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

        {/* ── Já cobrados hoje ─────────────────────────────── */}
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
                        disabled={processando === m.id}
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
    </LayoutAdmin>
  );
}