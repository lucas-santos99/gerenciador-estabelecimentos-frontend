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

// Cor do avatar de cada categoria — sempre a mesma pro mesmo nome (hash
// simples), escolhida de uma paleta que harmoniza com o teal da marca.
const CORES_AVATAR = ['teal', 'azul', 'roxo', 'rosa', 'ambar', 'verde'];
function corDaCategoria(nome) {
  let hash = 0;
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash);
  return CORES_AVATAR[Math.abs(hash) % CORES_AVATAR.length];
}

// Ícone de "sem imagem" — SVG em vez de emoji, pra nunca depender da
// fonte de emoji do sistema (em alguns Windows/navegadores o 📦 rendeiza
// como um símbolo genérico quebrado em vez do desenho colorido)
function IconePacote({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
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
  const [imagemExpandida, setImagemExpandida] = useState(null); // url da imagem em tela cheia, ou null
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
  const [visualizacao,     setVisualizacao]     = useState(() => localStorage.getItem('estoque-visualizacao') || 'lista');
  const [produtoFocadoId,  setProdutoFocadoId]  = useState(null);
  const [modalAberto,      setModalAberto]      = useState(false);
  const [produtoEditar,    setProdutoEditar]    = useState(null);

  // Gestão de categorias
  const [catEditandoId,    setCatEditandoId]    = useState(null);
  const [catEditandoNome,  setCatEditandoNome]  = useState('');
  const [catNovaNome,      setCatNovaNome]      = useState('');
  const [catNovaAberta,    setCatNovaAberta]    = useState(false);
  const [catNovaPaiId,     setCatNovaPaiId]     = useState(''); // '' = categoria principal
  const [catColapsadas,    setCatColapsadas]    = useState(() => new Set()); // ids de categoria-mãe com subcategorias escondidas
  const [catSalvando,      setCatSalvando]      = useState(false);
  const [catErro,          setCatErro]          = useState('');
  const [catBusca,         setCatBusca]         = useState('');
  const [sidebarMobile,    setSidebarMobile]    = useState(false);
  const [sidebarColapsada, setSidebarColapsada] = useState(() => localStorage.getItem('estoque-sidebar-colapsada') === 'true');
  const [catFontScale,     setCatFontScale]     = useState(() => {
    const s = localStorage.getItem('estoque-cat-font-scale');
    return s ? parseFloat(s) : 1;
  });
  function changeCatFontScale(delta) {
    setCatFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('estoque-cat-font-scale', next);
      return next;
    });
  }
  function toggleSidebarColapsada() {
    setSidebarColapsada(prev => {
      const next = !prev;
      localStorage.setItem('estoque-sidebar-colapsada', next);
      return next;
    });
  }
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
  useEffect(() => { localStorage.setItem('estoque-visualizacao', visualizacao); }, [visualizacao]);

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

  // Agrupa: raízes (sem pai) + mapa paiId -> subcategorias
  const categoriasRaiz = categorias.filter(c => !c.categoria_pai_id);
  const subPorPai = {};
  categorias.forEach(c => {
    if (c.categoria_pai_id) {
      (subPorPai[c.categoria_pai_id] ||= []).push(c);
    }
  });

  // ids que "contam" pra categoria ativa selecionada — se for uma
  // categoria-mãe, inclui as subcategorias dela também (clicar em
  // "Calças" mostra jeans + moletom junto, não só o que está direto nela)
  function idsDaCategoriaAtiva(catId) {
    const subs = subPorPai[catId];
    return subs ? [catId, ...subs.map(s => s.id)] : [catId];
  }

  const produtosFiltrados = produtos.filter(p => {
    const catOK =
      categoriaAtiva === 'todos' ? true
      : categoriaAtiva === 'sem_categoria' ? !p.categoria_id
      : idsDaCategoriaAtiva(categoriaAtiva).includes(p.categoria_id);

    const busca = normalizar(termoBusca).trim();
    let buscaOK = true;
    if (busca.length > 0) {
      const nomeOK   = normalizar(p.nome).includes(busca);
      const marcaOK  = normalizar(p.marca || '').includes(busca);
      const codigoOK = (p.codigo_barras || '').toLowerCase().includes(busca);
      const pluNum   = parseInt(String(p.plu_balanca || '').trim(), 10);
      const buscaNum = parseInt(termoBusca.trim(), 10);
      const pluOK    = !isNaN(pluNum) && !isNaN(buscaNum) && pluNum === buscaNum;
      buscaOK = nomeOK || marcaOK || codigoOK || pluOK;
    }

    return catOK && buscaOK;
  });

  function toggleColapsada(id) {
    setCatColapsadas(prev => {
      const novo = new Set(prev);
      novo.has(id) ? novo.delete(id) : novo.add(id);
      return novo;
    });
  }

  /* ── Criar categoria ────────────────────────────────────── */
  async function criarCategoria() {
    if (!catNovaNome.trim()) return;
    setCatSalvando(true);
    setCatErro('');
    try {
      const resp = await apiFetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: catNovaNome.trim(), categoria_pai_id: catNovaPaiId || null }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao criar categoria');
      setCategorias(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setCatNovaNome('');
      setCatNovaPaiId('');
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
    const numSubs = (subPorPai[id] || []).length;
    const partes = [];
    if (count > 0)   partes.push(`${count} produto(s) (ficam sem categoria)`);
    if (numSubs > 0) partes.push(`${numSubs} subcategoria(s) (viram categoria principal)`);
    const msg = partes.length > 0
      ? `A categoria "${nome}" tem ${partes.join(' e ')}. Confirmar exclusão?`
      : `Excluir a categoria "${nome}"?`;
    if (!window.confirm(msg)) return;
    setCatErro('');
    try {
      const resp = await apiFetch(`/api/categorias/${id}`, { method: 'DELETE' });
      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Erro ao excluir');
      }
      setCategorias(prev => prev
        .filter(c => c.id !== id)
        .map(c => c.categoria_pai_id === id ? { ...c, categoria_pai_id: null } : c) // banco já promove sozinho — reflete localmente
      );
      if (categoriaAtiva === id) setCategoriaAtiva('todos');
      setProdutos(prev => prev.map(p => p.categoria_id === id ? { ...p, categoria_id: null } : p));
    } catch (err) {
      setCatErro(err.message);
    }
  }

  /* ── Abrir form de nova subcategoria já com o pai escolhido ── */
  function abrirNovaSubcategoria(paiId) {
    setCatNovaPaiId(paiId);
    setCatNovaAberta(true);
    setCatEditandoId(null);
    setCatErro('');
    setCatColapsadas(prev => { const n = new Set(prev); n.delete(paiId); return n; }); // garante que a lista abre pra ver a nova subcategoria depois
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
      <aside
        className={`estoque-sidebar${sidebarMobile ? ' aberta' : ''}${sidebarColapsada ? ' colapsada' : ''}`}
        style={{ '--estoque-cat-font-scale': catFontScale }}
        onClick={e => {
          // Clicar em qualquer espaço vazio recolhe/expande — mesmo padrão
          // do menu do estabelecimento. Ignora cliques em botões, links,
          // inputs e selects, pra não atrapalhar o uso normal da lista.
          if (e.target.closest('button, input, a, select, textarea')) return;
          toggleSidebarColapsada();
        }}
      >
        <div className="estoque-sidebar-header">
          <div className="estoque-sidebar-header-topo">
            <div className="estoque-sidebar-titulo">
              Categorias
              {categoriasRaiz.length > 0 && <span className="estoque-sidebar-titulo-total">{categoriasRaiz.length}</span>}
            </div>
            <button
              className="estoque-cat-btn-nova"
              onClick={() => { setCatNovaAberta(p => !p); setCatNovaPaiId(''); setCatEditandoId(null); setCatErro(''); }}
              title="Nova categoria"
            >+</button>
          </div>
          <div className="estoque-sidebar-header-zoom">
            <button className="estoque-cat-zoom-btn" onClick={() => changeCatFontScale(-0.1)} disabled={catFontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="estoque-cat-zoom-btn" onClick={() => changeCatFontScale(0.1)}  disabled={catFontScale >= 1.4} title="Aumentar fonte">A+</button>
          </div>
        </div>

        {/* Formulário nova categoria */}
        {catNovaAberta && (
          <div className="estoque-cat-form estoque-cat-form--nova">
            <input
              ref={catNovaRef}
              className="estoque-cat-input"
              placeholder={catNovaPaiId ? 'Nome da subcategoria…' : 'Nome da categoria…'}
              value={catNovaNome}
              onChange={e => setCatNovaNome(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); }
                if (e.key === 'Escape') { setCatNovaAberta(false); setCatNovaNome(''); setCatNovaPaiId(''); }
              }}
              disabled={catSalvando}
            />
            <select
              className="estoque-cat-select-pai"
              value={catNovaPaiId}
              onChange={e => setCatNovaPaiId(e.target.value)}
              disabled={catSalvando}
              title="Categoria principal (opcional)"
            >
              <option value="">— Categoria principal —</option>
              {categoriasRaiz.map(cat => (
                <option key={cat.id} value={cat.id}>↳ dentro de "{cat.nome}"</option>
              ))}
            </select>
            <div className="estoque-cat-form-btns">
              <button className="estoque-cat-form-btn confirmar" onClick={criarCategoria} disabled={catSalvando}>
                {catSalvando ? '…' : '✓'}
              </button>
              <button className="estoque-cat-form-btn cancelar" onClick={() => { setCatNovaAberta(false); setCatNovaNome(''); setCatNovaPaiId(''); }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {catErro && <div className="estoque-cat-erro">⚠️ {catErro}</div>}

        {/* Busca de categoria */}
        {categorias.length > 4 && (
          <div className="estoque-cat-busca-wrap">
            <div className="estoque-cat-busca-inner">
              <svg className="estoque-cat-busca-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="estoque-cat-busca"
                placeholder="Filtrar categorias…"
                value={catBusca}
                onChange={e => setCatBusca(e.target.value)}
              />
            </div>
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
                  <span className="estoque-cat-avatar estoque-cat-avatar--geral">≡</span>
                  <span className="estoque-cat-item-nome">Todos os produtos</span>
                  <div className="estoque-cat-item-right">
                    {criticos > 0 && (
                      <span className="estoque-cat-dot estoque-cat-dot--critico" title={`${criticos} produto(s) sem estoque`}>
                        <span className="estoque-cat-dot-ponto" />{criticos}
                      </span>
                    )}
                    {baixos > 0 && (
                      <span className="estoque-cat-dot estoque-cat-dot--baixo" title={`${baixos} produto(s) com estoque baixo`}>
                        <span className="estoque-cat-dot-ponto" />{baixos}
                      </span>
                    )}
                    <span className="estoque-cat-count">{produtos.length}</span>
                  </div>
                </button>
              );
            })()}
          </li>

          {/* ── Categorias ── */}
          {categoriasRaiz
            .filter(cat => {
              const termo = catBusca.trim().toLowerCase();
              if (!termo) return true;
              const subs = subPorPai[cat.id] || [];
              return cat.nome.toLowerCase().includes(termo) || subs.some(s => s.nome.toLowerCase().includes(termo));
            })
            .map(cat => {
              const subs = subPorPai[cat.id] || [];
              const idsAgregados = idsDaCategoriaAtiva(cat.id);
              const prods    = produtos.filter(p => idsAgregados.includes(p.categoria_id));
              const criticos = prods.filter(p => estoqueStatus(p) === 'critico').length;
              const baixos   = prods.filter(p => estoqueStatus(p) === 'baixo').length;
              const termo    = catBusca.trim().toLowerCase();
              const catBateBusca = !termo || cat.nome.toLowerCase().includes(termo);
              const subsVisiveis = catBateBusca ? subs : subs.filter(s => s.nome.toLowerCase().includes(termo));
              const colapsada = catColapsadas.has(cat.id);

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
                      {subs.length > 0 ? (
                        <button
                          className={`estoque-cat-chevron${colapsada ? ' colapsada' : ''}`}
                          onClick={() => toggleColapsada(cat.id)}
                          title={colapsada ? 'Expandir subcategorias' : 'Recolher subcategorias'}
                        >
                          ▾
                        </button>
                      ) : (
                        <span className="estoque-cat-chevron-espaco" />
                      )}
                      <button
                        className={`estoque-cat-item${categoriaAtiva === cat.id ? ' ativo' : ''}`}
                        onClick={() => setCategoriaAtiva(cat.id)}
                      >
                        <span className={`estoque-cat-avatar estoque-cat-avatar--${corDaCategoria(cat.nome)}`}>
                          {cat.nome.charAt(0).toUpperCase()}
                        </span>
                        <span className="estoque-cat-item-nome">{cat.nome}</span>
                        <div className="estoque-cat-item-right">
                          {criticos > 0 && (
                            <span className="estoque-cat-dot estoque-cat-dot--critico" title={`${criticos} sem estoque`}>
                              <span className="estoque-cat-dot-ponto" />{criticos}
                            </span>
                          )}
                          {baixos > 0 && (
                            <span className="estoque-cat-dot estoque-cat-dot--baixo" title={`${baixos} baixo`}>
                              <span className="estoque-cat-dot-ponto" />{baixos}
                            </span>
                          )}
                          <span className="estoque-cat-count">{prods.length}</span>
                        </div>
                      </button>
                      <div className="estoque-cat-acoes">
                        <button
                          className="estoque-cat-acao subcategoria"
                          title="Nova subcategoria"
                          onClick={() => abrirNovaSubcategoria(cat.id)}
                        >➕</button>
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

                  {/* ── Subcategorias ── */}
                  {subsVisiveis.length > 0 && (
                    <ul className={`estoque-subcats${colapsada ? ' colapsada' : ''}`}>
                      {subsVisiveis.map(sub => {
                        const subProds    = produtos.filter(p => p.categoria_id === sub.id);
                        const subCriticos = subProds.filter(p => estoqueStatus(p) === 'critico').length;
                        const subBaixos   = subProds.filter(p => estoqueStatus(p) === 'baixo').length;
                        return (
                          <li key={sub.id} className="estoque-cat-li estoque-cat-li--sub">
                            {catEditandoId === sub.id ? (
                              <div className="estoque-cat-form">
                                <input
                                  ref={catEditRef}
                                  className="estoque-cat-input"
                                  value={catEditandoNome}
                                  onChange={e => setCatEditandoNome(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); salvarEdicaoCategoria(sub.id); }
                                    if (e.key === 'Escape') { setCatEditandoId(null); setCatEditandoNome(''); }
                                  }}
                                  disabled={catSalvando}
                                />
                                <div className="estoque-cat-form-btns">
                                  <button className="estoque-cat-form-btn confirmar" onClick={() => salvarEdicaoCategoria(sub.id)} disabled={catSalvando}>
                                    {catSalvando ? '…' : '✓'}
                                  </button>
                                  <button className="estoque-cat-form-btn cancelar" onClick={() => { setCatEditandoId(null); setCatEditandoNome(''); }}>
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="estoque-cat-row estoque-cat-row--sub">
                                <button
                                  className={`estoque-cat-item estoque-cat-item--sub${categoriaAtiva === sub.id ? ' ativo' : ''}`}
                                  onClick={() => setCategoriaAtiva(sub.id)}
                                >
                                  <span className="estoque-cat-item-nome">{sub.nome}</span>
                                  <div className="estoque-cat-item-right">
                                    {subCriticos > 0 && (
                                      <span className="estoque-cat-dot estoque-cat-dot--critico" title={`${subCriticos} sem estoque`}>
                                        <span className="estoque-cat-dot-ponto" />{subCriticos}
                                      </span>
                                    )}
                                    {subBaixos > 0 && (
                                      <span className="estoque-cat-dot estoque-cat-dot--baixo" title={`${subBaixos} baixo`}>
                                        <span className="estoque-cat-dot-ponto" />{subBaixos}
                                      </span>
                                    )}
                                    <span className="estoque-cat-count">{subProds.length}</span>
                                  </div>
                                </button>
                                <div className="estoque-cat-acoes">
                                  <button
                                    className="estoque-cat-acao editar"
                                    title="Renomear"
                                    onClick={() => { setCatEditandoId(sub.id); setCatEditandoNome(sub.nome); setCatNovaAberta(false); setCatErro(''); }}
                                  >✏️</button>
                                  <button
                                    className="estoque-cat-acao excluir"
                                    title="Excluir"
                                    onClick={() => excluirCategoria(sub.id, sub.nome)}
                                  >🗑</button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
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
                <span className="estoque-cat-avatar estoque-cat-avatar--geral">—</span>
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
              placeholder="🔍  Buscar por nome, marca, código ou PLU…"
              value={termoBusca}
              onChange={e => setTermoBusca(e.target.value)}
            />
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
            <div className="estoque-view-toggle">
              <button
                className={`estoque-view-btn${visualizacao === 'lista' ? ' ativo' : ''}`}
                onClick={() => setVisualizacao('lista')}
                title="Visualização em lista"
              >☰</button>
              <button
                className={`estoque-view-btn${visualizacao === 'grade' ? ' ativo' : ''}`}
                onClick={() => setVisualizacao('grade')}
                title="Visualização em grade (catálogo)"
              >▦</button>
            </div>
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
        <div className={`estoque-grid${visualizacao === 'grade' ? ' modo-grade' : ''}`}>
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
                visualizacao={visualizacao}
                onExpandirImagem={setImagemExpandida}
              />
            ))
          )}
        </div>

      </div>

      {imagemExpandida && (
        <div className="prod-lightbox-overlay" onClick={() => setImagemExpandida(null)}>
          <button className="prod-lightbox-fechar" onClick={() => setImagemExpandida(null)}>✕</button>
          <img src={imagemExpandida} alt="" className="prod-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ── Card de produto ─────────────────────────────────────────*/
function ProdutoCard({ produto, focado, onEditar, onDeletar, podeEditar = true, podeExcluir = true, somenteLeitura = false, visualizacao = 'lista', onExpandirImagem }) {
  const status = estoqueStatus(produto);
  const unSufixo = produto.unidade_medida === 'kg' ? '/kg' : '/un';
  const modoGrade = visualizacao === 'grade';
  const [imgErro, setImgErro] = useState(false);

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

  const imagem = (
    <div className="prod-card-imagem">
      {produto.imagem_url && !imgErro ? (
        <img
          src={produto.imagem_url}
          alt=""
          loading="lazy"
          onError={() => setImgErro(true)}
          onClick={e => { e.stopPropagation(); onExpandirImagem?.(produto.imagem_url); }}
        />
      ) : (
        <IconePacote className="prod-card-imagem-placeholder" />
      )}
    </div>
  );

  return (
    <div
      id={`prod-${produto.id}`}
      className={`prod-card${focado ? ' focado' : ''}${modoGrade ? ' modo-grade' : ''}`}
    >
      <div className="prod-card-corpo" onClick={podeEditar || somenteLeitura ? onEditar : undefined} style={{ cursor: podeEditar || somenteLeitura ? "pointer" : "default" }}>
        {modoGrade && imagem}
        <div className="prod-card-corpo-info">
          <div className="prod-card-topo-linha">
            {!modoGrade && imagem}
            <span className={`prod-badge-estoque ${status}`}>
              {formatarEstoque(produto.estoque_atual, produto.unidade_medida)}
            </span>
          </div>
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
            {!modoGrade && <span className="prod-codigo-inline">{produto.codigo_barras || ''}</span>}
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