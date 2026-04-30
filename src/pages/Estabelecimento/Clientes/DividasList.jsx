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
  const [vendas,     setVendas]     = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [erro,       setErro]       = useState('');
  const [abaDetalhe, setAbaDetalhe] = useState('compras'); // 'compras' | 'pagamentos'

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      setErro('');
      try {
        const [rVendas, rPagamentos] = await Promise.all([
          apiFetch(`/api/clientes/${cliente.id}/itens-fiado`),
          apiFetch(`/api/clientes/${cliente.id}/pagamentos`),
        ]);
        if (!rVendas.ok) throw new Error('Erro ao buscar histórico');
        setVendas(await rVendas.json());
        if (rPagamentos.ok) setPagamentos(await rPagamentos.json());
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

      {/* Abas internas */}
      <div className="cli-detalhes-tabs">
        <button
          className={`cli-detalhes-tab${abaDetalhe === 'compras' ? ' ativo' : ''}`}
          onClick={() => setAbaDetalhe('compras')}
        >
          🛒 Compras
        </button>
        <button
          className={`cli-detalhes-tab${abaDetalhe === 'pagamentos' ? ' ativo' : ''}`}
          onClick={() => setAbaDetalhe('pagamentos')}
        >
          💰 Pagamentos
        </button>
      </div>

      <div className="cli-detalhes-body">
        {loading && (
          <div className="cli-detalhes-loading">
            <div className="est-spinner" />
            Carregando histórico…
          </div>
        )}
        {erro && <div className="cli-erro">⚠️ {erro}</div>}

        {/* Aba compras */}
        {!loading && abaDetalhe === 'compras' && (
          <>
            {vendas.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">📋</span>
                <p>Sem vendas fiadas pendentes</p>
              </div>
            ) : (
              vendas.map(venda => (
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
              ))
            )}
          </>
        )}

        {/* Aba pagamentos */}
        {!loading && abaDetalhe === 'pagamentos' && (
          <>
            {pagamentos.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">💰</span>
                <p>Nenhum pagamento registrado</p>
              </div>
            ) : (
              pagamentos.map((p, i) => (
                <div key={i} className="cli-pagamento-card">
                  <div className="cli-pagamento-info">
                    <span className="cli-pagamento-data">📅 {formatarData(p.data_transacao)}</span>
                    <span className={`cli-pagamento-meio ${p.meio_pagamento?.toLowerCase()}`}>{p.meio_pagamento}</span>
                  </div>
                  <span className="cli-pagamento-valor">- {fmt(p.valor)}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function DividasList({ estabelecimentoId, nomeEstabelecimento }) {

  const [viewMode,          setViewMode]          = useState('devedores');
  const [dividas,           setDividas]           = useState([]);
  const [todosClientes,     setTodosClientes]     = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [erro,              setErro]              = useState('');
  const [termoBusca,        setTermoBusca]        = useState('');
  const [ordenacao,         setOrdenacao]         = useState('vencimento'); // 'vencimento' | 'valor' | 'nome'
  const [clienteDetalhes,   setClienteDetalhes]   = useState(null);
  const [clienteModal,      setClienteModal]      = useState(null);
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

  /* ── WhatsApp cobrança ──────────────────────────────────── */
  function enviarWhatsApp(cliente) {
    const tel = (cliente.telefone || '').replace(/\D/g, '');
    if (!tel) {
      alert('Este cliente não tem telefone cadastrado.');
      return;
    }
    const valor = parseFloat(cliente.saldo_devedor || 0)
      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const estabelecimento = nomeEstabelecimento || 'nosso estabelecimento';
    const msg = `Olá, ${cliente.nome}! Passando para informar que você possui um saldo devedor de *${valor}* em *${estabelecimento}*. Por favor, entre em contato para regularizar. Obrigado! 😊`;
    const url = `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  /* ── Filtro + Ordenação ──────────────────────────────────── */
  const lista = viewMode === 'devedores' ? dividas : todosClientes;

  const listaFiltrada = lista
    .filter(c => {
      if (!termoBusca.trim()) return true;
      const t = termoBusca.toLowerCase();
      return (
        (c.nome || '').toLowerCase().includes(t) ||
        (c.telefone || '').toString().toLowerCase().includes(t)
      );
    })
    .sort((a, b) => {
      if (ordenacao === 'vencimento') {
        // Sem vencimento vai pro final
        if (!a.data_vencimento && !b.data_vencimento) return 0;
        if (!a.data_vencimento) return 1;
        if (!b.data_vencimento) return -1;
        return new Date(a.data_vencimento) - new Date(b.data_vencimento);
      }
      if (ordenacao === 'valor') {
        return parseFloat(b.saldo_devedor || 0) - parseFloat(a.saldo_devedor || 0);
      }
      if (ordenacao === 'nome') {
        return (a.nome || '').localeCompare(b.nome || '');
      }
      return 0;
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

      {/* ── ORDENAÇÃO ───────────────────────────────────── */}
      {viewMode === 'devedores' && dividas.length > 0 && (
        <div className="cli-ordenacao">
          <span className="cli-ordenacao-label">Ordenar:</span>
          {[
            { key: 'vencimento', label: '📅 Vencimento' },
            { key: 'valor',      label: '💰 Maior dívida' },
            { key: 'nome',       label: '🔤 Nome' },
          ].map(o => (
            <button
              key={o.key}
              className={`cli-ordenacao-btn${ordenacao === o.key ? ' ativo' : ''}`}
              onClick={() => setOrdenacao(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

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
                  onWhatsApp={() => enviarWhatsApp(cliente)}
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
function ClienteCard({ cliente, onEditar, onDetalhes, onReceber, onExcluir, onWhatsApp }) {
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

  // Verifica se vencimento está próximo ou vencido
  function statusVencimento(data) {
    if (!data) return null;
    const hoje = new Date();
    const venc = new Date(data);
    const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'vencido';
    if (diff <= 3) return 'proximo';
    return 'ok';
  }

  const svStatus = statusVencimento(cliente.data_vencimento);

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
            <span className={`cli-info-valor${svStatus === 'vencido' ? ' vencido' : svStatus === 'proximo' ? ' proximo' : ''}`}>
              {temDivida ? formatarData(cliente.data_vencimento) : '—'}
              {svStatus === 'vencido' && ' 🔴'}
              {svStatus === 'proximo' && ' ⚠️'}
            </span>
          </div>
          <div className="cli-info-item">
            <span className="cli-info-label">Limite</span>
            <span className="cli-info-valor">
              {parseFloat(cliente.limite_credito || 0) === 0 ? '∞ Sem limite' : fmt(cliente.limite_credito)}
            </span>
          </div>
        </div>
      </div>

      <div className="cli-card-acoes">
        <button className="cli-btn-acao config" onClick={onEditar}>⚙️</button>

        {temDivida && cliente.telefone && (
          <button className="cli-btn-acao whatsapp" onClick={onWhatsApp} title="Enviar cobrança via WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{flexShrink:0}}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.428a.75.75 0 0 0 .916.916l5.573-1.471A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.956 0-3.792-.5-5.388-1.373l-.386-.215-3.996 1.055 1.056-3.996-.215-.386A9.955 9.955 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Cobrar
          </button>
        )}

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