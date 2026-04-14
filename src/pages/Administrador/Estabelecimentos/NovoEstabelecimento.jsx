// src/pages/Administrador/Estabelecimentos/NovoEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

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
  });

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

  async function carregarTipos() {
    try {
      const resp  = await fetch(`${API_URL}/admin/estabelecimentos/listar`);
      const lista = await resp.json();
      const tipos = [...new Set(lista.map(m => m.tipo_estabelecimento).filter(Boolean))];
      setTiposExistentes(tipos);
    } catch {}
  }

  useEffect(() => { carregarTipos(); }, []);

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
    if (form.status_assinatura === "ativa" && !form.data_vencimento) {
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
        body:    JSON.stringify({ ...form, tipo_estabelecimento: tipoFinal }),
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
                <label className="est-label">CNPJ</label>
                <input
                  className="est-input"
                  name="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={form.cnpj}
                  onChange={atualizar}
                />
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

            </div>
          </div>

          {/* SEÇÃO 5 — Logo (opcional) */}
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