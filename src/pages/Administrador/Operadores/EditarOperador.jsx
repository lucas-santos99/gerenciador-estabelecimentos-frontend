// src/pages/Administrador/Operadores/EditarOperador.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Operadores.css";

export default function EditarOperador() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [form, setForm] = useState({
    nome: "", email: "", telefone: "", status: "ativo",
  });
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/detalhes/${id}`, {
        credentials: "include",
      });
      const data = await resp.json();
      if (resp.ok && data) {
        setForm({
          nome:     data.nome     || "",
          email:    data.email    || "",
          telefone: data.telefone || "",
          status:   data.status   || "ativo",
        });
      } else { navigate(-1); }
    } catch { navigate(-1); }
    setLoading(false);
  }


  useEffect(() => { carregar(); }, [id]);

  function change(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
        credentials: "include",
      });
      if (resp.ok) navigate(`/admin/operadores/${id}`);
      else {
        const json = await resp.json().catch(() => ({}));
        setErro(json.error || "Erro ao salvar.");
      }
    } catch { setErro("Erro ao salvar operador."); }
    setSalvando(false);
  }

  if (loading) {
    return (
      <LayoutAdmin>
        <div className="op-wrapper">
          <div className="op-loading"><div className="op-spinner" /> Carregando...</div>
        </div>
      </LayoutAdmin>
    );
  }

  return (
    <LayoutAdmin>
      <div className="op-wrapper">

        {/* HEADER */}
        <div className="op-page-header">
          <div className="op-page-header-left">
            <span className="op-breadcrumb">👥 Operadores</span>
            <h1 className="op-page-title">Editar <span>Operador</span></h1>
          </div>
          <div className="op-page-actions">
            <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
              ← Voltar
            </button>
          </div>
        </div>

        {erro && <div className="op-alert op-alert-error">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="op-form-wrapper">

          {/* SEÇÃO — Dados */}
          <div className="op-form-section">
            <div className="op-form-section-title">👤 Dados do Operador</div>
            <div className="op-form-grid">
              <div className="op-form-group op-form-full">
                <label className="op-label">Nome *</label>
                <input
                  className="op-input"
                  name="nome"
                  value={form.nome}
                  onChange={change}
                  required
                />
              </div>
              <div className="op-form-group">
                <label className="op-label">E-mail *</label>
                <input
                  className="op-input"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={change}
                  required
                />
              </div>
              <div className="op-form-group">
                <label className="op-label">Telefone</label>
                <input
                  className="op-input"
                  name="telefone"
                  value={form.telefone}
                  onChange={change}
                />
              </div>
              <div className="op-form-group">
                <label className="op-label">Status</label>
                <select className="op-select" name="status" value={form.status} onChange={change}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>
          </div>

          {/* AÇÕES */}
          <div className="op-form-actions">
            <button
              type="submit"
              className="op-btn op-btn-primary op-btn-lg"
              disabled={salvando}
            >
              {salvando ? "⏳ Salvando…" : "✓ Salvar Alterações"}
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