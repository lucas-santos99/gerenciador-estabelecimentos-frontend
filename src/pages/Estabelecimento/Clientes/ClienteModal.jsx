// src/pages/Estabelecimento/Clientes/ClienteModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../Clientes.css';

const API_URL = import.meta.env.VITE_API_URL;

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarDataInput(s) {
  if (!s) return '';
  try { return s.includes('T') ? s.split('T')[0] : s; }
  catch { return ''; }
}

/* ════════════════════════════════════════════════════════════ */
export default function ClienteModal({
  estabelecimentoId,
  cliente,
  onClose,
  onSalvo,
  onExcluido,
}) {
  const isEdit = !!cliente;

  const [nome,           setNome]           = useState(cliente?.nome || '');
  const [telefone,       setTelefone]       = useState(cliente?.telefone || '');
  const [limiteCredito,  setLimiteCredito]  = useState(
    parseFloat(cliente?.limite_credito || 0).toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 })
  );
  const [dataVencimento, setDataVencimento] = useState(formatarDataInput(cliente?.data_vencimento));
  const [salvando,       setSalvando]       = useState(false);
  const [erro,           setErro]           = useState('');

  const nomeRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nomeRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  /* ── Salvar ──────────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) { setErro('O nome do cliente é obrigatório.'); return; }
    setSalvando(true);
    setErro('');

    const url    = isEdit
      ? `${API_URL}/api/clientes/atualizar/${encodeURIComponent(cliente.id)}`
      : `${API_URL}/api/clientes/criar`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimentoId,
          nome:          nome.trim(),
          telefone:      telefone.trim() || null,
          limiteCredito: limiteCredito.replace(/\./g, '').replace(',', '.'),
          dataVencimento: dataVencimento || null,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar');
      onSalvo?.();
      onClose();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ── Excluir ─────────────────────────────────────────────── */
  async function excluir() {
    if (!isEdit) return;
    if (parseFloat(cliente.saldo_devedor) > 0.01) {
      setErro('Não é possível excluir cliente com saldo devedor pendente.');
      return;
    }
    if (!window.confirm(`Excluir "${cliente.nome}"? Esta ação é irreversível.`)) return;
    setSalvando(true);
    try {
      const resp = await fetch(
        `${API_URL}/api/clientes/deletar/${encodeURIComponent(cliente.id)}?estabelecimentoId=${encodeURIComponent(estabelecimentoId)}`,
        { method: 'DELETE' }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao excluir');
      onExcluido?.();
      onClose();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="cli-modal-overlay" onClick={onClose}>
      <div className="cli-modal" onClick={e => e.stopPropagation()}>

        <div className="cli-modal-titulo">
          {isEdit ? `✏️ Editar — ${cliente.nome}` : '➕ Novo cliente'}
        </div>

        {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="cli-modal-form">

          {/* Dados pessoais */}
          <div>
            <div className="cli-form-group">
              <label className="cli-form-label">Nome completo *</label>
              <input
                ref={nomeRef}
                className="cli-form-input"
                type="text"
                placeholder="Nome do cliente"
                value={nome}
                onChange={e => setNome(e.target.value)}
                required
                disabled={salvando}
              />
            </div>
            <div className="cli-form-group">
              <label className="cli-form-label">Telefone</label>
              <input
                className="cli-form-input"
                type="text"
                placeholder="(00) 00000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                disabled={salvando}
              />
            </div>
          </div>

          {/* Config fiado */}
          <div className="cli-modal-section">
            <div className="cli-modal-section-titulo">💳 Configurações do Fiado</div>

            <div className="cli-form-group">
              <label className="cli-form-label">Limite de crédito (R$)</label>
              <input
                className="cli-form-input"
                type="text"
                value={limiteCredito}
                onChange={e => setLimiteCredito(e.target.value)}
                disabled={salvando}
              />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Data de vencimento (opcional)</label>
              <input
                className="cli-form-input"
                type="date"
                value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)}
                disabled={salvando}
              />
              <span className="cli-form-small">
                O sistema exibirá alertas quando o fiado vencer.
              </span>
            </div>
          </div>

          {/* Saldo atual no modo editar */}
          {isEdit && (
            <div className={`cli-saldo-info${parseFloat(cliente.saldo_devedor) > 0.01 ? ' devedor' : ' ok'}`}>
              Saldo atual: {fmt(cliente.saldo_devedor)}
            </div>
          )}

          {/* Ações */}
          <div className="cli-modal-acoes">
            {isEdit && parseFloat(cliente.saldo_devedor) <= 0.01 && (
              <button
                type="button"
                className="cli-modal-btn-excluir"
                onClick={excluir}
                disabled={salvando}
              >
                🗑
              </button>
            )}
            <button
              type="button"
              className="cli-modal-btn-cancelar"
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar (Esc)
            </button>
            <button
              type="submit"
              className="cli-modal-btn-salvar"
              disabled={salvando}
            >
              {salvando
                ? '⏳ Salvando…'
                : isEdit ? '✓ Salvar alterações' : '✓ Criar cliente'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}