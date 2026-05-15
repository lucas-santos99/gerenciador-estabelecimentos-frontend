// src/pages/Estabelecimento/Operadores/OperadoresEstabelecimento.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import './OperadoresEstabelecimento.css';

/* ── Módulos disponíveis com ações granulares ────────────── */
const MODULOS = [
  {
    id: 'pdv', label: 'PDV (Caixa)', icone: '🖥️', desc: 'Realizar vendas e operar o caixa',
    acoes: [
      { id: 'pdv_realizar_venda',  label: 'Realizar vendas' },
      { id: 'pdv_cancelar_venda',  label: 'Cancelar vendas' },
      { id: 'pdv_fiado',           label: 'Vender no fiado' },
      { id: 'pdv_desconto',        label: 'Aplicar desconto' },
    ],
  },
  {
    id: 'estoque', label: 'Estoque', icone: '📦', desc: 'Ver e editar produtos e categorias',
    acoes: [
      { id: 'estoque_adicionar', label: 'Adicionar produtos' },
      { id: 'estoque_editar',    label: 'Editar produtos' },
      { id: 'estoque_excluir',   label: 'Excluir produtos' },
    ],
  },
  {
    id: 'clientes', label: 'Clientes / Fiado', icone: '👥', desc: 'Gerenciar clientes e cobranças',
    acoes: [
      { id: 'clientes_adicionar', label: 'Adicionar clientes' },
      { id: 'clientes_editar',    label: 'Editar clientes' },
      { id: 'clientes_excluir',   label: 'Excluir clientes' },
      { id: 'clientes_receber',   label: 'Registrar recebimentos' },
    ],
  },
  {
    id: 'financeiro', label: 'Financeiro', icone: '💰', desc: 'Fluxo de caixa e relatórios',
    acoes: [
      { id: 'financeiro_ver_resumo',    label: 'Ver resumo do caixa' },
      { id: 'financeiro_ver_dre',       label: 'Ver DRE' },
      { id: 'financeiro_ver_relatorio', label: 'Ver relatório de vendas' },
      { id: 'financeiro_contas_pagar',  label: 'Gerenciar contas a pagar' },
    ],
  },
  {
    id: 'configuracoes', label: 'Configurações', icone: '⚙️', desc: 'Editar dados do estabelecimento',
    acoes: [
      { id: 'config_editar_dados', label: 'Editar dados' },
      { id: 'config_editar_logo',  label: 'Alterar logo' },
    ],
  },
];

const STATUS_LABEL = { ativo: 'Ativo', inativo: 'Inativo' };
const STATUS_COR   = { ativo: 'verde', inativo: 'cinza' };

