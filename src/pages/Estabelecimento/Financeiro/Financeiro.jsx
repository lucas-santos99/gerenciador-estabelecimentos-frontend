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
    if (abaAtiva === 'contas'    && estabelecimentoId) carregarContas(filtroStatus);
    if (abaAtiva === 'historico' && estabelecimentoId) carregarHistorico();
    if (abaAtiva === 'estoque'   && estabelecimentoId) carregarEstoque();
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
            { key: 'fluxo',      label: '💰 Fluxo de Caixa' },
            { key: 'contas',     label: '📋 Contas a Pagar' },
            { key: 'relatorios', label: '📊 Relatório de Vendas' },
            { key: 'operadores', label: '👤 Por Operador' },
            { key: 'historico',  label: '🧾 Histórico' },
            { key: 'estoque',    label: '📦 Estoque' },
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
                { key: 'total_cartao',        label: '💳 Cartão' },
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

        {/* ══ ABA 3: RELATÓRIO DE PRODUTOS ══ */}
        {abaAtiva === 'relatorios' && (
          <>
            <div className="fin-section-header">
              <span className="fin-section-titulo">📊 Produtos mais vendidos</span>
              {reportProd.length > 0 && (
                <button className="fin-btn-excel" onClick={exportarRelatorioExcel}>
                  📥 Excel
                </button>
              )}
            </div>

            <form className="fin-form-filtros" onSubmit={gerarReportProdutos}>
              <div className="fin-form-group">
                <label className="fin-form-label">Data início</label>
                <input className="fin-form-input" type="date" value={reportInicio} onChange={e => setReportInicio(e.target.value)} />
              </div>
              <div className="fin-form-group">
                <label className="fin-form-label">Data fim</label>
                <input className="fin-form-input" type="date" value={reportFim} onChange={e => setReportFim(e.target.value)} />
              </div>
              <div className="fin-form-group">
                <label className="fin-form-label">Categoria</label>
                <select className="fin-form-select" value={reportCat} onChange={e => setReportCat(e.target.value)}>
                  <option value="">Todas</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <button type="submit" className="fin-btn-gerar" disabled={loadingReport}>
                {loadingReport ? '⏳ Gerando…' : '▶ Gerar'}
              </button>
            </form>

            {erroReport && <div className="fin-erro">⚠️ {erroReport}</div>}

            {loadingReport ? (
              <div className="fin-loading"><div className="est-spinner" /> Gerando…</div>
            ) : (
              <div className="fin-report-grid">
                {reportProd.length === 0 ? (
                  <div className="fin-vazio">
                    <span className="fin-vazio-icon">📊</span>
                    <p>Nenhum produto encontrado</p>
                    <small>Selecione um período e clique em Gerar</small>
                  </div>
                ) : (
                  reportProd.map((prod, i) => {
                    const lucro = parseFloat(prod.receita_total) - parseFloat(prod.custo_total || 0);
                    const margem = parseFloat(prod.receita_total) > 0
                      ? ((lucro / parseFloat(prod.receita_total)) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                      : '0,0';
                    return (
                      <div key={i} className="fin-report-card">
                        <div className="fin-report-rank">#{i + 1}</div>
                        <div className="fin-report-nome">{prod.produto_nome}</div>
                        <div className="fin-report-info">
                          <span className="fin-report-info-label">Categoria</span>
                          <span className="fin-report-info-valor">{prod.categoria_nome || 'Sem categoria'}</span>
                        </div>
                        <div className="fin-report-info">
                          <span className="fin-report-info-label">Total vendido</span>
                          <span className="fin-report-info-valor qtd">
                            {prod.unidade_medida === 'kg'
                              ? `${parseFloat(prod.total_vendido).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                              : `${Math.trunc(parseFloat(prod.total_vendido))} un`}
                          </span>
                        </div>
                        <div className="fin-report-info">
                          <span className="fin-report-info-label">Receita</span>
                          <span className="fin-report-info-valor receita">{fmt(prod.receita_total)}</span>
                        </div>
                        <div className="fin-report-info">
                          <span className="fin-report-info-label">Lucro</span>
                          <span className={`fin-report-info-valor ${lucro >= 0 ? 'receita' : 'negativo'}`}>
                            {fmt(lucro)} <span className="fin-report-margem">({margem}%)</span>
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}

        {/* ══ ABA 4: RELATÓRIO POR OPERADOR ══ */}
        {abaAtiva === 'operadores' && (
          <>
            <div className="fin-section-header">
              <span className="fin-section-titulo">👤 Vendas por Operador</span>
              {relOp.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="fin-btn-excel" onClick={exportarRelatorioOperadorExcel}>
                    📥 Excel
                  </button>
                  <button className="fin-btn-pdf" onClick={baixarPDFOperador}>
                    📄 PDF
                  </button>
                </div>
              )}
            </div>

            <form className="fin-form-filtros" onSubmit={gerarRelatorioOperador}>
              <div className="fin-form-group">
                <label className="fin-form-label">Data início</label>
                <input
                  className="fin-form-input"
                  type="date"
                  value={relOpInicio}
                  onChange={e => setRelOpInicio(e.target.value)}
                />
              </div>
              <div className="fin-form-group">
                <label className="fin-form-label">Data fim</label>
                <input
                  className="fin-form-input"
                  type="date"
                  value={relOpFim}
                  onChange={e => setRelOpFim(e.target.value)}
                />
              </div>
              <button type="submit" className="fin-btn-gerar" disabled={loadingRelOp}>
                {loadingRelOp ? '⏳ Gerando…' : '▶ Gerar'}
              </button>
            </form>

            {erroRelOp && <div className="fin-erro">⚠️ {erroRelOp}</div>}

            {loadingRelOp ? (
              <div className="fin-loading"><div className="est-spinner" /> Gerando relatório…</div>
            ) : relOp.length === 0 ? (
              <div className="fin-vazio">
                <span className="fin-vazio-icon">👤</span>
                <p>Nenhuma venda encontrada</p>
                <small>Selecione um período e clique em Gerar</small>
              </div>
            ) : (
              <>
                {/* ── Cards de totais gerais ── */}
                {(() => {
                  const totalGeral   = relOp.reduce((s, op) => s + op.total_vendas, 0);
                  const totalVendas  = relOp.reduce((s, op) => s + op.qtd_vendas, 0);
                  const ticketMedio  = totalVendas > 0 ? totalGeral / totalVendas : 0;
                  return (
                    <div className="fin-resumo-grid" style={{ marginBottom: 24 }}>
                      <div className="fin-resumo-card destaque">
                        <span className="fin-resumo-card-titulo">Total do Período</span>
                        <span className="fin-resumo-card-valor">{fmt(totalGeral)}</span>
                      </div>
                      <div className="fin-resumo-card">
                        <span className="fin-resumo-card-titulo">Qtd Vendas</span>
                        <span className="fin-resumo-card-valor">{totalVendas}</span>
                      </div>
                      <div className="fin-resumo-card">
                        <span className="fin-resumo-card-titulo">Média por Venda</span>
                        <span className="fin-resumo-card-valor">{fmt(ticketMedio)}</span>
                      </div>
                      <div className="fin-resumo-card">
                        <span className="fin-resumo-card-titulo">Operadores ativos</span>
                        <span className="fin-resumo-card-valor">{relOp.length}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Cards por operador ── */}
                <div className="fin-relop-grid">
                  {relOp.map((op, i) => {
                    const totalGeral  = relOp.reduce((s, o) => s + o.total_vendas, 0);
                    const pct         = totalGeral > 0 ? (op.total_vendas / totalGeral) * 100 : 0;
                    const ticketMedio = op.qtd_vendas > 0 ? op.total_vendas / op.qtd_vendas : 0;

                    return (
                      <div key={op.operador_id || i} className="fin-relop-card">

                        {/* Rank + nome */}
                        <div className="fin-relop-header">
                          <span className="fin-relop-rank">#{i + 1}</span>
                          <span className="fin-relop-nome">{op.operador_nome}</span>
                          <span className="fin-relop-pct">{pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                        </div>

                        {/* Barra de progresso */}
                        <div className="fin-relop-barra-bg">
                          <div
                            className="fin-relop-barra-fill"
                            style={{ width: `${pct}%` }}
                          />
                        </div>

                        {/* Total em destaque */}
                        <div className="fin-relop-total">{fmt(op.total_vendas)}</div>

                        {/* Métricas */}
                        <div className="fin-relop-metricas">
                          <div className="fin-relop-metrica">
                            <span className="fin-relop-metrica-label">Qtd Vendas</span>
                            <span className="fin-relop-metrica-valor">{op.qtd_vendas}</span>
                          </div>
                          <div className="fin-relop-metrica">
                            <span className="fin-relop-metrica-label">MÉdia por Venda</span>
                            <span className="fin-relop-metrica-valor">{fmt(ticketMedio)}</span>
                          </div>
                        </div>

                        {/* Breakdown por meio de pagamento */}
                        <div className="fin-relop-meios">
                          {op.total_dinheiro > 0 && (
                            <div className="fin-relop-meio dinheiro">
                              <span>💵 Dinheiro</span>
                              <span>{fmt(op.total_dinheiro)}</span>
                            </div>
                          )}
                          {op.total_pix > 0 && (
                            <div className="fin-relop-meio pix">
                              <span>📱 Pix</span>
                              <span>{fmt(op.total_pix)}</span>
                            </div>
                          )}
                          {op.total_cartao > 0 && (
                            <div className="fin-relop-meio cartao">
                              <span>💳 Cartão</span>
                              <span>{fmt(op.total_cartao)}</span>
                            </div>
                          )}
                          {op.total_fiado > 0 && (
                            <div className="fin-relop-meio fiado">
                              <span>📋 Fiado</span>
                              <span>{fmt(op.total_fiado)}</span>
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ══ ABA 5: HISTÓRICO DE VENDAS ══ */}
        {abaAtiva === 'historico' && (
          <>
            <div className="fin-section-header">
              <span className="fin-section-titulo">🧾 Histórico de Vendas</span>
            </div>

            <form className="fin-form-filtros" onSubmit={e => { e.preventDefault(); carregarHistorico(); }}>
              <div className="fin-form-group">
                <label className="fin-form-label">Data início</label>
                <input className="fin-form-input" type="date" value={histInicio} onChange={e => setHistInicio(e.target.value)} />
              </div>
              <div className="fin-form-group">
                <label className="fin-form-label">Data fim</label>
                <input className="fin-form-input" type="date" value={histFim} onChange={e => setHistFim(e.target.value)} />
              </div>
              <button type="submit" className="fin-btn-gerar" disabled={loadingHistorico}>
                {loadingHistorico ? '⏳…' : '▶ Buscar'}
              </button>
            </form>

            {erroHistorico && <div className="fin-erro">⚠️ {erroHistorico}</div>}

            {loadingHistorico ? (
              <div className="fin-loading"><div className="est-spinner" /> Carregando…</div>
            ) : (
              <div className="fin-historico-lista">
                {historico.length === 0 ? (
                  <div className="fin-vazio">
                    <span className="fin-vazio-icon">🧾</span>
                    <p>Nenhuma venda encontrada</p>
                    <small>Selecione um período e clique em Buscar</small>
                  </div>
                ) : (
                  historico.map(venda => (
                    <div key={venda.id} className="fin-historico-card">
                      <div className="fin-historico-header" onClick={() => setVendaDetalhes(vendaDetalhes?.id === venda.id ? null : venda)}>
                        <div className="fin-historico-info">
                          <span className="fin-historico-data">{new Date(venda.data_venda).toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          <span className={`fin-badge-meio ${venda.meio_pagamento?.toLowerCase()}`}>{venda.meio_pagamento}</span>
                          {venda.cliente_nome && <span className="fin-historico-cliente">👤 {venda.cliente_nome}</span>}
                        </div>
                        <div className="fin-historico-valor">{fmt(venda.valor_total)}</div>
                      </div>
                      {vendaDetalhes?.id === venda.id && venda.itens?.length > 0 && (
                        <div className="fin-historico-itens">
                          {venda.itens.map((item, i) => {
                            const unidade = item.unidade_medida || 'un';
                            const qtd = parseFloat(item.quantidade);
                            const qtdLabel = unidade === 'kg'
                              ? `${qtd.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                              : `${Math.trunc(qtd)}×`;
                            return (
                              <div key={i} className="fin-historico-item">
                                <span className="fin-hist-item-nome">{item.produto_nome}</span>
                                <span className="fin-hist-item-qtd">{qtdLabel}</span>
                                <span className="fin-hist-item-val">{fmt(item.preco_unitario)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* ══ ABA 6: ESTOQUE ══ */}
        {abaAtiva === 'estoque' && (
          <>
            <div className="fin-section-header">
              <span className="fin-section-titulo">📦 Relatório de Estoque</span>
              {estoque.length > 0 && (
                <button className="fin-btn-excel" onClick={exportarEstoqueExcel}>📥 Excel</button>
              )}
            </div>

            {/* Cards de resumo */}
            <div className="fin-estoque-resumo">
              <div className="fin-estoque-resumo-card">
                <span className="fin-estoque-resumo-label">Valor em Custo</span>
                <span className="fin-estoque-resumo-valor">{fmt(totalEstoqueCusto)}</span>
              </div>
              <div className="fin-estoque-resumo-card destaque">
                <span className="fin-estoque-resumo-label">Valor em Venda</span>
                <span className="fin-estoque-resumo-valor">{fmt(totalEstoqueVenda)}</span>
              </div>
              <div className="fin-estoque-resumo-card alerta">
                <span className="fin-estoque-resumo-label">⚠️ Estoque Baixo</span>
                <span className="fin-estoque-resumo-valor">{qtdBaixo} produtos</span>
              </div>
              <div className="fin-estoque-resumo-card critico">
                <span className="fin-estoque-resumo-label">🔴 Estoque Crítico</span>
                <span className="fin-estoque-resumo-valor">{qtdCritico} produtos</span>
              </div>
            </div>

            {/* Filtros */}
            <div className="fin-filtro-btns" style={{ marginBottom: 16 }}>
              {[
                { key: 'todos',   label: `Todos (${estoque.length})` },
                { key: 'critico', label: `🔴 Crítico (${qtdCritico})` },
                { key: 'baixo',   label: `⚠️ Baixo (${qtdBaixo})` },
                { key: 'ok',      label: `✅ Normal (${estoque.length - qtdCritico - qtdBaixo})` },
              ].map(f => (
                <button
                  key={f.key}
                  className={`fin-filtro-btn${filtrEstoque === f.key ? ' ativo' : ''}`}
                  onClick={() => setFiltrEstoque(f.key)}
                >{f.label}</button>
              ))}
            </div>

            {erroEstoque && <div className="fin-erro">⚠️ {erroEstoque}</div>}

            {loadingEstoque ? (
              <div className="fin-loading"><div className="est-spinner" /> Carregando…</div>
            ) : (
              <div className="fin-estoque-grid">
                {estoqueFiltrado.length === 0 ? (
                  <div className="fin-vazio">
                    <span className="fin-vazio-icon">📦</span>
                    <p>Nenhum produto encontrado</p>
                  </div>
                ) : (
                  estoqueFiltrado.map(p => {
                    const status = estoqueStatus(p);
                    const estAtual = parseFloat(p.estoque_atual);
                    const unidade = p.unidade_medida === 'kg'
                      ? `${estAtual.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                      : `${Math.trunc(estAtual)} un`;
                    return (
                      <div key={p.id} className={`fin-estoque-card ${status}`}>
                        <div className={`fin-estoque-badge ${status}`}>
                          {status === 'critico' ? '🔴 Crítico' : status === 'baixo' ? '⚠️ Baixo' : '✅ Normal'}
                        </div>
                        <div className="fin-estoque-nome">{p.nome}</div>
                        <div className="fin-estoque-cat">{p.nome_categoria || 'Sem categoria'}</div>
                        <div className="fin-estoque-info-row">
                          <span className="fin-estoque-info-label">Estoque</span>
                          <span className="fin-estoque-info-valor">{unidade}</span>
                        </div>
                        <div className="fin-estoque-info-row">
                          <span className="fin-estoque-info-label">Mínimo</span>
                          <span className="fin-estoque-info-valor">{p.estoque_minimo} {p.unidade_medida}</span>
                        </div>
                        <div className="fin-estoque-info-row">
                          <span className="fin-estoque-info-label">Venda</span>
                          <span className="fin-estoque-info-valor accent">{fmt(p.preco_venda)}</span>
                        </div>
                        <div className="fin-estoque-info-row">
                          <span className="fin-estoque-info-label">Total estoque</span>
                          <span className="fin-estoque-info-valor">{fmt(parseFloat(p.preco_venda) * estAtual)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}