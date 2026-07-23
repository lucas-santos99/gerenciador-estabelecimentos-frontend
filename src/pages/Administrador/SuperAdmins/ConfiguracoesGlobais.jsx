// src/pages/Administrador/SuperAdmins/ConfiguracoesGlobais.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { supabase } from "../../../utils/supabaseClient";
import "./SuperAdmins.css";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function ConfiguracoesGlobais() {
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [carregando,   setCarregando]   = useState(true);
  const [aba,          setAba]          = useState("geral"); // 'geral' | 'tela' | 'contatos'

  // Config geral
  const [cfgLimite,       setCfgLimite]       = useState(3);
  const [cfgMensalidade,  setCfgMensalidade]  = useState("49,90");
  const [salvandoGeral,   setSalvandoGeral]   = useState(false);
  const [msgGeral,        setMsgGeral]        = useState("");

  // Tela de bloqueio
  const [cfgTelaTitulo,     setCfgTelaTitulo]     = useState("");
  const [cfgTelaMensagem,   setCfgTelaMensagem]   = useState("");
  const [cfgTelaInfo,       setCfgTelaInfo]       = useState("");
  const [cfgPromoAtiva,     setCfgPromoAtiva]     = useState(false);
  const [cfgPromoTexto,     setCfgPromoTexto]     = useState("");
  const [cfgPromoValidade,  setCfgPromoValidade]  = useState("");
  const [salvandoTela,      setSalvandoTela]      = useState(false);
  const [msgTela,           setMsgTela]           = useState("");

  // Contatos de suporte
  const [contatos,      setContatos]      = useState([]);
  const [novoTipo,       setNovoTipo]      = useState("whatsapp");
  const [novoValor,      setNovoValor]     = useState("");
  const [novoLabel,      setNovoLabel]     = useState("");
  const [salvandoContato, setSalvandoContato] = useState(false);
  const [msgContato,      setMsgContato]      = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [rGeral, rTela, rContatos] = await Promise.all([
        fetch(`${API_URL}/superadmin/config`, { headers }),
        fetch(`${API_URL}/superadmin/config-tela-bloqueio`, { headers }),
        fetch(`${API_URL}/superadmin/contatos-suporte`, { headers }),
      ]);

      if (rGeral.ok) {
        const d = await rGeral.json();
        setCfgLimite(d.limite_operadores_padrao ?? 3);
        setCfgMensalidade(parseFloat(d.valor_mensalidade ?? 49.9).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
      if (rTela.ok) {
        const d = await rTela.json();
        setCfgTelaTitulo(d.titulo || "");
        setCfgTelaMensagem(d.mensagem || "");
        setCfgTelaInfo(d.info || "");
        setCfgPromoAtiva(!!d.promo_ativa);
        setCfgPromoTexto(d.promo_texto || "");
        setCfgPromoValidade(d.promo_validade || "");
      }
      if (rContatos.ok) setContatos(await rContatos.json());
    } catch { /* silencioso */ }
    setCarregando(false);
  }

  useEffect(() => { carregar(); }, []);

  /* ── Máscara de moeda tipo calculadora ────────────────────── */
  function digitarValorMascarado(valorBruto) {
    const digitos = (valorBruto || "").replace(/\D/g, "").slice(-9);
    if (!digitos) return "";
    const numero = parseInt(digitos, 10) / 100;
    return numero.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function paraFloatBR(valor) {
    return parseFloat(String(valor).replace(/\./g, "").replace(",", "."));
  }

  async function salvarGeral() {
    setSalvandoGeral(true);
    setMsgGeral("");
    try {
      const token = await getToken();
      const resp = await fetch(`${API_URL}/superadmin/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          limite_operadores_padrao: parseInt(cfgLimite),
          valor_mensalidade: paraFloatBR(cfgMensalidade),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");
      setMsgGeral("✓ Salvo!");
      setTimeout(() => setMsgGeral(""), 3000);
    } catch (e) { setMsgGeral("❌ " + e.message); }
    setSalvandoGeral(false);
  }

  async function salvarTela() {
    setSalvandoTela(true);
    setMsgTela("");
    try {
      const token = await getToken();
      const resp = await fetch(`${API_URL}/superadmin/config-tela-bloqueio`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          titulo: cfgTelaTitulo, mensagem: cfgTelaMensagem, info: cfgTelaInfo,
          promo_ativa: cfgPromoAtiva, promo_texto: cfgPromoTexto, promo_validade: cfgPromoValidade,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");
      setMsgTela("✓ Salvo!");
      setTimeout(() => setMsgTela(""), 3000);
    } catch (e) { setMsgTela("❌ " + e.message); }
    setSalvandoTela(false);
  }

  async function adicionarContato() {
    if (!novoValor.trim()) { setMsgContato("❌ Preencha o valor do contato."); return; }
    setSalvandoContato(true);
    setMsgContato("");
    try {
      const token = await getToken();
      const resp = await fetch(`${API_URL}/superadmin/contatos-suporte`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tipo: novoTipo, valor: novoValor, label: novoLabel }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao adicionar.");
      setContatos(prev => [...prev, json]);
      setNovoValor(""); setNovoLabel("");
    } catch (e) { setMsgContato("❌ " + e.message); }
    setSalvandoContato(false);
  }

  async function removerContato(id) {
    if (!window.confirm("Remover esse contato?")) return;
    try {
      const token = await getToken();
      await fetch(`${API_URL}/superadmin/contatos-suporte/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setContatos(prev => prev.filter(c => c.id !== id));
    } catch { alert("Erro ao remover contato."); }
  }

  /* ── render ──────────────────────────────────────────────── */
  return (
    <LayoutAdmin>
      <div className="sa-wrapper">

        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">⚙️ Painel Administrativo</span>
            <h1 className="sa-page-title">Configurações <span>Globais</span></h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>← Voltar ao painel</button>
          </div>
        </div>

        {carregando ? (
          <div className="sa-loading"><div className="sa-spinner" /> Carregando...</div>
        ) : (
          <>
            {/* ── NAVEGAÇÃO DE ABAS ───────────────────────────── */}
            <div style={{ display: "flex", gap: 6, borderBottom: "2px solid var(--border)", marginBottom: 20, paddingBottom: 2 }}>
              {[
                { k: "geral",    label: "⚙️ Padrões do Sistema" },
                { k: "tela",     label: "🔒 Tela de Bloqueio" },
                { k: "contatos", label: "💬 Contatos de Suporte" },
              ].map(t => (
                <button
                  key={t.k}
                  onClick={() => setAba(t.k)}
                  style={{
                    padding: "9px 16px",
                    borderRadius: "8px 8px 0 0",
                    border: "none",
                    borderBottom: aba === t.k ? "2px solid #14b8a6" : "2px solid transparent",
                    marginBottom: -2,
                    background: aba === t.k ? "var(--bg-hover)" : "transparent",
                    color: aba === t.k ? "var(--text-accent)" : "var(--text-secondary)",
                    fontWeight: aba === t.k ? 700 : 600,
                    fontSize: "0.85rem",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── GERAL ────────────────────────────────────── */}
            {aba === "geral" && (
            <div className="sa-config-box">
              <div className="sa-config-header">
                <div className="sa-config-header-left">
                  <span className="sa-config-icon">⚙️</span>
                  <div>
                    <div className="sa-config-title">Padrões do Sistema</div>
                    <div className="sa-config-subtitle">Valem pra novos estabelecimentos — cada um pode ser sobrescrito individualmente.</div>
                  </div>
                </div>
              </div>
              <div className="sa-config-body">
                <div className="sa-config-item">
                  <div className="sa-config-item-info">
                    <span className="sa-config-item-label">👥 Limite padrão de operadores</span>
                    <span className="sa-config-item-desc">Aplicado em novos estabelecimentos.</span>
                  </div>
                  <div className="sa-config-item-control">
                    <input className="sa-config-input" type="number" min={0} max={50}
                      value={cfgLimite} onChange={e => setCfgLimite(e.target.value)} />
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>operadores</span>
                  </div>
                </div>
                <div className="sa-config-item">
                  <div className="sa-config-item-info">
                    <span className="sa-config-item-label">💰 Valor padrão da mensalidade</span>
                    <span className="sa-config-item-desc">Pode ser diferente por estabelecimento.</span>
                  </div>
                  <div className="sa-config-item-control">
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>R$</span>
                    <input className="sa-config-input" type="text" inputMode="decimal" style={{ width: 100 }}
                      value={cfgMensalidade} onChange={e => setCfgMensalidade(digitarValorMascarado(e.target.value))} />
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>/mês</span>
                  </div>
                </div>
                {msgGeral && <div className={`sa-config-msg ${msgGeral.startsWith("✓") ? "sucesso" : "erro"}`}>{msgGeral}</div>}
                <button className="sa-btn sa-btn-primary" style={{ alignSelf: "flex-end", marginTop: 8 }} onClick={salvarGeral} disabled={salvandoGeral}>
                  {salvandoGeral ? "⏳ Salvando…" : "✓ Salvar"}
                </button>
              </div>
            </div>
            )}

            {/* ── TELA DE BLOQUEIO ────────────────────────────── */}
            {aba === "tela" && (
            <div className="sa-config-box">
              <div className="sa-config-header">
                <div className="sa-config-header-left">
                  <span className="sa-config-icon">🔒</span>
                  <div>
                    <div className="sa-config-title">Tela de Bloqueio</div>
                    <div className="sa-config-subtitle">Textos exibidos quando a licença de um estabelecimento vence.</div>
                  </div>
                </div>
              </div>
              <div className="sa-config-body">
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Use <code style={{ background: "var(--border)", padding: "1px 4px", borderRadius: 4 }}>**texto**</code> para negrito.
                </div>
                <div className="sa-config-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <span className="sa-config-item-label">Título</span>
                  <input className="sa-config-input" style={{ width: "100%" }} value={cfgTelaTitulo} onChange={e => setCfgTelaTitulo(e.target.value)} />
                </div>
                <div className="sa-config-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <span className="sa-config-item-label">Mensagem principal</span>
                  <textarea className="sa-config-input" style={{ width: "100%" }} rows={2} value={cfgTelaMensagem} onChange={e => setCfgTelaMensagem(e.target.value)} />
                </div>
                <div className="sa-config-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                  <span className="sa-config-item-label">Informação adicional</span>
                  <textarea className="sa-config-input" style={{ width: "100%" }} rows={2} value={cfgTelaInfo} onChange={e => setCfgTelaInfo(e.target.value)} />
                </div>

                <div className="sa-config-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="sa-config-item-label">🎉 Banner de promoção</span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <input type="checkbox" checked={cfgPromoAtiva} onChange={e => setCfgPromoAtiva(e.target.checked)}
                        style={{ accentColor: "#14b8a6", width: 16, height: 16 }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{cfgPromoAtiva ? "Ativo" : "Inativo"}</span>
                    </label>
                  </div>
                  {cfgPromoAtiva && (
                    <>
                      <input className="sa-config-input" value={cfgPromoTexto} onChange={e => setCfgPromoTexto(e.target.value)}
                        style={{ width: "100%" }} placeholder="Ex: Assine agora e ganhe 7 dias grátis!" />
                      <input className="sa-config-input" type="date" value={cfgPromoValidade} onChange={e => setCfgPromoValidade(e.target.value)} style={{ width: "100%" }} />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Validade da promoção (opcional)</span>
                    </>
                  )}
                </div>

                {msgTela && <div className={`sa-config-msg ${msgTela.startsWith("✓") ? "sucesso" : "erro"}`}>{msgTela}</div>}
                <button className="sa-btn sa-btn-primary" style={{ alignSelf: "flex-end", marginTop: 8 }} onClick={salvarTela} disabled={salvandoTela}>
                  {salvandoTela ? "⏳ Salvando…" : "✓ Salvar"}
                </button>
              </div>
            </div>
            )}

            {/* ── CONTATOS DE SUPORTE ─────────────────────────── */}
            {aba === "contatos" && (
            <div className="sa-config-box">
              <div className="sa-config-header">
                <div className="sa-config-header-left">
                  <span className="sa-config-icon">💬</span>
                  <div>
                    <div className="sa-config-title">Contatos de Suporte</div>
                    <div className="sa-config-subtitle">Aparecem no "Fale Conosco" (barra lateral do estabelecimento) e na tela de bloqueio. Pode cadastrar quantos quiser.</div>
                  </div>
                </div>
              </div>
              <div className="sa-config-body">

                {contatos.length === 0 ? (
                  <div className="sa-empty" style={{ padding: 20 }}>Nenhum contato cadastrado ainda.</div>
                ) : (
                  contatos.map(c => (
                    <div key={c.id} className="sa-config-item">
                      <div className="sa-config-item-info">
                        <span className="sa-config-item-label">
                          {c.tipo === "whatsapp" ? "🟢" : "✉️"} {c.label || (c.tipo === "whatsapp" ? "WhatsApp" : "E-mail")}
                        </span>
                        <span className="sa-config-item-desc">{c.valor}</span>
                      </div>
                      <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => removerContato(c.id)}>🗑 Remover</button>
                    </div>
                  ))
                )}

                <div className="sa-config-item" style={{ flexWrap: "wrap", gap: 10 }}>
                  <select className="sa-config-input" value={novoTipo} onChange={e => setNovoTipo(e.target.value)} style={{ width: 120 }}>
                    <option value="whatsapp">🟢 WhatsApp</option>
                    <option value="email">✉️ E-mail</option>
                  </select>
                  <input className="sa-config-input" placeholder={novoTipo === "whatsapp" ? "5553999998888" : "contato@empresa.com"}
                    value={novoValor} onChange={e => setNovoValor(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                  <input className="sa-config-input" placeholder="Rótulo (opcional, ex: Financeiro)"
                    value={novoLabel} onChange={e => setNovoLabel(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                  <button className="sa-btn sa-btn-purple sa-btn-sm" onClick={adicionarContato} disabled={salvandoContato}>
                    {salvandoContato ? "⏳" : "+ Adicionar"}
                  </button>
                </div>
                {msgContato && <div className="sa-config-msg erro">{msgContato}</div>}
              </div>
            </div>
            )}
          </>
        )}

      </div>
    </LayoutAdmin>
  );
}