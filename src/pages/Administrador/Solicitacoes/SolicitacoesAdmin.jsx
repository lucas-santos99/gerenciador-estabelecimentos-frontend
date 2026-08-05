// src/pages/Administrador/Solicitacoes/SolicitacoesAdmin.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import "./SolicitacoesAdmin.css";

function formatarDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ABAS = [
  { key: "pendente",  label: "Pendentes" },
  { key: "atendida",  label: "Atendidas" },
  { key: "recusada",  label: "Recusadas" },
  { key: "",          label: "Todas" },
];

// Atualiza a lista sozinha a cada 20s — pra ver solicitações novas
// (ou respostas, do lado do estabelecimento) sem precisar recarregar
// a página na mão.
const INTERVALO_ATUALIZACAO = 20000;

export default function SolicitacoesAdmin() {
  const [aba,          setAba]          = useState("pendente");
  const [filtroTipo,      setFiltroTipo]      = useState("");
  const [filtroDataInicio, setFiltroDataInicio] = useState("");
  const [filtroDataFim,    setFiltroDataFim]    = useState("");
  const [lista,        setLista]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [processando,  setProcessando]  = useState(null); // id da solicitação em ação
  const [respostaAberta, setRespostaAberta] = useState(null); // { id, status }
  const [respostaTexto,  setRespostaTexto]  = useState("");

  const [fontScale, setFontScale] = useState(() => {
    const s = localStorage.getItem("sol-font-scale");
    return s ? parseFloat(s) : 1;
  });
  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem("sol-font-scale", next);
      return next;
    });
  }

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const params = new URLSearchParams({
        ...(aba && { status: aba }),
        ...(filtroTipo && { tipo_estabelecimento: filtroTipo }),
        ...(filtroDataInicio && { data_inicio: filtroDataInicio }),
        ...(filtroDataFim && { data_fim: filtroDataFim }),
      });
      const resp = await apiFetch(`/api/solicitacoes/admin?${params}`);
      const data = resp.ok ? await resp.json() : [];
      setLista(data);
    } catch {
      if (!silencioso) setLista([]);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [aba, filtroTipo, filtroDataInicio, filtroDataFim]);

  useEffect(() => { carregar(); }, [carregar]);

  // Atualização automática em segundo plano — sem piscar loading nem
  // precisar recarregar a página pra ver solicitação nova ou resposta.
  useEffect(() => {
    const id = setInterval(() => carregar(true), INTERVALO_ATUALIZACAO);
    return () => clearInterval(id);
  }, [carregar]);

  // Tipos de estabelecimento que aparecem na lista carregada — usado
  // pra montar as opções do filtro sem precisar de outra rota.
  const tiposDisponiveis = useMemo(() => {
    return [...new Set(lista.map(s => s.tipo_estabelecimento).filter(Boolean))].sort();
  }, [lista]);

  function abrirWhatsApp(s) {
    const numero = (s.telefone_estabelecimento || "").replace(/\D/g, "");
    if (!numero) return;
    const msg = `Olá! Sobre a sua solicitação de alteração de dados enviada em ${formatarDataHora(s.criado_em)}...`;
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  function abrirEmail(s) {
    if (!s.email_estabelecimento) return;
    const assunto = `Sobre sua solicitação de alteração de dados — ${s.nome_estabelecimento || ""}`;
    const corpo   = `Olá! Sobre a sua solicitação de alteração de dados enviada em ${formatarDataHora(s.criado_em)}...`;
    window.location.href = `mailto:${s.email_estabelecimento}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
  }

  function abrirResposta(id, status) {
    setRespostaAberta({ id, status });
    setRespostaTexto("");
  }

  async function confirmarResolucao() {
    if (!respostaAberta) return;
    const { id, status } = respostaAberta;
    setProcessando(id);
    try {
      const resp = await apiFetch(`/api/solicitacoes/admin/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, resposta: respostaTexto.trim() || null }),
      });
      if (resp.ok) {
        setRespostaAberta(null);
        carregar();
      }
    } catch { /* fica na tela, usuário tenta de novo */ }
    setProcessando(null);
  }

  return (
    <LayoutAdmin>
      <div className="sol-wrapper" style={{ "--sol-font-scale": fontScale }}>

        <div className="sol-header">
          <div className="sol-header-left">
            <span className="sol-breadcrumb">📨 Painel Administrativo</span>
            <h1 className="sol-title">Solicitações de <span>Alteração</span></h1>
            <p className="sol-subtitle">
              Pedidos de mudança de dados enviados pelos estabelecimentos.
            </p>
          </div>
          <div className="sol-header-actions">
            <button className="sol-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="sol-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
          </div>
        </div>

        <div className="sol-abas">
          {ABAS.map(a => (
            <button
              key={a.key || "todas"}
              className={`sol-aba-btn${aba === a.key ? " ativa" : ""}`}
              onClick={() => setAba(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="sol-filtros">
          <div className="sol-filtro-group">
            <label className="sol-filtro-label">Tipo</label>
            <select className="sol-filtro-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {tiposDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sol-filtro-group">
            <label className="sol-filtro-label">De</label>
            <input className="sol-filtro-input" type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} />
          </div>
          <div className="sol-filtro-group">
            <label className="sol-filtro-label">Até</label>
            <input className="sol-filtro-input" type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} />
          </div>
          {(filtroTipo || filtroDataInicio || filtroDataFim) && (
            <button
              className="sol-filtro-limpar"
              onClick={() => { setFiltroTipo(""); setFiltroDataInicio(""); setFiltroDataFim(""); }}
            >
              ✕ Limpar
            </button>
          )}
        </div>

        {loading ? (
          <div className="sol-loading"><div className="sol-spinner" /> Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="sol-vazio">
            <span className="sol-vazio-icone">📭</span>
            <p>Nenhuma solicitação {aba === "pendente" ? "pendente" : aba ? `"${aba}"` : ""} no momento.</p>
          </div>
        ) : (
          <div className="sol-lista">
            {lista.map(s => (
              <div key={s.id} className={`sol-card sol-card--${s.status}`}>
                <div className="sol-card-topo">
                  <div>
                    <span className="sol-card-estabelecimento">{s.nome_estabelecimento || "Estabelecimento"}</span>
                    <span className={`sol-status-badge sol-status-badge--${s.status}`}>
                      {s.status === "pendente" ? "🕓 Pendente" : s.status === "atendida" ? "✓ Atendida" : "✕ Recusada"}
                    </span>
                  </div>
                  <span className="sol-card-data">{formatarDataHora(s.criado_em)}</span>
                </div>

                <div className="sol-card-meta">
                  Solicitado por: {s.solicitado_por_nome || "—"}
                  {s.telefone_estabelecimento && (
                    <>
                      {" · "}📱 {s.telefone_estabelecimento}
                      <button className="sol-btn-whatsapp" onClick={() => abrirWhatsApp(s)} title="Falar no WhatsApp">
                        💬 WhatsApp
                      </button>
                    </>
                  )}
                  {s.email_estabelecimento && (
                    <button className="sol-btn-email" onClick={() => abrirEmail(s)} title="Enviar e-mail">
                      ✉️ E-mail
                    </button>
                  )}
                </div>

                {(s.campos || []).length > 0 && (
                  <div className="sol-campos">
                    {s.campos.map((c, idx) => (
                      <div className="sol-campo-linha" key={idx}>
                        <span className="sol-campo-label">{c.label}</span>
                        <span className="sol-campo-atual">{c.valor_atual || "—"}</span>
                        <span className="sol-campo-seta">→</span>
                        <span className="sol-campo-novo">{c.valor_novo || "(não informado)"}</span>
                      </div>
                    ))}
                  </div>
                )}

                {s.detalhes && (
                  <div className="sol-detalhes">💬 {s.detalhes}</div>
                )}

                {s.status === "pendente" ? (
                  respostaAberta?.id === s.id ? (
                    <div className="sol-resposta-box">
                      <textarea
                        className="sol-resposta-textarea"
                        rows={2}
                        placeholder="Observação pro estabelecimento (opcional)…"
                        value={respostaTexto}
                        onChange={e => setRespostaTexto(e.target.value)}
                      />
                      <div className="sol-card-acoes">
                        <button className="sol-btn sol-btn-ghost" onClick={() => setRespostaAberta(null)}>
                          Cancelar
                        </button>
                        <button
                          className={`sol-btn ${respostaAberta.status === "atendida" ? "sol-btn-sucesso" : "sol-btn-perigo"}`}
                          disabled={processando === s.id}
                          onClick={confirmarResolucao}
                        >
                          {processando === s.id ? "⏳…" : respostaAberta.status === "atendida" ? "✓ Confirmar e aplicar no cadastro" : "✕ Confirmar recusa"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="sol-card-acoes">
                      <button className="sol-btn sol-btn-ghost" onClick={() => abrirResposta(s.id, "recusada")}>
                        ✕ Recusar
                      </button>
                      <button className="sol-btn sol-btn-sucesso" onClick={() => abrirResposta(s.id, "atendida")}>
                        ✓ Atender
                      </button>
                    </div>
                  )
                ) : (
                  <div className="sol-resolvido">
                    {s.status === "atendida"
                      ? "✓ Atendida e já aplicada no cadastro"
                      : "✕ Recusada"} por {s.atendido_por || "—"} em {formatarDataHora(s.atendido_em)}
                    {s.resposta && <div className="sol-resposta-final">💬 {s.resposta}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </LayoutAdmin>
  );
}