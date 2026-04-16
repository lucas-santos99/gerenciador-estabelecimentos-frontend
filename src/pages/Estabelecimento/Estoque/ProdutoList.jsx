// src/pages/Estabelecimento/Estoque/ProdutoList.jsx
import { apiFetch } from '../../../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import ProdutoModal from './ProdutoModal';
import '../Estoque.css';



/* ── Helpers ───────────────────────────────────────────────── */
const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarEstoque(estoque, unidade) {
  const v = parseFloat(estoque);
  return unidade === 'kg'
    ? `${v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
    : `${Math.trunc(v)} un`;
}

function normalizar(t) {
  return (t || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function estoqueStatus(produto) {
  const e = parseFloat(produto.estoque_atual);
  const m = parseFloat(produto.estoque_minimo);
  if (e <= 0) return 'critico';
  if (e <= m) return 'baixo';
  return 'ok';
}

/* ════════════════════════════════════════════════════════════ */
export default function ProdutoList({ estabelecimentoId }) {

  const [produtos,         setProdutos]         = useState([]);
  const [categorias,       setCategorias]       = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [erro,             setErro]             = useState('');
  const [categoriaAtiva,   setCategoriaAtiva]   = useState('todos');
  const [termoBusca,       setTermoBusca]       = useState('');
  const [produtoFocadoId,  setProdutoFocadoId]  = useState(null);
  const [modalAberto,      setModalAberto]      = useState(false);
  const [produtoEditar,    setProdutoEditar]    = useState(null);

  const searchRef = useRef(null);

  /* ── Carregar dados ─────────────────────────────────────── */
  async function carregarDados(focarId = null) {
    if (!estabelecimentoId) return;
    setLoading(true);
    setErro('');
    try {
      const [rProd, rCat] = await Promise.all([
        apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos`),
        apiFetch(`/api/categorias/${estabelecimentoId}`),
      ]);
      if (!rProd.ok) throw new Error('Erro ao buscar produtos');
      if (!rCat.ok)  throw new Error('Erro ao buscar categorias');
      const [prods, cats] = await Promise.all([rProd.json(), rCat.json()]);
      setProdutos(prods);
      setCategorias(cats);
      if (focarId) {
        setProdutoFocadoId(focarId);
        const p = prods.find(x => x.id === focarId);
        if (p) setCategoriaAtiva(p.categoria_id || 'sem_categoria');
      }
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregarDados(); }, [estabelecimentoId]);

  /* ── Foco automático no campo de busca ──────────────────── */
  useEffect(() => {
    if (!loading) setTimeout(() => searchRef.current?.focus(), 100);
  }, [loading]);

  /* ── Scroll para produto focado ─────────────────────────── */
  useEffect(() => {
    if (!produtoFocadoId) return;
    const el = document.getElementById(`prod-${produtoFocadoId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setProdutoFocadoId(null), 3000);
    }
  }, [produtoFocadoId, produtos]);

  /* ── Deletar produto ─────────────────────────────────────── */
  async function deletarProduto(id) {
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${id}`,
        { method: 'DELETE' }
      );
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Erro ao excluir');
      }
      setProdutos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setErro(err.message);
    }
  }

  /* ── Exportar Excel ──────────────────────────────────────── */
  function exportarExcel() {
    if (produtos.length === 0) return;
    const dados = produtos.map(p => {
      const cat = categorias.find(c => c.id === p.categoria_id)?.nome || 'Sem Categoria';
      const custo = parseFloat(p.preco_custo || 0);
      const venda = parseFloat(p.preco_venda || 0);
      return {
        'Categoria': cat,
        'Produto': p.nome,
        'Cód. Barras': p.codigo_barras || '',
        'Estoque': parseFloat(p.estoque_atual),
        'Unid.': p.unidade_medida,
        'Custo (R$)': fmt(custo),
        'Venda (R$)': fmt(venda),
        'Lucro/Un': fmt(venda - custo),
      };
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    XLSX.writeFile(wb, `Estoque-${data}.xlsx`);
  }

  /* ── Filtros ─────────────────────────────────────────────── */
  const semCategoria = produtos.filter(p => !p.categoria_id).length;

  const produtosFiltrados = produtos.filter(p => {
    const catOK =
      categoriaAtiva === 'todos' ? true
      : categoriaAtiva === 'sem_categoria' ? !p.categoria_id
      : p.categoria_id === categoriaAtiva;

    const busca = normalizar(termoBusca).trim();
    const buscaOK = busca.length === 0
      ? true
      : normalizar(p.nome).includes(busca) || (p.codigo_barras || '').toLowerCase().includes(busca);

    return catOK && buscaOK;
  });

  /* ── Handlers modal ─────────────────────────────────────── */
  function abrirNovo() { setProdutoEditar(null); setModalAberto(true); }
  function abrirEditar(p) { setProdutoEditar(p); setModalAberto(true); }
  function fecharModal() { setModalAberto(false); setProdutoEditar(null); }
  function onProdutoSalvo(p) { fecharModal(); carregarDados(p.id); }

  /* ════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando estoque…
      </div>
    );
  }

  return (
    <div className="estoque-container">

      {/* Modal produto */}
      {modalAberto && (
        <ProdutoModal
          estabelecimentoId={estabelecimentoId}
          produtoEditar={produtoEditar}
          categorias={categorias}
          onClose={fecharModal}
          onSalvo={onProdutoSalvo}
          onCategoriaCriada={() => carregarDados()}
        />
      )}

      {/* ── SIDEBAR CATEGORIAS ───────────────────────────── */}
      <aside className="estoque-sidebar">
        <div className="estoque-sidebar-titulo">Categorias</div>
        <ul className="estoque-cats">

          <li>
            <button
              className={`estoque-cat-item${categoriaAtiva === 'todos' ? ' ativo' : ''}`}
              onClick={() => setCategoriaAtiva('todos')}
            >
              Todos os produtos
              <span className="estoque-cat-count">{produtos.length}</span>
            </button>
          </li>

          {categorias.map(cat => (
            <li key={cat.id}>
              <button
                className={`estoque-cat-item${categoriaAtiva === cat.id ? ' ativo' : ''}`}
                onClick={() => setCategoriaAtiva(cat.id)}
              >
                {cat.nome}
                <span className="estoque-cat-count">
                  {produtos.filter(p => p.categoria_id === cat.id).length}
                </span>
              </button>
            </li>
          ))}

          {semCategoria > 0 && (
            <li>
              <button
                className={`estoque-cat-item${categoriaAtiva === 'sem_categoria' ? ' ativo' : ''}`}
                onClick={() => setCategoriaAtiva('sem_categoria')}
              >
                Sem categoria
                <span className="estoque-cat-count">{semCategoria}</span>
              </button>
            </li>
          )}

        </ul>
      </aside>

      {/* ── CONTEÚDO PRINCIPAL ──────────────────────────── */}
      <div className="estoque-main">

        {/* Header */}
        <div className="estoque-header">
          <input
            ref={searchRef}
            className="estoque-busca-input"
            type="text"
            placeholder="🔍  Buscar por nome ou código de barras…"
            value={termoBusca}
            onChange={e => setTermoBusca(e.target.value)}
          />
          <div className="estoque-header-btns">
            <button className="estoque-btn verde" onClick={exportarExcel} title="Exportar Excel">
              📥 Excel
            </button>
            <button className="estoque-btn" onClick={() => window.print()} title="Imprimir">
              🖨️
            </button>
            <button className="estoque-btn primary" onClick={abrirNovo}>
              + Produto
            </button>
          </div>
        </div>

        {/* Erro */}
        {erro && <div className="estoque-erro">⚠️ {erro}</div>}

        {/* Grid */}
        <div className="estoque-grid">
          {produtosFiltrados.length === 0 ? (
            <div className="estoque-vazio">
              <span className="estoque-vazio-icon">📦</span>
              <p>Nenhum produto encontrado</p>
              <small>
                {termoBusca ? `Sem resultados para "${termoBusca}"` : 'Adicione seu primeiro produto'}
              </small>
            </div>
          ) : (
            produtosFiltrados.map(produto => (
              <ProdutoCard
                key={produto.id}
                produto={produto}
                focado={produto.id === produtoFocadoId}
                onEditar={() => abrirEditar(produto)}
                onDeletar={() => deletarProduto(produto.id)}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}

/* ── Card de produto ─────────────────────────────────────────*/
function ProdutoCard({ produto, focado, onEditar, onDeletar }) {
  const status = estoqueStatus(produto);

  return (
    <div
      id={`prod-${produto.id}`}
      className={`prod-card${focado ? ' focado' : ''}`}
    >
      <div className="prod-card-corpo" onClick={onEditar}>
        <span className={`prod-badge-estoque ${status}`}>
          {formatarEstoque(produto.estoque_atual, produto.unidade_medida)}
        </span>
        <div className="prod-nome">{produto.nome}</div>
        <div className="prod-codigo">{produto.codigo_barras || 'Sem código'}</div>
        <div className="prod-precos">
          <div className="prod-preco-item">
            <span className="prod-preco-label">Custo</span>
            <span className="prod-preco-valor">{fmt(produto.preco_custo)}</span>
          </div>
          <div className="prod-preco-item">
            <span className="prod-preco-label">Venda</span>
            <span className="prod-preco-valor venda">{fmt(produto.preco_venda)}</span>
          </div>
        </div>
      </div>
      <div className="prod-card-acoes">
        <button className="prod-btn-acao editar" onClick={onEditar}>✏️ Editar</button>
        <button className="prod-btn-acao excluir" onClick={onDeletar}>🗑 Excluir</button>
      </div>
    </div>
  );
}