// src/pages/Administrador/Operadores/DetalhesOperador.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import ResetSenhaModal from "./ResetSenhaModal";
import "./Operadores.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function DetalhesOperador() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;

  const [op,         setOp]         = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showReset,  setShowReset]  = useState(false);
  const [permissoes, setPermissoes] = useState([]);
  const [permLoading,setPermLoading]= useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permEditing,setPermEditing]= useState(false);

  const MODULOS_ADMIN = [
    { id:'pdv',           label:'PDV (Caixa)',      icone:'🖥️', acoes:[{id:'pdv_cancelar_venda',label:'Cancelar vendas'},{id:'pdv_fiado',label:'Registrar fiado'}] },
    { id:'estoque',       label:'Estoque',          icone:'📦', acoes:[{id:'estoque_adicionar',label:'Adicionar'},{id:'estoque_editar',label:'Editar'},{id:'estoque_excluir',label:'Excluir'}] },
    { id:'clientes',      label:'Clientes / Fiado', icone:'👥', acoes:[{id:'clientes_adicionar',label:'Adicionar'},{id:'clientes_editar',label:'Editar'},{id:'clientes_excluir',label:'Excluir'},{id:'clientes_receber',label:'Receber'}] },
    { id:'financeiro',    label:'Financeiro',       icone:'💰', acoes:[{id:'financeiro_ver_dre',label:'DRE'},{id:'financeiro_ver_relatorio',label:'Relatório'},{id:'financeiro_contas_pagar',label:'Contas a pagar'}] },
    { id:'configuracoes', label:'Configurações',    icone:'⚙️', acoes:[{id:'config_editar_dados',label:'Editar dados'},{id:'config_editar_logo',label:'Alterar logo'}] },
  ];

  async function carregar() {
    setLoading(true);
    try {
      const [respOp, respPerms] = await Promise.all([
        fetch(`${API_URL}/admin/operadores/detalhes/${id}`, { credentials: "include" }),
        fetch(`${API_URL}/admin/operadores/${id}/permissoes`,  { credentials: "include" }),
      ]);
      const data = await respOp.json();
      setOp(respOp.ok ? data : null);
      if (respPerms.ok) setPermissoes(await respPerms.json());
    } catch { setOp(null); }
    setLoading(false);
  }


  useEffect(() => { carregar(); }, [id]);

  function togglePerm(id, moduloId) {
    setPermissoes(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      const novo = [...prev, id];
      if (moduloId && !novo.includes(moduloId)) novo.push(moduloId);
      return novo;
    });
  }

  function toggleModulo(id) {
    setPermissoes(prev => {
      const mod = MODULOS_ADMIN.find(m => m.id === id);
      if (prev.includes(id)) {
        const acoesIds = mod?.acoes.map(a => a.id) || [];
        return prev.filter(p => p !== id && !acoesIds.includes(p));
      }
      return [...prev, id];
    });
  }

  async function salvarPermissoes() {
    setPermSaving(true);
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}/permissoes`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ permissoes }),
        credentials: "include",
      });
      if (resp.ok) setPermEditing(false);
      else alert("Erro ao salvar permissões.");
    } catch { alert("Erro interno."); }
    setPermSaving(false);
  }

  async function toggleStatus() {
    if (!op) return;
    const novoStatus = op.status === "ativo" ? "inativo" : "ativo";
    if (!window.confirm(`Alterar status para "${novoStatus}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}/status`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status: novoStatus }),
        credentials: "include",
      });
      if (resp.ok) carregar();
      else alert("Erro ao alterar status.");
    } catch { alert("Erro ao alterar status."); }
  }

  async function excluir() {
    if (!window.confirm(`Excluir operador "${op?.nome}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/operadores/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (resp.ok) navigate(-1);
      else alert("Erro ao excluir operador.");
    } catch { alert("Erro ao excluir operador."); }
  }

  /* ── loading ────────────────────────────────────────────── */
  if (loading) {
    return (
      <LayoutAdmin>
        <div className="op-wrapper">
          <div className="op-loading"><div className="op-spinner" /> Carregando operador...</div>
        </div>
      </LayoutAdmin>
    );
  }

  if (!op) {
    return (
      <LayoutAdmin>
        <div className="op-wrapper">
          <div className="op-empty">
            <span className="op-empty-icon">⚠️</span>
            Operador não encontrado.
          </div>
          <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
            ← Voltar
          </button>
        </div>
      </LayoutAdmin>
    );
  }

  const isAtivo = op.status === "ativo";

  return (
    <LayoutAdmin>
      <div className="op-wrapper">

        {/* HEADER */}
        <div className="op-page-header">
          <div className="op-page-header-left">
            <span className="op-breadcrumb">👥 Operadores</span>
            <h1 className="op-page-title">Detalhes do <span>Operador</span></h1>
          </div>
          <div className="op-page-actions">
            <button className="op-btn op-btn-ghost" onClick={() => navigate(-1)}>
              ← Voltar
            </button>
          </div>
        </div>

        {/* HERO CARD */}
        <div className="op-detail-hero">
          {/* Avatar / Foto */}
          {op.foto_url
            ? <img src={op.foto_url} alt="Foto" className="op-avatar-foto" />
            : <div className="op-avatar-lg">{iniciais(op.nome)}</div>
          }

          {/* Info */}
          <div className="op-detail-info">
            <div className="op-detail-name">{op.nome}</div>
            <div className="op-detail-email">{op.email}</div>
            <div className="op-detail-meta">
              <span className={`op-badge op-badge-${op.status}`}>
                {op.status}
              </span>
            </div>
          </div>

          {/* Ações */}
          <div className="op-detail-actions">
            <button
              className="op-btn op-btn-outline op-btn-sm"
              onClick={() => navigate(`/admin/operadores/editar/${id}`)}
            >
              ✏️ Editar
            </button>
            <button
              className="op-btn op-btn-primary op-btn-sm"
              onClick={() => setShowReset(true)}
            >
              🔑 Resetar Senha
            </button>
            <button
              className={`op-btn op-btn-sm ${isAtivo ? "op-btn-warning" : "op-btn-success"}`}
              onClick={toggleStatus}
            >
              {isAtivo ? "⏸ Inativar" : "▶ Ativar"}
            </button>
            <button
              className="op-btn op-btn-danger op-btn-sm"
              onClick={excluir}
            >
              🗑 Excluir
            </button>
          </div>
        </div>

        {/* INFO GRID */}
        <div className="op-info-grid">
          <div className="op-info-block">
            <div className="op-info-block-title">Contato</div>
            <div className="op-info-row">
              <span className="op-info-label">E-mail</span>
              <span className="op-info-value mono">{op.email || "—"}</span>
            </div>
            <div className="op-info-row">
              <span className="op-info-label">Telefone</span>
              <span className="op-info-value mono">{op.telefone || "—"}</span>
            </div>
          </div>

          <div className="op-info-block">
            <div className="op-info-block-title">Situação</div>
            <div className="op-info-row">
              <span className="op-info-label">Status</span>
              <span className={`op-badge op-badge-${op.status}`}>{op.status}</span>
            </div>
            <div className="op-info-row" style={{ marginTop: 10 }}>
              <span className="op-info-label">ID do sistema</span>
              <span className="op-info-value mono" style={{ fontSize: "0.72rem", wordBreak: "break-all" }}>
                {op.id}
              </span>
            </div>
          </div>
        {/* PERMISSÕES */}
        <div className="op-info-block" style={{ gridColumn: '1 / -1' }}>
          <div className="op-info-block-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>🔑 Módulos e Permissões</span>
            {!permEditing
              ? <button className="op-btn op-btn-ghost op-btn-sm" onClick={() => setPermEditing(true)}>✏️ Editar</button>
              : <div style={{ display: 'flex', gap: 6 }}>
                  <button className="op-btn op-btn-ghost op-btn-sm" onClick={() => { setPermEditing(false); carregar(); }}>Cancelar</button>
                  <button className="op-btn op-btn-primary op-btn-sm" onClick={salvarPermissoes} disabled={permSaving}>
                    {permSaving ? '⏳…' : '✓ Salvar'}
                  </button>
                </div>
            }
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {MODULOS_ADMIN.map(mod => {
              const modAtivo = permissoes.includes(mod.id);
              return (
                <div key={mod.id} style={{
                  border: `1.5px solid ${modAtivo ? '#14b8a6' : 'var(--border, #e2e8f0)'}`,
                  borderRadius: 10, overflow: 'hidden',
                }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px',
                      background: modAtivo ? 'rgba(20,184,166,0.08)' : 'var(--bg-input, #f8fafc)',
                      cursor: permEditing ? 'pointer' : 'default',
                    }}
                    onClick={() => permEditing && toggleModulo(mod.id)}
                  >
                    <span style={{ fontSize: '1.1rem' }}>{mod.icone}</span>
                    <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text, #1e293b)' }}>{mod.label}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: modAtivo ? '#14b8a6' : 'var(--text-muted, #94a3b8)' }}>
                      {modAtivo ? '✓ Ativo' : '○ Inativo'}
                    </span>
                  </div>
                  {modAtivo && mod.acoes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px 10px 36px', background: 'var(--card-bg, #fff)', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                      {mod.acoes.map(acao => {
                        const acaoAtiva = permissoes.includes(acao.id);
                        return (
                          <span
                            key={acao.id}
                            onClick={() => permEditing && togglePerm(acao.id, mod.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 20,
                              border: `1px solid ${acaoAtiva ? '#14b8a6' : 'var(--border, #e2e8f0)'}`,
                              background: acaoAtiva ? 'rgba(20,184,166,0.1)' : 'var(--bg-input, #f8fafc)',
                              color: acaoAtiva ? '#14b8a6' : 'var(--text-muted, #94a3b8)',
                              fontSize: '0.72rem', fontWeight: acaoAtiva ? 700 : 500,
                              cursor: permEditing ? 'pointer' : 'default',
                              userSelect: 'none',
                            }}
                          >
                            {acaoAtiva ? '✓' : '○'} {acao.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>

      </div>

      {/* MODAL RESET SENHA */}
      {showReset && (
        <ResetSenhaModal id={id} onClose={() => setShowReset(false)} />
      )}
    </LayoutAdmin>
  );
}