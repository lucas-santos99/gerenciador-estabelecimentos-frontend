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
// Fornecedor cadastrado com condição personalizada (ex: "12_dias") não
// está no mapa acima — formata de um jeito legível em vez de mostrar cru
function formatarCondicao(valor) {
  if (CONDICAO_LABEL[valor]) return CONDICAO_LABEL[valor];
  const m = /^(\d+)_dias$/.exec(valor || '');
  return m ? `${m[1]} dias` : valor;
}

const FORMA_PGTO_LABEL = { a_vista: 'À vista', a_prazo: 'Parcelado' };

/* ════════════════════════════════════════════════════════════ */
export default function Fornecedores({ estabelecimentoId, permissoes = null, isMerchant = true }) {
  const [tela,         setTela]         = useState('fornecedores'); // 'fornecedores' | 'contas'
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

      <div className="forn-tabs-topo">
        <button className={`forn-tab-topo${tela === 'fornecedores' ? ' ativo' : ''}`} onClick={() => setTela('fornecedores')}>
          🚚 Fornecedores
        </button>
        <button className={`forn-tab-topo${tela === 'contas' ? ' ativo' : ''}`} onClick={() => setTela('contas')}>
          💰 Contas a Pagar
        </button>
        <div className="forn-zoom-group" style={{ marginLeft: 'auto' }}>
          <button className="forn-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
          <button className="forn-zoom-btn" onClick={() => changeFontScale(0.1)} disabled={fontScale >= 1.6} title="Aumentar fonte">A+</button>
        </div>
      </div>

      {tela === 'contas' ? (
        <ContasFornecedores fontScale={fontScale} />
      ) : (
      <>
      <div className="cli-header">
        <input maxLength={100}
          className="cli-header-busca"
          placeholder="🔍 Buscar fornecedor…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div className="cli-header-btns">
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
                        {formatarCondicao(f.condicao_pagamento)}
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
      </>
      )}

    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CONTAS A PAGAR DE FORNECEDORES — visão agregada, todos os
   fornecedores juntos numa lista só (não precisa abrir um por um)
════════════════════════════════════════════════════════════ */
function ContasFornecedores({ fontScale = 1 }) {
  const [lista,       setLista]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('pendente'); // 'pendente' | 'paga' | 'atrasada'
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');
  const [pagando,     setPagando]     = useState(null);
  const [compraDetalheId, setCompraDetalheId] = useState(null);
  const [avisoAberto, setAvisoAberto] = useState(() => localStorage.getItem('forn-contapag-aviso-fechado') !== 'true');
  function fecharAviso() {
    setAvisoAberto(false);
    localStorage.setItem('forn-contapag-aviso-fechado', 'true');
  }
  function abrirAviso() {
    setAvisoAberto(true);
    localStorage.removeItem('forn-contapag-aviso-fechado');
  }

  async function carregar() {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/compras/contas-a-pagar?status=${filtroStatus}`);
      const data = await resp.json();
      setLista(Array.isArray(data) ? data : []);
    } catch { setLista([]); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroStatus]);

  async function pagar(contaId, fornecedorNome) {
    if (!window.confirm(`Marcar essa compra de "${fornecedorNome}" como paga?`)) return;
    setPagando(contaId);
    try {
      const resp = await apiFetch(`/api/financeiro/${contaId}/pagar`, { method: 'PUT' });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || 'Erro ao marcar como paga.'); setPagando(null); return; }
      carregar();
    } catch { alert('Erro ao marcar como paga.'); }
    setPagando(null);
  }

  return (
    <div className="forn-zoom-scope" style={{ '--forn-font-scale': fontScale }}>
      {avisoAberto ? (
      <div className="forn-contapag-explicacao">
        <span>💡</span>
        <span>
          Aqui ficam <strong>só as compras de fornecedor feitas a prazo</strong> — elas entram sozinhas quando você lança
          a compra. Contas de água, luz, aluguel etc. ficam no módulo <strong>Financeiro</strong>, separado daqui.
        </span>
        <button className="forn-contapag-explicacao-fechar" onClick={fecharAviso} title="Ocultar este aviso">✕</button>
      </div>
      ) : (
        <button className="forn-contapag-explicacao-reabrir" onClick={abrirAviso}>
          💡 Sobre esta aba
        </button>
      )}

      <div className="forn-contapag-header">
        <div className="forn-status-toggle">
          {['pendente', 'atrasada', 'paga'].map(s => (
            <button
              key={s}
              className={`forn-status-btn ${s}${filtroStatus === s ? ' ativo' : ''}`}
              onClick={() => setFiltroStatus(s)}
            >
              {s === 'pendente' ? '⏳ Pendente' : s === 'paga' ? '✅ Paga' : '🔴 Atrasada'}
            </button>
          ))}
        </div>
        <div className="forn-contapag-filtro-data">
          <span className="cli-form-label">De</span>
          <input className="cli-form-input" type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} />
          <span className="cli-form-label">Até</span>
          <input className="cli-form-input" type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} />
          {(filtroDataDe || filtroDataAte) && (
            <button className="forn-historico-limpar" onClick={() => { setFiltroDataDe(''); setFiltroDataAte(''); }}>✕ Limpar</button>
          )}
        </div>
      </div>

      {(() => {
        const listaFiltrada = lista.filter(c => {
          if (filtroDataDe && c.data_vencimento < filtroDataDe) return false;
          if (filtroDataAte && c.data_vencimento > filtroDataAte) return false;
          return true;
        });
        const totalFiltrado = listaFiltrada.reduce((s, c) => s + (parseFloat(c.valor) || 0), 0);
        const labelTotal = filtroStatus === 'paga' ? '💰 Total pago'
          : filtroStatus === 'atrasada' ? '🔴 Total atrasado'
          : '⏳ Total pendente';
        const periodoTexto = (filtroDataDe || filtroDataAte)
          ? ' no período selecionado'
          : '';

        return (
        <>
        {listaFiltrada.length > 0 && (
          <div className="forn-contapag-total">
            <span>{labelTotal}{periodoTexto}</span>
            <strong>{fmt(totalFiltrado)}</strong>
          </div>
        )}
        {loading ? (
        <div className="cli-loading"><div className="cli-spinner" /> Carregando…</div>
      ) : listaFiltrada.length === 0 ? (
        <div className="cli-vazio">
          <span className="cli-vazio-icon">✅</span>
          <p>Nenhuma conta {filtroStatus === 'pendente' ? 'pendente' : filtroStatus === 'paga' ? 'paga' : 'atrasada'} {(filtroDataDe || filtroDataAte) ? 'nesse período' : 'no momento'}.</p>
        </div>
      ) : (
        <div className="forn-contapag-grid">
          {listaFiltrada.map(c => (
            <div key={c.conta_a_pagar_id} className={`forn-contapag-card ${c.status}`}>
              <div className="forn-contapag-card-header">
                <span className="forn-contapag-nome">{c.fornecedor_nome}</span>
                <span className={`forn-contapag-badge ${c.status}`}>{c.status}</span>
              </div>
              {c.numero_nota && <span className="forn-compra-nota">Nota {c.numero_nota}</span>}
              <div className="forn-contapag-card-body">
                <div className="forn-contapag-info-row">
                  <span className="forn-contapag-info-label">Vencimento</span>
                  <span className="forn-contapag-info-valor">{fmtData(c.data_vencimento)}</span>
                </div>
                <div className="forn-contapag-info-row">
                  <span className="forn-contapag-info-label">Valor</span>
                  <span className="forn-contapag-info-valor valor-grande">{fmt(c.valor)}</span>
                </div>
              </div>
              <div className="forn-contapag-card-acoes">
                <button className="forn-contapag-card-btn ver" onClick={() => setCompraDetalheId(c.compra_id)}>
                  👁 Ver
                </button>
                {c.status !== 'paga' && (
                  <button
                    className="forn-contapag-card-btn pagar"
                    disabled={pagando === c.conta_a_pagar_id}
                    onClick={() => pagar(c.conta_a_pagar_id, c.fornecedor_nome)}
                  >
                    {pagando === c.conta_a_pagar_id ? '⏳' : '💰 Pagar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      );
      })()}

      {compraDetalheId && (
        <DetalheCompraModal
          compraId={compraDetalheId}
          onFechar={() => setCompraDetalheId(null)}
          fontScale={fontScale}
          onPago={carregar}
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
  const [pagando,    setPagando]    = useState(null);
  const [exportando, setExportando] = useState(null); // 'xlsx' | 'pdf' | null
  const [compraDetalheId, setCompraDetalheId] = useState(null);

  // Busca dentro do histórico — por nº da nota ou intervalo de data
  const [buscaNota,   setBuscaNota]   = useState('');
  const [filtroDataDe, setFiltroDataDe] = useState('');
  const [filtroDataAte, setFiltroDataAte] = useState('');

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

  // Paga a compra a prazo direto por aqui — chama o mesmo endpoint que
  // o módulo Financeiro usa, só que sem precisar sair de Fornecedores.
  async function pagarCompra(contaId, nomeFornecedor) {
    if (!window.confirm(`Marcar essa compra de "${nomeFornecedor}" como paga?`)) return;
    setPagando(contaId);
    try {
      const resp = await apiFetch(`/api/financeiro/${contaId}/pagar`, { method: 'PUT' });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || 'Erro ao marcar como paga.'); setPagando(null); return; }
      const respD = await apiFetch(`/api/fornecedores/${fornecedorId}`);
      setDados(await respD.json());
      onAtualizar?.();
    } catch { alert('Erro ao marcar como paga.'); }
    setPagando(null);
  }

  /* ── Exportação (mesmo padrão do Inventário) ─────────────── */
  const nomeArquivoBase = () => (dados?.nome || 'fornecedor').replace(/\s+/g, '_');

  // Filtra o histórico por nº da nota (contém) e/ou intervalo de data —
  // usado tanto na lista quanto na exportação, pra exportar exatamente
  // o que está sendo mostrado na tela.
  function comprasFiltradas() {
    if (!dados?.compras) return [];
    return dados.compras.filter(c => {
      if (buscaNota.trim() && !(c.numero_nota || '').toLowerCase().includes(buscaNota.trim().toLowerCase())) return false;
      if (filtroDataDe && c.data_compra < filtroDataDe) return false;
      if (filtroDataAte && c.data_compra > filtroDataAte) return false;
      return true;
    });
  }

  function linhasParaExportar() {
    if (aba === 'compras') {
      const linhas = [];
      comprasFiltradas().forEach(c => {
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
    ? (comprasFiltradas().length > 0)
    : (dados?.produtos_fornecidos?.length > 0);

  return (
    <div className="cli-modal-overlay">
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
              {dados.condicao_pagamento && <span>💳 {formatarCondicao(dados.condicao_pagamento)}</span>}
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
                <div className="forn-historico-filtros">
                  <input maxLength={50}
                    className="cli-form-input forn-historico-busca"
                    placeholder="🔍 Buscar por nº da nota…"
                    value={buscaNota}
                    onChange={e => setBuscaNota(e.target.value)}
                  />
                  <input
                    className="cli-form-input"
                    type="date"
                    value={filtroDataDe}
                    onChange={e => setFiltroDataDe(e.target.value)}
                    title="Data inicial"
                  />
                  <span className="forn-historico-ate">até</span>
                  <input
                    className="cli-form-input"
                    type="date"
                    value={filtroDataAte}
                    onChange={e => setFiltroDataAte(e.target.value)}
                    title="Data final"
                  />
                  {(buscaNota || filtroDataDe || filtroDataAte) && (
                    <button className="forn-historico-limpar" onClick={() => { setBuscaNota(''); setFiltroDataDe(''); setFiltroDataAte(''); }}>
                      ✕ Limpar
                    </button>
                  )}
                </div>
              )}

              {aba === 'compras' && (
                comprasFiltradas().length === 0 ? (
                  <div className="cli-vazio" style={{ padding: 30 }}>
                    <p>{dados.compras.length === 0 ? 'Nenhuma compra registrada ainda.' : 'Nenhuma compra encontrada com esse filtro.'}</p>
                  </div>
                ) : (
                  comprasFiltradas().map(c => (
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
                      <span className="forn-compra-forma">
                        {c.forma_pagamento === 'a_vista' ? 'À vista' : 'A prazo'}
                        {c.forma_pagamento === 'a_prazo' && c.data_vencimento_prazo && (
                          <small> · vence {fmtData(c.data_vencimento_prazo)}</small>
                        )}
                        {c.forma_pagamento === 'a_prazo' && c.status_conta_pagar === 'paga' && (
                          <small className="forn-compra-paga"> · ✓ Paga</small>
                        )}
                      </span>
                      <span className="forn-compra-valor">{fmt(c.valor_total)}</span>
                      {c.status === 'ativa' && (
                        <div className="forn-compra-acoes" onClick={e => e.stopPropagation()}>
                          {c.forma_pagamento === 'a_prazo' && c.conta_a_pagar_id && ['pendente', 'atrasada'].includes(c.status_conta_pagar) && (
                            <button
                              className="forn-compra-pagar"
                              disabled={pagando === c.conta_a_pagar_id}
                              onClick={() => pagarCompra(c.conta_a_pagar_id, dados.nome)}
                            >
                              {pagando === c.conta_a_pagar_id ? '⏳' : '💰 Pagar'}
                            </button>
                          )}
                          <button
                            className="forn-compra-cancelar"
                            disabled={cancelando === c.id}
                            onClick={() => cancelarCompra(c.id)}
                          >
                            {cancelando === c.id ? '⏳' : '✕ Cancelar'}
                          </button>
                        </div>
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
          onPago={async () => {
            const respD = await apiFetch(`/api/fornecedores/${fornecedorId}`);
            setDados(await respD.json());
            onAtualizar?.();
          }}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETALHE DE UMA COMPRA — itens completos (produto, qtd, custo,
   subtotal), aberto ao clicar numa linha do histórico
════════════════════════════════════════════════════════════ */
function DetalheCompraModal({ compraId, onFechar, fontScale = 1, onPago }) {
  const [compra,  setCompra]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagando, setPagando] = useState(false);

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

  async function pagarAqui() {
    if (!compra?.conta_a_pagar_id) return;
    if (!window.confirm(`Marcar essa compra de "${compra.fornecedor_nome}" como paga?`)) return;
    setPagando(true);
    try {
      const resp = await apiFetch(`/api/financeiro/${compra.conta_a_pagar_id}/pagar`, { method: 'PUT' });
      const data = await resp.json();
      if (!resp.ok) { alert(data.error || 'Erro ao marcar como paga.'); setPagando(false); return; }
      setCompra(prev => ({ ...prev, status_conta_pagar: 'paga' }));
      onPago?.();
    } catch { alert('Erro ao marcar como paga.'); }
    setPagando(false);
  }

  return (
    <div className="cli-modal-overlay">
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
              {compra.forma_pagamento === 'a_prazo' && compra.data_vencimento_prazo && (
                <span>🗓 Vence {fmtData(compra.data_vencimento_prazo)}</span>
              )}
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

            {compra.forma_pagamento === 'a_prazo' && compra.conta_a_pagar_id && (
              compra.status_conta_pagar === 'paga' ? (
                <div className="forn-compra-paga-box">✓ Essa conta já está paga</div>
              ) : compra.status === 'ativa' && (
                <button className="forn-compra-pagar forn-compra-pagar--grande" disabled={pagando} onClick={pagarAqui}>
                  {pagando ? '⏳ Marcando…' : '💰 Marcar como paga'}
                </button>
              )
            )}

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