/* ════════════════════════════════════════════════════════════ */
export default function OperadoresEstabelecimento({ estabelecimentoId }) {

  const [operadores,    setOperadores]    = useState([]);
  const [limite,        setLimite]        = useState({ limite: 3, total: 0, pode_criar: true });
  const [loading,       setLoading]       = useState(true);
  const [erro,          setErro]          = useState('');

  // Modal criar/editar
  const [modalAberto,   setModalAberto]   = useState(false);
  const [operadorEdit,  setOperadorEdit]  = useState(null); // null = novo

  // Modal de permissões
  const [permModal,     setPermModal]     = useState(null); // operador selecionado
  const [resetModal,    setResetModal]    = useState(null); // operador selecionado para reset

  useEffect(() => {
    if (estabelecimentoId) {
      carregarTudo();
    }
  }, [estabelecimentoId]);

  async function carregarTudo() {
    setLoading(true);
    setErro('');
    try {
      const [respOp, respLim] = await Promise.all([
        apiFetch('/api/operadores'),
        apiFetch('/api/operadores/limite'),
      ]);
      if (!respOp.ok)  throw new Error('Erro ao carregar operadores');
      if (!respLim.ok) throw new Error('Erro ao carregar limite');
      setOperadores(await respOp.json());
      setLimite(await respLim.json());
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function alterarStatus(op) {
    const novoStatus = op.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const resp = await apiFetch(`/api/operadores/${op.id}/status`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: novoStatus }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      setOperadores(prev =>
        prev.map(o => o.id === op.id ? { ...o, status: novoStatus } : o)
      );
    } catch (err) {
      setErro(err.message);
    }
  }

  async function excluir(op) {
    if (!window.confirm(`Excluir "${op.nome}"? Esta ação desativa o acesso permanentemente.`)) return;
    try {
      const resp = await apiFetch(`/api/operadores/${op.id}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error((await resp.json()).error);
      setOperadores(prev => prev.filter(o => o.id !== op.id));
      setLimite(prev => ({ ...prev, total: prev.total - 1, pode_criar: true }));
    } catch (err) {
      setErro(err.message);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="opest-container">

      {/* Modal criar/editar */}
      {modalAberto && (
        <ModalOperador
          operador={operadorEdit}
          onClose={() => { setModalAberto(false); setOperadorEdit(null); }}
          onSalvo={() => { setModalAberto(false); setOperadorEdit(null); carregarTudo(); }}
        />
      )}

      {/* Modal permissões */}
      {permModal && (
        <ModalPermissoes
          operador={permModal}
          onClose={() => setPermModal(null)}
          onSalvo={() => setPermModal(null)}
        />
      )}

      {/* Modal reset senha */}
      {resetModal && (
        <ModalResetSenha
          operador={resetModal}
          onClose={() => setResetModal(null)}
        />
      )}

      {/* ── Header ── */}
      <div className="opest-header">
        <div className="opest-header-info">
          <h2 className="opest-titulo">👥 Operadores</h2>
          <span className="opest-subtitulo">
            Funcionários com acesso ao sistema
          </span>
        </div>
        <div className="opest-header-right">
          <div className="opest-limite-badge">
            <span className="opest-limite-num">{limite.total}</span>
            <span className="opest-limite-sep">/</span>
            <span className="opest-limite-max">{limite.limite}</span>
            <span className="opest-limite-label">operadores</span>
          </div>
          <button
            className="opest-btn-novo"
            onClick={() => {
              if (!limite.pode_criar) {
                setErro(`Limite de ${limite.limite} operador(es) atingido. Contate o administrador.`);
                return;
              }
              setOperadorEdit(null);
              setModalAberto(true);
            }}
            disabled={!limite.pode_criar}
          >
            + Novo Operador
          </button>
        </div>
      </div>

      {erro && (
        <div className="opest-erro" onClick={() => setErro('')}>
          ⚠️ {erro} <span className="opest-erro-fechar">×</span>
        </div>
      )}

      {/* ── Lista ── */}
      {loading ? (
        <div className="opest-loading">
          <div className="opest-spinner" /> Carregando operadores…
        </div>
      ) : operadores.length === 0 ? (
        <div className="opest-vazio">
          <span className="opest-vazio-icone">👤</span>
          <p>Nenhum operador cadastrado</p>
          <small>Crie o primeiro operador para dar acesso a um funcionário</small>
          <button className="opest-btn-novo" onClick={() => setModalAberto(true)}>
            + Criar primeiro operador
          </button>
        </div>
      ) : (
        <div className="opest-lista">
          {operadores.map(op => (
            <div key={op.id} className={`opest-card ${op.status}`}>

              {/* Avatar */}
              <div className="opest-avatar">
                {op.foto_url
                  ? <img src={op.foto_url} alt={op.nome} className="opest-avatar-img" />
                  : <span className="opest-avatar-inicial">{op.nome[0]?.toUpperCase()}</span>
                }
              </div>

              {/* Info */}
              <div className="opest-card-info">
                <span className="opest-card-nome">{op.nome}</span>
                <span className="opest-card-email">{op.email}</span>
                {op.telefone && <span className="opest-card-tel">{op.telefone}</span>}
              </div>

              {/* Badge status */}
              <div className={`opest-status-badge ${STATUS_COR[op.status]}`}>
                {STATUS_LABEL[op.status] || op.status}
              </div>

              {/* Ações */}
              <div className="opest-card-acoes">
                <button
                  className="opest-acao-btn permissoes"
                  onClick={() => setPermModal(op)}
                  title="Definir permissões"
                >
                  🔑 Permissões
                </button>
                <button
                  className="opest-acao-btn editar"
                  onClick={() => { setOperadorEdit(op); setModalAberto(true); }}
                  title="Editar operador"
                >
                  ✏️ Editar
                </button>
                <button
                  className="opest-acao-btn senha"
                  onClick={() => setResetModal(op)}
                  title="Alterar senha"
                >
                  🔒 Senha
                </button>
                <button
                  className={`opest-acao-btn status ${op.status === 'ativo' ? 'desativar' : 'ativar'}`}
                  onClick={() => alterarStatus(op)}
                  title={op.status === 'ativo' ? 'Desativar' : 'Reativar'}
                >
                  {op.status === 'ativo' ? '⏸ Desativar' : '▶ Ativar'}
                </button>
                <button
                  className="opest-acao-btn excluir"
                  onClick={() => excluir(op)}
                  title="Excluir operador"
                >
                  🗑
                </button>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — Criar / Editar Operador
════════════════════════════════════════════════════════════ */
function ModalOperador({ operador, onClose, onSalvo }) {
  const isEdit = !!operador;

  const [form,     setForm]     = useState({
    nome:     operador?.nome     || '',
    email:    operador?.email    || '',
    telefone: operador?.telefone || '',
    senha:    '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');
  const nomeRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nomeRef.current?.focus(), 0);
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  function atualizar(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    if (!isEdit && (!form.senha || form.senha.length < 6)) {
      setErro('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setSalvando(true);
    try {
      const url    = isEdit ? `/api/operadores/${operador.id}` : '/api/operadores/criar';
      const method = isEdit ? 'PUT' : 'POST';
      const body   = isEdit
        ? { nome: form.nome, email: form.email, telefone: form.telefone }
        : { ...form };

      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="opest-modal-overlay">
      <div className="opest-modal">
        <div className="opest-modal-titulo">
          {isEdit ? `✏️ Editar — ${operador.nome}` : '➕ Novo Operador'}
        </div>

        {erro && <div className="opest-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="opest-modal-form">
          <div className="opest-form-group">
            <label className="opest-form-label">Nome completo *</label>
            <input ref={nomeRef} className="opest-form-input" name="nome"
              placeholder="Nome do funcionário" value={form.nome}
              onChange={atualizar} required disabled={salvando} />
          </div>
          <div className="opest-form-group">
            <label className="opest-form-label">E-mail de login *</label>
            <input className="opest-form-input" name="email" type="email"
              placeholder="email@exemplo.com" value={form.email}
              onChange={atualizar} required disabled={salvando || isEdit} />
            {isEdit && (
              <span className="opest-form-hint">O e-mail não pode ser alterado após criação.</span>
            )}
          </div>
          <div className="opest-form-group">
            <label className="opest-form-label">Telefone</label>
            <input className="opest-form-input" name="telefone"
              placeholder="(00) 00000-0000" value={form.telefone}
              onChange={atualizar} disabled={salvando} />
          </div>
          {!isEdit && (
            <div className="opest-form-group">
              <label className="opest-form-label">Senha inicial *</label>
              <input className="opest-form-input" name="senha" type="password"
                placeholder="Mínimo 6 caracteres" value={form.senha}
                onChange={atualizar} required disabled={salvando} />
              <span className="opest-form-hint">
                O operador pode alterar a senha depois pelo login.
              </span>
            </div>
          )}

          <div className="opest-modal-acoes">
            <button type="button" className="opest-modal-btn-cancelar"
              onClick={onClose} disabled={salvando}>
              Cancelar (Esc)
            </button>
            <button type="submit" className="opest-modal-btn-salvar" disabled={salvando}>
              {salvando ? '⏳ Salvando…' : isEdit ? '✓ Salvar alterações' : '✓ Criar operador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — Permissões do Operador (com ações granulares)
════════════════════════════════════════════════════════════ */
function ModalPermissoes({ operador, onClose, onSalvo }) {
  const [selecionadas, setSelecionadas] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState('');

  useEffect(() => {
    carregarPermissoes();
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  async function carregarPermissoes() {
    try {
      const resp = await apiFetch(`/api/operadores/${operador.id}/permissoes`);
      if (!resp.ok) throw new Error('Erro ao carregar permissões');
      setSelecionadas(await resp.json());
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleModulo(id) {
    setSelecionadas(prev => {
      const temModulo = prev.includes(id);
      const mod = MODULOS.find(m => m.id === id);
      if (temModulo) {
        // Remove módulo e todas as suas ações
        const acoesIds = mod?.acoes.map(a => a.id) || [];
        return prev.filter(p => p !== id && !acoesIds.includes(p));
      } else {
        return [...prev, id];
      }
    });
  }

  function toggleAcao(acaoId, moduloId) {
    setSelecionadas(prev => {
      if (prev.includes(acaoId)) {
        return prev.filter(p => p !== acaoId);
      } else {
        // Garantir que o módulo pai também está selecionado
        const novo = [...prev, acaoId];
        if (!novo.includes(moduloId)) novo.push(moduloId);
        return novo;
      }
    });
  }

  async function salvar() {
    setSalvando(true);
    setErro('');
    try {
      const resp = await apiFetch(`/api/operadores/${operador.id}/permissoes`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permissoes: selecionadas }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const modulosCount = MODULOS.filter(m => selecionadas.includes(m.id)).length;

  return (
    <div className="opest-modal-overlay">
      <div className="opest-modal opest-modal--perm">
        <div className="opest-modal-titulo">
          🔑 Permissões — {operador.nome}
        </div>
        <p className="opest-perm-subtitulo">
          Ative os módulos e as ações específicas que este operador pode executar.
        </p>

        {erro && <div className="opest-modal-erro">⚠️ {erro}</div>}

        {loading ? (
          <div className="opest-loading"><div className="opest-spinner" /> Carregando…</div>
        ) : (
          <div className="opest-perm-lista">
            {MODULOS.map(mod => {
              const moduloAtivo = selecionadas.includes(mod.id);
              return (
                <div key={mod.id} className={`opest-perm-modulo ${moduloAtivo ? 'ativo' : ''}`}>
                  {/* Header do módulo — toggle principal */}
                  <button
                    type="button"
                    className="opest-perm-modulo-header"
                    onClick={() => toggleModulo(mod.id)}
                  >
                    <span className="opest-perm-modulo-icone">{mod.icone}</span>
                    <div className="opest-perm-modulo-info">
                      <span className="opest-perm-modulo-label">{mod.label}</span>
                      <span className="opest-perm-modulo-desc">{mod.desc}</span>
                    </div>
                    <span className={`opest-perm-toggle ${moduloAtivo ? 'ativo' : ''}`}>
                      {moduloAtivo ? '✓' : '○'}
                    </span>
                  </button>

                  {/* Ações granulares — só exibe se módulo ativo */}
                  {moduloAtivo && mod.acoes.length > 0 && (
                    <div className="opest-perm-acoes">
                      <button
                        type="button"
                        className="opest-perm-acao-todas"
                        onClick={() => {
                          const todasAtivas = mod.acoes.every(a => selecionadas.includes(a.id));
                          if (todasAtivas) {
                            setSelecionadas(prev => prev.filter(p => !mod.acoes.map(a => a.id).includes(p)));
                          } else {
                            setSelecionadas(prev => {
                              const novo = [...prev];
                              mod.acoes.forEach(a => { if (!novo.includes(a.id)) novo.push(a.id); });
                              return novo;
                            });
                          }
                        }}
                      >
                        {mod.acoes.every(a => selecionadas.includes(a.id)) ? '✕ Desmarcar todas' : '✓ Selecionar todas'}
                      </button>
                      {mod.acoes.map(acao => {
                        const acaoAtiva = selecionadas.includes(acao.id);
                        return (
                          <label key={acao.id} className={`opest-perm-acao ${acaoAtiva ? 'ativo' : ''}`}>
                            <span className="opest-perm-acao-check">{acaoAtiva ? '✓' : ''}</span>
                            <input
                              type="checkbox"
                              checked={acaoAtiva}
                              onChange={() => toggleAcao(acao.id, mod.id)}
                            />
                            <span>{acao.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="opest-perm-resumo">
            {modulosCount === 0
              ? '⚠️ Nenhum módulo selecionado — o operador não acessará nenhuma tela.'
              : `✓ ${modulosCount} módulo(s) liberado(s) — ${selecionadas.length} permissão(ões) total`
            }
          </div>
        )}

        <div className="opest-modal-acoes">
          <button className="opest-modal-btn-cancelar" onClick={onClose} disabled={salvando}>
            Cancelar (Esc)
          </button>
          <button className="opest-modal-btn-salvar" onClick={salvar} disabled={salvando || loading}>
            {salvando ? '⏳ Salvando…' : '✓ Salvar permissões'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — Reset Senha do Operador
════════════════════════════════════════════════════════════ */
function ModalResetSenha({ operador, onClose }) {
  const [senha,      setSenha]      = useState('');
  const [confirmar,  setConfirmar]  = useState('');
  const [salvando,   setSalvando]   = useState(false);
  const [erro,       setErro]       = useState('');
  const [sucesso,    setSucesso]    = useState(false);
  const senhaRef = useRef(null);

  useEffect(() => {
    setTimeout(() => senhaRef.current?.focus(), 0);
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return; }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return; }
    setSalvando(true);
    try {
      const resp = await apiFetch(`/api/operadores/${operador.id}/reset-senha`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ senha }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setSucesso(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="opest-modal-overlay">
      <div className="opest-modal">
        <div className="opest-modal-titulo">🔒 Alterar senha — {operador.nome}</div>

        {sucesso ? (
          <>
            <div className="opest-modal-sucesso">✓ Senha alterada com sucesso!</div>
            <div className="opest-modal-acoes">
              <button className="opest-modal-btn-salvar" onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : (
          <form onSubmit={salvar} className="opest-modal-form">
            {erro && <div className="opest-modal-erro">⚠️ {erro}</div>}
            <div className="opest-form-group">
              <label className="opest-form-label">Nova senha *</label>
              <input
                ref={senhaRef}
                className="opest-form-input"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                required
                disabled={salvando}
              />
            </div>
            <div className="opest-form-group">
              <label className="opest-form-label">Confirmar senha *</label>
              <input
                className="opest-form-input"
                type="password"
                placeholder="Repita a senha"
                value={confirmar}
                onChange={e => setConfirmar(e.target.value)}
                required
                disabled={salvando}
              />
            </div>
            <span className="opest-form-hint">
              O operador deverá usar esta nova senha no próximo login.
            </span>
            <div className="opest-modal-acoes">
              <button type="button" className="opest-modal-btn-cancelar" onClick={onClose} disabled={salvando}>
                Cancelar (Esc)
              </button>
              <button type="submit" className="opest-modal-btn-salvar" disabled={salvando}>
                {salvando ? '⏳ Salvando…' : '✓ Alterar senha'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}