// src/pages/Estabelecimento/Clientes/DividasList.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/api';
import ClienteModal from './ClienteModal';
import ModalRecebimento from './ModalRecebimento';
import '../Clientes.css';


/* ── Helpers ───────────────────────────────────────────────── */
const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarData(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return '—'; }
}

/* ── Painel de detalhes do fiado ───────────────────────────── */
function DetalhesFiado({ cliente, onFechar }) {
  const [vendas,   setVendas]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [erro,     setErro]     = useState('');

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro('');
      try {
        const resp = await apiFetch(`/api/clientes/${cliente.id}/itens-fiado`);
        if (!resp.ok) throw new Error('Erro ao buscar histórico');
        setVendas(await resp.json());
      } catch (err) { setErro(err.message); }
      finally { setLoading(false); }
    }
    carregar();
  }, [cliente.id]);

  return (
    <div className="cli-detalhes">
      <div className="cli-detalhes-header">
        <span className="cli-detalhes-titulo">📋 Fiado — {cliente.nome}</span>
        <button className="cli-detalhes-fechar" onClick={onFechar}>✕</button>
      </div>

      <div className="cli-detalhes-body">
        {loading && (
          <div className="cli-detalhes-loading">
            <div className="est-spinner" />
            Carregando histórico…
          </div>
        )}
        {erro && <div className="cli-erro">⚠️ {erro}</div>}
        {!loading && vendas.length === 0 && (
          <div className="cli-vazio">
            <span className="cli-vazio-icon">📋</span>
            <p>Sem vendas fiadas pendentes</p>
          </div>
        )}
        {vendas.map(venda => (
          <div key={venda.venda_id} className="cli-venda-card">
            <div className="cli-venda-info">
              <span>📅 {formatarData(venda.data_venda)}</span>
              <strong>{fmt(venda.valor_total)}</strong>
            </div>
            <ul className="cli-venda-itens">
              {venda.itens.map((item, i) => (
                <li key={i} className="cli-venda-item">
                  <span className="cli-item-qtd">{item.quantidade}×</span>
                  <span className="cli-item-nome">{item.produto_nome}</span>
                  <span className="cli-item-subtotal">
                    {fmt(item.quantidade * item.preco_unitario)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function DividasList({ estabelecimentoId }) {

  const [viewMode,          setViewMode]          = useState('devedores');
  const [dividas,           setDividas]           = useState([]);
  const [todosClientes,     setTodosClientes]     = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [erro,              setErro]              = useState('');
  const [termoBusca,        setTermoBusca]        = useState('');
  const [clienteDetalhes,   setClienteDetalhes]   = useState(null);
  const [clienteModal,      setClienteModal]      = useState(null); // null = fechado, {} = novo, {...} = editar
  const [modalAberto,       setModalAberto]       = useState(false);
  const [clienteReceber,    setClienteReceber]    = useState(null);
  const [modalRecebimento,  setModalRecebimento]  = useState(false);

  /* ── Carregar dados ─────────────────────────────────────── */
  async function carregarDados() {
    if (!estabelecimentoId) return;
    setLoading(true);
    setErro('');
    try {
      const [rDiv, rTodos] = await Promise.all([
        apiFetch(`/api/clientes/dividas`),
        apiFetch(`/api/clientes`),
      ]);
      if (!rDiv.ok)   throw new Error('Erro ao buscar dívidas');
      if (!rTodos.ok) throw new Error('Erro ao buscar clientes');
      const [div, todos] = await Promise.all([rDiv.json(), rTodos.json()]);
      setDividas(div);
      setTodosClientes(todos);
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, [estabelecimentoId]);

  /* ── Handlers recebimento ───────────────────────────────── */
  function abrirRecebimento(cliente) {
    setClienteReceber(cliente);
    setModalRecebimento(true);
  }

  async function confirmarRecebimento(valorPago, meioPagamento) {
    const resp = await apiFetch(`/api/clientes/liquidar`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        clienteId: clienteReceber.id,
        estabelecimentoId,
        valorPago,
        meioPagamento,
      }),
    });
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Erro ao registrar pagamento');
    await carregarDados();
  }

  /* ── Excluir cliente ─────────────────────────────────────── */
  async function excluirCliente(cliente) {
    if (parseFloat(cliente.saldo_devedor) > 0.01) {
      alert('Não é possível excluir cliente com saldo devedor pendente.');
      return;
    }
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"? Esta ação é irreversível.`)) return;
    try {
      const resp = await apiFetch(`/api/clientes/deletar/${cliente.id}`,
        { method: 'DELETE' }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao excluir');
      setTodosClientes(prev => prev.filter(c => c.id !== cliente.id));
      setDividas(prev => prev.filter(c => c.id !== cliente.id));
    } catch (err) {
      setErro(err.message);
    }
  }

  /* ── Filtro ──────────────────────────────────────────────── */
  const lista = viewMode === 'devedores' ? dividas : todosClientes;
  const listaFiltrada = lista.filter(c => {
    if (!termoBusca.trim()) return true;
    const t = termoBusca.toLowerCase();
    return (
      (c.nome || '').toLowerCase().includes(t) ||
      (c.telefone || '').toString().toLowerCase().includes(t)
    );
  });

  /* ════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando clientes…
      </div>
    );
  }

  return (
    <div className="cli-container">

      {/* Modal cliente */}
      {modalAberto && (
        <ClienteModal
          estabelecimentoId={estabelecimentoId}
          cliente={clienteModal}
          onClose={() => { setModalAberto(false); setClienteModal(null); }}
          onSalvo={carregarDados}
          onExcluido={carregarDados}
        />
      )}

      {/* Modal recebimento */}
      {modalRecebimento && clienteReceber && (
        <ModalRecebimento
          cliente={clienteReceber}
          onClose={() => { setModalRecebimento(false); setClienteReceber(null); }}
          onConfirmar={confirmarRecebimento}
        />
      )}

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="cli-header">
        <input
          className="cli-header-busca"
          type="text"
          placeholder="🔍  Buscar por nome ou telefone…"
          value={termoBusca}
          onChange={e => setTermoBusca(e.target.value)}
        />
        <div className="cli-toggle">
          <button
            className={`cli-toggle-btn${viewMode === 'devedores' ? ' ativo' : ''}`}
            onClick={() => { setViewMode('devedores'); setTermoBusca(''); }}
          >
            💸 Devedores ({dividas.length})
          </button>
          <button
            className={`cli-toggle-btn${viewMode === 'todos' ? ' ativo' : ''}`}
            onClick={() => { setViewMode('todos'); setTermoBusca(''); }}
          >
            👥 Todos ({todosClientes.length})
          </button>
        </div>
        <div className="cli-header-btns">
          <button className="cli-btn" onClick={() => window.print()}>🖨️</button>
          <button
            className="cli-btn primary"
            onClick={() => { setClienteModal(null); setModalAberto(true); }}
          >
            + Cliente
          </button>
        </div>
      </div>

      {erro && <div className="cli-erro">⚠️ {erro}</div>}

      {/* ── CORPO ───────────────────────────────────────── */}
      <div className="cli-body">

        {/* Grid */}
        <div className="cli-grid-wrapper">
          <div className="cli-grid">
            {listaFiltrada.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">👥</span>
                <p>
                  {viewMode === 'devedores'
                    ? 'Nenhum devedor encontrado'
                    : 'Nenhum cliente encontrado'}
                </p>
                <small>
                  {termoBusca
                    ? `Sem resultados para "${termoBusca}"`
                    : viewMode === 'devedores'
                      ? 'Sem contas a receber pendentes'
                      : 'Cadastre seu primeiro cliente'}
                </small>
              </div>
            ) : (
              listaFiltrada.map(cliente => (
                <ClienteCard
                  key={cliente.id}
                  cliente={cliente}
                  onEditar={() => { setClienteModal(cliente); setModalAberto(true); }}
                  onDetalhes={() => setClienteDetalhes(
                    clienteDetalhes?.id === cliente.id ? null : cliente
                  )}
                  onReceber={() => abrirRecebimento(cliente)}
                  onExcluir={() => excluirCliente(cliente)}
                />
              ))
            )}
          </div>
        </div>

        {/* Painel detalhes */}
        {clienteDetalhes && (
          <DetalhesFiado
            cliente={clienteDetalhes}
            onFechar={() => setClienteDetalhes(null)}
          />
        )}

      </div>
    </div>
  );
}

/* ── Card de cliente ─────────────────────────────────────────*/
function ClienteCard({ cliente, onEditar, onDetalhes, onReceber, onExcluir }) {
  const temDivida       = parseFloat(cliente.saldo_devedor) > 0.01;
  const limiteExcedido  = temDivida
    && parseFloat(cliente.limite_credito || 0) > 0
    && parseFloat(cliente.saldo_devedor) > parseFloat(cliente.limite_credito);

  const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function formatarData(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return '—'; }
  }

  return (
    <div className={`cli-card${temDivida ? ' devedor' : ''}${limiteExcedido ? ' limite-excedido' : ''}`}>

      <div className="cli-card-header" onClick={temDivida ? onDetalhes : undefined}>
        <span className="cli-card-nome">{cliente.nome}</span>
        <span className="cli-card-tel">📞 {cliente.telefone || 'Sem telefone'}</span>
      </div>

      <div className="cli-card-corpo" onClick={temDivida ? onDetalhes : undefined}>
        {limiteExcedido && (
          <span className="cli-badge-limite">⚠️ Limite excedido</span>
        )}
        <span className="cli-divida-label">Dívida atual</span>
        <span className="cli-divida-valor">{fmt(cliente.saldo_devedor)}</span>

        <div className="cli-card-info-row">
          <div className="cli-info-item">
            <span className="cli-info-label">Vencimento</span>
            <span className="cli-info-valor">
              {temDivida ? formatarData(cliente.data_vencimento) : '—'}
            </span>
          </div>
          <div className="cli-info-item">
            <span className="cli-info-label">Limite</span>
            <span className="cli-info-valor">{fmt(cliente.limite_credito)}</span>
          </div>
        </div>
      </div>

      <div className="cli-card-acoes">
        <button className="cli-btn-acao config" onClick={onEditar}>⚙️ Config</button>

        {temDivida
          ? <button className="cli-btn-acao detalhes" onClick={onDetalhes}>📋 Detalhes</button>
          : <button className="cli-btn-acao excluir" onClick={onExcluir}>🗑 Excluir</button>
        }

        <button
          className="cli-btn-acao receber"
          onClick={onReceber}
          disabled={!temDivida}
        >
          💰 Receber
        </button>
      </div>

    </div>
  );
}