// src/pages/Estabelecimento/Fornecedores/Fornecedores.jsx
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../utils/api';
import FornecedorModal from './FornecedorModal';
import LancarCompraModal from './LancarCompraModal';
import '../Clientes.css';
import './Fornecedores.css';

function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtData(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}
// Mesmo padrão de formatação de quantidade usado no Ajuste Rápido do Inventário
function fmtQ(v, u) {
  return u === 'kg'
    ? parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg'
    : Math.trunc(parseFloat(v || 0)) + ' un';
}

const CONDICAO_LABEL = {
  a_vista: 'À vista', '7_dias': '7 dias', '15_dias': '15 dias',
  '30_dias': '30 dias', '45_dias': '45 dias', '60_dias': '60 dias', outro: 'Combinar',
};

const FORMA_PGTO_LABEL = { a_vista: 'À vista', a_prazo: 'Parcelado' };

/* ════════════════════════════════════════════════════════════ */
export default function Fornecedores({ estabelecimentoId, permissoes = null, isMerchant = true }) {
  const [lista,        setLista]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busca,        setBusca]        = useState('');
  const [fontScale,    setFontScale]    = useState(() => {
    const saved = localStorage.getItem('forn-font-scale');
    return saved ? parseFloat(saved) : 1;
  });

  const [modalForm,      setModalForm]      = useState(null); // null | 'novo' | fornecedor (editar)
  const [modalCompra,    setModalCompra]    = useState(false);
  const [fornecedorParaCompra, setFornecedorParaCompra] = useState(null);
  const [detalhesId,     setDetalhesId]     = useState(null);

  const pode = (perm) => isMerchant || (permissoes || []).includes(perm);

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('forn-font-scale', next);
      return next;
    });
  }

  async function carregar() {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/fornecedores${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`);
      const data = await resp.json();
      setLista(Array.isArray(data) ? data : []);
    } catch { setLista([]); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [estabelecimentoId]);

  useEffect(() => {
    const t = setTimeout(() => carregar(), 350);
    return () => clearTimeout(t);
  }, [busca]);

  async function excluir(f) {
    if (!window.confirm(`Excluir "${f.nome}"? Isso não apaga o histórico de compras já feitas.`)) return;
    try {
      const resp = await apiFetch(`/api/fornecedores/${f.id}`, { method: 'DELETE' });
      if (resp.ok) carregar();
      else { const j = await resp.json(); alert(j.error || 'Erro ao excluir.'); }
    } catch { alert('Erro ao excluir.'); }
  }

  return (
    <div className="cli-wrapper">

      <div className="cli-header">
        <input
          className="cli-header-busca"
          placeholder="🔍 Buscar fornecedor…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div className="cli-header-btns">
          <div className="forn-zoom-group">
            <button className="forn-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="forn-zoom-btn" onClick={() => changeFontScale(0.1)} disabled={fontScale >= 1.6} title="Aumentar fonte">A+</button>
          </div>
          {pode('fornecedores') && (
            <button className="cli-btn verde" onClick={() => setModalCompra(true)}>🧾 Lançar Compra</button>
          )}
          {pode('fornecedores') && (
            <button className="cli-btn azul" onClick={() => setModalForm('novo')}>+ Novo Fornecedor</button>
          )}
        </div>
      </div>

      <div className="forn-zoom-scope" style={{ '--forn-font-scale': fontScale }}>
      {loading ? (
        <div className="cli-loading"><div className="cli-spinner" /> Carregando fornecedores…</div>
      ) : lista.length === 0 ? (
        <div className="cli-vazio">
          <span className="cli-vazio-icon">🚚</span>
          <p>Nenhum fornecedor cadastrado ainda.</p>
          {pode('fornecedores') && <button className="cli-btn azul" onClick={() => setModalForm('novo')}>+ Cadastrar o primeiro</button>}
        </div>
      ) : (
        <div className="forn-grid">
          {lista.map(f => (
            <div key={f.id} className="forn-card">
              <div className="forn-card-header" onClick={() => setDetalhesId(f.id)}>
                <span className="forn-card-nome">{f.nome}</span>
                <div className="forn-card-selos">
                  {f.formas_pagamento && f.formas_pagamento.length > 0 ? (
                    f.formas_pagamento.map(fp => (
                      <span
                        key={fp}
                        className={`forn-card-condicao${fp === 'a_prazo' ? ' parcelado' : ''}`}
                      >
                        {FORMA_PGTO_LABEL[fp] || fp}
                      </span>
                    ))
                  ) : (
                    f.condicao_pagamento && (
                      <span className="forn-card-condicao">
                        {CONDICAO_LABEL[f.condicao_pagamento] || f.condicao_pagamento}
                      </span>
                    )
                  )}
                </div>
              </div>
              <div className="forn-card-contato" onClick={() => setDetalhesId(f.id)}>
                {f.whatsapp ? `📱 ${f.whatsapp}` : f.telefone ? `📞 ${f.telefone}` : '— sem contato —'}
              </div>
              <div className="forn-card-stats" onClick={() => setDetalhesId(f.id)}>
                <div className="forn-card-stat">
                  <span className="forn-card-stat-label">Gasto este mês</span>
                  <span className="forn-card-stat-valor">{fmt(f.gasto_mes)}</span>
                </div>
                <div className="forn-card-stat">
                  <span className="forn-card-stat-label">Última compra</span>
                  <span className="forn-card-stat-valor">{fmtData(f.ultima_compra)}</span>
                </div>
              </div>
              <div className="forn-card-acoes">
                <button className="cli-btn-acao detalhes" onClick={() => setDetalhesId(f.id)}>📋 Detalhes</button>
                {pode('fornecedores') && (
                  <>
                    <button className="cli-btn-acao" onClick={() => { setFornecedorParaCompra(f); setModalCompra(true); }} title="Lançar compra desse fornecedor">🧾</button>
                    <button className="cli-btn-acao" onClick={() => setModalForm(f)} title="Editar">✏️</button>
                    <button className="cli-btn-acao excluir" onClick={() => excluir(f)} title="Excluir">🗑</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {modalForm && (
        <FornecedorModal
          fornecedor={modalForm === 'novo' ? null : modalForm}
          onClose={() => setModalForm(null)}
          onSalvo={carregar}
          fontScale={fontScale}
        />
      )}

      {modalCompra && (
        <LancarCompraModal
          estabelecimentoId={estabelecimentoId}
          fornecedorPreselecionado={fornecedorParaCompra}
          onClose={() => { setModalCompra(false); setFornecedorParaCompra(null); }}
          onSalvo={carregar}
          fontScale={fontScale}
        />
      )}

      {detalhesId && (
        <DetalhesFornecedor
          fornecedorId={detalhesId}
          onFechar={() => setDetalhesId(null)}
          onAtualizar={carregar}
          fontScale={fontScale}
        />
      )}

    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETALHES DO FORNECEDOR — histórico de compras + produtos
════════════════════════════════════════════════════════════ */
function DetalhesFornecedor({ fornecedorId, onFechar, onAtualizar, fontScale = 1 }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [aba,     setAba]     = useState('compras'); // 'compras' | 'produtos'
  const [cancelando, setCancelando] = useState(null);
  const [exportando, setExportando] = useState(null); // 'xlsx' | 'pdf' | null
  const [compraDetalheId, setCompraDetalheId] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await apiFetch(`/api/fornecedores/${fornecedorId}`);
        const data = await resp.json();
        setDados(resp.ok ? data : null);
      } catch { setDados(null); }
      setLoading(false);
    })();
  }, [fornecedorId]);

  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  async function cancelarCompra(compraId) {
    if (!window.confirm('Cancelar essa compra? O estoque que entrou será estornado.')) return;
    setCancelando(compraId);
    try {
      const resp = await apiFetch(`/api/compras/${compraId}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || 'Erro ao cancelar.'); setCancelando(null); return; }
      // Recarrega os detalhes
      const respD = await apiFetch(`/api/fornecedores/${fornecedorId}`);
      setDados(await respD.json());
      onAtualizar?.();
    } catch { alert('Erro ao cancelar compra.'); }
    setCancelando(null);
  }

  /* ── Exportação (mesmo padrão do Inventário) ─────────────── */
  const nomeArquivoBase = () => (dados?.nome || 'fornecedor').replace(/\s+/g, '_');

  function linhasParaExportar() {
    if (aba === 'compras') {
      const linhas = [];
      (dados.compras || []).forEach(c => {
        const itensDaCompra = (c.itens && c.itens.length > 0) ? c.itens : [null];
        itensDaCompra.forEach(i => {
          linhas.push({
            'Data':                  fmtData(c.data_compra),
            'Nota':                  c.numero_nota || '—',
            'Forma':                 c.forma_pagamento === 'a_vista' ? 'À vista' : 'A prazo',
            'Status':                c.status === 'cancelada' ? 'Cancelada' : 'Ativa',
            'Produto':               i ? i.produto_nome + (i.produto_marca ? ` · ${i.produto_marca}` : '') : '—',
            'Quantidade':            i ? parseFloat(i.quantidade) || 0 : '',
            'Unidade':               i ? i.unidade_medida : '',
            'Custo Unit.':           i ? parseFloat(i.preco_custo_unitario) || 0 : '',
            'Subtotal':              i ? parseFloat(i.subtotal) || 0 : '',
            'Valor Total da Compra': parseFloat(c.valor_total) || 0,
          });
        });
      });
      return linhas;
    }
    return (dados.produtos_fornecidos || []).map(p => ({
      'Produto':       p.produto_nome,
      'Marca':         p.produto_marca || '',
      'Unidade':       p.unidade_medida,
      'Última Qtd.':   parseFloat(p.ultima_quantidade) || 0,
      'Último Preço':  parseFloat(p.ultimo_preco) || 0,
    }));
  }

  function exportarExcel() {
    const linhas = linhasParaExportar();
    if (linhas.length === 0) return;
    setExportando('xlsx');
    try {
      const ws = XLSX.utils.json_to_sheet(linhas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, aba === 'compras' ? 'Compras' : 'Produtos');
      const sufixo = aba === 'compras' ? 'Historico_Compras' : 'Produtos_Fornecidos';
      XLSX.writeFile(wb, `${nomeArquivoBase()}_${sufixo}.xlsx`);
    } finally {
      setExportando(null);
    }
  }

  function exportarPDF() {
    const linhas = linhasParaExportar();
    if (linhas.length === 0) return;
    setExportando('pdf');
    try {
      const titulo = aba === 'compras'
        ? `Histórico de Compras — ${dados.nome}`
        : `Produtos Fornecidos — ${dados.nome}`;

      const html = `
        <html><head><title>${titulo}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; }
          h1 { font-size: 16px; margin-bottom: 2px; }
          p.sub { color: #666; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; }
          th { background: #f0f0f0; }
          tr:nth-child(even) { background: #fafafa; }
        </style>
        </head><body>
        <h1>${titulo}</h1>
        <p class="sub">${linhas.length} registro(s) · Gerado em ${new Date().toLocaleDateString('pt-BR')}</p>
        <table>
          <thead><tr>${Object.keys(linhas[0]).map(k => `<th>${k}</th>`).join('')}</tr></thead>
          <tbody>
            ${linhas.map(l => `<tr>${Object.values(l).map(v => `<td>${String(v).replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        </body></html>
      `;

      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    } finally {
      setExportando(null);
    }
  }

  const temDadosParaExportar = aba === 'compras'
    ? (dados?.compras?.length > 0)
    : (dados?.produtos_fornecidos?.length > 0);

  return (
    <div className="cli-modal-overlay" onClick={onFechar}>
      <div className="cli-modal forn-modal-detalhes forn-zoom-scope" style={{ '--forn-font-scale': fontScale }} onClick={e => e.stopPropagation()}>

        {loading ? (
          <div className="cli-loading"><div className="cli-spinner" /> Carregando…</div>
        ) : !dados ? (
          <div className="cli-vazio"><p>Fornecedor não encontrado.</p></div>
        ) : (
          <>
            <div className="cli-modal-titulo">🚚 {dados.nome}</div>
            <div className="forn-detalhes-sub">
              {dados.whatsapp && <span>📱 {dados.whatsapp}</span>}
              {dados.contato_nome && <span>👤 {dados.contato_nome}</span>}
              {dados.condicao_pagamento && <span>💳 {CONDICAO_LABEL[dados.condicao_pagamento] || dados.condicao_pagamento}</span>}
            </div>

            <div className="forn-detalhes-resumo">
              <div><span>Total gasto (histórico)</span><strong>{fmt(dados.total_gasto_historico)}</strong></div>
              <div><span>Total de compras</span><strong>{dados.total_compras}</strong></div>
            </div>

            <div className="forn-abas-linha">
              <div className="forn-abas">
                <button className={`forn-aba-btn${aba === 'compras' ? ' ativo' : ''}`} onClick={() => setAba('compras')}>Histórico de Compras</button>
                <button className={`forn-aba-btn${aba === 'produtos' ? ' ativo' : ''}`} onClick={() => setAba('produtos')}>Produtos Fornecidos</button>
              </div>
              <div className="forn-export-btns">
                <button
                  className="forn-export-btn"
                  onClick={exportarExcel}
                  disabled={!temDadosParaExportar || exportando !== null}
                  title="Exportar como Excel"
                >
                  {exportando === 'xlsx' ? '⏳' : '📊'} Excel
                </button>
                <button
                  className="forn-export-btn"
                  onClick={exportarPDF}
                  disabled={!temDadosParaExportar || exportando !== null}
                  title="Exportar como PDF"
                >
                  {exportando === 'pdf' ? '⏳' : '🖨️'} PDF
                </button>
              </div>
            </div>

            <div className="forn-detalhes-body">
              {aba === 'compras' && (
                dados.compras.length === 0 ? (
                  <div className="cli-vazio" style={{ padding: 30 }}><p>Nenhuma compra registrada ainda.</p></div>
                ) : (
                  dados.compras.map(c => (
                    <div
                      key={c.id}
                      className={`forn-compra-linha forn-compra-linha--clicavel${c.status === 'cancelada' ? ' cancelada' : ''}`}
                      onClick={() => setCompraDetalheId(c.id)}
                      title="Clique para ver os itens dessa compra"
                    >
                      <div>
                        <strong>{fmtData(c.data_compra)}</strong>
                        {c.numero_nota && <span className="forn-compra-nota"> · Nota {c.numero_nota}</span>}
                        {c.status === 'cancelada' && <span className="forn-compra-tag-cancelada"> · Cancelada</span>}
                      </div>
                      <span className="forn-compra-forma">{c.forma_pagamento === 'a_vista' ? 'À vista' : 'A prazo'}</span>
                      <span className="forn-compra-valor">{fmt(c.valor_total)}</span>
                      {c.status === 'ativa' && (
                        <button
                          className="forn-compra-cancelar"
                          disabled={cancelando === c.id}
                          onClick={(e) => { e.stopPropagation(); cancelarCompra(c.id); }}
                        >
                          {cancelando === c.id ? '⏳' : '✕ Cancelar'}
                        </button>
                      )}
                    </div>
                  ))
                )
              )}

              {aba === 'produtos' && (
                dados.produtos_fornecidos.length === 0 ? (
                  <div className="cli-vazio" style={{ padding: 30 }}><p>Nenhum produto comprado desse fornecedor ainda.</p></div>
                ) : (
                  dados.produtos_fornecidos.map(p => (
                    <div key={p.produto_id} className="forn-produto-linha">
                      <span className="forn-produto-nome">{p.produto_nome}{p.produto_marca && <small> · {p.produto_marca}</small>}</span>
                      <div className="forn-produto-info">
                        <span className="forn-produto-qtd">Última compra: {fmtQ(p.ultima_quantidade, p.unidade_medida)}</span>
                        <span className="forn-produto-preco">{fmt(p.ultimo_preco)}{p.unidade_medida === 'kg' ? '/kg' : '/un'}</span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </>
        )}

        <div className="cli-modal-acoes">
          <button className="cli-modal-btn-cancelar" onClick={onFechar}>Fechar</button>
        </div>
      </div>

      {compraDetalheId && (
        <DetalheCompraModal
          compraId={compraDetalheId}
          onFechar={() => setCompraDetalheId(null)}
          fontScale={fontScale}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETALHE DE UMA COMPRA — itens completos (produto, qtd, custo,
   subtotal), aberto ao clicar numa linha do histórico
════════════════════════════════════════════════════════════ */
function DetalheCompraModal({ compraId, onFechar, fontScale = 1 }) {
  const [compra,  setCompra]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await apiFetch(`/api/compras/${compraId}`);
        const data = await resp.json();
        setCompra(resp.ok ? data : null);
      } catch { setCompra(null); }
      setLoading(false);
    })();
  }, [compraId]);

  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  return (
    <div className="cli-modal-overlay" onClick={onFechar}>
      <div className="cli-modal forn-modal-compra-detalhe forn-zoom-scope" style={{ '--forn-font-scale': fontScale }} onClick={e => e.stopPropagation()}>

        {loading ? (
          <div className="cli-loading"><div className="cli-spinner" /> Carregando…</div>
        ) : !compra ? (
          <div className="cli-vazio"><p>Compra não encontrada.</p></div>
        ) : (
          <>
            <div className="cli-modal-titulo">
              🧾 Compra de {fmtData(compra.data_compra)}
              {compra.status === 'cancelada' && <span className="forn-compra-tag-cancelada"> · Cancelada</span>}
            </div>
            <div className="forn-detalhes-sub">
              <span>🚚 {compra.fornecedor_nome}</span>
              {compra.numero_nota && <span>📄 Nota {compra.numero_nota}</span>}
              <span>{compra.forma_pagamento === 'a_vista' ? '💵 À vista' : '📆 A prazo'}</span>
            </div>

            <div className="forn-detalhe-itens">
              <div className="forn-detalhe-itens-header">
                <span>Produto</span>
                <span>Qtd.</span>
                <span>Custo unit.</span>
                <span>Subtotal</span>
              </div>
              {(compra.itens || []).length === 0 ? (
                <div className="cli-vazio" style={{ padding: 20 }}><p>Sem itens registrados.</p></div>
              ) : (
                compra.itens.map(i => (
                  <div key={i.id} className="forn-detalhe-item-linha">
                    <span className="forn-item-nome">{i.produto_nome}{i.produto_marca && <small> · {i.produto_marca}</small>}</span>
                    <span>{fmtQ(i.quantidade, i.unidade_medida)}</span>
                    <span>{fmt(i.preco_custo_unitario)}{i.unidade_medida === 'kg' ? '/kg' : '/un'}</span>
                    <span className="forn-item-subtotal">{fmt(i.subtotal)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="forn-total-box" style={{ marginTop: 12 }}>
              <span>Total da compra</span>
              <strong>{fmt(compra.valor_total)}</strong>
            </div>

            {compra.observacoes && (
              <div className="forn-detalhes-sub" style={{ marginTop: 10 }}>📝 {compra.observacoes}</div>
            )}
          </>
        )}

        <div className="cli-modal-acoes">
          <button className="cli-modal-btn-cancelar" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}