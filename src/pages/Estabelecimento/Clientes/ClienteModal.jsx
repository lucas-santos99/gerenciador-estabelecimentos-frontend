// src/pages/Estabelecimento/Clientes/ClienteModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import '../Clientes.css';


const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Máscara "tipo calculadora": dígitos entram da direita pra esquerda,
// vírgula fixa em 2 casas — digita "5000" e já vira "50,00" sozinho.
function digitarValorMascarado(valorBruto) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarDataInput(s) {
  if (!s) return '';
  try { return s.includes('T') ? s.split('T')[0] : s; }
  catch { return ''; }
}

// Detecta CPF (até 11 dígitos) ou CNPJ (12-14 dígitos) pela quantidade
// digitada — mesmo padrão usado no PDV, campo único que troca de
// máscara sozinho conforme a pessoa digita.
function formatarCpfCnpj(valor) {
  const d = (valor || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  // CNPJ
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

/* ════════════════════════════════════════════════════════════ */
export default function ClienteModal({
  estabelecimentoId,
  cliente,
  onClose,
  onSalvo,
  onExcluido,
  fiadoAtivo = true,
}) {
  const isEdit = !!cliente;

  const [nome,           setNome]           = useState(cliente?.nome || '');
  const [telefone,       setTelefone]       = useState(cliente?.telefone || '');
  const [cpf,            setCpf]            = useState(formatarCpfCnpj(cliente?.cpf || ''));
  const [permiteFiado,   setPermiteFiado]   = useState(cliente?.permite_fiado !== false);
  const [semLimite,      setSemLimite]      = useState(
    !cliente || parseFloat(cliente?.limite_credito || 0) === 0
  );
  const [limiteCredito,  setLimiteCredito]  = useState(
    parseFloat(cliente?.limite_credito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
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
      ? `/api/clientes/atualizar/${encodeURIComponent(cliente.id)}`
      : `/api/clientes/criar`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimentoId,
          nome:          nome.trim(),
          telefone:      telefone.trim() || null,
          cpf:           cpf.replace(/\D/g, '') || null,
          permiteFiado,
          limiteCredito: semLimite ? '0' : limiteCredito.replace(/\./g, '').replace(',', '.'),
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
      const resp = await apiFetch(`/api/clientes/deletar/${encodeURIComponent(cliente.id)}`,
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
    <div className="cli-modal-overlay">
      <div className="cli-modal">

        <div className="cli-modal-titulo">
          {isEdit ? `✏️ Editar — ${cliente.nome}` : '➕ Novo cliente'}
        </div>

        {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="cli-modal-form">

          {/* Dados pessoais */}
          <div>
            {isEdit && cliente.codigo_cliente && (
              <div className="cli-form-small" style={{ marginBottom: 10 }}>
                🔖 Código do cliente: <strong>#{cliente.codigo_cliente}</strong> — útil pra localizar rápido no PDV
              </div>
            )}
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
            <div className="cli-form-group">
              <label className="cli-form-label">CPF ou CNPJ (opcional)</label>
              <input
                className="cli-form-input"
                type="text"
                placeholder="CPF ou CNPJ"
                value={cpf}
                onChange={e => setCpf(formatarCpfCnpj(e.target.value))}
                disabled={salvando}
              />
              <span className="cli-form-small">
                Ajuda a localizar o cliente rápido no PDV, mesmo quem não usa fiado.
              </span>
            </div>
          </div>

          {/* Config fiado — só aparece se o módulo estiver ativo pro estabelecimento */}
          {fiadoAtivo && (
          <div className="cli-modal-section">
            <div className="cli-modal-section-titulo">💳 Configurações do Fiado</div>

            <div className="cli-form-group">
              <label className="cli-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={permiteFiado} onChange={e => setPermiteFiado(e.target.checked)} disabled={salvando} />
                Esse cliente pode comprar fiado
              </label>
              <span className="cli-form-small">
                {permiteFiado
                  ? 'Vai aparecer na busca de fiado do PDV, com limite de crédito e vencimento configuráveis abaixo.'
                  : 'Cliente cadastrado só pra identificação e histórico — não vai aparecer na busca de fiado do PDV.'}
              </span>
            </div>

            {permiteFiado && (
            <>
            <div className="cli-form-group">
              <label className="cli-form-label">Limite de crédito</label>
              <div className="cli-limite-toggle">
                <button
                  type="button"
                  className={`cli-limite-btn${semLimite ? ' ativo' : ''}`}
                  onClick={() => setSemLimite(true)}
                  disabled={salvando}
                >
                  ∞ Sem limite
                </button>
                <button
                  type="button"
                  className={`cli-limite-btn${!semLimite ? ' ativo' : ''}`}
                  onClick={() => setSemLimite(false)}
                  disabled={salvando}
                >
                  R$ Definir limite
                </button>
              </div>
              {!semLimite && (
                <input
                  className="cli-form-input"
                  type="text"
                  placeholder="0,00"
                  value={limiteCredito}
                  onChange={e => setLimiteCredito(digitarValorMascarado(e.target.value))}
                  disabled={salvando}
                  style={{ marginTop: 8 }}
                />
              )}
              {semLimite && (
                <span className="cli-form-small">Cliente pode comprar fiado sem restrição de valor.</span>
              )}
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
            </>
            )}
          </div>
          )}

          {/* Saldo atual no modo editar — só faz sentido com fiado ativo */}
          {isEdit && fiadoAtivo && (
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