// src/pages/Administrador/Estabelecimentos/EditarEstabelecimento.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function EditarEstabelecimento() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const location    = useLocation();
  const API_URL     = import.meta.env.VITE_API_URL;

  const modoDetalhes =
    new URLSearchParams(location.search).get("view") === "details";

  const [form, setForm] = useState({
    nome_fantasia:     "",
    cnpj:              "",
    telefone:          "",
    email_contato:     "",
    endereco_completo: "",
    status_assinatura: "ativa",
    data_vencimento:   "",
    logo_url:          "",
    limite_operadores: 3,
  });

  const [carregando,   setCarregando]   = useState(true);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");
  const [logoFile,     setLogoFile]     = useState(null);
  const [tipoCpfCnpj,  setTipoCpfCnpj]  = useState("cpf"); // "cpf" | "cnpj"
  const [cpfCnpjErro,  setCpfCnpjErro]  = useState("");

  /* ── carregar ────────────────────────────────────────────── */
  async function carregarDados() {
    setCarregando(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      if (resp.ok) {
        // Detectar se é CPF ou CNPJ pelo número de dígitos
        const docLimpo = (data.cnpj || "").replace(/\D/g, "");
        const tipoDetectado = docLimpo.length === 14 ? "cnpj" : "cpf";
        setTipoCpfCnpj(tipoDetectado);

        // Aplicar máscara no documento existente ao carregar
        const docComMascara = docLimpo ? aplicarMascaraCpfCnpjStatic(docLimpo, tipoDetectado) : "";

        setForm({
          nome_fantasia:     data.nome_fantasia     || "",
          cnpj:              docComMascara,
          telefone:          data.telefone          || "",
          email_contato:     data.email_contato     || "",
          endereco_completo: data.endereco_completo || "",
          status_assinatura: data.status_assinatura || "ativa",
          data_vencimento:   data.data_vencimento   ?? "",
          logo_url:          data.logo_url          || "",
          limite_operadores: data.limite_operadores ?? 3,
        });
      } else {
        setErro(data.error || "Erro ao carregar.");
      }
    } catch { setErro("Erro ao carregar dados."); }
    setCarregando(false);
  }


  useEffect(() => { carregarDados(); }, [id]);

  function atualizar(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  /* ── Função estática de máscara (usada no carregarDados) ────── */
  function aplicarMascaraCpfCnpjStatic(s, tipo) {
    const d = s.replace(/\D/g, "").slice(0, tipo === "cpf" ? 11 : 14);
    if (tipo === "cpf") {
      return d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
    }
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
  }

  /* ── Máscara CPF/CNPJ ─────────────────────────────────────── */
  function aplicarMascaraCpfCnpj(valor, tipo) {
    const s = valor.replace(/\D/g, "").slice(0, tipo === "cpf" ? 11 : 14);
    if (tipo === "cpf") {
      return s
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
    }
    return s
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
  }

  function handleCpfCnpj(e) {
    const valor = aplicarMascaraCpfCnpj(e.target.value, tipoCpfCnpj);
    setForm(prev => ({ ...prev, cnpj: valor }));
    // Validar tamanho esperado
    const digits = valor.replace(/\D/g, "");
    const esperado = tipoCpfCnpj === "cpf" ? 11 : 14;
    if (digits.length > 0 && digits.length < esperado) {
      setCpfCnpjErro(`${tipoCpfCnpj.toUpperCase()} incompleto — faltam ${esperado - digits.length} dígitos`);
    } else {
      setCpfCnpjErro("");
    }
  }

  function handleTipoCpfCnpj(tipo) {
    // Só troca o tipo, não limpa o campo
    setTipoCpfCnpj(tipo);
    setCpfCnpjErro("");
  }

  /* ── salvar ──────────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (form.status_assinatura === "ativa" && !form.data_vencimento) {
      setErro("Data de vencimento é obrigatória quando o status é Ativa.");
      return;
    }
    // Validar CPF/CNPJ se preenchido
    const docDigits = form.cnpj.replace(/\D/g, "");
    const esperado = tipoCpfCnpj === "cpf" ? 11 : 14;
    if (docDigits.length > 0 && docDigits.length !== esperado) {
      setErro(`${tipoCpfCnpj.toUpperCase()} inválido — deve ter ${esperado} dígitos.`);
      return;
    }

    setSalvando(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...form,
          data_vencimento:
            form.status_assinatura === "ativa" ? form.data_vencimento : null,
          limite_operadores: parseInt(form.limite_operadores) || 3,
        }),
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) { setErro(json.error || "Erro ao salvar."); }
      else           { navigate(`/admin/estabelecimentos/${id}?view=details`); }
    } catch { setErro("Erro ao salvar."); }
    setSalvando(false);
  }

  /* ── logo ────────────────────────────────────────────────── */
  async function enviarLogo() {
    if (!logoFile) { alert("Selecione um arquivo."); return; }
    const fd = new FormData();
    fd.append("logo", logoFile);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/upload-logo`, {
        method: "POST", body: fd, credentials: "include",
      });
      const json = await resp.json();
      if (resp.ok) {
        setForm(s => ({ ...s, logo_url: json.logo_url }));
        setLogoFile(null);
      } else { alert("Erro: " + (json.error || "erro")); }
    } catch { alert("Erro ao enviar logo."); }
  }

  async function removerLogo() {
    if (!window.confirm("Remover logo?")) return;
    const resp = await fetch(
      `${API_URL}/admin/estabelecimentos/${id}/remover-logo`,
      { method: "DELETE", credentials: "include" }
    );
    if (resp.ok) setForm(s => ({ ...s, logo_url: "" }));
    else alert("Erro ao remover logo.");
  }

  /* ── excluir ─────────────────────────────────────────────── */
  async function excluir() {
    if (!window.confirm(`Excluir "${form.nome_fantasia}"?`)) return;
    const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}`, {
      method: "DELETE", credentials: "include",
    });
    if (resp.ok) navigate("/admin");
    else alert("Erro ao excluir.");
  }

  /* ── loading ─────────────────────────────────────────────── */
  if (carregando) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">
          <div className="est-loading">
            <div className="est-spinner" />
            Carregando...
          </div>
        </div>
      </LayoutAdmin>
    );
  }

  /* ════════════════════════════════════════════════════════
     MODO DETALHES
  ════════════════════════════════════════════════════════ */
  if (modoDetalhes) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">

          {/* HEADER */}
          <div className="est-page-header">
            <div className="est-page-header-left">
              <span className="est-breadcrumb">🏢 Estabelecimentos</span>
              <h1 className="est-page-title">Detalhes do <span>Estabelecimento</span></h1>
            </div>
            <div className="est-page-actions">
              <button
                className="est-btn est-btn-ghost"
                onClick={() => navigate("/admin")}
              >
                ← Voltar ao painel
              </button>
            </div>
          </div>

          {/* HERO CARD */}
          <div className="est-card" style={{ marginBottom: 16 }}>
            <div className="est-detail-hero">

              {/* Logo */}
              <div className="est-detail-logo-col">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="est-detail-logo" />
                  : (
                    <div className="est-detail-logo-placeholder">
                      {iniciais(form.nome_fantasia)}
                    </div>
                  )
                }
              </div>

              {/* Info */}
              <div className="est-detail-info-col">
                <div className="est-detail-name">{form.nome_fantasia}</div>
                {form.email_contato && (
                  <div className="est-detail-email">{form.email_contato}</div>
                )}
                <div className="est-detail-meta">
                  <span className={`est-badge est-badge-${form.status_assinatura}`}>
                    {form.status_assinatura}
                  </span>
                  {form.data_vencimento && (
                    <span className="est-venc-label">
                      Vence em {form.data_vencimento.split("-").reverse().join("/")}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="est-detail-actions-col">
                <button
                  className="est-btn est-btn-outline"
                  onClick={() => navigate(`/admin/estabelecimentos/${id}`)}
                >
                  ✏️ Editar
                </button>
                <button
                  className="est-btn est-btn-blue"
                  onClick={() => navigate(`/admin/estabelecimentos/${id}/operadores`)}
                >
                  👥 Operadores
                </button>
                <button className="est-btn est-btn-danger" onClick={excluir}>
                  🗑 Excluir
                </button>
              </div>

            </div>
          </div>

          {/* INFO GRID */}
          <div className="est-info-grid">
            <div className="est-info-block">
              <div className="est-info-block-title">Dados da Empresa</div>
              {[
                { label: "CNPJ",     value: form.cnpj,              mono: true },
                { label: "Telefone", value: form.telefone,           mono: true },
                { label: "E-mail",   value: form.email_contato,      mono: false },
              ].map(r => (
                <div className="est-info-row" key={r.label}>
                  <span className="est-info-row-label">{r.label}</span>
                  <span className={`est-info-row-value${r.mono ? " mono" : ""}`}>
                    {r.value || "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">Endereço</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Endereço</span>
                <span className="est-info-row-value">
                  {form.endereco_completo || "Não informado"}
                </span>
              </div>
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">Assinatura</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Status</span>
                <span className={`est-badge est-badge-${form.status_assinatura}`}>
                  {form.status_assinatura}
                </span>
              </div>
              <div className="est-info-row" style={{ marginTop: 10 }}>
                <span className="est-info-row-label">Vencimento</span>
                <span className="est-info-row-value mono">
                  {form.data_vencimento
                    ? form.data_vencimento.split("-").reverse().join("/")
                    : "—"}
                </span>
              </div>
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">👥 Operadores</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Limite de operadores</span>
                <span className="est-info-row-value mono">
                  {form.limite_operadores ?? 3} operador(es)
                </span>
              </div>
              <div className="est-info-row" style={{ marginTop: 8 }}>
                <span className="est-info-row-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Para alterar, clique em ✏️ Editar
                </span>
              </div>
            </div>

          </div>

        </div>
      </LayoutAdmin>
    );
  }

  /* ════════════════════════════════════════════════════════
     MODO EDITAR
  ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Estabelecimentos</span>
            <h1 className="est-page-title">Editar <span>Estabelecimento</span></h1>
          </div>
          <div className="est-page-actions">
            <button
              className="est-btn est-btn-ghost"
              onClick={() => navigate("/admin")}
            >
              ← Voltar ao painel
            </button>
          </div>
        </div>

        {erro && <div className="est-alert est-alert-error">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="est-form-wrapper">

          {/* SEÇÃO 1 — Identificação */}
          <div className="est-form-section">
            <div className="est-form-section-title">📋 Identificação</div>
            <div className="est-form-grid">
              <div className="est-form-group est-form-full">
                <label className="est-label">Nome Fantasia</label>
                <input
                  className="est-input"
                  name="nome_fantasia"
                  value={form.nome_fantasia}
                  onChange={atualizar}
                />
              </div>
              <div className="est-form-group">
                <label className="est-label">CPF / CNPJ</label>
                {/* Toggle CPF / CNPJ */}
                <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                  {["cpf","cnpj"].map(t => (
                    <button key={t} type="button"
                      onClick={() => handleTipoCpfCnpj(t)}
                      style={{
                        padding:"3px 14px", borderRadius:20, border:"1px solid",
                        borderColor: tipoCpfCnpj===t ? "#14b8a6" : "var(--border,#334155)",
                        background:  tipoCpfCnpj===t ? "#14b8a6" : "transparent",
                        color:       tipoCpfCnpj===t ? "#fff" : "inherit",
                        fontSize:"0.75rem", fontWeight:700, cursor:"pointer",
                        fontFamily:"Plus Jakarta Sans, sans-serif",
                      }}>
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <input
                  className={`est-input${cpfCnpjErro ? " est-input-erro" : ""}`}
                  name="cnpj"
                  value={form.cnpj}
                  onChange={handleCpfCnpj}
                  placeholder={tipoCpfCnpj === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  maxLength={tipoCpfCnpj === "cpf" ? 14 : 18}
                  inputMode="numeric"
                />
                {cpfCnpjErro && (
                  <span style={{ fontSize:"0.72rem", color:"#ef4444", marginTop:2, display:"block" }}>
                    ⚠️ {cpfCnpjErro}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* SEÇÃO 2 — Contato */}
          <div className="est-form-section">
            <div className="est-form-section-title">📞 Contato</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Telefone</label>
                <input className="est-input" name="telefone" value={form.telefone} onChange={atualizar} />
              </div>
              <div className="est-form-group">
                <label className="est-label">E-mail de Contato</label>
                <input className="est-input" name="email_contato" value={form.email_contato} onChange={atualizar} />
              </div>
              <div className="est-form-group est-form-full">
                <label className="est-label">Endereço Completo</label>
                <input className="est-input" name="endereco_completo" value={form.endereco_completo} onChange={atualizar} />
              </div>
            </div>
          </div>

          {/* SEÇÃO 3 — Assinatura */}
          <div className="est-form-section">
            <div className="est-form-section-title">💳 Assinatura</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Status</label>
                <select className="est-select" name="status_assinatura" value={form.status_assinatura} onChange={atualizar}>
                  <option value="ativa">Ativa</option>
                  <option value="inativa">Inativa</option>
                  <option value="bloqueada">Bloqueada</option>
                </select>
              </div>
              {form.status_assinatura === "ativa" && (
                <div className="est-form-group">
                  <label className="est-label">Data de Vencimento</label>
                  <input
                    className="est-input"
                    type="date"
                    name="data_vencimento"
                    value={form.data_vencimento}
                    onChange={atualizar}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 4 — Logo */}
          <div className="est-form-section">
            <div className="est-form-section-title">🖼 Logo do Estabelecimento</div>
            <div className="est-logo-area">
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" className="est-logo-preview" />
                : (
                  <div className="est-logo-placeholder">
                    <span style={{ fontSize: "1.5rem" }}>🖼</span>
                    Sem logo
                  </div>
                )
              }
              <div className="est-logo-upload-info">
                <input
                  className="est-file-input"
                  type="file"
                  accept="image/*"
                  onChange={e => setLogoFile(e.target.files[0])}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="est-btn est-btn-outline est-btn-sm"
                    onClick={enviarLogo}
                  >
                    ⬆ Enviar Logo
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      className="est-btn est-btn-danger est-btn-sm"
                      onClick={removerLogo}
                    >
                      🗑 Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>



          {/* AÇÕES */}
          <div className="est-form-actions">
            <button
              type="submit"
              className="est-btn est-btn-primary est-btn-lg"
              disabled={salvando}
            >
              {salvando ? "⏳ Salvando…" : "✓ Salvar Alterações"}
            </button>
            <button
              type="button"
              className="est-btn est-btn-ghost est-btn-lg"
              onClick={() => navigate("/admin")}
            >
              Cancelar
            </button>
          </div>

        </form>
      </div>
    </LayoutAdmin>
  );
}