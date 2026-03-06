// ClienteModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import './ClienteModal.css';

// BACKEND AUTOMÁTICO
const BACKEND_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : 'https://estabelecimentos-api.onrender.com';

// Helper formatação moeda
const formatCurrency = (value) => {
  const number = parseFloat(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatarDataInput = (dataString) => {
  if (!dataString) return '';
  try {
    return dataString.includes('T') ? dataString.split('T')[0] : dataString;
  } catch {
    return '';
  }
};

const ClienteModal = ({ estabelecimentoId, cliente, onClose, onSave, onDelete }) => {
  const isEdit = !!cliente;

  const [nome, setNome] = useState(cliente?.nome || '');
  const [telefone, setTelefone] = useState(cliente?.telefone || '');
  const [limiteCredito, setLimiteCredito] = useState(
    parseFloat(cliente?.limite_credito || 0).toLocaleString('pt-BR', {
      useGrouping: false,
      minimumFractionDigits: 2,
    })
  );
  const [dataVencimento, setDataVencimento] = useState(formatarDataInput(cliente?.data_vencimento));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const modalRef = useRef(null);

  useEffect(() => {
    document.getElementById('nome-cliente')?.focus();
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!nome.trim()) {
      setError('O nome do cliente é obrigatório.');
      setLoading(false);
      return;
    }

    const url = isEdit
      ? `${BACKEND_BASE_URL}/api/clientes/atualizar/${encodeURIComponent(cliente.id)}`
      : `${BACKEND_BASE_URL}/api/clientes/criar`;

    const method = isEdit ? 'PUT' : 'POST';

    const body = {
      estabelecimentoId,
      nome: nome.trim(),
      telefone: telefone.trim() || null,
      limiteCredito: limiteCredito.replace(/\./g, '').replace(',', '.'),
      dataVencimento: dataVencimento || null,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao salvar cliente.');

      onSave(result);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || cliente.saldo_devedor > 0.01) return;
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"?`)) return;

    setLoading(true);
    setError(null);

    try {
      const url = `${BACKEND_BASE_URL}/api/clientes/deletar/${encodeURIComponent(cliente.id)}?estabelecimentoId=${encodeURIComponent(estabelecimentoId)}`;
      const response = await fetch(url, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao excluir cliente.');

      onDelete(cliente.id);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cliente-modal-overlay">
      <div className="cliente-modal-content" ref={modalRef}>
        <h3>{isEdit ? `Editar Cliente: ${cliente.nome}` : 'Adicionar Novo Cliente'}</h3>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label htmlFor="nome-cliente">Nome Completo</label>
            <input id="nome-cliente" type="text" value={nome} onChange={(e) => setNome(e.target.value)} required disabled={loading} />
          </div>

          <div className="form-group">
            <label htmlFor="telefone-cliente">Telefone</label>
            <input id="telefone-cliente" type="text" value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={loading} />
          </div>

          <div className="cliente-config-fiado">
            <h4>Configurações do Fiado</h4>

            <div className="form-group">
              <label htmlFor="limite-credito">Limite de Crédito (R$)</label>
              <input id="limite-credito" type="text" value={limiteCredito} onChange={(e) => setLimiteCredito(e.target.value)} required disabled={loading} />
            </div>

            <div className="form-group">
              <label htmlFor="data-vencimento">Vencimento Padrão (Opcional)</label>
              <input id="data-vencimento" type="date" value={dataVencimento} onChange={(e) => setDataVencimento(e.target.value)} disabled={loading} />
              <small>Se definido, o sistema pode emitir alertas de vencimento.</small>
            </div>
          </div>

          {error && <p className="cliente-modal-error">{error}</p>}

          <div className="cliente-modal-actions">
            {isEdit && cliente.saldo_devedor <= 0.01 && (
              <button type="button" onClick={handleDelete} className="btn-delete" disabled={loading}>
                Excluir Cliente
              </button>
            )}

            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Criar Cliente'}
            </button>

            <button type="button" onClick={onClose} className="btn-cancel" disabled={loading}>
              Cancelar
            </button>
          </div>

          {isEdit && (
            <p className={`saldo-info ${cliente.saldo_devedor > 0.01 ? 'devedor' : 'ok'}`}>Saldo Atual: {formatCurrency(cliente.saldo_devedor)}</p>
          )}
        </form>
      </div>
    </div>
  );
};

export default ClienteModal;
