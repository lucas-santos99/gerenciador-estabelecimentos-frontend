// src/pages/Administrador/Estabelecimentos/NovoEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";
import { apiFetch } from "../../../utils/api";

export default function NovoEstabelecimento() {
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [form, setForm] = useState({
    nome_fantasia:        "",
    cnpj:                 "",
    telefone:             "",
    email_contato:        "",
    endereco_completo:    "",
    senha:                "",
    status_assinatura:    "ativa",
    data_vencimento:      "",
    tipo_estabelecimento: "mercearia",
    limite_operadores:    3,
    valor_mensalidade:    "", // vazio = usa o padrão global
  });

  const [usarPeriodoTeste,  setUsarPeriodoTeste]  = useState(true);
  const [tipoCpfCnpj,      setTipoCpfCnpj]      = useState("cpf");
  const [cpfCnpjErro,      setCpfCnpjErro]      = useState("");
  const [mensalidadePadrao, setMensalidadePadrao] = useState(49.90);
  const [diasTeste,        setDiasTeste]        = useState(30);

  const [tipoCustomizado,  setTipoCustomizado]  = useState("");
  const [tiposExistentes,  setTiposExistentes]  = useState([]);
  const [sugestoes,        setSugestoes]         = useState([]);
  const [salvando,         setSalvando]          = useState(false);
  const [erro,             setErro]              = useState("");
  const [logoFile,         setLogoFile]          = useState(null);
  const [logoPreview,      setLogoPreview]       = useState("");

  /* ── helpers ─────────────────────────────────────────────── */
  function atualizar(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function formatarTipo(texto) {
    return texto
      .toLowerCase()
      .split(" ")
      .map(p => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

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
    const digits = valor.replace(/\D/g, "");
    const esperado = tipoCpfCnpj === "cpf" ? 11 : 14;
    if (digits.length > 0 && digits.length < esperado) {
      setCpfCnpjErro(`${tipoCpfCnpj.toUpperCase()} incompleto — faltam ${esperado - digits.length} dígitos`);
    } else {
      setCpfCnpjErro("");
    }
  }

  function handleTipoCpfCnpj(tipo) {
    const digitsAtuais = (form.cnpj || "").replace(/\D/g, "");
    const esperadoCpf  = digitsAtuais.length <= 11;
    const esperadoCnpj = digitsAtuais.length === 14;

    let novoValor = "";
    if (tipo === "cpf"  && esperadoCpf)  novoValor = aplicarMascaraCpfCnpj(digitsAtuais, "cpf");
    if (tipo === "cnpj" && esperadoCnpj) novoValor = aplicarMascaraCpfCnpj(digitsAtuais, "cnpj");
    // Se não pertence ao novo tipo, limpa

    setTipoCpfCnpj(tipo);
    setForm(prev => ({ ...prev, cnpj: novoValor }));
    setCpfCnpjErro("");
  }

  async function carregarTipos() {
    try {
      const resp  = await fetch(`${API_URL}/admin/estabelecimentos/listar`);
      const lista = await resp.json();
      const tipos = [...new Set(lista.map(m => m.tipo_estabelecimento).filter(Boolean))];
      setTiposExistentes(tipos);
    } catch {}
  }

  useEffect(() => {
    carregarTipos();
    carregarLimitePadrao();
  }, []);

  async function carregarLimitePadrao() {
    try {
      const resp = await apiFetch('/superadmin/config');
      if (resp.ok) {
        const d = await resp.json();
        setForm(prev => ({
          ...prev,
          limite_operadores: d.limite_operadores_padrao ?? 3,
          // não preenche valor_mensalidade aqui — deixa vazio = "usar padrão"
        }));
        // Guarda o padrão para mostrar no placeholder
        setMensalidadePadrao(d.valor_mensalidade ?? 49.90);
      }
    } catch {}
  }

  function filtrarSugestoes(valor) {
    setTipoCustomizado(valor);
    setSugestoes(
      valor
        ? tiposExistentes.filter(t => t.toLowerCase().includes(valor.toLowerCase()))
        : []
    );
  }

  function selecionarLogo(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  /* ── submit ──────────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (!form.senha) {
      setErro("A senha inicial é obrigatória.");
      return;
    }

    // Calcular data_vencimento a partir do período de teste
    let dataVencimentoFinal = form.data_vencimento;
    if (usarPeriodoTeste) {
      const d = new Date();
      d.setDate(d.getDate() + parseInt(diasTeste));
      dataVencimentoFinal = d.toISOString().split("T")[0];
    } else if (form.status_assinatura === "ativa" && !form.data_vencimento) {
      setErro("Data de vencimento é obrigatória para estabelecimentos ativos.");
      return;
    }

    let tipoFinal = form.tipo_estabelecimento;
    if (form.tipo_estabelecimento === "outro") {
      if (!tipoCustomizado) { setErro("Informe o tipo de estabelecimento."); return; }
      tipoFinal = formatarTipo(tipoCustomizado);
    } else {
      tipoFinal = formatarTipo(tipoFinal);
    }

    setSalvando(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/criar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          ...form,
          data_vencimento:      dataVencimentoFinal,
          tipo_estabelecimento: tipoFinal,
          limite_operadores:    parseInt(form.limite_operadores) || 3,
          valor_mensalidade:    form.valor_mensalidade ? parseFloat(form.valor_mensalidade) : null,
        }),
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErro(json.error || "Erro ao criar estabelecimento.");
      } else {
        // Se tem logo, faz upload antes de navegar
        if (logoFile && json.id) {
          const fd = new FormData();
          fd.append("logo", logoFile);
          await fetch(`${API_URL}/admin/estabelecimentos/${json.id}/upload-logo`, {
            method: "POST", body: fd, credentials: "include",
          });
        }
        navigate("/admin");
      }
    } catch {
      setErro("Erro ao criar estabelecimento.");
    }
    setSalvando(false);
  }

  /* ══════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* PAGE HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Estabelecimentos</span>
            <h1 className="est-page-title">Novo <span>Estabelecimento</span></h1>
          </div>
          <div className="est-page-actions">
            <button className="est-btn est-btn-ghost" onClick={() => navigate("/admin")}>
              ← Voltar ao painel
            </button>
          </div>
        </div>

        {/* ERRO */}
        {erro && (
          <div className="est-alert est-alert-error">
            ⚠️ {erro}
          </div>
        )}

        <form onSubmit={salvar} className="est-form-wrapper">

          {/* SEÇÃO 1 — Identificação */}
          <div className="est-form-section">
            <div className="est-form-section-title">📋 Identificação</div>
            <div className="est-form-grid">

              <div className="est-form-group est-form-full">
                <label className="est-label">Nome Fantasia *</label>
                <input
                  className="est-input"
                  name="nome_fantasia"
                  placeholder="Ex: Mercearia do João"
                  value={form.nome_fantasia}
                  onChange={atualizar}
                  required
                />
              </div>

              <div className="est-form-group">
                <label className="est-label">Tipo de Estabelecimento</label>
                <select
                  className="est-select"
                  name="tipo_estabelecimento"
                  value={form.tipo_estabelecimento}
                  onChange={atualizar}
                >
                  <option value="mercearia">Mercearia</option>
                  <option value="padaria">Padaria</option>
                  <option value="ferragem">Ferragem</option>
                  <option value="agropecuaria">Agropecuária</option>
                  <option value="loja">Loja</option>
                  <option value="restaurante">Restaurante</option>
                  <option value="outro">Outro…</option>
                </select>
              </div>

              {form.tipo_estabelecimento === "outro" && (
                <div className="est-form-group">
                  <label className="est-label">Qual tipo?</label>
                  <div className="est-autocomplete-wrap">
                    <input
                      className="est-input"
                      placeholder="Ex: Pet Shop, Oficina…"
                      value={tipoCustomizado}
                      onChange={e => filtrarSugestoes(e.target.value)}
                    />
                    {sugestoes.length > 0 && (
                      <div className="est-sugestoes">
                        {sugestoes.map((tipo, i) => (
                          <div
                            key={i}
                            className="est-sugestao-item"
                            onClick={() => { setTipoCustomizado(tipo); setSugestoes([]); }}
                          >
                            {tipo}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="est-form-group">
                <label className="est-label">CPF / CNPJ</label>
                <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                  {["cpf","cnpj"].map(t => (
                    <button key={t} type="button"
                      onClick={() => handleTipoCpfCnpj(t)}
                      style={{
                        padding:"3px 14px", borderRadius:20, border:"1px solid",
                        borderColor: tipoCpfCnpj===t ? "#14b8a6" : "var(--border,#e5e7eb)",
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
                <input
                  className="est-input"
                  name="telefone"
                  placeholder="(53) 99999-9999"
                  value={form.telefone}
                  onChange={atualizar}
                />
              </div>

              <div className="est-form-group">
                <label className="est-label">E-mail de Contato</label>
                <input
                  className="est-input"
                  name="email_contato"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={form.email_contato}
                  onChange={atualizar}
                />
              </div>

              <div className="est-form-group est-form-full">
                <label className="est-label">Endereço Completo</label>
                <input
                  className="est-input"
                  name="endereco_completo"
                  placeholder="Rua, número, bairro, cidade - UF"
                  value={form.endereco_completo}
                  onChange={atualizar}
                />
              </div>

            </div>
          </div>

          {/* SEÇÃO 3 — Acesso */}
          <div className="est-form-section">
            <div className="est-form-section-title">🔐 Acesso do Proprietário</div>
            <div className="est-form-grid">

              <div className="est-form-group est-form-full">
                <label className="est-label">Senha Inicial *</label>
                <input
                  className="est-input"
                  type="password"
                  name="senha"
                  placeholder="Senha que o proprietário usará no primeiro acesso"
                  value={form.senha}
                  onChange={atualizar}
                  required
                />
              </div>

            </div>
          </div>

          {/* SEÇÃO 4 — Assinatura */}
          <div className="est-form-section">
            <div className="est-form-section-title">💳 Assinatura</div>
            <div className="est-form-grid">

              {/* Toggle período de teste */}
              <div className="est-form-group est-form-full">
                <label className="est-label">Modo de ativação</label>
                <div className="est-periodo-toggle">
                  <button
                    type="button"
                    className={`est-periodo-btn${usarPeriodoTeste ? " ativo" : ""}`}
                    onClick={() => setUsarPeriodoTeste(true)}
                  >
                    🧪 Período de teste
                  </button>
                  <button
                    type="button"
                    className={`est-periodo-btn${!usarPeriodoTeste ? " ativo" : ""}`}
                    onClick={() => setUsarPeriodoTeste(false)}
                  >
                    📅 Data manual
                  </button>
                </div>
              </div>

              {usarPeriodoTeste ? (
                <>
                  <div className="est-form-group est-form-full">
                    <label className="est-label">Duração do período</label>
                    <div className="est-dias-atalhos">
                      {[7, 15, 30, 60, 90, 180, 365].map(d => (
                        <button
                          key={d}
                          type="button"
                          className={`est-dias-btn${parseInt(diasTeste) === d ? " ativo" : ""}`}
                          onClick={() => setDiasTeste(d)}
                        >
                          {d === 365 ? "1 ano" : d === 180 ? "6 meses" : `${d}d`}
                        </button>
                      ))}
                    </div>
                    <div className="est-dias-input-row">
                      <input
                        className="est-input"
                        type="number"
                        min={1}
                        max={3650}
                        value={diasTeste}
                        onChange={e => setDiasTeste(e.target.value)}
                        style={{ width: 100 }}
                      />
                      <span className="est-dias-label">dias</span>
                      <span className="est-periodo-preview">
                        Vence em {(() => {
                          const d = new Date();
                          d.setDate(d.getDate() + (parseInt(diasTeste) || 0));
                          return d.toLocaleDateString('pt-BR');
                        })()}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="est-form-group">
                    <label className="est-label">Status da Assinatura</label>
                    <select
                      className="est-select"
                      name="status_assinatura"
                      value={form.status_assinatura}
                      onChange={atualizar}
                    >
                      <option value="ativa">Ativa</option>
                      <option value="inativa">Inativa</option>
                      <option value="bloqueada">Bloqueada</option>
                    </select>
                  </div>

                  {form.status_assinatura === "ativa" && (
                    <div className="est-form-group">
                      <label className="est-label">Data de Vencimento *</label>
                      <input
                        className="est-input"
                        type="date"
                        name="data_vencimento"
                        value={form.data_vencimento}
                        onChange={atualizar}
                      />
                    </div>
                  )}
                </>
              )}

            </div>
          </div>

          {/* SEÇÃO 5 — Operadores */}
          <div className="est-form-section">
            <div className="est-form-section-title">👥 Operadores</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Limite de operadores</label>
                <div className="op-limite-field">
                  <input
                    className="op-limite-input"
                    type="number"
                    name="limite_operadores"
                    min="0"
                    max="50"
                    value={form.limite_operadores}
                    onChange={atualizar}
                  />
                  <span className="op-limite-hint">
                    Máximo de operadores ativos (0–50). Pré-preenchido com o padrão global.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 5b — Mensalidade individual */}
          <div className="est-form-section">
            <div className="est-form-section-title">💰 Mensalidade</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Valor da mensalidade (R$)</label>
                <input
                  className="est-input"
                  type="number"
                  name="valor_mensalidade"
                  min="0"
                  step="0.01"
                  value={form.valor_mensalidade}
                  onChange={atualizar}
                  placeholder={`Padrão global: R$ ${mensalidadePadrao.toFixed(2).replace(".", ",")}`}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  Deixe em branco para usar o valor padrão global. Preencha para aplicar um preço diferenciado a este cliente.
                </span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 6 — Logo (opcional) */}
          <div className="est-form-section">
            <div className="est-form-section-title">🖼 Logo do Estabelecimento <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span></div>
            <div className="est-logo-area">
              {logoPreview
                ? <img src={logoPreview} alt="Preview" className="est-logo-preview" />
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
                  onChange={selecionarLogo}
                />
                {logoPreview && (
                  <button
                    type="button"
                    className="est-btn est-btn-danger est-btn-sm"
                    onClick={() => { setLogoFile(null); setLogoPreview(""); }}
                  >
                    🗑 Remover
                  </button>
                )}
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
              {salvando ? "⏳ Criando…" : "✓ Criar Estabelecimento"}
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