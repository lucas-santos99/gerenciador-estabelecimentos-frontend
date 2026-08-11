// src/pages/Estabelecimento/Relatorios/Relatorios.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './Relatorios.css';

/* ── helpers ─────────────────────────────────────────────── */
const fmt = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
function formatarData(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); }
  catch { return '—'; }
}

// Ícone de "sem imagem" — SVG em vez de emoji, mesmo padrão já usado no
// Estoque (ProdutoList.jsx), pra não depender da fonte de emoji do sistema
function IconePacote({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function Relatorios({ estabelecimentoId, nomeEstabelecimento, logoUrl }) {

  const [abaAtiva, setAbaAtiva] = useState('historico');
  const [categorias, setCategorias] = useState([]);
  const [imagemExpandida, setImagemExpandida] = useState(null); // url da imagem em tela cheia, ou null
  const [fontScale, setFontScale] = useState(() => {
    const s = localStorage.getItem('rel-font-scale');
    return s ? parseFloat(s) : 1;
  });

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('rel-font-scale', next);
      return next;
    });
  }

  /* ── Histórico (agora com filtro por operador embutido) ── */
  const [historico, setHistorico] = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');
  const [histInicio, setHistInicio] = useState(dataHoje());
  const [histFim, setHistFim] = useState(dataHoje());
  const [histOperador, setHistOperador] = useState(''); // '' = todos, 'merchant' = admin, ou o id do operador
  const [histStatus, setHistStatus] = useState(''); // '' = todas, 'ativa', 'cancelada'
  const [histCliente, setHistCliente] = useState(''); // '' = todos, ou o id do cliente
  const [vendaDetalhes, setVendaDetalhes] = useState(null);
  const [cancelandoVendaId, setCancelandoVendaId] = useState(null);

  /* ── Relatório Produtos ── */
  const [reportProd, setReportProd] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [erroReport, setErroReport] = useState('');
  const [reportInicio, setReportInicio] = useState(dataHoje());
  const [reportFim, setReportFim] = useState(dataHoje());
  const [reportCat, setReportCat] = useState('');

  /* ── Estoque ── */
  const [estoque, setEstoque] = useState([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [erroEstoque, setErroEstoque] = useState('');
  const [filtrEstoque,    setFiltrEstoque]    = useState('todos');
  const [filtrCategoria,  setFiltrCategoria]  = useState('');

  /* ── Carga inicial ── */
  useEffect(() => {
    apiFetch('/api/categorias')
      .then(r => r.ok ? r.json() : []).then(setCategorias).catch(() => {});
  }, []);

  useEffect(() => {
    if (abaAtiva === 'historico' && estabelecimentoId) carregarHistorico();
    if (abaAtiva === 'estoque'   && estabelecimentoId) carregarEstoque();
  }, [abaAtiva, estabelecimentoId]);

  /* ── Histórico ── */
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

  async function cancelarVenda(venda) {
    const motivo = window.prompt(
      `Cancelar a venda de ${fmt(venda.valor_total)} (${venda.meio_pagamento})?\n\nIsso vai devolver os itens pro estoque e estornar o pagamento (caixa ou dívida de fiado).\n\nMotivo (opcional):`
    );
    if (motivo === null) return; // clicou em Cancelar do prompt, desiste
    setCancelandoVendaId(venda.id);
    try {
      const resp = await apiFetch(`/api/vendas/${venda.id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo || null }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao cancelar venda.');
      carregarHistorico();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelandoVendaId(null);
    }
  }

  // Lista de operadores que aparecem nesse período (pra popular o
  // seletor) — derivada do próprio histórico, sem precisar de outra
  // chamada ao servidor. "merchant" = vendas feitas pelo administrador.
  const operadoresNoPeriodo = [...new Map(
    historico.map(v => [v.operador_id || 'merchant', { id: v.operador_id || 'merchant', nome: v.operador_nome }])
  ).values()].sort((a, b) => a.nome.localeCompare(b.nome));

  // Mesma ideia, agora pra clientes — só entra quem realmente foi
  // identificado em alguma venda do período (nem toda venda tem cliente)
  const clientesNoPeriodo = [...new Map(
    historico.filter(v => v.cliente_id).map(v => [v.cliente_id, { id: v.cliente_id, nome: v.cliente_nome }])
  ).values()].sort((a, b) => a.nome.localeCompare(b.nome));

  const historicoFiltrado = historico
    .filter(v => !histOperador || (histOperador === 'merchant' ? !v.operador_id : v.operador_id === histOperador))
    .filter(v => !histStatus || (histStatus === 'ativa' ? v.status !== 'cancelada' : v.status === 'cancelada'))
    .filter(v => !histCliente || v.cliente_id === histCliente);

  // Resumo por operador — só faz sentido mostrar quando "Todos" está
  // selecionado (com 1 operador só, vira redundante com a lista de baixo)
  const resumoPorOperador = (() => {
    const mapa = {};
    historico.filter(v => v.status !== 'cancelada').forEach(v => {
      const chave = v.operador_id || 'merchant';
      if (!mapa[chave]) {
        mapa[chave] = {
          operador_id: chave, operador_nome: v.operador_nome,
          qtd_vendas: 0, total_vendas: 0,
          total_dinheiro: 0, total_pix: 0, total_cartao: 0, total_fiado: 0,
        };
      }
      const r = mapa[chave];
      const valor = parseFloat(v.valor_total) || 0;
      const meio = (v.meio_pagamento || '').toLowerCase();
      r.qtd_vendas += 1;
      r.total_vendas += valor;
      if (meio === 'dinheiro') r.total_dinheiro += valor;
      else if (meio === 'pix') r.total_pix += valor;
      else if (meio === 'debito' || meio === 'credito') r.total_cartao += valor;
      else if (meio === 'fiado') r.total_fiado += valor;
    });
    return Object.values(mapa).sort((a, b) => b.total_vendas - a.total_vendas);
  })();

  /* ── Exportação do Histórico (lista individual, respeita os filtros) ── */
  function exportarHistoricoExcel() {
    if (!historicoFiltrado.length) return;
    const dados = historicoFiltrado.map(v => ({
      'Data':        new Date(v.data_venda).toLocaleString('pt-BR'),
      'Operador':    v.operador_nome,
      'Cliente':     v.cliente_nome || '',
      'Meio Pagto':  v.meio_pagamento,
      'Valor (R$)':  parseFloat(v.valor_total),
      'Itens':       (v.itens || []).map(i => `${i.produto_nome} (${i.quantidade})`).join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico de Vendas');
    XLSX.writeFile(wb, `Historico_Vendas_${histInicio}_${histFim}.xlsx`);
  }

  function baixarPDFHistorico() {
    if (!historicoFiltrado.length) return;

    const operadorLabel = histOperador
      ? (operadoresNoPeriodo.find(o => o.id === histOperador)?.nome || '')
      : 'Todos os operadores';
    const totalGeral = historicoFiltrado.filter(v => v.status !== 'cancelada').reduce((s, v) => s + (parseFloat(v.valor_total) || 0), 0);

    const linhasHtml = historicoFiltrado.map(v => {
      const itensHtml = (v.itens && v.itens.length > 0)
        ? v.itens.map(item => {
            const unidade = item.unidade_medida || 'un';
            const qtdLabel = unidade === 'kg'
              ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
              : `${parseFloat(item.quantidade).toFixed(0)}×`;
            return `<div class="hp-item"><span>${qtdLabel} ${item.produto_nome}${item.produto_marca ? ` · ${item.produto_marca}` : ''}</span><span>${fmt(item.quantidade * item.preco_unitario)}</span></div>`;
          }).join('')
        : '<div class="hp-item"><span>—</span><span></span></div>';

      return `
        <tr class="hp-venda-row">
          <td>${new Date(v.data_venda).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${v.operador_nome || ''}</td>
          <td>${v.cliente_nome || '—'}</td>
          <td>${v.meio_pagamento}</td>
          <td>${v.status === 'cancelada' ? 'Cancelada' : 'Ativa'}</td>
          <td class="hp-valor">${fmt(v.valor_total)}</td>
        </tr>
        <tr class="hp-itens-row"><td colspan="6">${itensHtml}</td></tr>
      `;
    }).join('');

    const alturaJanela = Math.round((window.screen?.availHeight || 900) * 0.92);
    const janela = window.open('', '_blank', `width=860,height=${alturaJanela},top=20,left=100`);
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Histórico de Vendas</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; padding: 12px; }
            .hp-header { text-align: center; margin-bottom: 18px; }
            .hp-logo { max-width: 90px; max-height: 90px; margin: 0 auto 8px; display: block; }
            .hp-nome { font-size: 20px; font-weight: 800; }
            .hp-sub { font-size: 14px; color: #0d9488; margin-top: 2px; }
            .hp-periodo { font-size: 11px; color: #64748b; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            thead th { background: #0f766e; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; }
            .hp-venda-row td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
            .hp-valor { font-weight: 700; text-align: right; }
            .hp-itens-row td { padding: 4px 10px 10px 24px; border-bottom: 2px solid #e2e8f0; }
            .hp-item { display: flex; justify-content: space-between; font-size: 11px; color: #475569; padding: 2px 0; }
            .hp-total { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; font-size: 14px; font-weight: 800; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="hp-header">
            ${logoUrl ? `<img class="hp-logo" src="${logoUrl}" />` : ''}
            <div class="hp-nome">${nomeEstabelecimento || ''}</div>
            <div class="hp-sub">Histórico de Vendas</div>
            <div class="hp-periodo">Período: ${formatarData(histInicio)} a ${formatarData(histFim)} — ${operadorLabel}</div>
          </div>
          <table>
            <thead><tr><th>Data</th><th>Operador</th><th>Cliente</th><th>Pagamento</th><th>Status</th><th>Valor</th></tr></thead>
            <tbody>${linhasHtml}</tbody>
          </table>
          <div class="hp-total"><span>TOTAL (ativas)</span><span>${fmt(totalGeral)}</span></div>
        </body>
      </html>
    `);
    janela.document.close();
    setTimeout(() => { janela.print(); }, 300);
  }

  /* ── Relatório Produtos ── */
  async function gerarReportProdutos(e) {
    e.preventDefault();
    setLoadingReport(true); setErroReport(''); setReportProd([]);
    try {
      const params = new URLSearchParams({ data_inicio: reportInicio, data_fim: reportFim });
      if (reportCat) params.append('categoria_id', reportCat);
      const resp = await apiFetch(`/api/financeiro/relatorio_produtos?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro');
      setReportProd(data);
    } catch (err) { setErroReport(err.message); }
    finally { setLoadingReport(false); }
  }

  function exportarRelatorioExcel() {
    if (!reportProd.length) return;
    const dados = reportProd.map((p, i) => ({
      '#': i + 1, 'Produto': p.produto_nome, 'Categoria': p.categoria_nome || 'Sem categoria',
      'Unidade': p.unidade_medida, 'Total Vendido': parseFloat(p.total_vendido),
      'Receita (R$)': parseFloat(p.receita_total), 'Custo (R$)': parseFloat(p.custo_total || 0),
      'Lucro (R$)': parseFloat(p.receita_total) - parseFloat(p.custo_total || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produtos Vendidos');
    XLSX.writeFile(wb, `Produtos_${reportInicio}_${reportFim}.xlsx`);
  }

  function baixarPDFProdutos() {
    if (!reportProd.length) return;
    const doc = new jsPDF();
    const gerar = (y) => {
      doc.setFontSize(16); doc.setFont(undefined, 'bold');
      doc.text(nomeEstabelecimento || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
      doc.text('Produtos Mais Vendidos', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Período: ${formatarData(reportInicio)} a ${formatarData(reportFim)}`, 105, y + 13, { align: 'center' });
      const body = reportProd.map((p, i) => {
        const lucro = parseFloat(p.receita_total) - parseFloat(p.custo_total || 0);
        return [`#${i + 1}`, p.produto_nome, p.categoria_nome || '—', fmt(p.receita_total), fmt(lucro)];
      });
      autoTable(doc, {
        startY: y + 20,
        head: [['#', 'Produto', 'Categoria', 'Receita', 'Lucro']],
        body, theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      });
      doc.save(`Produtos_${nomeEstabelecimento || 'relatorio'}_${reportInicio}_a_${reportFim}.pdf`);
    };
    if (logoUrl) {
      const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = logoUrl;
      img.onload = () => { const r = img.width / img.height; doc.addImage(img, 'PNG', 15, 10, 25, 25 / r); gerar(25 / r + 15); };
      img.onerror = () => gerar(15);
    } else { gerar(15); }
  }

  /* ── Resumo por Operador (agora derivado do histórico, exibido
     dentro da própria aba de Histórico quando "Todos" está selecionado) ── */
  function exportarResumoOperadorExcel() {
    if (!resumoPorOperador.length) return;
    const totalGeral = resumoPorOperador.reduce((s, op) => s + op.total_vendas, 0);
    const dados = resumoPorOperador.map((op, i) => ({
      '#': i + 1, 'Operador': op.operador_nome, 'Qtd Vendas': op.qtd_vendas,
      'Total (R$)': parseFloat(op.total_vendas.toFixed(2)),
      '% do Total': totalGeral > 0 ? parseFloat(((op.total_vendas / totalGeral) * 100).toFixed(1)) : 0,
      'Dinheiro (R$)': parseFloat(op.total_dinheiro.toFixed(2)),
      'Pix (R$)': parseFloat(op.total_pix.toFixed(2)),
      'Cartão (R$)': parseFloat(op.total_cartao.toFixed(2)),
      'Fiado (R$)': parseFloat(op.total_fiado.toFixed(2)),
      'Média por Venda': op.qtd_vendas > 0 ? parseFloat((op.total_vendas / op.qtd_vendas).toFixed(2)) : 0,
    }));
    dados.push({
      '#': '', 'Operador': 'TOTAL', 'Qtd Vendas': resumoPorOperador.reduce((s, op) => s + op.qtd_vendas, 0),
      'Total (R$)': parseFloat(totalGeral.toFixed(2)), '% do Total': 100,
      'Dinheiro (R$)': parseFloat(resumoPorOperador.reduce((s, op) => s + op.total_dinheiro, 0).toFixed(2)),
      'Pix (R$)': parseFloat(resumoPorOperador.reduce((s, op) => s + op.total_pix, 0).toFixed(2)),
      'Cartão (R$)': parseFloat(resumoPorOperador.reduce((s, op) => s + op.total_cartao, 0).toFixed(2)),
      'Fiado (R$)': parseFloat(resumoPorOperador.reduce((s, op) => s + op.total_fiado, 0).toFixed(2)),
      'Média por Venda': '',
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas por Operador');
    XLSX.writeFile(wb, `Vendas_Operador_${histInicio}_${histFim}.xlsx`);
  }

  function baixarPDFResumoOperador() {
    if (!resumoPorOperador.length) return;
    const doc = new jsPDF();
    const totalGeral = resumoPorOperador.reduce((s, op) => s + op.total_vendas, 0);
    const gerar = (y) => {
      doc.setFontSize(16); doc.setFont(undefined, 'bold');
      doc.text(nomeEstabelecimento || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
      doc.text('Relatório de Vendas por Operador', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Período: ${formatarData(histInicio)} a ${formatarData(histFim)}`, 105, y + 13, { align: 'center' });
      const body = resumoPorOperador.map((op, i) => [
        `#${i + 1}`, op.operador_nome, op.qtd_vendas, fmt(op.total_vendas),
        totalGeral > 0 ? `${((op.total_vendas / totalGeral) * 100).toFixed(1)}%` : '0%',
        fmt(op.total_dinheiro), fmt(op.total_pix), fmt(op.total_cartao),
      ]);
      body.push(['', 'TOTAL', resumoPorOperador.reduce((s, op) => s + op.qtd_vendas, 0), fmt(totalGeral), '100%',
        fmt(resumoPorOperador.reduce((s, op) => s + op.total_dinheiro, 0)),
        fmt(resumoPorOperador.reduce((s, op) => s + op.total_pix, 0)),
        fmt(resumoPorOperador.reduce((s, op) => s + op.total_cartao, 0))]);
      autoTable(doc, {
        startY: y + 20,
        head: [['', 'Operador', 'Vendas', 'Total', '%', 'Dinheiro', 'Pix', 'Cartão']],
        body, theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      });
      doc.save(`Vendas_Operador_${nomeEstabelecimento || 'relatorio'}_${histInicio}_a_${histFim}.pdf`);
    };
    if (logoUrl) {
      const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = logoUrl;
      img.onload = () => { const r = img.width / img.height; doc.addImage(img, 'PNG', 15, 10, 25, 25 / r); gerar(25 / r + 15); };
      img.onerror = () => gerar(15);
    } else { gerar(15); }
  }

  /* ── Estoque ── */
  async function carregarEstoque() {
    setLoadingEstoque(true); setErroEstoque('');
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos`);
      if (!resp.ok) throw new Error(`Erro ${resp.status}`);
      setEstoque(await resp.json());
    } catch (err) { setErroEstoque(err.message); }
    finally { setLoadingEstoque(false); }
  }

  function estoqueStatus(p) {
    const e = parseFloat(p.estoque_atual), m = parseFloat(p.estoque_minimo);
    if (e <= 0) return 'critico';
    if (e <= m) return 'baixo';
    return 'ok';
  }

  const estoqueFiltrado = estoque.filter(p =>
    (filtrEstoque === 'todos' || estoqueStatus(p) === filtrEstoque) &&
    (filtrCategoria === '' || (p.categoria_id === filtrCategoria || p.nome_categoria === filtrCategoria))
  );
  const totalEstoqueCusto = estoque.reduce((s, p) => s + parseFloat(p.preco_custo || 0) * parseFloat(p.estoque_atual || 0), 0);
  const totalEstoqueVenda = estoque.reduce((s, p) => s + parseFloat(p.preco_venda || 0) * parseFloat(p.estoque_atual || 0), 0);
  const qtdCritico = estoque.filter(p => estoqueStatus(p) === 'critico').length;
  const qtdBaixo   = estoque.filter(p => estoqueStatus(p) === 'baixo').length;

  function exportarEstoqueExcel() {
    if (!estoqueFiltrado.length) return;
    const catLabel = filtrCategoria
      ? (categorias.find(c => c.id === filtrCategoria)?.nome || filtrCategoria)
      : 'Todas';
    const dados = estoqueFiltrado.map(p => ({
      'Produto': p.nome, 'Marca': p.marca || '', 'Categoria': p.nome_categoria || 'Sem categoria',
      'Unidade': p.unidade_medida, 'Estoque Atual': parseFloat(p.estoque_atual),
      'Estoque Mín.': parseFloat(p.estoque_minimo), 'Status': estoqueStatus(p),
      'Custo Unit.': parseFloat(p.preco_custo || 0), 'Venda Unit.': parseFloat(p.preco_venda || 0),
      'Total Custo': parseFloat(p.preco_custo || 0) * parseFloat(p.estoque_atual || 0),
      'Total Venda': parseFloat(p.preco_venda || 0) * parseFloat(p.estoque_atual || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    const sufixo = filtrCategoria ? `_${catLabel}` : '';
    const sufixoStatus = filtrEstoque !== 'todos' ? `_${filtrEstoque}` : '';
    XLSX.writeFile(wb, `Estoque${sufixo}${sufixoStatus}_${dataHoje()}.xlsx`);
  }

  function baixarPDFEstoque() {
    if (!estoqueFiltrado.length) return;
    const doc = new jsPDF();
    const gerar = (y) => {
      doc.setFontSize(16); doc.setFont(undefined, 'bold');
      doc.text(nomeEstabelecimento || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
      doc.text('Relatório de Estoque', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Gerado em ${formatarData(dataHoje())}`, 105, y + 13, { align: 'center' });
      const body = estoqueFiltrado.map(p => {
        const estAtual = parseFloat(p.estoque_atual);
        const unidade = p.unidade_medida === 'kg'
          ? `${estAtual.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
          : `${Math.trunc(estAtual)} un`;
        const status = estoqueStatus(p);
        return [
          p.nome, p.nome_categoria || '—', unidade,
          status === 'critico' ? 'Crítico' : status === 'baixo' ? 'Baixo' : 'Normal',
          fmt(p.preco_venda), fmt(parseFloat(p.preco_venda || 0) * estAtual),
        ];
      });
      autoTable(doc, {
        startY: y + 20,
        head: [['Produto', 'Categoria', 'Estoque', 'Status', 'Venda Unit.', 'Total']],
        body, theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      });
      doc.save(`Estoque_${nomeEstabelecimento || 'relatorio'}_${dataHoje()}.pdf`);
    };
    if (logoUrl) {
      const img = new Image(); img.crossOrigin = 'Anonymous'; img.src = logoUrl;
      img.onload = () => { const r = img.width / img.height; doc.addImage(img, 'PNG', 15, 10, 25, 25 / r); gerar(25 / r + 15); };
      img.onerror = () => gerar(15);
    } else { gerar(15); }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="rel-container" style={{ '--rel-font-scale': fontScale }}>

      {/* ── Header ── */}
      <div className="rel-header">
        <div className="rel-header-info">
          <h2 className="rel-titulo">📊 Relatórios</h2>
          <span className="rel-subtitulo">Vendas, estoque e desempenho da equipe</span>
        </div>
      </div>

      {/* ── Abas + zoom ── */}
      <div className="rel-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="fin-tabs-nav" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { key: 'historico',  label: '🧾 Histórico de Vendas' },
            { key: 'produtos',   label: '📊 Produtos Vendidos' },
            { key: 'estoque',    label: '📦 Estoque' },
          ].map(t => (
            <button
              key={t.key}
              className={`rel-tab${abaAtiva === t.key ? ' ativo' : ''}`}
              onClick={() => setAbaAtiva(t.key)}
            >{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button className="fin-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
          <button className="fin-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.6} title="Aumentar fonte">A+</button>
        </div>
      </div>

      {/* ══ ABA: HISTÓRICO DE VENDAS (com filtro por operador embutido) ══ */}
      {abaAtiva === 'historico' && (
        <div className="rel-body">
          <div className="fin-section-header">
            <span className="fin-section-titulo">🧾 Histórico de Vendas</span>
            {historicoFiltrado.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fin-btn-excel" onClick={exportarHistoricoExcel}>📥 Excel</button>
                <button className="fin-btn-pdf" onClick={baixarPDFHistorico}>📄 PDF</button>
              </div>
            )}
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
            <div className="fin-form-group">
              <label className="fin-form-label">Operador</label>
              <select className="fin-form-select" value={histOperador} onChange={e => setHistOperador(e.target.value)}>
                <option value="">Todos</option>
                {operadoresNoPeriodo.map(op => (
                  <option key={op.id} value={op.id}>{op.id === 'merchant' ? `${op.nome} (admin)` : op.nome}</option>
                ))}
              </select>
            </div>
            <div className="fin-form-group">
              <label className="fin-form-label">Cliente</label>
              <select className="fin-form-select" value={histCliente} onChange={e => setHistCliente(e.target.value)}>
                <option value="">Todos</option>
                {clientesNoPeriodo.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="fin-form-group">
              <label className="fin-form-label">Status</label>
              <select className="fin-form-select" value={histStatus} onChange={e => setHistStatus(e.target.value)}>
                <option value="">Todas</option>
                <option value="ativa">Só ativas</option>
                <option value="cancelada">Só canceladas</option>
              </select>
            </div>
            <button type="submit" className="fin-btn-gerar" disabled={loadingHistorico}>
              {loadingHistorico ? '⏳…' : '▶ Buscar'}
            </button>
          </form>
          {erroHistorico && <div className="fin-erro">⚠️ {erroHistorico}</div>}
          {loadingHistorico ? (
            <div className="fin-loading"><div className="est-spinner" /> Carregando…</div>
          ) : (
            <>
              {/* Resumo comparativo entre operadores — só aparece com "Todos"
                  selecionado e mais de um operador tendo vendido no período */}
              {!histOperador && histStatus !== 'cancelada' && resumoPorOperador.length > 1 && (
                <>
                  <div className="fin-section-header" style={{ marginTop: 4 }}>
                    <span className="fin-section-titulo" style={{ fontSize: '0.85rem' }}>👤 Resumo por operador</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="fin-btn-excel" onClick={exportarResumoOperadorExcel}>📥 Excel</button>
                      <button className="fin-btn-pdf" onClick={baixarPDFResumoOperador}>📄 PDF</button>
                    </div>
                  </div>
                  <div className="fin-relop-grid" style={{ marginBottom: 24 }}>
                    {resumoPorOperador.map((op, i) => {
                      const totalGeral = resumoPorOperador.reduce((s, o) => s + o.total_vendas, 0);
                      const pct = totalGeral > 0 ? (op.total_vendas / totalGeral) * 100 : 0;
                      const media = op.qtd_vendas > 0 ? op.total_vendas / op.qtd_vendas : 0;
                      return (
                        <div key={op.operador_id} className="fin-relop-card" onClick={() => setHistOperador(op.operador_id)} style={{ cursor: 'pointer' }} title="Ver só as vendas desse operador">
                          <div className="fin-relop-header">
                            <span className="fin-relop-rank">#{i + 1}</span>
                            <span className="fin-relop-nome">{op.operador_nome}</span>
                            <span className="fin-relop-pct">{pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
                          </div>
                          <div className="fin-relop-barra-bg">
                            <div className="fin-relop-barra-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="fin-relop-total">{fmt(op.total_vendas)}</div>
                          <div className="fin-relop-metricas">
                            <div className="fin-relop-metrica">
                              <span className="fin-relop-metrica-label">Qtd Vendas</span>
                              <span className="fin-relop-metrica-valor">{op.qtd_vendas}</span>
                            </div>
                            <div className="fin-relop-metrica">
                              <span className="fin-relop-metrica-label">Média por Venda</span>
                              <span className="fin-relop-metrica-valor">{fmt(media)}</span>
                            </div>
                          </div>
                          <div className="fin-relop-meios">
                            {op.total_dinheiro > 0 && <div className="fin-relop-meio dinheiro"><span>💵 Dinheiro</span><span>{fmt(op.total_dinheiro)}</span></div>}
                            {op.total_pix > 0      && <div className="fin-relop-meio pix"><span>📱 Pix</span><span>{fmt(op.total_pix)}</span></div>}
                            {op.total_cartao > 0   && <div className="fin-relop-meio cartao"><span>💳 Cartão</span><span>{fmt(op.total_cartao)}</span></div>}
                            {op.total_fiado > 0    && <div className="fin-relop-meio fiado"><span>📋 Fiado</span><span>{fmt(op.total_fiado)}</span></div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="fin-historico-lista">
                {historicoFiltrado.length === 0 ? (
                  <div className="fin-vazio">
                    <span className="fin-vazio-icon">🧾</span>
                    <p>Nenhuma venda encontrada</p>
                    <small>Selecione um período e clique em Buscar</small>
                  </div>
                ) : historicoFiltrado.map(venda => (
                  <div key={venda.id} className={`fin-historico-card${venda.status === 'cancelada' ? ' cancelada' : ''}`}>
                    <div className="fin-historico-header" onClick={() => setVendaDetalhes(vendaDetalhes?.id === venda.id ? null : venda)}>
                      <div className="fin-historico-info">
                        <span className="fin-historico-data">
                          {new Date(venda.data_venda).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className={`fin-badge-meio ${venda.meio_pagamento?.toLowerCase()}`}>{venda.meio_pagamento}</span>
                        {venda.cliente_nome && <span className="fin-historico-cliente">👤 {venda.cliente_nome}</span>}
                        {venda.operador_nome && (
                          <span className="fin-historico-operador">🧑‍💼 {venda.operador_nome}</span>
                        )}
                        {venda.status === 'cancelada' && (
                          <span className="fin-historico-cancelada-badge">✕ Cancelada</span>
                        )}
                        {venda.status === 'cancelada' && venda.motivo_cancelamento && (
                          <span className="fin-historico-motivo">— {venda.motivo_cancelamento}</span>
                        )}
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
                              <span className="fin-hist-item-nome">{item.produto_nome}{item.produto_marca && <span className="rel-produto-marca"> · {item.produto_marca}</span>}</span>
                              <span className="fin-hist-item-qtd">{qtdLabel}</span>
                              <span className="fin-hist-item-val">{fmt(item.preco_unitario)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {vendaDetalhes?.id === venda.id && venda.status !== 'cancelada' && (
                      <div className="fin-historico-acoes-extra">
                        <button
                          className="fin-historico-btn-cancelar"
                          disabled={cancelandoVendaId === venda.id}
                          onClick={(e) => { e.stopPropagation(); cancelarVenda(venda); }}
                        >
                          {cancelandoVendaId === venda.id ? '⏳ Cancelando…' : '🗑 Cancelar essa venda'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ ABA: PRODUTOS MAIS VENDIDOS ══ */}
      {abaAtiva === 'produtos' && (
        <div className="rel-body">
          <div className="fin-section-header">
            <span className="fin-section-titulo">📊 Produtos mais vendidos</span>
            {reportProd.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fin-btn-excel" onClick={exportarRelatorioExcel}>📥 Excel</button>
                <button className="fin-btn-pdf" onClick={baixarPDFProdutos}>📄 PDF</button>
              </div>
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
              ) : reportProd.map((prod, i) => {
                const lucro = parseFloat(prod.receita_total) - parseFloat(prod.custo_total || 0);
                const margem = parseFloat(prod.receita_total) > 0
                  ? ((lucro / parseFloat(prod.receita_total)) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '0,0';
                return (
                  <div key={i} className="fin-report-card">
                    <div className="fin-report-rank">#{i + 1}</div>
                    <div className="rel-report-cabecalho">
                      <div
                        className="rel-report-thumb"
                        onClick={() => prod.produto_imagem_url && setImagemExpandida(prod.produto_imagem_url)}
                        style={{ cursor: prod.produto_imagem_url ? 'pointer' : 'default' }}
                      >
                        {prod.produto_imagem_url ? (
                          <img
                            src={prod.produto_imagem_url}
                            alt=""
                            loading="lazy"
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <IconePacote className="rel-report-thumb-placeholder" />
                        )}
                      </div>
                      <div className="rel-report-nome-texto">{prod.produto_nome}{prod.produto_marca && <span className="rel-produto-marca"> · {prod.produto_marca}</span>}</div>
                    </div>
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
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ ABA: ESTOQUE ══ */}
      {abaAtiva === 'estoque' && (
        <div className="rel-body">
          <div className="fin-section-header">
            <span className="fin-section-titulo">📦 Relatório de Estoque</span>
            {estoque.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fin-btn-excel" onClick={exportarEstoqueExcel}>📥 Excel</button>
                <button className="fin-btn-pdf" onClick={baixarPDFEstoque}>📄 PDF</button>
              </div>
            )}
          </div>
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
          <div className="rel-estoque-filtros">
            <div className="rel-estoque-filtro-cat">
              <label className="rel-filtro-label">Categoria</label>
              <select
                className="rel-filtro-select"
                value={filtrCategoria}
                onChange={e => setFiltrCategoria(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {[...new Map(estoque.filter(p => p.nome_categoria).map(p => [p.categoria_id || p.nome_categoria, { id: p.categoria_id, nome: p.nome_categoria }])).values()]
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map(c => (
                    <option key={c.id || c.nome} value={c.id || c.nome}>{c.nome}</option>
                  ))}
              </select>
            </div>
            <div className="fin-filtro-btns">
              {[
                { key: 'todos',   label: `Todos (${estoqueFiltrado.length})` },
                { key: 'critico', label: `🔴 Crítico (${estoqueFiltrado.filter(p => estoqueStatus(p) === 'critico').length})` },
                { key: 'baixo',   label: `⚠️ Baixo (${estoqueFiltrado.filter(p => estoqueStatus(p) === 'baixo').length})` },
                { key: 'ok',      label: `✅ Normal (${estoqueFiltrado.filter(p => estoqueStatus(p) === 'ok').length})` },
              ].map(f => (
                <button key={f.key} className={`fin-filtro-btn${filtrEstoque === f.key ? ' ativo' : ''}`}
                  onClick={() => setFiltrEstoque(f.key)}>{f.label}</button>
              ))}
            </div>
          </div>
          {erroEstoque && <div className="fin-erro">⚠️ {erroEstoque}</div>}
          {loadingEstoque ? (
            <div className="fin-loading"><div className="est-spinner" /> Carregando…</div>
          ) : (
            <div className="fin-estoque-grid">
              {estoqueFiltrado.length === 0 ? (
                <div className="fin-vazio"><span className="fin-vazio-icon">📦</span><p>Nenhum produto encontrado</p></div>
              ) : estoqueFiltrado.map(p => {
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
                    <div className="fin-estoque-nome">{p.nome}{p.marca && <span className="rel-produto-marca"> · {p.marca}</span>}</div>
                    <div className="fin-estoque-cat">{p.nome_categoria || 'Sem categoria'}</div>
                    <div className="fin-estoque-info-row"><span className="fin-estoque-info-label">Estoque</span><span className="fin-estoque-info-valor">{unidade}</span></div>
                    <div className="fin-estoque-info-row"><span className="fin-estoque-info-label">Mínimo</span><span className="fin-estoque-info-valor">{p.estoque_minimo} {p.unidade_medida}</span></div>
                    <div className="fin-estoque-info-row"><span className="fin-estoque-info-label">Venda</span><span className="fin-estoque-info-valor accent">{fmt(p.preco_venda)}</span></div>
                    <div className="fin-estoque-info-row"><span className="fin-estoque-info-label">Total estoque</span><span className="fin-estoque-info-valor">{fmt(parseFloat(p.preco_venda) * estAtual)}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {imagemExpandida && (
        <div className="rel-lightbox-overlay" onClick={() => setImagemExpandida(null)}>
          <button className="rel-lightbox-fechar" onClick={() => setImagemExpandida(null)}>✕</button>
          <img src={imagemExpandida} alt="" className="rel-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}

    </div>
  );
}