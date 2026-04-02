// src/pages/Administrador/SuperAdmins/SuperAdmins.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthProvider";
import "./SuperAdmins.css";

/* ── helpers ──────────────────────────────────────────────── */
function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

/* ════════════════════════════════════════════════════════════ */
export default function SuperAdmins() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const API_URL     = import.meta.env.VITE_API_URL;

  /* ── bloqueio de acesso ─────────────────────────────────── */
  if (!profile?.is_master) return <Navigate to="/admin" />;

  /* ── state ──────────────────────────────────────────────── */
  const [lista,          setLista]          = useState([]);
  const [loadingLista,   setLoadingLista]   = useState(true);

  // Modal: criar novo superadmin
  const [modalCriar,     setModalCriar]     = useState(false);
  const [salvando,       setSalvando]       = useState(false);
  const [form,           setForm]           = useState({ nome: "", email: "", senha: "" });
  const [erroCriar,      setErroCriar]      = useState("");

  // Modal: alterar senha
  const [modalSenha,     setModalSenha]     = useState(false);
  const [userSel,        setUserSel]        = useState(null);
  const [novaSenha,      setNovaSenha]      = useState("");
  const [erroSenha,      setErroSenha]      = useState("");

  /* ── carregar lista ─────────────────────────────────────── */
  async function carregarLista() {
    setLoadingLista(true);
    try {
      const token = await getToken();
      const resp  = await fetch(`${API_URL}/superadmin/listar`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) setLista(await resp.json());
    } catch (err) { console.error(err); }
    setLoadingLista(false);
  }

  useEffect(() => { if (profile?.is_master) carregarLista(); }, [profile]);

  /* ── criar superadmin ───────────────────────────────────── */
  async function criarSuperAdmin() {
    setErroCriar("");
    if (!form.nome || !form.email || !form.senha) {
      setErroCriar("Preencha todos os campos.");
      return;
    }
    setSalvando(true);
    try {
      const token = await getToken();
      const resp  = await fetch(`${API_URL}/superadmin/criar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) { setErroCriar(data.error || "Erro ao criar."); return; }
      setModalCriar(false);
      setForm({ nome: "", email: "", senha: "" });
      carregarLista();
    } catch { setErroCriar("Erro interno."); }
    setSalvando(false);
  }

  /* ── excluir ────────────────────────────────────────────── */
  async function excluir(id, nome) {
    if (!window.confirm(`Excluir "${nome}"?`)) return;
    try {
      const token = await getToken();
      await fetch(`${API_URL}/superadmin/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      carregarLista();
    } catch { alert("Erro ao excluir."); }
  }

  /* ── toggle ativo ───────────────────────────────────────── */
  async function toggleAtivo(id) {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/superadmin/${id}/ativo`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      carregarLista();
    } catch { alert("Erro ao alterar status."); }
  }

  /* ── tornar master ──────────────────────────────────────── */
  async function tornarMaster(id, nome) {
    if (!window.confirm(`Tornar "${nome}" um MASTER?`)) return;
    try {
      const token = await getToken();
      const resp  = await fetch(`${API_URL}/superadmin/${id}/master`, {
        method: "PATCH", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || "Erro."); return; }
      carregarLista();
    } catch { alert("Erro interno."); }
  }

  /* ── alterar senha ──────────────────────────────────────── */
  async function alterarSenha() {
    setErroSenha("");
    if (!novaSenha) { setErroSenha("Informe a nova senha."); return; }
    try {
      const token = await getToken();
      const resp  = await fetch(`${API_URL}/superadmin/${userSel.id}/senha`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ senha: novaSenha }),
      });
      const data = await resp.json();
      if (!resp.ok) { setErroSenha(data.error || "Erro."); return; }
      setModalSenha(false);
      setNovaSenha("");
    } catch { setErroSenha("Erro interno."); }
  }

  function abrirModalSenha(user) {
    setUserSel(user);
    setNovaSenha("");
    setErroSenha("");
    setModalSenha(true);
  }

  function fecharModalCriar() {
    setModalCriar(false);
    setForm({ nome: "", email: "", senha: "" });
    setErroCriar("");
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="sa-wrapper">

        {/* ── HEADER ─────────────────────────────────────── */}
        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">👑 Administração Master</span>
            <h1 className="sa-page-title">
              Super <span>Administradores</span>
            </h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>
              ← Voltar ao painel
            </button>
            <button className="sa-btn sa-btn-purple" onClick={() => setModalCriar(true)}>
              👑 + Novo SuperAdmin
            </button>
          </div>
        </div>

        {/* ── LISTA ──────────────────────────────────────── */}
        <div className="sa-list-box">
          <div className="sa-list-header">
            <span className="sa-list-title">Usuários com acesso administrativo</span>
            <span className="sa-count-badge">{lista.length}</span>
          </div>

          {loadingLista ? (
            <div className="sa-loading">
              <div className="sa-spinner" />
              Carregando...
            </div>
          ) : lista.length === 0 ? (
            <div className="sa-empty">Nenhum SuperAdmin encontrado.</div>
          ) : (
            lista.map((user, i) => {
              const isMe     = user.id === profile.id;
              const isAtivo  = user.is_active !== false;

              return (
                <div
                  key={user.id}
                  className="sa-user-item"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {/* Avatar */}
                  <div className={`sa-avatar ${user.is_master ? "is-master" : isMe ? "is-me" : ""}`}>
                    {iniciais(user.nome)}
                  </div>

                  {/* Info */}
                  <div className="sa-user-info">
                    <div className="sa-user-name-row">
                      <span className="sa-user-name">{user.nome}</span>
                      {user.is_master && (
                        <span className="sa-badge-master">👑 Master</span>
                      )}
                      {isMe && !user.is_master && (
                        <span className="sa-badge-eu">Você</span>
                      )}
                      {isMe && user.is_master && (
                        <span className="sa-badge-eu">Você</span>
                      )}
                      <span className={`sa-badge ${isAtivo ? "sa-badge-ativo" : "sa-badge-inativo"}`}>
                        {isAtivo ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <span className="sa-user-email">{user.email}</span>
                  </div>

                  {/* Ações */}
                  <div className="sa-user-actions">
                    <button
                      className="sa-btn sa-btn-primary sa-btn-sm"
                      onClick={() => abrirModalSenha(user)}
                    >
                      🔑 {isMe ? "Minha Senha" : "Alterar Senha"}
                    </button>

                    {!isMe && (
                      <>
                        <button
                          className={`sa-btn sa-btn-sm ${isAtivo ? "sa-btn-warning" : "sa-btn-success"}`}
                          onClick={() => toggleAtivo(user.id)}
                        >
                          {isAtivo ? "⏸ Desativar" : "▶ Ativar"}
                        </button>

                        {!user.is_master && (
                          <button
                            className="sa-btn sa-btn-purple sa-btn-sm"
                            onClick={() => tornarMaster(user.id, user.nome)}
                          >
                            👑 Tornar Master
                          </button>
                        )}

                        <button
                          className="sa-btn sa-btn-danger sa-btn-sm"
                          onClick={() => excluir(user.id, user.nome)}
                        >
                          🗑 Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── MODAL: CRIAR SUPERADMIN ─────────────────────── */}
        {modalCriar && (
          <div className="sa-modal-overlay" onClick={fecharModalCriar}>
            <div className="sa-modal" onClick={e => e.stopPropagation()}>
              <div className="sa-modal-icon">👑</div>
              <div className="sa-modal-title">Novo SuperAdmin</div>
              <div className="sa-modal-subtitle">
                Crie um novo usuário com acesso administrativo ao sistema.
              </div>

              {erroCriar && (
                <div style={{
                  background: "var(--bg-danger)", color: "var(--text-danger)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 10, padding: "10px 14px",
                  fontSize: "0.85rem", fontWeight: 500, marginBottom: 16,
                }}>
                  ⚠️ {erroCriar}
                </div>
              )}

              <div className="sa-modal-form">
                <div className="sa-form-group">
                  <label className="sa-label">Nome</label>
                  <input
                    className="sa-input"
                    name="nome"
                    placeholder="Nome completo"
                    value={form.nome}
                    onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  />
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">E-mail</label>
                  <input
                    className="sa-input"
                    name="email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">Senha inicial</label>
                  <input
                    className="sa-input"
                    name="senha"
                    type="password"
                    placeholder="Senha de acesso"
                    value={form.senha}
                    onChange={e => setForm(p => ({ ...p, senha: e.target.value }))}
                  />
                </div>
              </div>

              <div className="sa-modal-actions">
                <button className="sa-btn sa-btn-ghost" onClick={fecharModalCriar}>
                  Cancelar
                </button>
                <button
                  className="sa-btn sa-btn-purple"
                  onClick={criarSuperAdmin}
                  disabled={salvando}
                >
                  {salvando ? "⏳ Criando…" : "✓ Criar SuperAdmin"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: ALTERAR SENHA ────────────────────────── */}
        {modalSenha && (
          <div
            className="sa-modal-overlay"
            onClick={() => setModalSenha(false)}
          >
            <div className="sa-modal" onClick={e => e.stopPropagation()}>
              <div className="sa-modal-icon">🔑</div>
              <div className="sa-modal-title">
                {userSel?.id === profile.id ? "Alterar Minha Senha" : `Senha de ${userSel?.nome}`}
              </div>
              <div className="sa-modal-subtitle">
                {userSel?.id === profile.id
                  ? "Defina uma nova senha para o seu acesso."
                  : `Defina uma nova senha para ${userSel?.nome}.`}
              </div>

              {erroSenha && (
                <div style={{
                  background: "var(--bg-danger)", color: "var(--text-danger)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: 10, padding: "10px 14px",
                  fontSize: "0.85rem", fontWeight: 500, marginBottom: 16,
                }}>
                  ⚠️ {erroSenha}
                </div>
              )}

              <div className="sa-modal-form">
                <div className="sa-form-group">
                  <label className="sa-label">Nova senha</label>
                  <input
                    className="sa-input"
                    type="password"
                    placeholder="Digite a nova senha"
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                  />
                </div>
              </div>

              <div className="sa-modal-actions">
                <button
                  className="sa-btn sa-btn-ghost"
                  onClick={() => setModalSenha(false)}
                >
                  Cancelar
                </button>
                <button
                  className="sa-btn sa-btn-primary"
                  onClick={alterarSenha}
                >
                  ✓ Salvar Senha
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutAdmin>
  );
}