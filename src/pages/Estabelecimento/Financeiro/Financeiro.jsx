// src/pages/Estabelecimento/Financeiro/Financeiro.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
      const resp = await apiFetch(`/api/financeiro/relatorio_dre?${params}`
      );
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
      const resp = await apiFetch(`/api/financeiro?status=${encodeURIComponent(status)}`
      );
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
      const resp = await apiFetch(`/api/financeiro/${encodeURIComponent(contaId)}/pagar`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ estabelecimentoId }),
        }
      );
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
      const resp = await apiFetch(`/api/financeiro/${encodeURIComponent(contaId)}`,
        {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ estabelecimentoId }),
        }
      );
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
      const resp = await apiFetch(`/api/financeiro/relatorio_produtos?${params}`
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar relatório');
      setReportProd(data);
    } catch (err) { setErroReport(err.message); }
    finally { setLoadingReport(false); }
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  return (
    <div className="fin-container">

      {/* ── TABS NAV ─────────────────────────────────────── */}
      <div className="fin-tabs">
        <div className="fin-tabs-nav">
          {[
            { key: 'fluxo',     label: '💰 Fluxo de Caixa' },
            { key: 'contas',    label: '📋 Contas a Pagar' },
            { key: 'relatorios',label: '📊 Relatório de Vendas' },
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
        <button className="fin-tab-btn-imprimir" onClick={() => window.print()}>
          🖨️ Imprimir
        </button>
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

            <div className="fin-resumo-grid">
              {[
                { key: 'total_entradas_dia', label: 'Entradas do Dia', destaque: true },
                { key: 'total_dinheiro',     label: 'Dinheiro' },
                { key: 'total_pix',          label: 'Pix' },
                { key: 'total_cartao',       label: 'Cartão' },
                { key: 'total_fiado_pendente',       label: 'Fiado Pendente' },
                { key: 'total_contas_pagar_pendente', label: 'Contas a Pagar' },
              ].map(c => (
                <div key={c.key} className={`fin-resumo-card${c.destaque ? ' destaque' : ''}`}>
                  <span className="fin-resumo-card-titulo">{c.label}</span>
                  {loadingResumo
                    ? <div className="fin-card-spinner" />
                    : <span className="fin-resumo-card-valor">{fmt(resumo?.[c.key])}</span>
                  }
                </div>
              ))}
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
                  <span className="fin-dre-card-valor">{fmt(dreData.receita_bruta)}</span>
                  <div className="fin-dre-sub">
                    <span>Dinheiro: {fmt(dreData.receita_dinheiro)}</span>
                    <span>Pix: {fmt(dreData.receita_pix)}</span>
                    <span>Cartão: {fmt(dreData.receita_cartao)}</span>
                  </div>
                </div>
                <div className="fin-dre-card despesa">
                  <span className="fin-dre-card-titulo">(-) CMV</span>
                  <span className="fin-dre-card-valor">- {fmt(dreData.cmv)}</span>
                </div>
                <div className="fin-dre-card bruto">
                  <span className="fin-dre-card-titulo">(=) Lucro Bruto</span>
                  <span className="fin-dre-card-valor">{fmt(dreData.lucro_bruto)}</span>
                </div>
                <div className="fin-dre-card despesa">
                  <span className="fin-dre-card-titulo">(-) Despesas Operacionais</span>
                  <span className="fin-dre-card-valor">- {fmt(dreData.despesas)}</span>
                </div>
                <div className="fin-dre-card liquido">
                  <span className="fin-dre-card-titulo">(=) Lucro Líquido</span>
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
                  reportProd.map((prod, i) => (
                    <div key={i} className="fin-report-card">
                      <div className="fin-report-nome">{prod.produto_nome}</div>
                      <div className="fin-report-info">
                        <span className="fin-report-info-label">Categoria</span>
                        <span className="fin-report-info-valor">{prod.categoria_nome || 'Sem categoria'}</span>
                      </div>
                      <div className="fin-report-info">
                        <span className="fin-report-info-label">Total vendido</span>
                        <span className="fin-report-info-valor qtd">
                          {prod.unidade_medida === 'kg'
                            ? `${parseFloat(prod.total_vendido).toFixed(3)} kg`
                            : `${parseFloat(prod.total_vendido).toFixed(0)} un`}
                        </span>
                      </div>
                      <div className="fin-report-info">
                        <span className="fin-report-info-label">Receita</span>
                        <span className="fin-report-info-valor receita">{fmt(prod.receita_total)}</span>
                      </div>
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