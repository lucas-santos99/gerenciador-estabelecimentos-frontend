// src/pages/Administrador/Operadores/DetalhesOperador.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import ResetSenhaModal from "./ResetSenhaModal";
import PersonificarModal from "../../../components/PersonificarModal";
import { useAuth } from "../../../contexts/AuthProvider";
import "./Operadores.css";
import { apiFetch } from "../../../utils/api";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function DetalhesOperador() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const API_URL  = import.meta.env.VITE_API_URL;
  const { profile } = useAuth();

  const [op,         setOp]         = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [showReset,  setShowReset]  = useState(false);
  const [modalPersonificar, setModalPersonificar] = useState(false);
  const [permissoes, setPermissoes] = useState([]);
  const [permLoading,setPermLoading]= useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permEditing,setPermEditing]= useState(false);

  // ⚠️ FONTE DA VERDADE DO ADMIN: mantenha sincronizado com
  // OperadoresEstabelecimento.jsx ao adicionar módulos/ações
  const MODULOS_ADMIN = [
    {
      id: 'pdv', label: 'PDV (Caixa)', icone: '🖥️',
      acoes: [
        { id: 'pdv_realizar_venda', label: 'Realizar vendas' },
        { id: 'pdv_cancelar_venda', label: 'Cancelar vendas' },
        { id: 'pdv_fiado',          label: 'Vender no fiado' },
        { id: 'pdv_desconto',       label: 'Aplicar desconto' },
      ],
    },
    {
      id: 'estoque', label: 'Estoque', icone: '📦',
      acoes: [
        { id: 'estoque_adicionar', label: 'Adicionar produtos' },
        { id: 'estoque_editar',    label: 'Editar produtos' },
        { id: 'estoque_excluir',   label: 'Excluir produtos' },
      ],
    },
    {
      id: 'clientes', label: 'Clientes / Fiado', icone: '👥',
      acoes: [
        { id: 'clientes_adicionar', label: 'Adicionar clientes' },
        { id: 'clientes_editar',    label: 'Editar clientes' },
        { id: 'clientes_excluir',   label: 'Excluir clientes' },
        { id: 'clientes_receber',   label: 'Registrar recebimentos' },
      ],
    },
    {
      id: 'financeiro', label: 'Financeiro', icone: '💰',
      acoes: [
        { id: 'financeiro_ver_resumo',   label: 'Ver resumo do caixa' },
        { id: 'financeiro_ver_dre',      label: 'Ver DRE' },
        { id: 'financeiro_contas_pagar', label: 'Gerenciar contas a pagar' },
      ],
    },
    {
      id: 'relatorios', label: 'Relatórios', icone: '📊',
      acoes: [
        { id: 'relatorios_historico',  label: 'Ver histórico de vendas' },
        { id: 'relatorios_operadores', label: 'Ver vendas por operador' },
        { id: 'relatorios_produtos',   label: 'Ver produtos mais vendidos' },
        { id: 'relatorios_estoque',    label: 'Ver relatório de estoque' },
        { id: 'relatorios_auditoria',  label: 'Ver auditoria de ações' },
      ],
    },
    {
      id: 'configuracoes', label: 'Configurações', icone: '⚙️',
      acoes: [
        { id: 'config_editar_dados', label: 'Editar dados' },
        { id: 'config_editar_logo',  label: 'Alterar logo' },
      ],
    },
    {
      id: 'inventario', label: 'Inventário', icone: '📦',
      acoes: [
        { id: 'inventario_contar',    label: 'Realizar contagens (inventário físico)' },
        { id: 'inventario_finalizar', label: 'Finalizar e aplicar inventário ao estoque' },
        { id: 'inventario_ajuste',    label: 'Ajustes rápidos de estoque' },
      ],
    },
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
      const resp = await apiFetch(`/admin/operadores/${id}/permissoes`, {
        method: "PUT",
        body:   JSON.stringify({ permissoes }),
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
      const resp = await apiFetch(`/admin/operadores/${id}/status`, {
        method: "PUT",
        body:   JSON.stringify({ status: novoStatus }),
      });
      if (resp.ok) carregar();
      else alert("Erro ao alterar status.");
    } catch { alert("Erro ao alterar status."); }
  }

  async function excluir() {
    if (!window.confirm(`Excluir operador "${op?.nome}"?`)) return;
    try {
      const resp = await apiFetch(`/admin/operadores/${id}`, { method: "DELETE" });
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
            {profile?.is_master && isAtivo && (
              <button
                className="op-btn op-btn-outline op-btn-sm"
                style={{ borderColor: "#7c3aed", color: "#7c3aed" }}
                onClick={() => setModalPersonificar(true)}
                title="Entrar no sistema como este operador"
              >
                🔑 Entrar como
              </button>
            )}
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
                <div
                  key={mod.id}
                  className={`op-modulo-card${modAtivo ? ' ativo' : ''}`}
                >
                  <div
                    className={`op-modulo-header${modAtivo ? ' ativo' : ''}${permEditing ? ' editavel' : ''}`}
                    onClick={() => permEditing && toggleModulo(mod.id)}
                  >
                    <span className="op-modulo-icone">{mod.icone}</span>
                    <span className="op-modulo-label">{mod.label}</span>
                    <span className={`op-modulo-status${modAtivo ? ' ativo' : ''}`}>
                      {modAtivo ? '✓ Ativo' : '○ Inativo'}
                    </span>
                  </div>
                  {modAtivo && mod.acoes.length > 0 && (
                    <div className="op-modulo-acoes">
                      {mod.acoes.map(acao => {
                        const acaoAtiva = permissoes.includes(acao.id);
                        return (
                          <span
                            key={acao.id}
                            className={`op-acao-tag${acaoAtiva ? ' ativo' : ''}${permEditing ? ' editavel' : ''}`}
                            onClick={() => permEditing && togglePerm(acao.id, mod.id)}
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

      {modalPersonificar && (
        <PersonificarModal
          tipo="usuario"
          id={op.id}
          nomeExibicao={op.nome}
          onClose={() => setModalPersonificar(false)}
        />
      )}
    </LayoutAdmin>
  );
}