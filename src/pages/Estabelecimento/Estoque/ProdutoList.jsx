// src/pages/Estabelecimento/Estoque/ProdutoList.jsx
import { apiFetch } from '../../../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx-js-style';
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
export default function ProdutoList({ estabelecimentoId, permissoes = null, isMerchant = true }) {
  const pode = (p) => isMerchant || !permissoes || permissoes.includes(p);
  const SEM_PERM = 'Sem permissão — contate o administrador';

  // Permissões granulares — merchant/super_admin tem tudo
  const podeAdicionar = pode('estoque_adicionar');
  const podeEditar    = pode('estoque_editar');
  const podeExcluir   = pode('estoque_excluir');
  // Se tem o módulo mas nenhuma ação = somente leitura
  const somenteLeitura = pode('estoque') && !podeAdicionar && !podeEditar && !podeExcluir;

  const [produtos,         setProdutos]         = useState([]);
  const [categorias,       setCategorias]       = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [erro,             setErro]             = useState('');
  const [categoriaAtiva,   setCategoriaAtiva]   = useState('todos');
  const [termoBusca,       setTermoBusca]       = useState('');
  const [modoBusca,        setModoBusca]        = useState('nome'); // 'nome' | 'marca' | 'codigo' | 'plu'
  const [produtoFocadoId,  setProdutoFocadoId]  = useState(null);
  const [modalAberto,      setModalAberto]      = useState(false);
  const [produtoEditar,    setProdutoEditar]    = useState(null);

  // Gestão de categorias
  const [catEditandoId,    setCatEditandoId]    = useState(null);
  const [catEditandoNome,  setCatEditandoNome]  = useState('');
  const [catNovaNome,      setCatNovaNome]      = useState('');
  const [catNovaAberta,    setCatNovaAberta]    = useState(false);
  const [catSalvando,      setCatSalvando]      = useState(false);
  const [catErro,          setCatErro]          = useState('');
  const [catBusca,         setCatBusca]         = useState('');
  const [sidebarMobile,    setSidebarMobile]    = useState(false);
  const [fontScale,        setFontScale]        = useState(() => {
    const saved = localStorage.getItem('estoque-font-scale');
    return saved ? parseFloat(saved) : 1;
  });

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('estoque-font-scale', next);
      return next;
    });
  }

  const searchRef   = useRef(null);
  const catEditRef  = useRef(null);
  const catNovaRef  = useRef(null);

  /* ── Carregar dados ─────────────────────────────────────── */
  async function carregarDados(focarId = null) {
    if (!estabelecimentoId) return;
    setLoading(true);
    setErro('');
    try {
      const [rProd, rCat] = await Promise.all([
        apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos`),
        apiFetch(`/api/categorias`),
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

  // Recarrega só as categorias — usado ao criar uma categoria nova de
  // dentro do modal de produto. Não mexe em `loading`, então a tela não
  // some e o modal não é desmontado (o que perderia o que já foi digitado).
  async function recarregarCategorias() {
    try {
      const rCat = await apiFetch(`/api/categorias`);
      if (rCat.ok) setCategorias(await rCat.json());
    } catch { /* silencioso — não é crítico */ }
  }

  /* ── Foco automático no campo de busca ──────────────────── */
  useEffect(() => {
    if (!loading) setTimeout(() => searchRef.current?.focus(), 100);
  }, [loading]);

  /* ── Foco no input de edição de categoria ───────────────── */
  useEffect(() => {
    if (catEditandoId) setTimeout(() => catEditRef.current?.focus(), 0);
  }, [catEditandoId]);

  useEffect(() => {
    if (catNovaAberta) setTimeout(() => catNovaRef.current?.focus(), 0);
  }, [catNovaAberta]);

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
  async function deletarProduto(produto) {
    const nome  = produto.nome  || 'este produto';
    const marca = produto.marca ? ` · ${produto.marca}` : '';
    const ok = window.confirm(`Excluir "${nome}${marca}"?\n\nEssa ação não pode ser desfeita.`);
    if (!ok) return;
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${produto.id}`,
        { method: 'DELETE' }
      );
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Erro ao excluir');
      }
      setProdutos(prev => prev.filter(p => p.id !== produto.id));
    } catch (err) {
      setErro(err.message);
    }
  }

  /* ── Exportar Excel ──────────────────────────────────────── */
  function exportarExcel() {
    if (produtos.length === 0) return;

    const TEAL      = '14B8A6';
    const TEAL_DARK = '0D9488';
    const CINZA     = 'E2E8F0';
    const AMARELO   = 'FEF3C7'; // estoque baixo
    const VERMELHO  = 'FEE2E2'; // estoque crítico

    const MOEDA_FMT = '"R$" #,##0.00';
    const PCT_FMT   = '0.0%';

    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { patternType: 'solid', fgColor: { rgb: TEAL } },
      alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: TEAL_DARK } }, bottom: { style: 'thin', color: { rgb: TEAL_DARK } },
        left: { style: 'thin', color: { rgb: TEAL_DARK } }, right: { style: 'thin', color: { rgb: TEAL_DARK } },
      },
    };
    const bordaFina = {
      border: {
        top: { style: 'thin', color: { rgb: CINZA } }, bottom: { style: 'thin', color: { rgb: CINZA } },
        left: { style: 'thin', color: { rgb: CINZA } }, right: { style: 'thin', color: { rgb: CINZA } },
      },
    };

    function estilizarAba(ws, numColunas, numLinhas, colunaMoeda = [], colunaPct = [], destaqueLinha = null) {
      for (let c = 0; c < numColunas; c++) {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[ref]) ws[ref].s = headerStyle;
      }
      for (let r = 1; r <= numLinhas; r++) {
        const destaque = destaqueLinha?.(r - 1);
        const fillExtra = destaque === 'critico' ? { fill: { patternType: 'solid', fgColor: { rgb: VERMELHO } } }
                         : destaque === 'baixo'   ? { fill: { patternType: 'solid', fgColor: { rgb: AMARELO } } }
                         : {};
        for (let c = 0; c < numColunas; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          const cell = ws[ref];
          if (!cell) continue;
          cell.s = { ...bordaFina, ...fillExtra };
          if (colunaMoeda.includes(c)) cell.z = MOEDA_FMT;
          if (colunaPct.includes(c))   cell.z = PCT_FMT;
        }
      }
      ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(numColunas - 1)}1` };
    }

    // ── Aba 1: Produtos (resumo, 1 linha por produto) ──────────
    const headerProdutos = [
      'Categoria', 'Produto', 'Marca', 'Cód. Barras', 'Tipo',
      'Estoque Total', 'Unid.', 'Custo (R$)', 'Venda (R$)',
      'Margem (%)', 'Valor em Estoque (R$)', 'Status',
    ];

    const linhasProdutos = produtos.map(p => {
      const cat    = categorias.find(c => c.id === p.categoria_id)?.nome || 'Sem Categoria';
      const custo  = parseFloat(p.preco_custo || 0);
      const venda  = parseFloat(p.preco_venda || 0);
      const estoque = parseFloat(p.estoque_atual || 0);
      const margem  = venda > 0 ? (venda - custo) / venda : 0;
      const status  = estoqueStatus(p);
      const statusLabel = status === 'critico' ? 'Estoque crítico' : status === 'baixo' ? 'Estoque baixo' : 'OK';
      return [
        cat, p.nome, p.marca || '', p.codigo_barras || '',
        p.tem_variacoes ? `Com variações (${(p.variacoes || []).length})` : 'Simples',
        estoque, p.unidade_medida, custo, venda, margem, estoque * custo, statusLabel,
      ];
    });

    const wsProdutos = XLSX.utils.aoa_to_sheet([headerProdutos, ...linhasProdutos]);
    wsProdutos['!cols'] = [
      { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 20 },
      { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 18 }, { wch: 14 },
    ];
    estilizarAba(
      wsProdutos, headerProdutos.length, linhasProdutos.length,
      [7, 8, 10], [9],
      i => linhasProdutos[i][11] === 'Estoque crítico' ? 'critico' : linhasProdutos[i][11] === 'Estoque baixo' ? 'baixo' : null,
    );

    // Linha de totais, com fórmulas de verdade (recalcula se abrir e editar)
    const linhaTotais = linhasProdutos.length + 1;
    const totaisRef = {
      produto: XLSX.utils.encode_cell({ r: linhaTotais, c: 1 }),
      valorEstoque: XLSX.utils.encode_cell({ r: linhaTotais, c: 10 }),
    };
    XLSX.utils.sheet_add_aoa(wsProdutos, [[
      '', `Total: ${linhasProdutos.length} produto${linhasProdutos.length === 1 ? '' : 's'}`, '', '', '', '', '', '', '', '',
      { t: 'n', f: `SUM(K2:K${linhaTotais})`, z: MOEDA_FMT }, '',
    ]], { origin: linhaTotais });
    [1, 10].forEach(c => {
      const ref = XLSX.utils.encode_cell({ r: linhaTotais, c });
      if (wsProdutos[ref]) wsProdutos[ref].s = { font: { bold: true }, border: bordaFina.border };
    });

    // ── Aba 2: Variações (detalhe, 1 linha por tamanho/cor) ────
    const headerVariacoes = [
      'Produto', 'Marca', 'Tamanho', 'Cor', 'Estoque', 'Unid.',
      'Custo (R$)', 'Venda (R$)', 'Valor em Estoque (R$)',
    ];
    const linhasVariacoes = [];
    produtos.forEach(p => {
      if (!p.tem_variacoes) return;
      (p.variacoes || []).forEach(v => {
        const custo   = parseFloat(v.preco_custo != null ? v.preco_custo : p.preco_custo || 0);
        const venda   = parseFloat(v.preco_venda != null ? v.preco_venda : p.preco_venda || 0);
        const estoque = parseFloat(v.estoque_atual || 0);
        linhasVariacoes.push([
          p.nome, p.marca || '', v.tamanho || '', v.cor || '',
          estoque, p.unidade_medida, custo, venda, estoque * custo,
        ]);
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsProdutos, 'Produtos');

    if (linhasVariacoes.length > 0) {
      const wsVariacoes = XLSX.utils.aoa_to_sheet([headerVariacoes, ...linhasVariacoes]);
      wsVariacoes['!cols'] = [
        { wch: 30 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 18 },
      ];
      estilizarAba(wsVariacoes, headerVariacoes.length, linhasVariacoes.length, [6, 7, 8], []);
      XLSX.utils.book_append_sheet(wb, wsVariacoes, 'Variações');
    }

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
    let buscaOK = true;
    if (busca.length > 0) {
      if (modoBusca === 'nome')   buscaOK = normalizar(p.nome).includes(busca);
      if (modoBusca === 'marca')  buscaOK = normalizar(p.marca || '').includes(busca);
      if (modoBusca === 'codigo') buscaOK = (p.codigo_barras || '').toLowerCase().includes(busca);
      if (modoBusca === 'plu') {
        const pluNum   = parseInt(String(p.plu_balanca || '').trim(), 10);
        const buscaNum = parseInt(busca, 10);
        buscaOK = !isNaN(pluNum) && !isNaN(buscaNum) && pluNum === buscaNum;
      }
    }

    return catOK && buscaOK;
  });

  /* ── Criar categoria ────────────────────────────────────── */
  async function criarCategoria() {
    if (!catNovaNome.trim()) return;
    setCatSalvando(true);
    setCatErro('');
    try {
      const resp = await apiFetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: catNovaNome.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao criar categoria');
      setCategorias(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setCatNovaNome('');
      setCatNovaAberta(false);
      setCategoriaAtiva(data.id);
    } catch (err) {
      setCatErro(err.message);
    } finally {
      setCatSalvando(false);
    }
  }

  /* ── Salvar edição de categoria ─────────────────────────── */
  async function salvarEdicaoCategoria(id) {
    if (!catEditandoNome.trim()) return;
    setCatSalvando(true);
    setCatErro('');
    try {
      const resp = await apiFetch(`/api/categorias/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: catEditandoNome.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao atualizar');
      setCategorias(prev =>
        prev.map(c => c.id === id ? { ...c, nome: data.nome } : c)
            .sort((a, b) => a.nome.localeCompare(b.nome))
      );
      setCatEditandoId(null);
      setCatEditandoNome('');
    } catch (err) {
      setCatErro(err.message);
    } finally {
      setCatSalvando(false);
    }
  }

  /* ── Excluir categoria ──────────────────────────────────── */
  async function excluirCategoria(id, nome) {
    const count = produtos.filter(p => p.categoria_id === id).length;
    const msg = count > 0
      ? `A categoria "${nome}" tem ${count} produto(s). Eles ficarão sem categoria. Confirmar exclusão?`
      : `Excluir a categoria "${nome}"?`;
    if (!window.confirm(msg)) return;
    setCatErro('');
    try {
      const resp = await apiFetch(`/api/categorias/${id}`, { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Erro ao excluir');
      }
      setCategorias(prev => prev.filter(c => c.id !== id));
      if (categoriaAtiva === id) setCategoriaAtiva('todos');
      // Atualiza produtos removendo categoria_id deletada
      setProdutos(prev => prev.map(p => p.categoria_id === id ? { ...p, categoria_id: null } : p));
    } catch (err) {
      setCatErro(err.message);
    }
  }

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
    <div className="estoque-container" style={{ '--est-font-scale': fontScale }}>

      {/* Modal produto */}
      {modalAberto && (
        <ProdutoModal
          estabelecimentoId={estabelecimentoId}
          produtoEditar={produtoEditar}
          categorias={categorias}
          onClose={fecharModal}
          onSalvo={onProdutoSalvo}
          onCategoriaCriada={recarregarCategorias}
          somenteLeitura={produtoEditar ? !podeEditar : false}
        />
      )}

      {/* Overlay mobile para fechar sidebar */}
      <div
        className={`estoque-sidebar-overlay${sidebarMobile ? ' visivel' : ''}`}
        onClick={() => setSidebarMobile(false)}
      />

      {/* ── SIDEBAR CATEGORIAS ───────────────────────────── */}
      <aside className={`estoque-sidebar${sidebarMobile ? ' aberta' : ''}`}>
        <div className="estoque-sidebar-header">
          <div className="estoque-sidebar-titulo">Categorias</div>
          <button
            className="estoque-cat-btn-nova"
            onClick={() => { setCatNovaAberta(p => !p); setCatEditandoId(null); setCatErro(''); }}
            title="Nova categoria"
          >+</button>
        </div>

        {/* Formulário nova categoria */}
        {catNovaAberta && (
          <div className="estoque-cat-form">
            <input
              ref={catNovaRef}
              className="estoque-cat-input"
              placeholder="Nome da categoria…"
              value={catNovaNome}
              onChange={e => setCatNovaNome(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); }
                if (e.key === 'Escape') { setCatNovaAberta(false); setCatNovaNome(''); }
              }}
              disabled={catSalvando}
            />
            <div className="estoque-cat-form-btns">
              <button className="estoque-cat-form-btn confirmar" onClick={criarCategoria} disabled={catSalvando}>
                {catSalvando ? '…' : '✓'}
              </button>
              <button className="estoque-cat-form-btn cancelar" onClick={() => { setCatNovaAberta(false); setCatNovaNome(''); }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {catErro && <div className="estoque-cat-erro">⚠️ {catErro}</div>}

        {/* Busca de categoria */}
        {categorias.length > 4 && (
          <div className="estoque-cat-busca-wrap">
            <input
              className="estoque-cat-busca"
              placeholder="🔍 Filtrar…"
              value={catBusca}
              onChange={e => setCatBusca(e.target.value)}
            />
          </div>
        )}

        <ul className="estoque-cats">

          {/* ── Todos os produtos ── */}
          <li className="estoque-cat-li--todos">
            {(() => {
              const criticos = produtos.filter(p => estoqueStatus(p) === 'critico').length;
              const baixos   = produtos.filter(p => estoqueStatus(p) === 'baixo').length;
              return (
                <button
                  className={`estoque-cat-item estoque-cat-item--todos${categoriaAtiva === 'todos' ? ' ativo' : ''}`}
                  onClick={() => setCategoriaAtiva('todos')}
                >
                  <span className="estoque-cat-item-nome">Todos os produtos</span>
                  <div className="estoque-cat-item-right">
                    {criticos > 0 && (
                      <span className="estoque-cat-alerta est-alerta-critico" title={`${criticos} produto(s) sem estoque`}>
                        🔴 {criticos}
                      </span>
                    )}
                    {baixos > 0 && (
                      <span className="estoque-cat-alerta est-alerta-baixo" title={`${baixos} produto(s) com estoque baixo`}>
                        ⚠️ {baixos}
                      </span>
                    )}
                    <span className="estoque-cat-count">{produtos.length}</span>
                  </div>
                </button>
              );
            })()}
          </li>

          {/* ── Categorias ── */}
          {categorias
            .filter(cat => !catBusca.trim() || cat.nome.toLowerCase().includes(catBusca.toLowerCase()))
            .map(cat => {
              const prods    = produtos.filter(p => p.categoria_id === cat.id);
              const criticos = prods.filter(p => estoqueStatus(p) === 'critico').length;
              const baixos   = prods.filter(p => estoqueStatus(p) === 'baixo').length;
              return (
                <li key={cat.id} className="estoque-cat-li">
                  {catEditandoId === cat.id ? (
                    <div className="estoque-cat-form">
                      <input
                        ref={catEditRef}
                        className="estoque-cat-input"
                        value={catEditandoNome}
                        onChange={e => setCatEditandoNome(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); salvarEdicaoCategoria(cat.id); }
                          if (e.key === 'Escape') { setCatEditandoId(null); setCatEditandoNome(''); }
                        }}
                        disabled={catSalvando}
                      />
                      <div className="estoque-cat-form-btns">
                        <button className="estoque-cat-form-btn confirmar" onClick={() => salvarEdicaoCategoria(cat.id)} disabled={catSalvando}>
                          {catSalvando ? '…' : '✓'}
                        </button>
                        <button className="estoque-cat-form-btn cancelar" onClick={() => { setCatEditandoId(null); setCatEditandoNome(''); }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="estoque-cat-row">
                      <button
                        className={`estoque-cat-item${categoriaAtiva === cat.id ? ' ativo' : ''}`}
                        onClick={() => setCategoriaAtiva(cat.id)}
                      >
                        <span className="estoque-cat-item-nome">{cat.nome}</span>
                        <div className="estoque-cat-item-right">
                          {criticos > 0 && (
                            <span className="estoque-cat-alerta est-alerta-critico" title={`${criticos} sem estoque`}>
                              🔴 {criticos}
                            </span>
                          )}
                          {baixos > 0 && (
                            <span className="estoque-cat-alerta est-alerta-baixo" title={`${baixos} baixo`}>
                              ⚠️ {baixos}
                            </span>
                          )}
                          <span className="estoque-cat-count">{prods.length}</span>
                        </div>
                      </button>
                      <div className="estoque-cat-acoes">
                        <button
                          className="estoque-cat-acao editar"
                          title="Renomear"
                          onClick={() => { setCatEditandoId(cat.id); setCatEditandoNome(cat.nome); setCatNovaAberta(false); setCatErro(''); }}
                        >✏️</button>
                        <button
                          className="estoque-cat-acao excluir"
                          title="Excluir"
                          onClick={() => excluirCategoria(cat.id, cat.nome)}
                        >🗑</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}

          {/* ── Sem categoria ── */}
          {semCategoria > 0 && (
            <li className="estoque-cat-li--sem-cat">
              <button
                className={`estoque-cat-item${categoriaAtiva === 'sem_categoria' ? ' ativo' : ''}`}
                onClick={() => setCategoriaAtiva('sem_categoria')}
              >
                <span className="estoque-cat-item-nome estoque-cat-nome-muted">Sem categoria</span>
                <div className="estoque-cat-item-right">
                  <span className="estoque-cat-count">{semCategoria}</span>
                </div>
              </button>
            </li>
          )}

        </ul>
      </aside>


      {/* ── CONTEÚDO PRINCIPAL ──────────────────────────── */}
      <div className="estoque-main">

        {/* Header */}
        <div className="estoque-header">
          <div className="estoque-busca-wrap">
            <input
              ref={searchRef}
              className="estoque-busca-input"
              type="text"
              placeholder={
                modoBusca === 'nome'   ? '🔍  Buscar por nome…' :
                modoBusca === 'marca'  ? '🏷️  Buscar por marca…' :
                modoBusca === 'plu'    ? '⚖️  Buscar por código PLU…' :
                                         '🔢  Buscar por código de barras…'
              }
              value={termoBusca}
              onChange={e => setTermoBusca(e.target.value)}
            />
            <div className="estoque-busca-modos">
              {[
                { key: 'nome',   label: 'Nome' },
                { key: 'marca',  label: 'Marca' },
                { key: 'codigo', label: 'Código' },
                { key: 'plu',    label: 'PLU' },
              ].map(m => (
                <button
                  key={m.key}
                  className={`estoque-busca-modo-btn${modoBusca === m.key ? ' ativo' : ''}`}
                  onClick={() => { setModoBusca(m.key); setTermoBusca(''); searchRef.current?.focus(); }}
                  type="button"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="estoque-header-btns">
            <button
              className="estoque-btn-cats-mobile"
              onClick={() => setSidebarMobile(true)}
              title="Categorias"
            >
              🗂 Categorias
            </button>
            <button
              className="estoque-zoom-btn"
              onClick={() => changeFontScale(-0.1)}
              disabled={fontScale <= 0.8}
              title="Diminuir fonte"
            >A−</button>
            <button
              className="estoque-zoom-btn"
              onClick={() => changeFontScale(0.1)}
              disabled={fontScale >= 1.6}
              title="Aumentar fonte"
            >A+</button>
            <button className="estoque-btn verde" onClick={exportarExcel} title="Exportar Excel">
              📥 Excel
            </button>
            <button className="estoque-btn" onClick={() => window.print()} title="Imprimir">
              🖨️
            </button>
            {podeAdicionar && (
              <button className="estoque-btn primary" onClick={abrirNovo}>
                + Produto
              </button>
            )}
          </div>
        </div>

        {/* Erro */}
        {!isMerchant && permissoes && (!pode('estoque_adicionar') || !pode('estoque_editar') || !pode('estoque_excluir')) && (
        <div className="mod-aviso-permissao">
          🔒 Visualização limitada — algumas ações de estoque não estão disponíveis para o seu perfil.
        </div>
      )}
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
                onDeletar={() => deletarProduto(produto)}
                podeEditar={podeEditar}
                podeExcluir={podeExcluir}
                somenteLeitura={somenteLeitura}
              />
            ))
          )}
        </div>

      </div>
    </div>
  );
}

/* ── Card de produto ─────────────────────────────────────────*/
function ProdutoCard({ produto, focado, onEditar, onDeletar, podeEditar = true, podeExcluir = true, somenteLeitura = false }) {
  const status = estoqueStatus(produto);
  const unSufixo = produto.unidade_medida === 'kg' ? '/kg' : '/un';

  // Com variações, cada linha pode ter preço próprio (ou herdar o preço
  // base do produto, quando não sobrescrito) — mostra faixa se os
  // valores efetivos não forem todos iguais, senão mostra um preço só.
  const temVariacoes = produto.tem_variacoes && (produto.variacoes || []).length > 0;
  let precoVendaExibido = fmt(produto.preco_venda);
  let precoCustoExibido = fmt(produto.preco_custo);
  if (temVariacoes) {
    const precosVenda = produto.variacoes.map(v => parseFloat(v.preco_venda != null ? v.preco_venda : produto.preco_venda) || 0);
    const min = Math.min(...precosVenda), max = Math.max(...precosVenda);
    precoVendaExibido = min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
  }

  return (
    <div
      id={`prod-${produto.id}`}
      className={`prod-card${focado ? ' focado' : ''}`}
    >
      <div className="prod-card-corpo" onClick={podeEditar || somenteLeitura ? onEditar : undefined} style={{ cursor: podeEditar || somenteLeitura ? "pointer" : "default" }}>
        <span className={`prod-badge-estoque ${status}`}>
          {formatarEstoque(produto.estoque_atual, produto.unidade_medida)}
        </span>
        <div className="prod-nome">{produto.nome}</div>
        {produto.marca && <div className="prod-marca">{produto.marca}</div>}
        <div className="prod-card-meta">
          {temVariacoes && (
            <span className="prod-badge-variacoes" title={produto.variacoes.map(v => [v.tamanho, v.cor].filter(Boolean).join(' ')).join(', ')}>
              🎨 {produto.variacoes.length} variaç{produto.variacoes.length > 1 ? 'ões' : 'ão'}
            </span>
          )}
          {produto.nome_categoria && (
            <span className="prod-badge-categoria">{produto.nome_categoria}</span>
          )}
          <span className="prod-codigo-inline">{produto.codigo_barras || ''}</span>
        </div>
        <div className="prod-precos">
          <div className="prod-preco-item">
            <span className="prod-preco-label">Custo{unSufixo}</span>
            <span className="prod-preco-valor">{precoCustoExibido}</span>
          </div>
          <div className="prod-preco-item">
            <span className="prod-preco-label">Venda{unSufixo}</span>
            <span className="prod-preco-valor venda">{precoVendaExibido}</span>
          </div>
        </div>
      </div>
      <div className="prod-card-acoes">
        {(podeEditar || somenteLeitura) && (
          <button className="prod-btn-acao editar" onClick={onEditar}>
            {somenteLeitura && !podeEditar ? '👁️ Ver' : '✏️ Editar'}
          </button>
        )}
        {podeExcluir && (
          <button className="prod-btn-acao excluir" onClick={onDeletar}>🗑 Excluir</button>
        )}
      </div>
    </div>
  );
}