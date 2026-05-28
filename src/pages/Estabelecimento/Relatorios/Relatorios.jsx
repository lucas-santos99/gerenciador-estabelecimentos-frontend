// src/pages/Estabelecimento/Relatorios/Relatorios.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './Relatorios.css';

/* ── helpers ─────────────────────────────────────────────── */
const fmt = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function dataHoje() {
  return new Date().toISOString().split('T')[0];
}
function dataHa30() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
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

const MODULO_LABEL = {
  pdv: '🖥️ PDV', estoque: '📦 Estoque', clientes: '👥 Clientes',
  financeiro: '💰 Financeiro', configuracoes: '⚙️ Config',
};
const MODULO_COR = {
  pdv: 'teal', estoque: 'blue', clientes: 'purple',
  financeiro: 'green', configuracoes: 'gray',
};
const ACAO_LABEL = {
  venda_realizada: '🛒 Venda', venda_cancelada: '❌ Cancelamento',
  produto_criado: '➕ Produto criado', produto_editado: '✏️ Produto editado',
  produto_excluido: '🗑️ Produto excluído', cliente_criado: '👤 Cliente criado',
  cliente_editado: '✏️ Cliente editado', cliente_excluido: '🗑️ Cliente excluído',
  fiado_recebido: '💰 Fiado recebido', config_atualizada: '⚙️ Config atualizada',
};
const META_LABEL = {
  nome: 'Nome', preco_venda: 'Preço venda', preco_custo: 'Preço custo',
  estoque_atual: 'Estoque', estoque_minimo: 'Est. mínimo',
  unidade_medida: null, limite_credito: 'Limite crédito',
  meio_pagamento: 'Pagamento', valor: 'Valor', itens: 'Itens', campos: null,
};

