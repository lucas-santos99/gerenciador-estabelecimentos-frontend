// src/pages/Estabelecimento/Financeiro/Financeiro.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import '../Financeiro.css';


/* ── Helpers ───────────────────────────────────────────────── */
const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatarData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }
  catch { return '—'; }
}

/* ════════════════════════════════════════════════════════════ */
export default function Financeiro({ estabelecimentoId, logoUrl, nomeFantasia }) {

  const [abaAtiva, setAbaAtiva] = useState('fluxo');
  const [fontScale, setFontScale] = useState(() => {
    const saved = localStorage.getItem('fin-font-scale');
    return saved ? parseFloat(saved) : 1;
  });

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('fin-font-scale', next);
      return next;
    });
  }

  /* ── Estado Fluxo / DRE ──────────────────────────────────── */
  const [resumo,        setResumo]        = useState(null);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [erroResumo,    setErroResumo]    = useState('');
  const [dreData,       setDreData]       = useState(null);
  const [loadingDre,    setLoadingDre]    = useState(false);
  const [erroDre,       setErroDre]       = useState('');
  const [dreInicio,     setDreInicio]     = useState(hoje());
  const [dreFim,        setDreFim]        = useState(hoje());

  /* ── Estado Contas a Pagar ───────────────────────────────── */
  const [contas,       setContas]       = useState([]);
  const [loadingContas,setLoadingContas] = useState(false);
  const [erroContas,   setErroContas]   = useState('');
  const [filtroStatus, setFiltroStatus] = useState('pendente');
  const [formAberto,   setFormAberto]   = useState(false);
  const [formData,     setFormData]     = useState({ descricao: '', valor: '', data_vencimento: '' });
  const [contaEditId,  setContaEditId]  = useState(null);
  const [salvandoConta,setSalvandoConta] = useState(false);

  /* ── Estado Relatório Produtos ───────────────────────────── */
  const [categorias,     setCategorias]     = useState([]);
  const [reportProd,     setReportProd]     = useState([]);
  const [loadingReport,  setLoadingReport]  = useState(false);
  const [erroReport,     setErroReport]     = useState('');
  const [reportInicio,   setReportInicio]   = useState(hoje());
  const [reportFim,      setReportFim]      = useState(hoje());
  const [reportCat,      setReportCat]      = useState('');

  /* ── Estado Histórico de Vendas ──────────────────────────── */
  const [historico,        setHistorico]        = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [erroHistorico,    setErroHistorico]    = useState('');
  const [histInicio,       setHistInicio]       = useState(hoje());
  const [histFim,          setHistFim]          = useState(hoje());
  const [vendaDetalhes,    setVendaDetalhes]    = useState(null);

  /* ── Estado Relatório Estoque ────────────────────────────── */
  const [estoque,        setEstoque]        = useState([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [erroEstoque,    setErroEstoque]    = useState('');
  const [filtrEstoque,   setFiltrEstoque]   = useState('todos');

  /* ── Estado Relatório por Operador ──────────────────────── */
  const [relOp,        setRelOp]        = useState([]);
  const [loadingRelOp, setLoadingRelOp] = useState(false);
  const [erroRelOp,    setErroRelOp]    = useState('');
  const [relOpInicio,  setRelOpInicio]  = useState(hoje());
  const [relOpFim,     setRelOpFim]     = useState(hoje());

  /* ── Carga inicial ───────────────────────────────────────── */
  useEffect(() => {
    if (!estabelecimentoId) return;
    carregarResumo();
    carregarCategorias();
  }, [estabelecimentoId]);

  useEffect(() => {
    if (abaAtiva === 'contas' && estabelecimentoId) carregarContas(filtroStatus);
  }, [abaAtiva, filtroStatus, estabelecimentoId]);

  /* ════════════════════════════════════════════════════════
     FLUXO DE CAIXA
  ════════════════════════════════════════════════════════ */
  async function carregarResumo() {
    setLoadingResumo(true);
    setErroResumo('');
    try {
      const resp = await apiFetch(`/api/financeiro/resumo`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      setResumo(await resp.json());
    } catch (err) { setErroResumo(err.message); }
    finally { setLoadingResumo(false); }
  }

  /* ── Gerar DRE ───────────────────────────────────────────── */
  async function gerarDRE(e) {
    e.preventDefault();
    setLoadingDre(true);
    setErroDre('');
    setDreData(null);
    try {
      const params = new URLSearchParams({ data_inicio: dreInicio, data_fim: dreFim });
      const resp = await apiFetch(`/api/financeiro/relatorio_dre?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
      setDreData(data);
    } catch (err) { setErroDre(err.message); }
    finally { setLoadingDre(false); }
  }

  /* ── Baixar PDF DRE ──────────────────────────────────────── */
  function baixarPDF() {
    if (!dreData) return;
    const doc = new jsPDF();

    const gerar = (y) => {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(nomeFantasia || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80);
      doc.text('Demonstrativo de Resultado do Exercício (DRE)', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Período: ${formatarData(dreInicio)} a ${formatarData(dreFim)}`, 105, y + 13, { align: 'center' });

      autoTable(doc, {
        startY: y + 20,
        head: [['Descrição', 'Valor']],
        body: [
          ['(+) Receita Bruta Total',   fmt(dreData.receita_bruta)],
          ['   Em Dinheiro',            fmt(dreData.receita_dinheiro)],
          ['   Em Pix',                 fmt(dreData.receita_pix)],
          ['   Em Cartão',              fmt(dreData.receita_cartao)],
          ['(-) CMV',                   `- ${fmt(dreData.cmv)}`],
          ['(=) Lucro Bruto',           fmt(dreData.lucro_bruto)],
          ['(-) Despesas Operacionais', `- ${fmt(dreData.despesas)}`],
          ['(=) Lucro Líquido',         fmt(dreData.lucro_liquido)],
        ],
        theme: 'striped',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 'auto', halign: 'right' } },
      });

      doc.save(`DRE_${nomeFantasia || 'relatorio'}_${dreInicio}_a_${dreFim}.pdf`);
    };

    if (logoUrl) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = logoUrl;
      img.onload = () => {
        const ratio = img.width / img.height;
        doc.addImage(img, 'PNG', 15, 10, 25, 25 / ratio);
        gerar(25 / ratio + 15);
      };
      img.onerror = () => gerar(15);
    } else {
      gerar(15);
    }
  }

  /* ════════════════════════════════════════════════════════
     CONTAS A PAGAR
  ════════════════════════════════════════════════════════ */
  async function carregarContas(status) {
    setLoadingContas(true);
    setErroContas('');
    try {
      const resp = await apiFetch(`/api/financeiro?status=${encodeURIComponent(status)}`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      setContas(await resp.json());
    } catch (err) { setErroContas(err.message); }
    finally { setLoadingContas(false); }
  }

  function abrirFormNovaConta() {
    setContaEditId(null);
    setFormData({ descricao: '', valor: '', data_vencimento: '' });
    setFormAberto(true);
  }

  function abrirFormEditar(conta) {
    setContaEditId(conta.id);
    setFormData({
      descricao:       conta.descricao || '',
      valor:           parseFloat(conta.valor || 0).toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 }),
      data_vencimento: conta.data_vencimento ? conta.data_vencimento.split('T')[0] : hoje(),
    });
    setFormAberto(true);
  }

  function cancelarForm() {
    setFormAberto(false);
    setContaEditId(null);
    setFormData({ descricao: '', valor: '', data_vencimento: '' });
    setErroContas('');
  }

  async function salvarConta(e) {
    e.preventDefault();
    setSalvandoConta(true);
    setErroContas('');
    try {
      const url    = contaEditId
        ? `/api/financeiro/${encodeURIComponent(contaEditId)}`
        : `/api/financeiro`;
      const method = contaEditId ? 'PUT' : 'POST';

      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimentoId,
          descricao:       formData.descricao,
          valor:           formData.valor.replace(',', '.'),
          data_vencimento: formData.data_vencimento,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Erro ao salvar');

      if (contaEditId) {
        setContas(prev => prev.map(c => c.id === contaEditId ? result : c));
      } else {
        carregarContas(filtroStatus);
      }
      cancelarForm();
    } catch (err) { setErroContas(err.message); }
    finally { setSalvandoConta(false); }
  }

  async function marcarPaga(contaId) {
    setSalvandoConta(true);
    try {
      const resp = await apiFetch(`/api/financeiro/${encodeURIComponent(contaId)}/pagar`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estabelecimentoId }),
      });
      if (!resp.ok) { const d = await resp.json(); throw new Error(d.error); }
      carregarResumo();
      if (filtroStatus === 'pendente' || filtroStatus === 'atrasada') {
        setContas(prev => prev.filter(c => c.id !== contaId));
      } else {
        carregarContas(filtroStatus);
      }
    } catch (err) { setErroContas(err.message); }
    finally { setSalvandoConta(false); }
  }

  async function excluirConta(contaId) {
    if (!window.confirm('Excluir esta conta?')) return;
    setSalvandoConta(true);
    try {
      const resp = await apiFetch(`/api/financeiro/${encodeURIComponent(contaId)}`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estabelecimentoId }),
      });
      if (!resp.ok) { const d = await resp.json(); throw new Error(d.error); }
      setContas(prev => prev.filter(c => c.id !== contaId));
    } catch (err) { setErroContas(err.message); }
    finally { setSalvandoConta(false); }
  }

  /* ════════════════════════════════════════════════════════
     RELATÓRIO DE PRODUTOS
  ════════════════════════════════════════════════════════ */
  async function carregarCategorias() {
    try {
      const resp = await apiFetch(`/api/categorias`);
      if (!resp.ok) return;
      setCategorias(await resp.json());
    } catch {}
  }

  async function gerarReportProdutos(e) {
    e.preventDefault();
    setLoadingReport(true);
    setErroReport('');
    setReportProd([]);
    try {
      const params = new URLSearchParams({ data_inicio: reportInicio, data_fim: reportFim });
      if (reportCat) params.append('categoria_id', reportCat);
      const resp = await apiFetch(`/api/financeiro/relatorio_produtos?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar relatório');
      setReportProd(data);
    } catch (err) { setErroReport(err.message); }
    finally { setLoadingReport(false); }
  }

  /* ════════════════════════════════════════════════════════
     HISTÓRICO DE VENDAS
  ════════════════════════════════════════════════════════ */
  async function carregarHistorico() {
    setLoadingHistorico(true);
    setErroHistorico('');
    try {
      const params = new URLSearchParams({ data_inicio: histInicio, data_fim: histFim });
      const resp = await apiFetch(`/api/financeiro/historico?${params}`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      setHistorico(await resp.json());
    } catch (err) { setErroHistorico(err.message); }
    finally { setLoadingHistorico(false); }
  }

  /* ════════════════════════════════════════════════════════
     RELATÓRIO DE ESTOQUE
  ════════════════════════════════════════════════════════ */
  async function carregarEstoque() {
    setLoadingEstoque(true);
    setErroEstoque('');
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      setEstoque(await resp.json());
    } catch (err) { setErroEstoque(err.message); }
    finally { setLoadingEstoque(false); }
  }

  function estoqueStatus(p) {
    const e = parseFloat(p.estoque_atual);
    const m = parseFloat(p.estoque_minimo);
    if (e <= 0) return 'critico';
    if (e <= m) return 'baixo';
    return 'ok';
  }

  const estoqueFiltrado = estoque.filter(p => {
    if (filtrEstoque === 'todos') return true;
    return estoqueStatus(p) === filtrEstoque;
  });

  const totalEstoqueCusto = estoque.reduce((s, p) => s + parseFloat(p.preco_custo || 0) * parseFloat(p.estoque_atual || 0), 0);
  const totalEstoqueVenda = estoque.reduce((s, p) => s + parseFloat(p.preco_venda || 0) * parseFloat(p.estoque_atual || 0), 0);
  const qtdCritico = estoque.filter(p => estoqueStatus(p) === 'critico').length;
  const qtdBaixo   = estoque.filter(p => estoqueStatus(p) === 'baixo').length;

  /* ════════════════════════════════════════════════════════
     RELATÓRIO POR OPERADOR
  ════════════════════════════════════════════════════════ */
  async function gerarRelatorioOperador(e) {
    e.preventDefault();
    setLoadingRelOp(true);
    setErroRelOp('');
    setRelOp([]);
    try {
      const params = new URLSearchParams({ data_inicio: relOpInicio, data_fim: relOpFim });
      const resp = await apiFetch(`/api/financeiro/relatorio_vendas_operador?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar relatório');
      setRelOp(data);
    } catch (err) { setErroRelOp(err.message); }
    finally { setLoadingRelOp(false); }
  }

  function exportarRelatorioOperadorExcel() {
    if (!relOp.length) return;

    const totalGeral = relOp.reduce((s, op) => s + op.total_vendas, 0);

    const dados = relOp.map((op, i) => ({
      '#':              i + 1,
      'Operador':       op.operador_nome,
      'Qtd Vendas':     op.qtd_vendas,
      'Total (R$)':     parseFloat(op.total_vendas.toFixed(2)),
      '% do Total':     totalGeral > 0
                          ? parseFloat(((op.total_vendas / totalGeral) * 100).toFixed(1))
                          : 0,
      'Dinheiro (R$)':  parseFloat(op.total_dinheiro.toFixed(2)),
      'Pix (R$)':       parseFloat(op.total_pix.toFixed(2)),
      'Cartão (R$)':    parseFloat(op.total_cartao.toFixed(2)),
      'Fiado (R$)':     parseFloat(op.total_fiado.toFixed(2)),
      'Ticket Médio':   op.qtd_vendas > 0
                          ? parseFloat((op.total_vendas / op.qtd_vendas).toFixed(2))
                          : 0,
    }));

    // Linha de totais
    dados.push({
      '#':              '',
      'Operador':       'TOTAL',
      'Qtd Vendas':     relOp.reduce((s, op) => s + op.qtd_vendas, 0),
      'Total (R$)':     parseFloat(totalGeral.toFixed(2)),
      '% do Total':     100,
      'Dinheiro (R$)':  parseFloat(relOp.reduce((s, op) => s + op.total_dinheiro, 0).toFixed(2)),
      'Pix (R$)':       parseFloat(relOp.reduce((s, op) => s + op.total_pix, 0).toFixed(2)),
      'Cartão (R$)':    parseFloat(relOp.reduce((s, op) => s + op.total_cartao, 0).toFixed(2)),
      'Fiado (R$)':     parseFloat(relOp.reduce((s, op) => s + op.total_fiado, 0).toFixed(2)),
      'Ticket Médio':   '',
    });

    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas por Operador');
    XLSX.writeFile(wb, `Vendas_Operador_${relOpInicio}_${relOpFim}.xlsx`);
  }

  function baixarPDFOperador() {
    if (!relOp.length) return;
    const doc = new jsPDF();
    const totalGeral = relOp.reduce((s, op) => s + op.total_vendas, 0);

    const gerar = (y) => {
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(nomeFantasia || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80);
      doc.text('Relatório de Vendas por Operador', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Período: ${formatarData(relOpInicio)} a ${formatarData(relOpFim)}`, 105, y + 13, { align: 'center' });

      const body = relOp.map((op, i) => [
        `#${i + 1}`,
        op.operador_nome,
        op.qtd_vendas,
        fmt(op.total_vendas),
        totalGeral > 0 ? `${((op.total_vendas / totalGeral) * 100).toFixed(1)}%` : '0%',
        fmt(op.total_dinheiro),
        fmt(op.total_pix),
        fmt(op.total_cartao),
      ]);

      // Linha de totais
      body.push([
        '',
        'TOTAL',
        relOp.reduce((s, op) => s + op.qtd_vendas, 0),
        fmt(totalGeral),
        '100%',
        fmt(relOp.reduce((s, op) => s + op.total_dinheiro, 0)),
        fmt(relOp.reduce((s, op) => s + op.total_pix, 0)),
        fmt(relOp.reduce((s, op) => s + op.total_cartao, 0)),
      ]);

      autoTable(doc, {
        startY: y + 20,
        head: [['', 'Operador', 'Vendas', 'Total', '%', 'Dinheiro', 'Pix', 'Cartão']],
        body,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
        foot: [],
      });

      doc.save(`Vendas_Operador_${nomeFantasia || 'relatorio'}_${relOpInicio}_a_${relOpFim}.pdf`);
    };

    if (logoUrl) {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.src = logoUrl;
      img.onload = () => {
        const ratio = img.width / img.height;
        doc.addImage(img, 'PNG', 15, 10, 25, 25 / ratio);
        gerar(25 / ratio + 15);
      };
      img.onerror = () => gerar(15);
    } else {
      gerar(15);
    }
  }

  /* ════════════════════════════════════════════════════════
     EXPORTAR EXCEL — RELATÓRIO DE PRODUTOS
  ════════════════════════════════════════════════════════ */
  function exportarRelatorioExcel() {
    if (!reportProd.length) return;
    const dados = reportProd.map((p, i) => ({
      '#': i + 1,
      'Produto':        p.produto_nome,
      'Categoria':      p.categoria_nome || 'Sem categoria',
      'Unidade':        p.unidade_medida,
      'Total Vendido':  parseFloat(p.total_vendido),
      'Receita (R$)':   parseFloat(p.receita_total),
      'Custo (R$)':     parseFloat(p.custo_total || 0),
      'Lucro (R$)':     parseFloat(p.receita_total) - parseFloat(p.custo_total || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Vendas');
    XLSX.writeFile(wb, `Relatorio_Vendas_${reportInicio}_${reportFim}.xlsx`);
  }

  function exportarEstoqueExcel() {
    if (!estoque.length) return;
    const dados = estoque.map(p => ({
      'Produto':       p.nome,
      'Categoria':     p.nome_categoria || 'Sem categoria',
      'Unidade':       p.unidade_medida,
      'Estoque Atual': parseFloat(p.estoque_atual),
      'Estoque Mín.':  parseFloat(p.estoque_minimo),
      'Status':        estoqueStatus(p),
      'Custo Unit.':   parseFloat(p.preco_custo || 0),
      'Venda Unit.':   parseFloat(p.preco_venda || 0),
      'Total Custo':   parseFloat(p.preco_custo || 0) * parseFloat(p.estoque_atual || 0),
      'Total Venda':   parseFloat(p.preco_venda || 0) * parseFloat(p.estoque_atual || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.writeFile(wb, `Estoque_${hoje()}.xlsx`);
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className="fin-container" style={{ '--fin-font-scale': fontScale }}>

      {/* ── TABS NAV ─────────────────────────────────────── */}
      <div className="fin-tabs">
        <div className="fin-tabs-nav">
          {[
            { key: 'fluxo',  label: '💰 Fluxo de Caixa' },
            { key: 'contas', label: '📋 Contas a Pagar' },
          ].map(tab => (
            <button
              key={tab.key}
              className={`fin-tab-btn${abaAtiva === tab.key ? ' ativo' : ''}`}
              onClick={() => setAbaAtiva(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
          <button
            className="fin-zoom-btn"
            onClick={() => changeFontScale(-0.1)}
            disabled={fontScale <= 0.8}
            title="Diminuir fonte"
          >A−</button>
          <button
            className="fin-zoom-btn"
            onClick={() => changeFontScale(0.1)}
            disabled={fontScale >= 1.6}
            title="Aumentar fonte"
          >A+</button>
          <button className="fin-tab-btn-imprimir" onClick={() => window.print()}>
            🖨️ Imprimir
          </button>
        </div>
      </div>

      {/* ── CONTEÚDO ─────────────────────────────────────── */}
      <div className="fin-content">

        {/* ══ ABA 1: FLUXO DE CAIXA ══ */}
        {abaAtiva === 'fluxo' && (
          <>
            {/* Resumo do dia */}
            <div className="fin-section-header">
              <span className="fin-section-titulo">📅 Resumo do Dia</span>
              <button
                className="fin-btn-atualizar"
                onClick={carregarResumo}
                disabled={loadingResumo}
              >
                {loadingResumo ? '…' : '↻ Atualizar'}
              </button>
            </div>

            {erroResumo && <div className="fin-erro">⚠️ {erroResumo}</div>}

            {/* ── Entradas do dia ── */}
            <div className="fin-resumo-secao-label fin-resumo-secao-label--entradas">
              ✅ Entradas de Hoje
            </div>
            <div className="fin-resumo-grid">
              {[
                { key: 'total_entradas_dia',  label: 'Total Entradas',    destaque: true },
                { key: 'total_vendas_dia',    label: '🛒 Vendas',         info: 'Vendas pagas no ato' },
                { key: 'total_fiado_recebido',label: '📋 Fiado Recebido', info: 'Quitação de dívidas' },
                { key: 'total_dinheiro',      label: '💵 Dinheiro' },
                { key: 'total_pix',           label: '📱 Pix' },
              ].map(c => (
                <div key={c.key} className={`fin-resumo-card${c.destaque ? ' destaque' : ''}`}>
                  <span className="fin-resumo-card-titulo">{c.label}</span>
                  {c.info && <span className="fin-resumo-card-info">{c.info}</span>}
                  {loadingResumo
                    ? <div className="fin-card-spinner" />
                    : <span className="fin-resumo-card-valor">{fmt(resumo?.[c.key])}</span>
                  }
                </div>
              ))}

              {/* Card Cartão com breakdown débito/crédito */}
              <div className="fin-resumo-card fin-resumo-card--cartao">
                <span className="fin-resumo-card-titulo">💳 Cartão</span>
                {loadingResumo
                  ? <div className="fin-card-spinner" />
                  : <>
                      <span className="fin-resumo-card-valor">{fmt(resumo?.total_cartao)}</span>
                      <div className="fin-cartao-breakdown">
                        <div className="fin-cartao-breakdown-item">
                          <span className="fin-cartao-breakdown-label">Débito</span>
                          <span className="fin-cartao-breakdown-valor">{fmt(resumo?.total_debito)}</span>
                        </div>
                        <div className="fin-cartao-breakdown-divider" />
                        <div className="fin-cartao-breakdown-item">
                          <span className="fin-cartao-breakdown-label">Crédito</span>
                          <span className="fin-cartao-breakdown-valor">{fmt(resumo?.total_credito)}</span>
                        </div>
                      </div>
                    </>
                }
              </div>
            </div>

            {/* ── Pendências ── */}
            <div className="fin-resumo-secao-label fin-resumo-secao-label--pendencias">
              ⚠️ Pendências
            </div>
            <div className="fin-pendencias-grid">
              <div className="fin-pendencia-card fiado">
                <div className="fin-pendencia-icone">📋</div>
                <div className="fin-pendencia-info">
                  <span className="fin-pendencia-titulo">Fiado Pendente</span>
                  <span className="fin-pendencia-desc">Total a receber de clientes</span>
                </div>
                {loadingResumo
                  ? <div className="fin-card-spinner" />
                  : <span className="fin-pendencia-valor">{fmt(resumo?.total_fiado_pendente)}</span>
                }
              </div>
              <div className="fin-pendencia-card contas">
                <div className="fin-pendencia-icone">💸</div>
                <div className="fin-pendencia-info">
                  <span className="fin-pendencia-titulo">Contas a Pagar</span>
                  <span className="fin-pendencia-desc">Despesas pendentes e atrasadas</span>
                </div>
                {loadingResumo
                  ? <div className="fin-card-spinner" />
                  : <span className="fin-pendencia-valor">{fmt(resumo?.total_contas_pagar_pendente)}</span>
                }
              </div>
            </div>

            <div className="fin-divisor" />

            {/* DRE */}
            <div className="fin-section-header">
              <span className="fin-section-titulo">📊 Relatório DRE</span>
            </div>

            <form className="fin-form-filtros" onSubmit={gerarDRE}>
              <div className="fin-form-group">
                <label className="fin-form-label">Data início</label>
                <input className="fin-form-input" type="date" value={dreInicio} onChange={e => setDreInicio(e.target.value)} />
              </div>
              <div className="fin-form-group">
                <label className="fin-form-label">Data fim</label>
                <input className="fin-form-input" type="date" value={dreFim} onChange={e => setDreFim(e.target.value)} />
              </div>
              <button type="submit" className="fin-btn-gerar" disabled={loadingDre}>
                {loadingDre ? '⏳ Gerando…' : '▶ Gerar DRE'}
              </button>
              <button
                type="button"
                className="fin-btn-pdf"
                onClick={baixarPDF}
                disabled={!dreData}
              >
                📄 Baixar PDF
              </button>
            </form>

            {erroDre && <div className="fin-erro">⚠️ {erroDre}</div>}

            {loadingDre && (
              <div className="fin-loading">
                <div className="est-spinner" /> Gerando relatório…
              </div>
            )}

            {dreData && (
              <div className="fin-dre-grid">
                <div className="fin-dre-card receita">
                  <span className="fin-dre-card-titulo">(+) Receita Bruta Total</span>
                  <span className="fin-dre-card-subtitulo">Tudo que entrou no caixa</span>
                  <span className="fin-dre-card-valor">{fmt(dreData.receita_bruta)}</span>
                  <div className="fin-dre-sub">
                    <span>Dinheiro: {fmt(dreData.receita_dinheiro)}</span>
                    <span>Pix: {fmt(dreData.receita_pix)}</span>
                    <span>Cartão: {fmt(dreData.receita_cartao)}</span>
                  </div>
                </div>
                <div className="fin-dre-card despesa">
                  <span className="fin-dre-card-titulo">(-) CMV</span>
                  <span className="fin-dre-card-subtitulo">Custo da Mercadoria Vendida</span>
                  <span className="fin-dre-card-valor">- {fmt(dreData.cmv)}</span>
                </div>
                <div className="fin-dre-card bruto">
                  <span className="fin-dre-card-titulo">(=) Lucro Bruto</span>
                  <span className="fin-dre-card-subtitulo">Receita menos custo dos produtos</span>
                  <span className="fin-dre-card-valor">{fmt(dreData.lucro_bruto)}</span>
                </div>
                <div className="fin-dre-card despesa">
                  <span className="fin-dre-card-titulo">(-) Despesas Operacionais</span>
                  <span className="fin-dre-card-subtitulo">Contas pagas no período</span>
                  <span className="fin-dre-card-valor">- {fmt(dreData.despesas)}</span>
                </div>
                <div className="fin-dre-card liquido">
                  <span className="fin-dre-card-titulo">(=) Lucro Líquido</span>
                  <span className="fin-dre-card-subtitulo">Resultado final do período</span>
                  <span className="fin-dre-card-valor">{fmt(dreData.lucro_liquido)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══ ABA 2: CONTAS A PAGAR ══ */}
        {abaAtiva === 'contas' && (
          <>
            <div className="fin-contas-header">
              <div className="fin-status-toggle">
                {['pendente', 'paga', 'atrasada'].map(s => (
                  <button
                    key={s}
                    className={`fin-status-btn ${s}${filtroStatus === s ? ' ativo' : ''}`}
                    onClick={() => setFiltroStatus(s)}
                  >
                    {s === 'pendente' ? '⏳ Pendente'
                      : s === 'paga' ? '✅ Paga'
                      : '🔴 Atrasada'}
                  </button>
                ))}
              </div>
              <button className="fin-btn-nova-conta" onClick={abrirFormNovaConta}>
                + Nova Conta
              </button>
            </div>

            {/* Formulário */}
            {formAberto && (
              <div className="fin-conta-form">
                <div className="fin-conta-form-titulo">
                  {contaEditId ? '✏️ Editar conta' : '➕ Nova conta a pagar'}
                </div>
                <form onSubmit={salvarConta}>
                  <div className="fin-conta-form-grid">
                    <div className="fin-form-group">
                      <label className="fin-form-label">Descrição *</label>
                      <input
                        className="fin-form-input"
                        type="text"
                        placeholder="Ex: Fatura de energia"
                        value={formData.descricao}
                        onChange={e => setFormData(p => ({ ...p, descricao: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="fin-form-group">
                      <label className="fin-form-label">Valor (R$) *</label>
                      <input
                        className="fin-form-input"
                        type="text"
                        placeholder="0,00"
                        value={formData.valor}
                        onChange={e => setFormData(p => ({ ...p, valor: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="fin-form-group">
                      <label className="fin-form-label">Vencimento *</label>
                      <input
                        className="fin-form-input"
                        type="date"
                        value={formData.data_vencimento}
                        onChange={e => setFormData(p => ({ ...p, data_vencimento: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                  {erroContas && <div className="fin-erro" style={{ marginTop: 10 }}>⚠️ {erroContas}</div>}
                  <div className="fin-conta-form-acoes">
                    <button type="button" className="fin-btn-cancelar-conta" onClick={cancelarForm}>
                      Cancelar
                    </button>
                    <button type="submit" className="fin-btn-gerar" disabled={salvandoConta}>
                      {salvandoConta ? '⏳…' : contaEditId ? '✓ Atualizar' : '✓ Salvar'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {erroContas && !formAberto && <div className="fin-erro">⚠️ {erroContas}</div>}

            {loadingContas ? (
              <div className="fin-loading"><div className="est-spinner" /> Carregando…</div>
            ) : (
              <div className="fin-contas-grid">
                {contas.length === 0 ? (
                  <div className="fin-vazio">
                    <span className="fin-vazio-icon">📋</span>
                    <p>Nenhuma conta encontrada</p>
                    <small>Filtro: {filtroStatus}</small>
                  </div>
                ) : (
                  contas.map(conta => (
                    <div key={conta.id} className={`fin-conta-card ${conta.status}`}>
                      <div className="fin-conta-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span className="fin-conta-descricao">{conta.descricao}</span>
                          <span className={`fin-badge-status ${conta.status}`}>{conta.status}</span>
                        </div>
                      </div>
                      <div className="fin-conta-card-body">
                        <div className="fin-conta-info-row">
                          <span className="fin-conta-info-label">Vencimento</span>
                          <span className="fin-conta-info-valor">{formatarData(conta.data_vencimento)}</span>
                        </div>
                        <div className="fin-conta-info-row">
                          <span className="fin-conta-info-label">Valor</span>
                          <span className="fin-conta-info-valor valor-grande">{fmt(conta.valor)}</span>
                        </div>
                      </div>
                      {(conta.status === 'pendente' || conta.status === 'atrasada') && (
                        <div className="fin-conta-acoes">
                          <button className="fin-conta-btn editar" onClick={() => abrirFormEditar(conta)}>✏️ Editar</button>
                          <button className="fin-conta-btn excluir" onClick={() => excluirConta(conta.id)}>🗑</button>
                          <button className="fin-conta-btn pagar" onClick={() => marcarPaga(conta.id)} disabled={salvandoConta}>
                            ✅ Pagar
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}


      </div>
    </div>
  );
}