// src/pages/Estabelecimento/Fornecedores/LancarCompraModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import '../Clientes.css';
import './Fornecedores.css';

function digitarValorMascarado(valorBruto, casasDecimais) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / Math.pow(10, casasDecimais);
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais });
}
function paraFloatBR(valor) {
  return parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0;
}
function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
// Mesmo padrão de formatação de quantidade usado no Ajuste Rápido do Inventário
function fmtQ(v, u) {
  return u === 'kg'
    ? parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg'
    : Math.trunc(parseFloat(v || 0)) + ' un';
}
function hojeISO() {
  return new Date().toISOString().split('T')[0];
}

/* ════════════════════════════════════════════════════════════ */
export default function LancarCompraModal({ estabelecimentoId, fornecedorPreselecionado, onClose, onSalvo, fontScale = 1 }) {
  const [fornecedorId,   setFornecedorId]   = useState(fornecedorPreselecionado?.id || '');
  const [fornecedorNome, setFornecedorNome] = useState(fornecedorPreselecionado?.nome || '');
  const [buscaFornecedor, setBuscaFornecedor] = useState('');
  const [resultadosForn,  setResultadosForn]  = useState([]);

  const [numeroNota,   setNumeroNota]   = useState('');
  const [dataCompra,   setDataCompra]   = useState(hojeISO());
  const [formaPgto,    setFormaPgto]    = useState('a_vista');
  const [dataVenc,     setDataVenc]     = useState('');
  const [observacoes,  setObservacoes]  = useState('');

  // Busca de produto pra adicionar na lista
  const [buscaProduto, setBuscaProduto] = useState('');
  const [resultadosProduto, setResultadosProduto] = useState([]);
  // [{ produto_id, nome, marca, unidade_medida, estoque_atual, quantidade, preco_custo_unitario }]
  const [carrinho, setCarrinho] = useState([]);

  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');

  const inputFornecedorRef = useRef(null);
  const inputProdutoRef    = useRef(null);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (!fornecedorPreselecionado) setTimeout(() => inputFornecedorRef.current?.focus(), 0);
    else setTimeout(() => inputProdutoRef.current?.focus(), 0);
  }, [fornecedorPreselecionado]);

  /* ── Busca de fornecedor ─────────────────────────────────── */
  async function buscarFornecedor(termo) {
    setBuscaFornecedor(termo);
    setFornecedorId('');
    if (termo.length < 2) { setResultadosForn([]); return; }
    try {
      const resp = await apiFetch(`/api/fornecedores/buscar-rapido?termo=${encodeURIComponent(termo)}`);
      const data = await resp.json();
      setResultadosForn(Array.isArray(data) ? data : []);
    } catch { setResultadosForn([]); }
  }

  function selecionarFornecedor(f) {
    setFornecedorId(f.id);
    setFornecedorNome(f.nome);
    setBuscaFornecedor('');
    setResultadosForn([]);
    if (f.condicao_pagamento === 'a_vista') setFormaPgto('a_vista');
    setTimeout(() => inputProdutoRef.current?.focus(), 0);
  }

  /* ── Busca de produto ────────────────────────────────────── */
  async function buscarProduto(termo) {
    setBuscaProduto(termo);
    if (termo.length < 2) { setResultadosProduto([]); return; }
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`);
      const data = await resp.json();
      setResultadosProduto(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { setResultadosProduto([]); }
  }

  function handleBuscaProdutoKeyDown(e) {
    if (e.key === 'Enter' && resultadosProduto.length > 0) {
      e.preventDefault();
      adicionarProduto(resultadosProduto[0]);
    }
  }

  function adicionarProduto(p) {
    setCarrinho(prev => {
      const jaTem = prev.find(i => i.produto_id === p.id);
      if (jaTem) return prev; // já está na lista — ajusta a quantidade direto nela
      return [...prev, {
        produto_id: p.id,
        nome: p.nome,
        marca: p.marca,
        unidade_medida: p.unidade_medida,
        estoque_atual: parseFloat(p.estoque_atual) || 0,
        quantidade: '', // vazio de propósito — evita o comerciante ter que apagar "1,000" toda vez
        preco_custo_unitario: p.preco_custo ? p.preco_custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      }];
    });
    setBuscaProduto('');
    setResultadosProduto([]);
    setTimeout(() => inputProdutoRef.current?.focus(), 0);
  }

  function atualizarItem(produtoId, campo, valor) {
    setCarrinho(prev => prev.map(i => {
      if (i.produto_id !== produtoId) return i;
      if (campo === 'quantidade') {
        const casas = i.unidade_medida === 'kg' ? 3 : 0;
        return { ...i, quantidade: digitarValorMascarado(valor, casas) };
      }
      if (campo === 'preco_custo_unitario') {
        return { ...i, preco_custo_unitario: digitarValorMascarado(valor, 2) };
      }
      return i;
    }));
  }

  function removerItem(produtoId) {
    setCarrinho(prev => prev.filter(i => i.produto_id !== produtoId));
  }

  const valorTotal = carrinho.reduce((acc, i) => acc + paraFloatBR(i.quantidade) * paraFloatBR(i.preco_custo_unitario), 0);

  /* ── Salvar ──────────────────────────────────────────────── */
  async function salvar() {
    setErro('');
    if (!fornecedorId) { setErro('Selecione um fornecedor.'); return; }
    if (carrinho.length === 0) { setErro('Adicione pelo menos um produto.'); return; }
    for (const i of carrinho) {
      if (paraFloatBR(i.quantidade) <= 0) { setErro(`Quantidade inválida em "${i.nome}".`); return; }
    }
    if (formaPgto === 'a_prazo' && !dataVenc) { setErro('Informe a data de vencimento.'); return; }

    setSalvando(true);
    try {
      const resp = await apiFetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedor_id: fornecedorId,
          numero_nota: numeroNota.trim() || null,
          data_compra: dataCompra,
          forma_pagamento: formaPgto,
          data_vencimento: formaPgto === 'a_prazo' ? dataVenc : null,
          observacoes: observacoes.trim() || null,
          itens: carrinho.map(i => ({
            produto_id: i.produto_id,
            quantidade: paraFloatBR(i.quantidade),
            preco_custo_unitario: paraFloatBR(i.preco_custo_unitario),
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao lançar compra');
      onSalvo?.(data);
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
      <div className="cli-modal forn-modal-compra forn-zoom-scope" style={{ '--forn-font-scale': fontScale }}>

        <div className="cli-modal-titulo">🧾 Lançar Compra</div>

        {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

        {/* Fornecedor */}
        <div className="cli-form-group" style={{ position: 'relative' }}>
          <label className="cli-form-label">Fornecedor *</label>
          {fornecedorId ? (
            <div className="forn-selecionado">
              <span>🚚 {fornecedorNome}</span>
              <button type="button" onClick={() => { setFornecedorId(''); setFornecedorNome(''); setTimeout(() => inputFornecedorRef.current?.focus(), 0); }}>Trocar</button>
            </div>
          ) : (
            <>
              <input
                ref={inputFornecedorRef}
                className="cli-form-input"
                placeholder="Buscar fornecedor pelo nome…"
                value={buscaFornecedor}
                onChange={e => buscarFornecedor(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && resultadosForn.length > 0) { e.preventDefault(); selecionarFornecedor(resultadosForn[0]); } }}
                autoComplete="off"
              />
              {resultadosForn.length > 0 && (
                <div className="forn-resultados-dropdown">
                  {resultadosForn.map(f => (
                    <div key={f.id} className="forn-resultado-item" onClick={() => selecionarFornecedor(f)}>
                      {f.nome}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Nota, data, forma de pagamento */}
        <div className="forn-form-grid" style={{ marginTop: 10 }}>
          <div className="cli-form-group">
            <label className="cli-form-label">Nº da nota (opcional)</label>
            <input className="cli-form-input" value={numeroNota} onChange={e => setNumeroNota(e.target.value)} />
          </div>
          <div className="cli-form-group">
            <label className="cli-form-label">Data da compra</label>
            <input className="cli-form-input" type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} />
          </div>
          <div className="cli-form-group forn-full">
            <label className="cli-form-label">Forma de pagamento</label>
            <div className="forn-forma-pgto-toggle">
              <button type="button" className={`forn-forma-pgto-btn${formaPgto === 'a_vista' ? ' ativo' : ''}`} onClick={() => setFormaPgto('a_vista')}>À vista</button>
              <button type="button" className={`forn-forma-pgto-btn${formaPgto === 'a_prazo' ? ' ativo' : ''}`} onClick={() => setFormaPgto('a_prazo')}>A prazo (gera conta a pagar)</button>
            </div>
          </div>
          {formaPgto === 'a_prazo' && (
            <div className="cli-form-group forn-full">
              <label className="cli-form-label">Data de vencimento *</label>
              <input className="cli-form-input" type="date" value={dataVenc} onChange={e => setDataVenc(e.target.value)} min={hojeISO()} />
            </div>
          )}
        </div>

        {/* Produtos */}
        <div className="cli-form-group" style={{ marginTop: 14, position: 'relative' }}>
          <label className="cli-form-label">Adicionar produto</label>
          <input
            ref={inputProdutoRef}
            className="cli-form-input"
            placeholder="Digite o nome ou código do produto… (Enter adiciona)"
            value={buscaProduto}
            onChange={e => buscarProduto(e.target.value)}
            onKeyDown={handleBuscaProdutoKeyDown}
            autoComplete="off"
          />
          {resultadosProduto.length > 0 && (
            <div className="forn-resultados-dropdown">
              {resultadosProduto.map(p => (
                <div key={p.id} className="forn-resultado-item" onClick={() => adicionarProduto(p)}>
                  {p.nome} {p.marca && <span style={{ opacity: 0.6 }}>· {p.marca}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carrinho de itens */}
        <div className="forn-itens-lista">
          {carrinho.length === 0 ? (
            <div className="forn-itens-vazio">Nenhum produto adicionado ainda.</div>
          ) : (
            <>
              <div className="forn-itens-header">
                <span>Produto</span>
                <span>Qtd.</span>
                <span>Custo unit.</span>
                <span>Estoque (atual → após)</span>
                <span>Subtotal</span>
                <span></span>
              </div>
              {carrinho.map(item => {
                const qtdNumerica = paraFloatBR(item.quantidade);
                const qtdDepois   = item.estoque_atual + qtdNumerica;
                return (
                  <div key={item.produto_id} className="forn-item-linha">
                    <span className="forn-item-nome">{item.nome}{item.marca && <small> · {item.marca}</small>}</span>

                    <div className="forn-item-qtd-wrap">
                      <input
                        className="cli-form-input forn-item-input"
                        value={item.quantidade}
                        onChange={e => atualizarItem(item.produto_id, 'quantidade', e.target.value)}
                        placeholder={item.unidade_medida === 'kg' ? '0,000' : '0'}
                      />
                      <span className="forn-item-unidade">{item.unidade_medida}</span>
                    </div>

                    <div className="forn-item-preco-wrap">
                      <span>R$</span>
                      <input
                        className="cli-form-input forn-item-input"
                        value={item.preco_custo_unitario}
                        onChange={e => atualizarItem(item.produto_id, 'preco_custo_unitario', e.target.value)}
                        placeholder="0,00"
                      />
                      <span className="forn-item-preco-unidade">/{item.unidade_medida === 'kg' ? 'kg' : 'un'}</span>
                    </div>

                    <div className="forn-item-estoque">
                      <span className="forn-item-estoque-atual">{fmtQ(item.estoque_atual, item.unidade_medida)}</span>
                      <span className="forn-item-estoque-seta">→</span>
                      <span className={`forn-item-estoque-depois${qtdNumerica > 0 ? ' mais' : ''}`}>
                        {qtdNumerica > 0 ? fmtQ(qtdDepois, item.unidade_medida) : '—'}
                      </span>
                    </div>

                    <span className="forn-item-subtotal">{fmt(qtdNumerica * paraFloatBR(item.preco_custo_unitario))}</span>
                    <button type="button" className="forn-item-remover" onClick={() => removerItem(item.produto_id)}>✕</button>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {carrinho.length > 0 && (
          <div className="forn-total-box">
            <span>Total da compra</span>
            <strong>{fmt(valorTotal)}</strong>
          </div>
        )}

        <div className="cli-form-group" style={{ marginTop: 10 }}>
          <label className="cli-form-label">Observações (opcional)</label>
          <input className="cli-form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
        </div>

        <div className="cli-modal-acoes">
          <button type="button" className="cli-modal-btn-cancelar" onClick={onClose} disabled={salvando}>
            Cancelar (Esc)
          </button>
          <button type="button" className="cli-modal-btn-salvar" onClick={salvar} disabled={salvando}>
            {salvando ? '⏳ Salvando…' : '✓ Lançar compra'}
          </button>
        </div>

      </div>
    </div>
  );
}