function formatarMetaValor(chave, valor, meta) {
  if (chave === 'estoque_atual' || chave === 'estoque_minimo') {
    const u = meta?.unidade_medida || 'un';
    if (u === 'kg') return `${parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
    return `${parseFloat(valor).toLocaleString('pt-BR')} un`;
  }
  if (['preco_venda','preco_custo','limite_credito','valor'].includes(chave))
    return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');
  return String(valor);
}

function calcularDiff(antes, depois) {
  if (!antes || !depois) return null;
  const campos = Object.keys(depois).filter(k =>
    META_LABEL[k] !== null && META_LABEL[k] !== undefined &&
    k !== 'unidade_medida' && String(antes[k]) !== String(depois[k])
  );
  return campos.length > 0 ? campos : null;
}

/* ════════════════════════════════════════════════════════════ */
export default function Relatorios({ estabelecimentoId, nomeEstabelecimento, logoUrl }) {

  const [abaAtiva, setAbaAtiva] = useState('historico');
  const [operadores, setOperadores] = useState([]);
  const [categorias, setCategorias] = useState([]);
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

  /* ── Auditoria ── */
  const [filtros, setFiltros] = useState({
    data_inicio: dataHa30(), data_fim: dataHoje(), modulo: '', operador_id: '', acao: '',
  });
  const [registros, setRegistros] = useState([]);
  const [totalRegs, setTotalRegs] = useState(0);
  const [pagina, setPagina] = useState(0);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const LIMIT = 30;

  /* ── Histórico ── */
  const [historico, setHistorico] = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');
  const [histInicio, setHistInicio] = useState(dataHoje());
  const [histFim, setHistFim] = useState(dataHoje());
  const [vendaDetalhes, setVendaDetalhes] = useState(null);

  /* ── Relatório Produtos ── */
  const [reportProd, setReportProd] = useState([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [erroReport, setErroReport] = useState('');
  const [reportInicio, setReportInicio] = useState(dataHoje());
  const [reportFim, setReportFim] = useState(dataHoje());
  const [reportCat, setReportCat] = useState('');

  /* ── Vendas por Operador ── */
  const [relOp, setRelOp] = useState([]);
  const [loadingRelOp, setLoadingRelOp] = useState(false);
  const [erroRelOp, setErroRelOp] = useState('');
  const [relOpInicio, setRelOpInicio] = useState(dataHoje());
  const [relOpFim, setRelOpFim] = useState(dataHoje());

  /* ── Estoque ── */
  const [estoque, setEstoque] = useState([]);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [erroEstoque, setErroEstoque] = useState('');
  const [filtrEstoque,    setFiltrEstoque]    = useState('todos');
  const [filtrCategoria,  setFiltrCategoria]  = useState('');

  /* ── Carga inicial ── */
  useEffect(() => {
    apiFetch('/api/auditoria/operadores')
      .then(r => r.ok ? r.json() : []).then(setOperadores).catch(() => {});
    apiFetch('/api/categorias')
      .then(r => r.ok ? r.json() : []).then(setCategorias).catch(() => {});
  }, []);

  useEffect(() => {
    if (abaAtiva === 'auditoria') carregarAuditoria(0);
    if (abaAtiva === 'historico' && estabelecimentoId) carregarHistorico();
    if (abaAtiva === 'estoque'   && estabelecimentoId) carregarEstoque();
  }, [abaAtiva, estabelecimentoId]);

  /* ── Auditoria ── */
  const carregarAuditoria = useCallback(async (p = 0) => {
    setLoadingRegs(true);
    try {
      const params = new URLSearchParams({
        limit: LIMIT, offset: p * LIMIT,
        ...(filtros.data_inicio && { data_inicio: filtros.data_inicio }),
        ...(filtros.data_fim    && { data_fim:    filtros.data_fim }),
        ...(filtros.modulo      && { modulo:      filtros.modulo }),
        ...(filtros.operador_id && { operador_id: filtros.operador_id }),
        ...(filtros.acao        && { acao:        filtros.acao }),
      });
      const resp = await apiFetch(`/api/auditoria?${params}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setRegistros(data.registros || []);
      setTotalRegs(data.total || 0);
      setPagina(p);
    } catch { setRegistros([]); }
    finally { setLoadingRegs(false); }
  }, [filtros]);

  function aplicarFiltros() {
    if (abaAtiva === 'auditoria') carregarAuditoria(0);
  }

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

  /* ── Vendas por Operador ── */
  async function gerarRelatorioOperador(e) {
    e.preventDefault();
    setLoadingRelOp(true); setErroRelOp(''); setRelOp([]);
    try {
      const params = new URLSearchParams({ data_inicio: relOpInicio, data_fim: relOpFim });
      const resp = await apiFetch(`/api/financeiro/relatorio_vendas_operador?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro');
      setRelOp(data);
    } catch (err) { setErroRelOp(err.message); }
    finally { setLoadingRelOp(false); }
  }

  function exportarRelatorioOperadorExcel() {
    if (!relOp.length) return;
    const totalGeral = relOp.reduce((s, op) => s + op.total_vendas, 0);
    const dados = relOp.map((op, i) => ({
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
      '#': '', 'Operador': 'TOTAL', 'Qtd Vendas': relOp.reduce((s, op) => s + op.qtd_vendas, 0),
      'Total (R$)': parseFloat(totalGeral.toFixed(2)), '% do Total': 100,
      'Dinheiro (R$)': parseFloat(relOp.reduce((s, op) => s + op.total_dinheiro, 0).toFixed(2)),
      'Pix (R$)': parseFloat(relOp.reduce((s, op) => s + op.total_pix, 0).toFixed(2)),
      'Cartão (R$)': parseFloat(relOp.reduce((s, op) => s + op.total_cartao, 0).toFixed(2)),
      'Fiado (R$)': parseFloat(relOp.reduce((s, op) => s + op.total_fiado, 0).toFixed(2)),
      'Média por Venda': '',
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
      doc.setFontSize(16); doc.setFont(undefined, 'bold');
      doc.text(nomeEstabelecimento || 'Relatório', 105, y, { align: 'center' });
      doc.setFontSize(11); doc.setFont(undefined, 'normal'); doc.setTextColor(80);
      doc.text('Relatório de Vendas por Operador', 105, y + 7, { align: 'center' });
      doc.setFontSize(9);
      doc.text(`Período: ${formatarData(relOpInicio)} a ${formatarData(relOpFim)}`, 105, y + 13, { align: 'center' });
      const body = relOp.map((op, i) => [
        `#${i + 1}`, op.operador_nome, op.qtd_vendas, fmt(op.total_vendas),
        totalGeral > 0 ? `${((op.total_vendas / totalGeral) * 100).toFixed(1)}%` : '0%',
        fmt(op.total_dinheiro), fmt(op.total_pix), fmt(op.total_cartao),
      ]);
      body.push(['', 'TOTAL', relOp.reduce((s, op) => s + op.qtd_vendas, 0), fmt(totalGeral), '100%',
        fmt(relOp.reduce((s, op) => s + op.total_dinheiro, 0)),
        fmt(relOp.reduce((s, op) => s + op.total_pix, 0)),
        fmt(relOp.reduce((s, op) => s + op.total_cartao, 0))]);
      autoTable(doc, {
        startY: y + 20,
        head: [['', 'Operador', 'Vendas', 'Total', '%', 'Dinheiro', 'Pix', 'Cartão']],
        body, theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      });
      doc.save(`Vendas_Operador_${nomeEstabelecimento || 'relatorio'}_${relOpInicio}_a_${relOpFim}.pdf`);
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

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="rel-container" style={{ '--rel-font-scale': fontScale }}>

      {/* ── Header ── */}
      <div className="rel-header">
        <div className="rel-header-info">
          <h2 className="rel-titulo">📊 Relatórios</h2>
          <span className="rel-subtitulo">Vendas, estoque e auditoria de ações</span>
        </div>
      </div>

      {/* ── Abas + zoom ── */}
      <div className="rel-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="fin-tabs-nav" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { key: 'historico',  label: '🧾 Histórico de Vendas' },
            { key: 'operadores', label: '👤 Por Operador' },
            { key: 'produtos',   label: '📊 Produtos Vendidos' },
            { key: 'estoque',    label: '📦 Estoque' },
            { key: 'auditoria',  label: '📋 Auditoria' },
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

      {/* ══ ABA: HISTÓRICO DE VENDAS ══ */}
      {abaAtiva === 'historico' && (
        <div className="rel-body">
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
              ) : historico.map(venda => (
                <div key={venda.id} className="fin-historico-card">
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ ABA: VENDAS POR OPERADOR ══ */}
      {abaAtiva === 'operadores' && (
        <div className="rel-body">
          <div className="fin-section-header">
            <span className="fin-section-titulo">👤 Vendas por Operador</span>
            {relOp.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="fin-btn-excel" onClick={exportarRelatorioOperadorExcel}>📥 Excel</button>
                <button className="fin-btn-pdf" onClick={baixarPDFOperador}>📄 PDF</button>
              </div>
            )}
          </div>
          <form className="fin-form-filtros" onSubmit={gerarRelatorioOperador}>
            <div className="fin-form-group">
              <label className="fin-form-label">Data início</label>
              <input className="fin-form-input" type="date" value={relOpInicio} onChange={e => setRelOpInicio(e.target.value)} />
            </div>
            <div className="fin-form-group">
              <label className="fin-form-label">Data fim</label>
              <input className="fin-form-input" type="date" value={relOpFim} onChange={e => setRelOpFim(e.target.value)} />
            </div>
            <button type="submit" className="fin-btn-gerar" disabled={loadingRelOp}>
              {loadingRelOp ? '⏳ Gerando…' : '▶ Gerar'}
            </button>
          </form>
          {erroRelOp && <div className="fin-erro">⚠️ {erroRelOp}</div>}
          {loadingRelOp ? (
            <div className="fin-loading"><div className="est-spinner" /> Gerando…</div>
          ) : relOp.length === 0 ? (
            <div className="fin-vazio">
              <span className="fin-vazio-icon">👤</span>
              <p>Nenhuma venda encontrada</p>
              <small>Selecione um período e clique em Gerar</small>
            </div>
          ) : (
            <>
              {(() => {
                const totalGeral = relOp.reduce((s, op) => s + op.total_vendas, 0);
                const totalVendas = relOp.reduce((s, op) => s + op.qtd_vendas, 0);
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
                      <span className="fin-resumo-card-valor">{fmt(totalVendas > 0 ? totalGeral / totalVendas : 0)}</span>
                    </div>
                    <div className="fin-resumo-card">
                      <span className="fin-resumo-card-titulo">Operadores ativos</span>
                      <span className="fin-resumo-card-valor">{relOp.length}</span>
                    </div>
                  </div>
                );
              })()}
              <div className="fin-relop-grid">
                {relOp.map((op, i) => {
                  const totalGeral = relOp.reduce((s, o) => s + o.total_vendas, 0);
                  const pct = totalGeral > 0 ? (op.total_vendas / totalGeral) * 100 : 0;
                  const media = op.qtd_vendas > 0 ? op.total_vendas / op.qtd_vendas : 0;
                  return (
                    <div key={op.operador_id || i} className="fin-relop-card">
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
        </div>
      )}

      {/* ══ ABA: PRODUTOS MAIS VENDIDOS ══ */}
      {abaAtiva === 'produtos' && (
        <div className="rel-body">
          <div className="fin-section-header">
            <span className="fin-section-titulo">📊 Produtos mais vendidos</span>
            {reportProd.length > 0 && (
              <button className="fin-btn-excel" onClick={exportarRelatorioExcel}>📥 Excel</button>
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
                    <div className="fin-report-nome">{prod.produto_nome}{prod.produto_marca && <span className="rel-produto-marca"> · {prod.produto_marca}</span>}</div>
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
              <button className="fin-btn-excel" onClick={exportarEstoqueExcel}>📥 Excel</button>
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

      {/* ══ ABA: AUDITORIA ══ */}
      {abaAtiva === 'auditoria' && (
        <div className="rel-body">
          <div className="rel-filtros">
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">De</label>
              <input className="rel-filtro-input" type="date" value={filtros.data_inicio}
                onChange={e => setFiltros(p => ({ ...p, data_inicio: e.target.value }))} />
            </div>
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">Até</label>
              <input className="rel-filtro-input" type="date" value={filtros.data_fim}
                onChange={e => setFiltros(p => ({ ...p, data_fim: e.target.value }))} />
            </div>
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">Módulo</label>
              <select className="rel-filtro-select" value={filtros.modulo}
                onChange={e => setFiltros(p => ({ ...p, modulo: e.target.value }))}>
                <option value="">Todos</option>
                {Object.entries(MODULO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">Operador</label>
              <select className="rel-filtro-select" value={filtros.operador_id}
                onChange={e => setFiltros(p => ({ ...p, operador_id: e.target.value }))}>
                <option value="">Todos</option>
                <option value="merchant">{nomeEstabelecimento || 'Administrador'}</option>
                {operadores.map(op => <option key={op.id} value={op.id}>{op.nome}</option>)}
              </select>
            </div>
            <button className="rel-btn-filtrar" onClick={aplicarFiltros}>🔍 Filtrar</button>
          </div>

          {loadingRegs ? (
            <div className="rel-loading"><div className="rel-spinner" /> Carregando…</div>
          ) : registros.length === 0 ? (
            <div className="rel-vazio">
              <span className="rel-vazio-icone">📋</span>
              <p>Nenhum registro encontrado</p>
              <small>Tente ajustar os filtros de data ou módulo</small>
            </div>
          ) : (
            <>
              <div className="rel-lista">
                {registros.map(r => (
                  <div key={r.id} className={`rel-registro rel-mod-${MODULO_COR[r.modulo] || 'gray'}`}>
                    <div className="rel-registro-corpo">
                      <div className="rel-registro-linha1">
                        <div className="rel-registro-badges">
                          <span className="rel-registro-modulo">{MODULO_LABEL[r.modulo] || r.modulo}</span>
                          <span className="rel-registro-acao">{ACAO_LABEL[r.acao] || r.acao}</span>
                        </div>
                        <div className="rel-registro-dir">
                          <span className="rel-registro-usuario">{r.usuario_nome || nomeEstabelecimento || 'Administrador'}</span>
                          <span className="rel-registro-hora">{formatarDataHora(r.criado_em)}</span>
                        </div>
                      </div>
                      <div className="rel-registro-linha2">
                        <span className="rel-registro-desc">{r.descricao}</span>
                        {(() => {
                          const diff = calcularDiff(r.meta?.antes, r.meta?.depois);
                          if (diff) {
                            return (
                              <div className="rel-registro-meta">
                                {diff.map(k => (
                                  <span key={k} className="rel-meta-tag rel-meta-tag--diff">
                                    <span className="rel-meta-key">{META_LABEL[k] || k}</span>
                                    <span className="rel-meta-val rel-meta-val--old">{formatarMetaValor(k, r.meta.antes[k], r.meta.antes)}</span>
                                    <span className="rel-meta-seta">→</span>
                                    <span className="rel-meta-val rel-meta-val--new">{formatarMetaValor(k, r.meta.depois[k], r.meta.depois)}</span>
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          if (r.meta?.depois) {
                            return (
                              <div className="rel-registro-meta">
                                {Object.entries(r.meta.depois)
                                  .filter(([k]) => META_LABEL[k] !== null && META_LABEL[k] !== undefined && k !== 'unidade_medida')
                                  .map(([k, v]) => (
                                    <span key={k} className="rel-meta-tag">
                                      <span className="rel-meta-key">{META_LABEL[k] || k}</span>
                                      <span className="rel-meta-val">{formatarMetaValor(k, v, r.meta.depois)}</span>
                                    </span>
                                  ))}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rel-paginacao">
                <span className="rel-paginacao-info">
                  {pagina * LIMIT + 1}–{Math.min((pagina + 1) * LIMIT, totalRegs)} de {totalRegs}
                </span>
                <div className="rel-paginacao-btns">
                  <button className="rel-pag-btn" disabled={pagina === 0} onClick={() => carregarAuditoria(pagina - 1)}>← Anterior</button>
                  <button className="rel-pag-btn" disabled={(pagina + 1) * LIMIT >= totalRegs} onClick={() => carregarAuditoria(pagina + 1)}>Próximo →</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}