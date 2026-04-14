// src/pages/Administrador/Operadores/NovoOperador.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Operadores.css";

export default function NovoOperador() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const API_URL   = import.meta.env.VITE_API_URL;

  // Pega estabelecimento_id da query string (?estabelecimento=xxx)
  const estabelecimentoIdParam =
    new URLSearchParams(location.search).get("estabelecimento") || "";

  const [form, setForm] = useState({
    nome:         "",
    email:        "",
    senha:        "",
    telefone:     "",
    mercearia_id: estabelecimentoIdParam,
  });

  const [estabelecimentos, setEstabelecimentos] = useState([]);
  const [salvando,         setSalvando]         = useState(false);
  const [erro,             setErro]             = useState("");

  async function carregarEstabelecimentos() {
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/listar`, {
        credentials: "include",
      });
      setEstabelecimentos((await resp.json()) || []);
    } catch { setErro("Erro ao carregar estabelecimentos."); }
  }

  useEffect(() => { carregarEstabelecimentos(); }, []);

  function atualizar(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (!form.senha || form.senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setSalvando(true);
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/criar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
        credentials: "include",
      });
      const json = await resp.json();
      if (!resp.ok) { setErro(json.error || "Erro ao criar operador."); }
      else { navigate(`/admin/estabelecimentos/${form.mercearia_id}/operadores`); }
    } catch { setErro("Erro interno ao criar operador."); }
    setSalvando(false);
  }

  return (
    <LayoutAdmin>
      <div className="op-wrapper">

        {/* HEADER */}
        <div className="op-page-header">
          <div className="op-page-header-left">
            <span className="op-breadcrumb">👥 Operadores</span>
            <h1 className="op-page-title">Novo <span>Operador</span></h1>
          </div>
          <div className="op-page-actions">
            <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
              ← Voltar
            </button>
          </div>
        </div>

        {erro && <div className="op-alert op-alert-error">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="op-form-wrapper">

          {/* SEÇÃO 1 — Estabelecimento */}
          <div className="op-form-section">
            <div className="op-form-section-title">🏢 Estabelecimento</div>
            <div className="op-form-group">
              <label className="op-label">Estabelecimento *</label>
              <select
                className="op-select"
                name="mercearia_id"
                value={form.mercearia_id}
                onChange={atualizar}
                required
              >
                <option value="">Selecione o estabelecimento...</option>
                {estabelecimentos.map(m => (
                  <option key={m.id} value={m.id}>{m.nome_fantasia}</option>
                ))}
              </select>
            </div>
          </div>

          {/* SEÇÃO 2 — Dados pessoais */}
          <div className="op-form-section">
            <div className="op-form-section-title">👤 Dados do Operador</div>
            <div className="op-form-grid">
              <div className="op-form-group op-form-full">
                <label className="op-label">Nome completo *</label>
                <input
                  className="op-input"
                  name="nome"
                  placeholder="Nome do operador"
                  value={form.nome}
                  onChange={atualizar}
                  required
                />
              </div>
              <div className="op-form-group">
                <label className="op-label">E-mail de login *</label>
                <input
                  className="op-input"
                  name="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={atualizar}
                  required
                />
              </div>
              <div className="op-form-group">
                <label className="op-label">Telefone</label>
                <input
                  className="op-input"
                  name="telefone"
                  placeholder="(53) 99999-9999"
                  value={form.telefone}
                  onChange={atualizar}
                />
              </div>
            </div>
          </div>

          {/* SEÇÃO 3 — Acesso */}
          <div className="op-form-section">
            <div className="op-form-section-title">🔐 Acesso</div>
            <div className="op-form-group">
              <label className="op-label">Senha inicial *</label>
              <input
                className="op-input"
                name="senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={form.senha}
                onChange={atualizar}
                required
              />
            </div>
          </div>

          {/* AÇÕES */}
          <div className="op-form-actions">
            <button
              type="submit"
              className="op-btn op-btn-primary op-btn-lg"
              disabled={salvando}
            >
              {salvando ? "⏳ Cadastrando…" : "✓ Cadastrar Operador"}
            </button>
            <button
              type="button"
              className="op-btn op-btn-ghost op-btn-lg"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </button>
          </div>

        </form>
      </div>
    </LayoutAdmin>
  );
}