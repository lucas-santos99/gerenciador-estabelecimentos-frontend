// src/pages/Estabelecimento/PDV/PDV.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import './PDV.css';

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro',          icone: '💵' },
  { key: 'Pix',      label: 'Pix',               icone: '📱' },
  { key: 'Debito',   label: 'Cartão de Débito',  icone: '💳' },
  { key: 'Credito',  label: 'Cartão de Crédito', icone: '💳' },
  { key: 'Fiado',    label: 'Fiado (Na conta)',   icone: '📋' },
];

/* ════════════════════════════════════════════════════════════
   MODAL DE PAGAMENTO
   ════════════════════════════════════════════════════════════ */
function PagamentoModal({ total, onFinalizar, onCancelar, loading }) {

  const [selectedIndex,      setSelectedIndex]      = useState(0);
  const [meioPagamento,      setMeioPagamento]      = useState('Dinheiro');
  const [metodoConfirmado,   setMetodoConfirmado]   = useState(false);
  const [valorRecebido,      setValorRecebido]      = useState('');
  const [troco,              setTroco]              = useState(0);
  const [termoBuscaCliente,  setTermoBuscaCliente]  = useState('');
  const [resultadosCliente,  setResultadosCliente]  = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [loadingCliente,     setLoadingCliente]     = useState(false);
  const [clienteIndex,       setClienteIndex]       = useState(-1);
  const [erro,               setErro]               = useState('');

  const overlayRef       = useRef(null);
  const inputDinheiroRef = useRef(null);
  const inputClienteRef  = useRef(null);
  const btnConfirmarRef  = useRef(null);
  const listaClienteRef  = useRef(null);
  const listaMeiosRef    = useRef(null);

  useEffect(() => {
    if (!metodoConfirmado) overlayRef.current?.focus();
  }, [metodoConfirmado]);

  useEffect(() => {
    if (!metodoConfirmado) return;
    if (meioPagamento === 'Dinheiro') {
      const val = total.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 });
      setValorRecebido(val);
      setTimeout(() => { inputDinheiroRef.current?.focus(); inputDinheiroRef.current?.select(); }, 0);
    } else if (meioPagamento === 'Fiado' && !clienteSelecionado) {
      setTimeout(() => inputClienteRef.current?.focus(), 0);
    } else {
      setTimeout(() => btnConfirmarRef.current?.focus(), 0);
    }
  }, [metodoConfirmado, meioPagamento]);

  useEffect(() => {
    if (meioPagamento !== 'Dinheiro') return;
    const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
    setTroco(recebido >= total ? recebido - total : 0);
  }, [valorRecebido, total, meioPagamento]);

  useEffect(() => {
    if (clienteIndex < 0 || !listaClienteRef.current) return;
    listaClienteRef.current.children[clienteIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [clienteIndex]);

  useEffect(() => {
    if (!listaMeiosRef.current) return;
    listaMeiosRef.current.children[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  async function buscarCliente(termo) {
    setTermoBuscaCliente(termo);
    setClienteIndex(-1);
    setErro('');
    if (termo.length < 2) { setResultadosCliente([]); return; }
    setLoadingCliente(true);
    try {
      const resp = await apiFetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      setResultadosCliente(await resp.json());
    } catch { setErro('Erro ao buscar clientes.'); }
    finally { setLoadingCliente(false); }
  }

  function selecionarCliente(cli) {
    setClienteSelecionado(cli);
    setResultadosCliente([]);
    setTermoBuscaCliente('');
    setTimeout(() => btnConfirmarRef.current?.focus(), 0);
  }

  function confirmarMetodo(key, idx) {
    setMeioPagamento(key);
    setSelectedIndex(idx);
    setMetodoConfirmado(true);
    setErro('');
    if (key !== 'Fiado') setClienteSelecionado(null);
  }

  function confirmarFinal() {
    setErro('');
    if (meioPagamento === 'Fiado') {
      if (!clienteSelecionado?.id) { setErro('Selecione um cliente para o fiado.'); return; }
      onFinalizar('Fiado', clienteSelecionado.id);
    } else if (meioPagamento === 'Dinheiro') {
      const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
      if (recebido < parseFloat(total.toFixed(2))) { setErro('Valor recebido insuficiente.'); return; }
      onFinalizar('Dinheiro', null);
    } else {
      onFinalizar(meioPagamento, null);
    }
  }

  function handleOverlayKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return; }
    if (e.target.tagName === 'INPUT') return;
    if (!metodoConfirmado) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p + 1) % MEIOS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p - 1 + MEIOS.length) % MEIOS.length); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmarMetodo(MEIOS[selectedIndex].key, selectedIndex); }
    }
  }

  function handleDinheiroKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmarFinal(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
  }

  function handleClienteKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setClienteIndex(p => Math.min(p + 1, resultadosCliente.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setClienteIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (clienteIndex > -1 && resultadosCliente[clienteIndex]) selecionarCliente(resultadosCliente[clienteIndex]);
    }
  }

  return (
    <div className="pdv-modal-overlay" ref={overlayRef} tabIndex={-1} onKeyDown={handleOverlayKey}>
      <div className="pdv-modal" onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-titulo">💳 Finalizar Venda</div>
        <div className="pdv-pagamento-total">
          <span className="pdv-pagamento-total-label">Total a pagar</span>
          <span className="pdv-pagamento-total-valor">{fmt(total)}</span>
        </div>
        {!metodoConfirmado && (
          <>
            <span className="pdv-pagamento-label">Forma de pagamento  ↑ ↓ Enter</span>
            <ul className="pdv-meios-lista" ref={listaMeiosRef}>
              {MEIOS.map((m, i) => (
                <li key={m.key} className={`pdv-meio-item${selectedIndex === i ? ' ativo' : ''}`} onClick={() => confirmarMetodo(m.key, i)}>
                  <span className="pdv-meio-icone">{m.icone}</span>
                  <span style={{ flex: 1 }}>{m.label}</span>
                  {selectedIndex === i && <span className="pdv-meio-enter">↩ Enter</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {metodoConfirmado && (
          <div className="pdv-pagamento-conteudo">
            {meioPagamento === 'Dinheiro' && (
              <>
                <span className="pdv-troco-input-label">Valor recebido (R$)</span>
                <input ref={inputDinheiroRef} className="pdv-troco-input" type="text" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} onKeyDown={handleDinheiroKey} />
                <div className="pdv-troco-display">
                  <span>Troco</span>
                  <strong>{fmt(troco)}</strong>
                </div>
              </>
            )}
            {['Pix', 'Debito', 'Credito'].includes(meioPagamento) && (
              <div className="pdv-pagamento-digital">
                <span className="pdv-pagamento-digital-icone">{MEIOS.find(m => m.key === meioPagamento)?.icone}</span>
                <span className="pdv-pagamento-digital-nome">{MEIOS.find(m => m.key === meioPagamento)?.label}</span>
                <span className="pdv-pagamento-digital-hint">Pressione Enter para confirmar</span>
              </div>
            )}
            {meioPagamento === 'Fiado' && (
              <>
                {clienteSelecionado ? (
                  <div className="pdv-cliente-selecionado">
                    <span className="pdv-cliente-selecionado-nome">📋 {clienteSelecionado.nome}</span>
                    <div className="pdv-cliente-selecionado-info">
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Saldo atual</span>
                        <span className="pdv-cliente-info-valor">{fmt(clienteSelecionado.saldo_devedor)}</span>
                      </div>
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Novo saldo</span>
                        <span className="pdv-cliente-info-valor novo-saldo">{fmt((parseFloat(clienteSelecionado.saldo_devedor) || 0) + total)}</span>
                      </div>
                    </div>
                    <button className="pdv-btn-trocar-cliente" onClick={() => setClienteSelecionado(null)}>↩ Trocar cliente</button>
                  </div>
                ) : (
                  <>
                    <input ref={inputClienteRef} className="pdv-cliente-busca-input" type="text" placeholder="Buscar cliente por nome ou telefone…" value={termoBuscaCliente} onChange={e => buscarCliente(e.target.value)} onKeyDown={handleClienteKey} />
                    {loadingCliente && <div style={{ fontSize: '0.78rem', color: 'var(--est-text-muted)', marginBottom: 6 }}>Buscando…</div>}
                    {resultadosCliente.length > 0 && (
                      <ul className="pdv-cliente-lista" ref={listaClienteRef}>
                        {resultadosCliente.map((cli, i) => (
                          <li key={cli.id} className={`pdv-cliente-item${clienteIndex === i ? ' ativo' : ''}`} onClick={() => selecionarCliente(cli)} onMouseEnter={() => setClienteIndex(i)}>
                            {cli.nome}
                            <span className="pdv-cliente-item-tel">{cli.telefone || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {erro && <div className="pdv-pagamento-erro">⚠️ {erro}</div>}
        <div className="pdv-pagamento-acoes">
          <button className="pdv-btn-cancelar" onClick={onCancelar} disabled={loading}>Cancelar (Esc)</button>
          <button ref={btnConfirmarRef} className="pdv-btn-confirmar" onClick={confirmarFinal} disabled={loading || !metodoConfirmado}>
            {loading ? '⏳ Processando…' : '✓ Confirmar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL — PDV
   ════════════════════════════════════════════════════════════ */
export default function PDV({ estabelecimentoId }) {
  const [termoBusca,      setTermoBusca]      = useState('');
  const [resultados,      setResultados]      = useState([]);
  const [carrinho,        setCarrinho]        = useState([]);
  const [total,           setTotal]           = useState(0);
  const [loadingBusca,    setLoadingBusca]    = useState(false);
  const [loadingVenda,    setLoadingVenda]    = useState(false);
  const [vendaStatus,     setVendaStatus]     = useState(null);
  const [buscaIndex,      setBuscaIndex]      = useState(-1);
  const [itemQuantificar, setItemQuantificar] = useState(null);
  const [inputQtd,        setInputQtd]        = useState('1');
  const [editIndex,       setEditIndex]       = useState(null);
  const [showPagamento,   setShowPagamento]   = useState(false);

  const inputBuscaRef   = useRef(null);
  const inputQtdRef     = useRef(null);
  const btnFinalizarRef = useRef(null);
  const resultadosRef   = useRef(null);

  useEffect(() => {
    if (!showPagamento && !itemQuantificar && editIndex === null) inputBuscaRef.current?.focus();
  }, [showPagamento, itemQuantificar, editIndex]);

  useEffect(() => {
    if (itemQuantificar) {
      setTimeout(() => {
        inputQtdRef.current?.focus();
        inputQtdRef.current?.select();
      }, 50);
    }
  }, [itemQuantificar]);

  useEffect(() => {
    setTotal(carrinho.reduce((acc, item) => acc + parseFloat(item.preco_venda) * item.quantidade, 0));
  }, [carrinho]);

  useEffect(() => {
    if (buscaIndex < 0 || !resultadosRef.current) return;
    resultadosRef.current.children[buscaIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [buscaIndex]);

  async function buscarProdutos(termo) {
    setTermoBusca(termo);
    setBuscaIndex(-1);
    if (!estabelecimentoId || termo.length < 2) { setResultados([]); return; }
    setLoadingBusca(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setResultados(data);
      if (data.length > 0) setBuscaIndex(0);
    } catch { setResultados([]); }
    finally { setLoadingBusca(false); }
  }

  function selecionarProduto(produto) {
    const estoque = parseFloat(produto.estoque_atual);
    if (estoque <= 0) { mostrarStatus('erro', `"${produto.nome}" sem estoque!`); limparBusca(); return; }
    const qtdNoCarrinho = carrinho.filter(i => i.id === produto.id).reduce((acc, i) => acc + i.quantidade, 0);
    if (produto.unidade_medida !== 'kg' && qtdNoCarrinho + 1 > estoque) {
      mostrarStatus('erro', `Estoque máximo de "${produto.nome}" (${estoque} un.) atingido.`);
      limparBusca(); return;
    }
    setInputQtd(produto.unidade_medida === 'kg' ? '1.000' : '1');
    setItemQuantificar(produto);
    setEditIndex(null);
    limparBusca();
  }

  function limparBusca() {
    setTermoBusca(''); setResultados([]); setBuscaIndex(-1);
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  function confirmarQuantidade(e) {
    e?.preventDefault();
    const produto = itemQuantificar;
    const qtd     = parseFloat(inputQtd) || 0;
    if (qtd <= 0) { fecharModalQtd(); return; }
    const estoque = parseFloat(produto.estoque_atual);
    if (editIndex !== null) {
      const outrasQtds = carrinho.filter((item, idx) => item.id === produto.id && idx !== editIndex).reduce((acc, i) => acc + i.quantidade, 0);
      if (outrasQtds + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque} ${produto.unidade_medida}`); return; }
      const novo = [...carrinho]; novo[editIndex] = { ...produto, quantidade: qtd }; setCarrinho(novo);
    } else {
      const qtdJa = carrinho.filter(i => i.id === produto.id).reduce((acc, i) => acc + i.quantidade, 0);
      if (qtdJa + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque} ${produto.unidade_medida}`); return; }
      setCarrinho(prev => [...prev, { ...produto, quantidade: qtd }]);
    }
    fecharModalQtd();
  }

  function fecharModalQtd() {
    setItemQuantificar(null); setEditIndex(null); setInputQtd('1');
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  function editarItem(item, idx) {
    setInputQtd(item.unidade_medida === 'kg' ? parseFloat(item.quantidade).toFixed(3) : String(parseFloat(item.quantidade)));
    setItemQuantificar(item); setEditIndex(idx);
  }

  function removerItem(idx) { setCarrinho(prev => prev.filter((_, i) => i !== idx)); }

  async function finalizarVenda(meioPagamento, clienteId) {
    setLoadingVenda(true); setVendaStatus(null);
    try {
      const resp = await apiFetch(`/api/vendas/finalizar`, {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId, valor_total: total, meio_pagamento: meioPagamento,
          carrinho: carrinho.map(i => ({ produto_id: i.id, quantidade: parseFloat(i.quantidade), preco_unitario: parseFloat(i.preco_venda) })),
          clienteId,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error?.includes('check constraint') ? 'Falha de estoque. Verifique as quantidades.' : result.error || 'Erro no servidor.');
      mostrarStatus('sucesso', `✓ Venda de ${fmt(total)} registrada!`);
      setCarrinho([]); setShowPagamento(false);
    } catch (err) {
      mostrarStatus('erro', `Falha: ${err.message}`); setShowPagamento(false);
    } finally { setLoadingVenda(false); }
  }

  function mostrarStatus(tipo, msg) { setVendaStatus({ tipo, msg }); setTimeout(() => setVendaStatus(null), 4000); }

  function handleSearchKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setBuscaIndex(p => Math.min(p + 1, resultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setBuscaIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Escape') { setTermoBusca(''); setResultados([]); setBuscaIndex(-1); }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (buscaIndex > -1 && resultados[buscaIndex]) selecionarProduto(resultados[buscaIndex]);
    else if (!termoBusca.trim() && carrinho.length > 0) btnFinalizarRef.current?.focus();
  }

  function estoqueClass(p) {
    const e = parseFloat(p.estoque_atual), m = parseFloat(p.estoque_minimo);
    if (e <= 0) return 'critico'; if (e <= m) return 'baixo'; return '';
  }

  function estoqueLabel(p) {
    const e = parseFloat(p.estoque_atual);
    return p.unidade_medida === 'kg' ? `${e.toFixed(3)} kg` : `${Math.trunc(e)} un`;
  }

  return (
    <div className="pdv-container">
      {itemQuantificar && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <div className="pdv-modal-qtd-titulo">{editIndex !== null ? '✏️ Editar item' : '➕ Adicionar item'}</div>
            <div className="pdv-modal-qtd-produto">{itemQuantificar.nome}{' — '}<strong>{fmt(itemQuantificar.preco_venda)}</strong>{' / '}{itemQuantificar.unidade_medida}</div>
            <form onSubmit={confirmarQuantidade}>
              <label className="pdv-modal-qtd-label">{itemQuantificar.unidade_medida === 'kg' ? 'Peso (kg)' : 'Quantidade (un)'}</label>
              <input ref={inputQtdRef} className="pdv-modal-qtd-input" type="number" step={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'} min={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'} value={inputQtd} onChange={e => setInputQtd(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fecharModalQtd(); } }} />
              <div className="pdv-modal-acoes">
                <button type="button" className="pdv-modal-btn-cancelar" onClick={fecharModalQtd}>Cancelar (Esc)</button>
                <button type="submit" className="pdv-modal-btn-confirmar">{editIndex !== null ? '✓ Atualizar (Enter)' : '✓ Adicionar (Enter)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPagamento && <PagamentoModal total={total} onCancelar={() => setShowPagamento(false)} onFinalizar={finalizarVenda} loading={loadingVenda} />}
      <div className="pdv-busca">
        <form onSubmit={handleSearchSubmit}>
          <input ref={inputBuscaRef} className="pdv-busca-input" type="text" placeholder="🔍  Nome ou código de barras… (↑ ↓ Enter)" value={termoBusca} onChange={e => buscarProdutos(e.target.value)} onKeyDown={handleSearchKeyDown} disabled={loadingVenda} autoComplete="off" />
        </form>
        <ul className="pdv-resultados" ref={resultadosRef}>
          {loadingBusca && <li className="pdv-resultados-status"><span>⏳</span>Buscando…</li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length > 1 && <li className="pdv-resultados-status"><span>🔍</span>Nenhum produto encontrado para<br /><strong>"{termoBusca}"</strong></li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length <= 1 && <li className="pdv-resultados-status"><span>🛒</span>Digite o nome ou código do produto</li>}
          {resultados.map((p, i) => (
            <li key={p.id} className={`pdv-produto-card${buscaIndex === i ? ' selecionado' : ''}`} onClick={() => selecionarProduto(p)} onMouseEnter={() => setBuscaIndex(i)}>
              <span className="pdv-card-nome">{p.nome}</span>
              <span className="pdv-card-preco">{fmt(p.preco_venda)}</span>
              <span className={`pdv-card-estoque ${estoqueClass(p)}`}>{estoqueLabel(p)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pdv-carrinho">
        <div className="pdv-carrinho-header">
          <span className="pdv-carrinho-titulo">Resumo da Venda</span>
          {carrinho.length > 0 && <span className="pdv-carrinho-count">{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</span>}
        </div>
        {vendaStatus && <div className={`pdv-status ${vendaStatus.tipo}`}>{vendaStatus.msg}</div>}
        <ul className="pdv-carrinho-lista">
          {carrinho.length === 0 ? (
            <li className="pdv-carrinho-vazio"><span className="pdv-carrinho-vazio-icon">🛒</span><p>Carrinho vazio</p><small>Busque e selecione produtos ao lado</small></li>
          ) : (
            carrinho.map((item, idx) => (
              <li key={`${item.id}-${idx}`} className="pdv-item">
                <div className="pdv-item-info" onClick={() => editarItem(item, idx)}>
                  <span className="pdv-item-nome">{item.nome}</span>
                  <span className="pdv-item-qtde">{item.unidade_medida === 'kg' ? `${parseFloat(item.quantidade).toFixed(3)} kg` : `${parseFloat(item.quantidade).toFixed(0)} un`}{' @ '}{fmt(item.preco_venda)}</span>
                </div>
                <span className="pdv-item-total">{fmt(item.preco_venda * item.quantidade)}</span>
                <button className="pdv-item-remover" onClick={() => removerItem(idx)}>×</button>
              </li>
            ))
          )}
        </ul>
        <div className="pdv-footer">
          <div className="pdv-total">
            <span className="pdv-total-label">Total</span>
            <span className="pdv-total-valor">{fmt(total)}</span>
          </div>
          <button ref={btnFinalizarRef} className="pdv-btn-finalizar" onClick={() => setShowPagamento(true)} disabled={carrinho.length === 0 || loadingVenda}>
            {loadingVenda ? '⏳ Processando…' : '✓ Finalizar Venda'}
          </button>
        </div>
      </div>
    </div>
  );
}