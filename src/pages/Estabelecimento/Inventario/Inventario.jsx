// src/pages/Estabelecimento/Inventario/Inventario.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { apiFetch } from '../../../utils/api';
import './Inventario.css';

/* ─── helpers ─────────────────────────────────────────────── */
const fmt  = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtQ = (v, u) => u === 'kg'
  ? parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg'
  : Math.trunc(parseFloat(v || 0)) + ' un';
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtData = iso => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_LABEL  = { em_andamento: 'Em andamento', finalizado: 'Finalizado', cancelado: 'Cancelado' };
const STATUS_CLASSE = { em_andamento: 'inv-badge-andamento', finalizado: 'inv-badge-finalizado', cancelado: 'inv-badge-cancelado' };
const TIPO_LABEL    = { completo: 'Estoque completo', por_categoria: 'Por categoria' };

const TIPOS_AJUSTE = [
  { key: 'entrada',   label: '📦 Entrada',    cor: 'verde',    desc: 'Reposição de mercadoria, compra de fornecedor. Soma ao estoque atual.' },
  { key: 'saida',     label: '📤 Saída',       cor: 'azul',     desc: 'Saída não registrada como venda. Subtrai do estoque atual.' },
  { key: 'perda',     label: '🗑️ Perda',       cor: 'vermelho', desc: 'Produto vencido, danificado ou extraviado. Subtrai do estoque.' },
  { key: 'devolucao', label: '↩️ Devolução',   cor: 'roxo',     desc: 'Devolução de cliente ou ao fornecedor. Soma ao estoque atual.' },
  { key: 'correcao',  label: '✏️ Correção',    cor: 'amarelo',  desc: 'Define o estoque como o valor exato informado, substituindo o atual.' },
];

const MOTIVOS_SUGERIDOS = {
  entrada:   ['Compra de fornecedor', 'Reposição de estoque', 'Transferência entre lojas', 'Bonificação de fornecedor'],
  saida:     ['Uso interno', 'Amostras/degustação', 'Transferência entre lojas', 'Erro de sistema'],
  perda:     ['Produto vencido', 'Produto danificado', 'Produto extraviado', 'Furto/roubo', 'Avaria no transporte'],
  devolucao: ['Devolução de cliente insatisfeito', 'Troca de produto', 'Devolução ao fornecedor'],
  correcao:  ['Acerto de contagem manual', 'Divergência com nota fiscal', 'Corrigir erro de cadastro'],
};

/* ════════════════════════════════════════════════════════════
   MODAL — NOVO INVENTÁRIO
════════════════════════════════════════════════════════════ */
function ModalNovoInventario({ estabelecimentoId, categorias, onCriado, onFechar }) {
  const [form,     setForm]     = useState({ nome: `Inventário ${new Date().toLocaleDateString('pt-BR')}`, tipo: 'completo', categoria_id: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');
  const nomeRef = useRef(null);

  useEffect(() => { setTimeout(() => nomeRef.current?.focus(), 50); }, []);
  useEffect(() => {
    function esc(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  async function criar(e) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Nome é obrigatório.'); return; }
    if (form.tipo === 'por_categoria' && !form.categoria_id) { setErro('Selecione uma categoria.'); return; }
    setSalvando(true); setErro('');
    try {
      const resp = await apiFetch('/api/inventario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao criar inventário');
      onCriado(data);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="inv-modal-overlay" onClick={onFechar}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>
        <div className="inv-modal-titulo">📋 Novo Inventário</div>
        <div className="inv-modal-desc">
          Um inventário cria um <strong>snapshot</strong> do estoque atual e permite registrar a contagem física dos produtos.
        </div>
        {erro && <div className="inv-modal-erro">⚠️ {erro}</div>}
        <form onSubmit={criar}>
          <div className="inv-form-group">
            <label className="inv-label">Nome do inventário *</label>
            <input ref={nomeRef} className="inv-input" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Inventário Mensal — Junho 2026" />
            <span className="inv-hint">Identifique o inventário com data ou motivo para consulta futura.</span>
          </div>
          <div className="inv-form-group">
            <label className="inv-label">Escopo *</label>
            <div className="inv-tipo-toggle">
              {[
                { v: 'completo',       label: '📦 Estoque Completo',  desc: 'Todos os produtos do estabelecimento' },
                { v: 'por_categoria',  label: '🗂️ Por Categoria',     desc: 'Somente produtos de uma categoria' },
              ].map(op => (
                <button key={op.v} type="button" className={`inv-tipo-btn${form.tipo === op.v ? ' ativo' : ''}`} onClick={() => setForm(p => ({ ...p, tipo: op.v, categoria_id: '' }))}>
                  <span className="inv-tipo-label">{op.label}</span>
                  <span className="inv-tipo-desc">{op.desc}</span>
                </button>
              ))}
            </div>
          </div>
          {form.tipo === 'por_categoria' && (
            <div className="inv-form-group">
              <label className="inv-label">Categoria *</label>
              <select className="inv-select" value={form.categoria_id} onChange={e => setForm(p => ({ ...p, categoria_id: e.target.value }))}>
                <option value="">Selecione a categoria…</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          )}
          <div className="inv-form-group">
            <label className="inv-label">Observações</label>
            <textarea className="inv-textarea" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="Ex: Inventário antes do fechamento mensal, turno da manhã…" />
          </div>
          <div className="inv-modal-acoes">
            <button type="button" className="inv-btn-cancelar" onClick={onFechar}>Cancelar (Esc)</button>
            <button type="submit" className="inv-btn-confirmar" disabled={salvando}>
              {salvando ? '⏳ Criando…' : '✓ Iniciar inventário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TELA DE CONTAGEM — quando um inventário está em andamento
════════════════════════════════════════════════════════════ */
function TelaContagem({ inventario, onAtualizado, onFinalizado, onCancelado }) {
  const [itens,         setItens]         = useState(inventario.itens || []);
  const [busca,         setBusca]         = useState('');
  const [filtro,        setFiltro]        = useState('todos'); // todos | nao_contados | com_diferenca
  const [salvando,      setSalvando]      = useState({}); // { [itemId]: bool }
  const [contadores,    setContadores]    = useState({ contados: inventario.produtos_contados, divergencias: inventario.total_divergencias });
  const [confirmarFin,  setConfirmarFin]  = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [aplicarOp,     setAplicarOp]     = useState('divergencias'); // 'divergencias' | 'todos'
  const [loading,       setLoading]       = useState(false);
  const [erro,          setErro]          = useState('');
  const [valores,       setValores]       = useState(() => {
    const m = {};
    (inventario.itens || []).forEach(i => {
      m[i.id] = i.estoque_contado !== null ? String(i.estoque_contado) : '';
    });
    return m;
  });

  const inputRefs = useRef({});

  const itensFiltrados = itens.filter(item => {
    const matchBusca = !busca || item.produto_nome.toLowerCase().includes(busca.toLowerCase()) || (item.produto_marca || '').toLowerCase().includes(busca.toLowerCase());
    if (!matchBusca) return false;
    if (filtro === 'nao_contados')  return item.estoque_contado === null;
    if (filtro === 'com_diferenca') return item.diferenca !== null && item.diferenca !== 0;
    return true;
  });

  const progresso = Math.round((contadores.contados / (inventario.total_produtos || 1)) * 100);

  async function salvarItem(item) {
    const val = valores[item.id];
    if (val === '' || val === null || val === undefined) return;
    const qtd = parseFloat(String(val).replace(',', '.'));
    if (isNaN(qtd) || qtd < 0) return;

    setSalvando(p => ({ ...p, [item.id]: true }));
    try {
      const resp = await apiFetch(`/api/inventario/${inventario.id}/item/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estoque_contado: qtd }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      const diferenca = qtd - parseFloat(item.estoque_sistema);
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, estoque_contado: qtd, diferenca } : i));
      setContadores({ contados: data.produtos_contados, divergencias: data.total_divergencias });
      if (data.produtos_contados !== undefined) onAtualizado?.(data.produtos_contados);
    } catch (err) {
      setErro(err.message);
      setTimeout(() => setErro(''), 3000);
    } finally {
      setSalvando(p => ({ ...p, [item.id]: false }));
    }
  }

  async function finalizar() {
    setLoading(true); setErro('');
    try {
      const resp = await apiFetch(`/api/inventario/${inventario.id}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aplicar_apenas_divergencias: aplicarOp === 'divergencias' }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      onFinalizado?.(data);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); setConfirmarFin(false); }
  }

  async function cancelar() {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/inventario/${inventario.id}/cancelar`, { method: 'PATCH' });
      if (!resp.ok) throw new Error('Erro ao cancelar');
      onCancelado?.();
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); setConfirmCancel(false); }
  }

  function difClass(d) {
    if (d === null || d === undefined) return '';
    if (d === 0) return 'inv-dif-ok';
    return d > 0 ? 'inv-dif-mais' : 'inv-dif-menos';
  }

  function exportarExcel() {
    const dados = itens.map(i => ({
      'Produto':           i.produto_nome,
      'Marca':             i.produto_marca || '',
      'Unidade':           i.unidade_medida,
      'Estoque Sistema':   parseFloat(i.estoque_sistema),
      'Estoque Contado':   i.estoque_contado !== null ? parseFloat(i.estoque_contado) : '',
      'Diferença':         i.diferenca !== null ? parseFloat(i.diferenca) : '',
      'Status':            i.estoque_contado === null ? 'Não contado' : i.diferenca === 0 ? 'OK' : i.diferenca > 0 ? 'Sobra' : 'Falta',
      'Observação':        i.observacao || '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contagem');
    XLSX.writeFile(wb, `${inventario.nome.replace(/\s+/g, '_')}.xlsx`);
  }

  return (
    <div className="inv-contagem-tela">

      {/* Header da contagem */}
      <div className="inv-contagem-header">
        <div className="inv-contagem-header-top">
          <div>
            <div className="inv-contagem-nome">{inventario.nome}</div>
            <div className="inv-contagem-meta">
              {TIPO_LABEL[inventario.tipo]} · Iniciado por {inventario.usuario_nome} · {fmtData(inventario.iniciado_em)}
            </div>
          </div>
          <div className="inv-contagem-header-acoes">
            <button className="inv-btn-outline" onClick={exportarExcel} title="Exportar como Excel">📊 Excel</button>
            <button className="inv-btn-outline inv-btn-perigo" onClick={() => setConfirmCancel(true)}>✕ Cancelar</button>
            <button className="inv-btn-finalizar" onClick={() => setConfirmarFin(true)} disabled={contadores.contados === 0}>
              ✓ Finalizar inventário
            </button>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="inv-progresso-wrap">
          <div className="inv-progresso-bar">
            <div className="inv-progresso-fill" style={{ width: `${progresso}%` }} />
          </div>
          <div className="inv-progresso-info">
            <span className="inv-progresso-num">{contadores.contados} <span>/ {inventario.total_produtos}</span> contados</span>
            <span className={`inv-progresso-div${contadores.divergencias > 0 ? ' tem-div' : ''}`}>
              {contadores.divergencias > 0 ? `⚠️ ${contadores.divergencias} divergência(s)` : '✓ Sem divergências'}
            </span>
            <span className="inv-progresso-pct">{progresso}%</span>
          </div>
        </div>

        {/* Filtros */}
        <div className="inv-contagem-filtros">
          <input className="inv-contagem-busca" placeholder="🔍 Buscar produto…" value={busca} onChange={e => setBusca(e.target.value)} />
          <div className="inv-filtro-btns">
            {[
              { k: 'todos',          label: `Todos (${itens.length})` },
              { k: 'nao_contados',   label: `⬜ Não contados (${itens.filter(i => i.estoque_contado === null).length})` },
              { k: 'com_diferenca',  label: `⚠️ Com diferença (${itens.filter(i => i.diferenca !== null && i.diferenca !== 0).length})` },
            ].map(f => (
              <button key={f.k} className={`inv-filtro-btn${filtro === f.k ? ' ativo' : ''}`} onClick={() => setFiltro(f.k)}>{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      {erro && <div className="inv-erro-bar">⚠️ {erro}</div>}

      {/* Legenda */}
      <div className="inv-legenda">
        <span className="inv-legenda-item inv-dif-ok">■ OK (sem diferença)</span>
        <span className="inv-legenda-item inv-dif-mais">■ Sobra (contado &gt; sistema)</span>
        <span className="inv-legenda-item inv-dif-menos">■ Falta (contado &lt; sistema)</span>
        <span className="inv-legenda-item">□ Não contado</span>
      </div>

      {/* Cabeçalho da tabela */}
      <div className="inv-tabela-header">
        <span className="inv-col-produto">Produto</span>
        <span className="inv-col-sistema">Estoque sistema</span>
        <span className="inv-col-contado">Qtd. contada</span>
        <span className="inv-col-diferenca">Diferença</span>
      </div>

      {/* Lista de itens */}
      <div className="inv-itens-lista">
        {itensFiltrados.length === 0 && (
          <div className="inv-vazio">
            <span className="inv-vazio-icon">🔍</span>
            <p>Nenhum produto encontrado</p>
            <small>Tente ajustar o filtro ou a busca.</small>
          </div>
        )}
        {itensFiltrados.map(item => {
          const val = valores[item.id] ?? '';
          const qtdContada = val !== '' ? parseFloat(String(val).replace(',', '.')) : null;
          const difLocal = qtdContada !== null ? qtdContada - parseFloat(item.estoque_sistema) : null;
          return (
            <div key={item.id} className={`inv-item${item.estoque_contado !== null ? ' contado' : ''}`}>
              <div className="inv-col-produto">
                <span className="inv-item-nome">{item.produto_nome}</span>
                {item.produto_marca && <span className="inv-item-marca"> · {item.produto_marca}</span>}
              </div>
              <div className="inv-col-sistema">
                <span className="inv-item-sistema">{fmtQ(item.estoque_sistema, item.unidade_medida)}</span>
              </div>
              <div className="inv-col-contado">
                <input
                  ref={el => inputRefs.current[item.id] = el}
                  className="inv-item-input"
                  type="number"
                  min="0"
                  step={item.unidade_medida === 'kg' ? '0.001' : '1'}
                  value={val}
                  onChange={e => setValores(p => ({ ...p, [item.id]: e.target.value }))}
                  onBlur={() => salvarItem(item)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      salvarItem(item);
                      // Focar no próximo input
                      const idx = itensFiltrados.findIndex(i => i.id === item.id);
                      const prox = itensFiltrados[idx + 1];
                      if (prox) inputRefs.current[prox.id]?.focus();
                    }
                  }}
                  placeholder={`0${item.unidade_medida === 'kg' ? '.000' : ''}`}
                />
                {salvando[item.id] && <span className="inv-item-saving">⏳</span>}
              </div>
              <div className={`inv-col-diferenca ${difClass(difLocal ?? item.diferenca)}`}>
                {(difLocal !== null || item.diferenca !== null) ? (
                  (() => {
                    const d = difLocal ?? item.diferenca;
                    if (d === 0) return <span>✓ OK</span>;
                    return <span>{d > 0 ? '+' : ''}{fmtQ(d, item.unidade_medida)}</span>;
                  })()
                ) : (
                  <span className="inv-dif-vazio">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal confirmar finalização */}
      {confirmarFin && (
        <div className="inv-modal-overlay" onClick={() => setConfirmarFin(false)}>
          <div className="inv-modal" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-titulo">✓ Finalizar inventário</div>
            {contadores.contados < inventario.total_produtos && (
              <div className="inv-modal-aviso">
                ⚠️ Atenção: <strong>{inventario.total_produtos - contadores.contados} produto(s)</strong> ainda não foram contados. Eles não serão ajustados no estoque.
              </div>
            )}
            <div className="inv-form-group" style={{ marginTop: 16 }}>
              <label className="inv-label">O que aplicar ao estoque?</label>
              <div className="inv-radio-group">
                <label className={`inv-radio-option${aplicarOp === 'divergencias' ? ' ativo' : ''}`}>
                  <input type="radio" checked={aplicarOp === 'divergencias'} onChange={() => setAplicarOp('divergencias')} />
                  <div>
                    <div className="inv-radio-label">Somente divergências ({contadores.divergencias})</div>
                    <div className="inv-radio-desc">Ajusta apenas produtos onde a quantidade contada é diferente do sistema. Recomendado.</div>
                  </div>
                </label>
                <label className={`inv-radio-option${aplicarOp === 'todos' ? ' ativo' : ''}`}>
                  <input type="radio" checked={aplicarOp === 'todos'} onChange={() => setAplicarOp('todos')} />
                  <div>
                    <div className="inv-radio-label">Todos os contados ({contadores.contados})</div>
                    <div className="inv-radio-desc">Aplica o valor contado para todos os produtos, incluindo os sem divergência.</div>
                  </div>
                </label>
              </div>
            </div>
            {erro && <div className="inv-modal-erro">⚠️ {erro}</div>}
            <div className="inv-modal-acoes">
              <button className="inv-btn-cancelar" onClick={() => setConfirmarFin(false)}>Voltar</button>
              <button className="inv-btn-confirmar" onClick={finalizar} disabled={loading}>
                {loading ? '⏳ Aplicando…' : '✓ Confirmar e finalizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar cancelamento */}
      {confirmCancel && (
        <div className="inv-modal-overlay" onClick={() => setConfirmCancel(false)}>
          <div className="inv-modal inv-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="inv-confirm-icone">⚠️</div>
            <div className="inv-modal-titulo">Cancelar inventário?</div>
            <div className="inv-modal-desc">Todo o progresso de contagem será perdido. O estoque não será alterado.</div>
            <div className="inv-modal-acoes">
              <button className="inv-btn-cancelar" onClick={() => setConfirmCancel(false)}>Voltar</button>
              <button className="inv-btn-confirmar inv-btn-danger" onClick={cancelar} disabled={loading}>
                {loading ? '…' : '✕ Sim, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABA CONTAGENS — lista e gestão de inventários
════════════════════════════════════════════════════════════ */
function AbaContagens({ estabelecimentoId, categorias }) {
  const [inventarios,     setInventarios]     = useState([]);
  const [total,           setTotal]           = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [showNovo,        setShowNovo]        = useState(false);
  const [inventarioAtivo, setInventarioAtivo] = useState(null); // quando abrindo contagem
  const [loadingAbrir,    setLoadingAbrir]    = useState(null);
  const [filtroStatus,    setFiltroStatus]    = useState('');
  const [sucesso,         setSucesso]         = useState('');
  const [erro,            setErro]            = useState('');
  const [pagina,          setPagina]          = useState(0);
  const LIMIT = 10;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: pagina * LIMIT });
      if (filtroStatus) params.append('status', filtroStatus);
      const resp = await apiFetch(`/api/inventario?${params}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setInventarios(data.inventarios || []);
      setTotal(data.total || 0);
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  }, [pagina, filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrirContagem(inv) {
    setLoadingAbrir(inv.id);
    try {
      const resp = await apiFetch(`/api/inventario/${inv.id}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setInventarioAtivo(data);
    } catch (err) { setErro(err.message); }
    finally { setLoadingAbrir(null); }
  }

  function handleCriado(inv) {
    setShowNovo(false);
    abrirContagem(inv);
    carregar();
  }

  function handleFinalizado(resultado) {
    setInventarioAtivo(null);
    setSucesso(`✓ Inventário finalizado! ${resultado.ajustes} produto(s) ajustado(s). ${resultado.valor_divergencia > 0 ? `Valor da divergência: ${fmt(resultado.valor_divergencia)}` : ''}`);
    setTimeout(() => setSucesso(''), 6000);
    carregar();
  }

  function handleCancelado() {
    setInventarioAtivo(null);
    carregar();
  }

  function exportarExcel(inv) {
    // Exporta o histórico de inventários
    const dados = [{
      'Nome': inv.nome,
      'Status': STATUS_LABEL[inv.status],
      'Tipo': TIPO_LABEL[inv.tipo],
      'Total Produtos': inv.total_produtos,
      'Contados': inv.produtos_contados,
      'Divergências': inv.total_divergencias,
      'Iniciado por': inv.usuario_nome,
      'Iniciado em': fmtData(inv.iniciado_em),
      'Finalizado em': inv.finalizado_em ? fmtData(inv.finalizado_em) : '—',
    }];
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `${inv.nome.replace(/\s+/g, '_')}.xlsx`);
  }

  if (inventarioAtivo) {
    return (
      <TelaContagem
        inventario={inventarioAtivo}
        onAtualizado={() => {}}
        onFinalizado={handleFinalizado}
        onCancelado={handleCancelado}
      />
    );
  }

  return (
    <div className="inv-aba">
      <div className="inv-aba-header">
        <div>
          <div className="inv-aba-titulo">📋 Contagens de Inventário</div>
          <div className="inv-aba-desc">Crie sessões de contagem física e compare com o estoque do sistema.</div>
        </div>
        <button className="inv-btn-primary" onClick={() => setShowNovo(true)}>+ Nova contagem</button>
      </div>

      {sucesso && <div className="inv-sucesso">{sucesso}</div>}
      {erro    && <div className="inv-erro-bar">⚠️ {erro}</div>}

      {/* Filtros */}
      <div className="inv-filtros-row">
        <div className="inv-filtro-btns">
          {[
            { k: '',             label: `Todos (${total})` },
            { k: 'em_andamento', label: '🟡 Em andamento' },
            { k: 'finalizado',   label: '✅ Finalizados' },
            { k: 'cancelado',    label: '❌ Cancelados' },
          ].map(f => (
            <button key={f.k} className={`inv-filtro-btn${filtroStatus === f.k ? ' ativo' : ''}`} onClick={() => { setFiltroStatus(f.k); setPagina(0); }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="inv-loading"><div className="inv-spinner" />Carregando inventários…</div>
      ) : inventarios.length === 0 ? (
        <div className="inv-vazio">
          <span className="inv-vazio-icon">📋</span>
          <p>Nenhum inventário encontrado</p>
          <small>Clique em "+ Nova contagem" para iniciar o primeiro inventário.</small>
        </div>
      ) : (
        <div className="inv-cards">
          {inventarios.map(inv => (
            <div key={inv.id} className={`inv-card inv-card-${inv.status}`}>
              <div className="inv-card-top">
                <div className="inv-card-info">
                  <span className={`inv-badge ${STATUS_CLASSE[inv.status]}`}>{STATUS_LABEL[inv.status]}</span>
                  <span className="inv-badge inv-badge-tipo">{TIPO_LABEL[inv.tipo]}</span>
                </div>
                <div className="inv-card-acoes">
                  {inv.status === 'em_andamento' && (
                    <button className="inv-btn-outline inv-btn-sm" onClick={() => abrirContagem(inv)} disabled={loadingAbrir === inv.id}>
                      {loadingAbrir === inv.id ? '⏳' : '▶️ Continuar contagem'}
                    </button>
                  )}
                  {inv.status === 'finalizado' && (
                    <button className="inv-btn-outline inv-btn-sm" onClick={() => exportarExcel(inv)} title="Exportar Excel">📊</button>
                  )}
                </div>
              </div>
              <div className="inv-card-nome">{inv.nome}</div>
              <div className="inv-card-meta">
                <span>👤 {inv.usuario_nome}</span>
                <span>📅 {fmtData(inv.iniciado_em)}</span>
                {inv.finalizado_em && <span>✓ {fmtData(inv.finalizado_em)}</span>}
              </div>
              <div className="inv-card-stats">
                <div className="inv-stat">
                  <span className="inv-stat-val">{inv.total_produtos}</span>
                  <span className="inv-stat-label">Produtos</span>
                </div>
                <div className="inv-stat">
                  <span className="inv-stat-val">{inv.produtos_contados}</span>
                  <span className="inv-stat-label">Contados</span>
                </div>
                <div className={`inv-stat${inv.total_divergencias > 0 ? ' inv-stat-alerta' : ''}`}>
                  <span className="inv-stat-val">{inv.total_divergencias}</span>
                  <span className="inv-stat-label">Divergências</span>
                </div>
                {inv.status === 'em_andamento' && (
                  <div className="inv-stat">
                    <span className="inv-stat-val">{Math.round((inv.produtos_contados / (inv.total_produtos || 1)) * 100)}%</span>
                    <span className="inv-stat-label">Progresso</span>
                  </div>
                )}
              </div>
              {inv.observacoes && <div className="inv-card-obs">💬 {inv.observacoes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Paginação */}
      {total > LIMIT && (
        <div className="inv-paginacao">
          <span className="inv-pag-info">Mostrando {pagina * LIMIT + 1}–{Math.min((pagina + 1) * LIMIT, total)} de {total}</span>
          <div className="inv-pag-btns">
            <button className="inv-pag-btn" onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}>← Anterior</button>
            <button className="inv-pag-btn" onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * LIMIT >= total}>Próximo →</button>
          </div>
        </div>
      )}

      {showNovo && (
        <ModalNovoInventario
          estabelecimentoId={estabelecimentoId}
          categorias={categorias}
          onCriado={handleCriado}
          onFechar={() => setShowNovo(false)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABA MOVIMENTAÇÕES
════════════════════════════════════════════════════════════ */
function AbaMovimentacoes({ estabelecimentoId }) {
  const [movs,    setMovs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagina,  setPagina]  = useState(0);
  const [filtros, setFiltros] = useState({ tipo: '', produto: '', data_inicio: hoje(), data_fim: hoje() });
  const [busca,   setBusca]   = useState('');
  const LIMIT = 50;

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ limit: LIMIT, offset: pagina * LIMIT });
      if (filtros.tipo)        p.append('tipo', filtros.tipo);
      if (busca.trim())        p.append('produto', busca.trim());
      if (filtros.data_inicio) p.append('data_inicio', filtros.data_inicio);
      if (filtros.data_fim)    p.append('data_fim', filtros.data_fim);
      const resp = await apiFetch(`/api/inventario/movimentacoes/listar?${p}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);
      setMovs(data.movimentacoes || []);
      setTotal(data.total || 0);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [pagina, filtros, busca]);

  useEffect(() => { carregar(); }, [carregar]);

  function exportarExcel() {
    const dados = movs.map(m => ({
      'Data/Hora':          fmtData(m.created_at),
      'Produto':            m.produto_nome,
      'Marca':              m.produto_marca || '',
      'Tipo':               TIPO_MOV_LABEL[m.tipo] || m.tipo,
      'Qtd. Anterior':      parseFloat(m.quantidade_anterior),
      'Movimentação':       parseFloat(m.quantidade_movimentacao),
      'Qtd. Posterior':     parseFloat(m.quantidade_posterior),
      'Motivo':             m.motivo || '',
      'Usuário':            m.usuario_nome || '',
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimentações');
    XLSX.writeFile(wb, `Movimentacoes_${filtros.data_inicio}_${filtros.data_fim}.xlsx`);
  }

  const TIPO_MOV_LABEL = {
    entrada: '📦 Entrada', saida: '📤 Saída', perda: '🗑️ Perda',
    devolucao: '↩️ Devolução', correcao: '✏️ Correção', inventario_ajuste: '📋 Inventário',
  };

  const TIPO_MOV_COR = {
    entrada: 'verde', saida: 'azul', perda: 'vermelho',
    devolucao: 'roxo', correcao: 'amarelo', inventario_ajuste: 'teal',
  };

  return (
    <div className="inv-aba">
      <div className="inv-aba-header">
        <div>
          <div className="inv-aba-titulo">📊 Movimentações de Estoque</div>
          <div className="inv-aba-desc">Histórico de todas as entradas, saídas e ajustes manuais registrados.</div>
        </div>
        <button className="inv-btn-outline" onClick={exportarExcel} disabled={movs.length === 0}>📊 Exportar Excel</button>
      </div>

      {/* Filtros */}
      <div className="inv-mov-filtros">
        <div className="inv-filtro-group">
          <label className="inv-label">Período</label>
          <div className="inv-datas-row">
            <input type="date" className="inv-input-date" value={filtros.data_inicio} onChange={e => setFiltros(p => ({ ...p, data_inicio: e.target.value }))} />
            <span className="inv-datas-sep">até</span>
            <input type="date" className="inv-input-date" value={filtros.data_fim} onChange={e => setFiltros(p => ({ ...p, data_fim: e.target.value }))} />
          </div>
        </div>
        <div className="inv-filtro-group">
          <label className="inv-label">Tipo</label>
          <select className="inv-select" value={filtros.tipo} onChange={e => setFiltros(p => ({ ...p, tipo: e.target.value }))}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_MOV_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="inv-filtro-group">
          <label className="inv-label">Produto</label>
          <input className="inv-input" placeholder="Buscar por nome…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <button className="inv-btn-primary inv-btn-buscar" onClick={() => { setPagina(0); carregar(); }}>▶ Buscar</button>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="inv-loading"><div className="inv-spinner" />Buscando movimentações…</div>
      ) : movs.length === 0 ? (
        <div className="inv-vazio">
          <span className="inv-vazio-icon">📊</span>
          <p>Nenhuma movimentação encontrada</p>
          <small>Ajustes rápidos e inventários finalizados aparecem aqui.</small>
        </div>
      ) : (
        <>
          <div className="inv-mov-tabela-header">
            <span className="inv-mov-col-data">Data/Hora</span>
            <span className="inv-mov-col-produto">Produto</span>
            <span className="inv-mov-col-tipo">Tipo</span>
            <span className="inv-mov-col-antes">Antes</span>
            <span className="inv-mov-col-mov">Movimentação</span>
            <span className="inv-mov-col-depois">Depois</span>
            <span className="inv-mov-col-motivo">Motivo</span>
            <span className="inv-mov-col-user">Usuário</span>
          </div>
          <div className="inv-mov-lista">
            {movs.map(m => (
              <div key={m.id} className="inv-mov-row">
                <span className="inv-mov-col-data">{fmtData(m.created_at)}</span>
                <span className="inv-mov-col-produto">
                  <span className="inv-mov-produto-nome">{m.produto_nome}</span>
                  {m.produto_marca && <span className="inv-mov-produto-marca"> · {m.produto_marca}</span>}
                </span>
                <span className="inv-mov-col-tipo">
                  <span className={`inv-badge inv-badge-mov-${TIPO_MOV_COR[m.tipo] || 'teal'}`}>{TIPO_MOV_LABEL[m.tipo] || m.tipo}</span>
                </span>
                <span className="inv-mov-col-antes inv-num">{fmtQ(m.quantidade_anterior, m.unidade_medida)}</span>
                <span className={`inv-mov-col-mov inv-num ${['entrada','devolucao'].includes(m.tipo) ? 'inv-dif-mais' : 'inv-dif-menos'}`}>
                  {['entrada','devolucao'].includes(m.tipo) ? '+' : ['correcao','inventario_ajuste'].includes(m.tipo) ? '±' : '-'}
                  {fmtQ(m.quantidade_movimentacao, m.unidade_medida)}
                </span>
                <span className="inv-mov-col-depois inv-num">{fmtQ(m.quantidade_posterior, m.unidade_medida)}</span>
                <span className="inv-mov-col-motivo">{m.motivo || '—'}</span>
                <span className="inv-mov-col-user">{m.usuario_nome || '—'}</span>
              </div>
            ))}
          </div>
          <div className="inv-paginacao">
            <span className="inv-pag-info">{total} registro(s)</span>
            <div className="inv-pag-btns">
              <button className="inv-pag-btn" onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}>← Anterior</button>
              <button className="inv-pag-btn" onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * LIMIT >= total}>Próximo →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABA AJUSTE RÁPIDO
════════════════════════════════════════════════════════════ */
function AbaAjusteRapido({ estabelecimentoId }) {
  const [termoBusca,   setTermoBusca]   = useState('');
  const [resultados,   setResultados]   = useState([]);
  const [produto,      setProduto]      = useState(null);
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [tipo,         setTipo]         = useState('entrada');
  const [quantidade,   setQuantidade]   = useState('');
  const [motivo,       setMotivo]       = useState('');
  const [salvando,     setSalvando]     = useState(false);
  const [sucesso,      setSucesso]      = useState('');
  const [erro,         setErro]         = useState('');
  const inputRef = useRef(null);

  async function buscarProdutos(termo) {
    setTermoBusca(termo);
    if (termo.length < 2) { setResultados([]); return; }
    setLoadingBusca(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`);
      const data = await resp.json();
      setResultados(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch { setResultados([]); }
    finally { setLoadingBusca(false); }
  }

  function selecionarProduto(p) {
    setProduto(p);
    setTermoBusca('');
    setResultados([]);
    setQuantidade('');
    setMotivo('');
  }

  const tipoInfo = TIPOS_AJUSTE.find(t => t.key === tipo);

  const qtdNumerica = parseFloat(String(quantidade).replace(',', '.')) || 0;
  const qtdAtual    = parseFloat(produto?.estoque_atual || 0);
  const qtdDepois   = tipo === 'correcao' ? qtdNumerica
    : ['entrada', 'devolucao'].includes(tipo) ? qtdAtual + qtdNumerica
    : Math.max(0, qtdAtual - qtdNumerica);

  async function enviarAjuste(e) {
    e.preventDefault();
    if (!produto) { setErro('Selecione um produto.'); return; }
    if (!qtdNumerica || qtdNumerica <= 0) { setErro('Informe uma quantidade válida.'); return; }
    if (!motivo.trim()) { setErro('Informe o motivo do ajuste.'); return; }

    setSalvando(true); setErro('');
    try {
      const resp = await apiFetch('/api/inventario/ajuste-rapido', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produto_id: produto.id, tipo, quantidade: qtdNumerica, motivo: motivo.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error);

      setSucesso(`✓ Ajuste aplicado! ${produto.nome}: ${fmtQ(data.quantidade_anterior, produto.unidade_medida)} → ${fmtQ(data.quantidade_posterior, produto.unidade_medida)}`);
      setTimeout(() => setSucesso(''), 5000);
      setProduto(null); setQuantidade(''); setMotivo('');
      inputRef.current?.focus();
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="inv-aba">
      <div className="inv-aba-header">
        <div>
          <div className="inv-aba-titulo">⚡ Ajuste Rápido de Estoque</div>
          <div className="inv-aba-desc">Registre entradas, saídas, perdas ou correções pontuais sem criar um inventário completo.</div>
        </div>
      </div>

      {sucesso && <div className="inv-sucesso">{sucesso}</div>}
      {erro    && <div className="inv-erro-bar">⚠️ {erro}</div>}

      <div className="inv-ajuste-layout">
        {/* Coluna esquerda: formulário */}
        <div className="inv-ajuste-form-col">
          <form onSubmit={enviarAjuste}>

            {/* Busca de produto */}
            <div className="inv-form-group">
              <label className="inv-label">Produto *</label>
              {produto ? (
                <div className="inv-produto-selecionado">
                  <div className="inv-produto-sel-info">
                    <span className="inv-produto-sel-nome">{produto.nome}</span>
                    {produto.marca && <span className="inv-produto-sel-marca"> · {produto.marca}</span>}
                    <span className="inv-produto-sel-estoque">Estoque atual: <strong>{fmtQ(produto.estoque_atual, produto.unidade_medida)}</strong></span>
                  </div>
                  <button type="button" className="inv-produto-trocar" onClick={() => { setProduto(null); setTimeout(() => inputRef.current?.focus(), 50); }}>↩ Trocar</button>
                </div>
              ) : (
                <div className="inv-busca-wrap">
                  <input
                    ref={inputRef}
                    className="inv-input"
                    value={termoBusca}
                    onChange={e => buscarProdutos(e.target.value)}
                    placeholder="Digite o nome ou código do produto…"
                    autoComplete="off"
                  />
                  {loadingBusca && <span className="inv-busca-loading">⏳</span>}
                  {resultados.length > 0 && (
                    <ul className="inv-busca-lista">
                      {resultados.map(p => (
                        <li key={p.id} className="inv-busca-item" onClick={() => selecionarProduto(p)}>
                          <span className="inv-busca-nome">{p.nome}{p.marca ? <span className="inv-busca-marca"> · {p.marca}</span> : ''}</span>
                          <span className="inv-busca-estoque">{fmtQ(p.estoque_atual, p.unidade_medida)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Tipo de ajuste */}
            <div className="inv-form-group">
              <label className="inv-label">Tipo de ajuste *</label>
              <div className="inv-tipos-ajuste">
                {TIPOS_AJUSTE.map(t => (
                  <button key={t.key} type="button" className={`inv-tipo-ajuste-btn inv-cor-${t.cor}${tipo === t.key ? ' ativo' : ''}`} onClick={() => { setTipo(t.key); setMotivo(''); }}>
                    {t.label}
                  </button>
                ))}
              </div>
              {tipoInfo && <div className="inv-tipo-desc">{tipoInfo.desc}</div>}
            </div>

            {/* Quantidade */}
            <div className="inv-form-group">
              <label className="inv-label">
                {tipo === 'correcao' ? 'Novo valor do estoque *' : 'Quantidade *'}
              </label>
              <input
                className="inv-input inv-input-qtd"
                type="number"
                min="0"
                step={produto?.unidade_medida === 'kg' ? '0.001' : '1'}
                value={quantidade}
                onChange={e => setQuantidade(e.target.value)}
                placeholder={tipo === 'correcao' ? 'Valor final do estoque…' : 'Quantidade…'}
              />
              {tipo === 'correcao' && <span className="inv-hint">Informe a quantidade exata que o produto deve ter no estoque após a correção.</span>}
            </div>

            {/* Motivo */}
            <div className="inv-form-group">
              <label className="inv-label">Motivo *</label>
              <input
                className="inv-input"
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Descreva o motivo do ajuste…"
                list={`motivos-${tipo}`}
              />
              <datalist id={`motivos-${tipo}`}>
                {(MOTIVOS_SUGERIDOS[tipo] || []).map(m => <option key={m} value={m} />)}
              </datalist>
              <span className="inv-hint">Sugestões aparecem enquanto você digita. Obrigatório para auditoria.</span>
            </div>

            <button type="submit" className="inv-btn-primary inv-btn-full" disabled={salvando || !produto}>
              {salvando ? '⏳ Salvando…' : `✓ Registrar ${tipoInfo?.label.split(' ')[1] || 'ajuste'}`}
            </button>
          </form>
        </div>

        {/* Coluna direita: preview */}
        <div className="inv-ajuste-preview-col">
          <div className="inv-preview-card">
            <div className="inv-preview-titulo">👁️ Pré-visualização</div>
            {!produto ? (
              <div className="inv-preview-vazio">Selecione um produto para ver o impacto do ajuste.</div>
            ) : (
              <>
                <div className="inv-preview-produto">{produto.nome}{produto.marca ? ` · ${produto.marca}` : ''}</div>
                <div className="inv-preview-valores">
                  <div className="inv-preview-item">
                    <span className="inv-preview-label">Estoque atual</span>
                    <span className="inv-preview-val">{fmtQ(qtdAtual, produto.unidade_medida)}</span>
                  </div>
                  <div className="inv-preview-seta">→</div>
                  <div className="inv-preview-item">
                    <span className="inv-preview-label">Após ajuste</span>
                    <span className={`inv-preview-val inv-preview-val-dest${qtdDepois > qtdAtual ? ' mais' : qtdDepois < qtdAtual ? ' menos' : ''}`}>
                      {qtdNumerica > 0 ? fmtQ(qtdDepois, produto.unidade_medida) : '—'}
                    </span>
                  </div>
                </div>
                {qtdNumerica > 0 && (
                  <div className={`inv-preview-diff${qtdDepois > qtdAtual ? ' mais' : qtdDepois < qtdAtual ? ' menos' : ' ok'}`}>
                    {qtdDepois === qtdAtual ? '= Sem alteração'
                      : qtdDepois > qtdAtual ? `▲ +${fmtQ(qtdDepois - qtdAtual, produto.unidade_medida)}`
                      : `▼ ${fmtQ(qtdDepois - qtdAtual, produto.unidade_medida)}`}
                  </div>
                )}
                <div className="inv-preview-tipo">
                  <span className={`inv-badge inv-badge-mov-${tipoInfo?.cor}`}>{tipoInfo?.label}</span>
                </div>
                {motivo.trim() && <div className="inv-preview-motivo">"{motivo}"</div>}
              </>
            )}
          </div>

          {/* Info sobre tipos */}
          <div className="inv-tipos-info">
            <div className="inv-tipos-info-titulo">📖 Guia de tipos de ajuste</div>
            {TIPOS_AJUSTE.map(t => (
              <div key={t.key} className={`inv-tipos-info-item${tipo === t.key ? ' ativo' : ''}`} onClick={() => setTipo(t.key)}>
                <span className={`inv-badge inv-badge-mov-${t.cor} inv-badge-sm`}>{t.label}</span>
                <span className="inv-tipos-info-desc">{t.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
════════════════════════════════════════════════════════════ */
export default function Inventario({ estabelecimentoId }) {
  const [abaAtiva,   setAbaAtiva]   = useState('contagens');
  const [categorias, setCategorias] = useState([]);
  const [fontScale,  setFontScale]  = useState(() => parseFloat(localStorage.getItem('inv-font-scale') || '1'));

  useEffect(() => {
    async function carregarCategorias() {
      try {
        const resp = await apiFetch('/api/categorias');
        const data = await resp.json();
        setCategorias(Array.isArray(data) ? data : []);
      } catch {}
    }
    carregarCategorias();
  }, []);

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.85, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('inv-font-scale', next);
      return next;
    });
  }

  const ABAS = [
    { key: 'contagens',    label: '📋 Contagens',     desc: 'Inventários físicos' },
    { key: 'movimentacoes', label: '📊 Movimentações', desc: 'Histórico de ajustes' },
    { key: 'ajuste',       label: '⚡ Ajuste Rápido',  desc: 'Entrada / Saída / Perda' },
  ];

  return (
    <div className="inv-container" style={{ '--inv-font-scale': fontScale }}>
      <div className="inv-header">
        <div className="inv-header-left">
          <span className="inv-titulo">📦 Inventário</span>
          <span className="inv-subtitulo">Contagem física, movimentações e ajustes de estoque</span>
        </div>
        <div className="inv-header-right">
          <button className="inv-zoom-btn" onClick={() => changeFontScale(-0.05)} disabled={fontScale <= 0.85} title="Diminuir fonte">A−</button>
          <button className="inv-zoom-btn" onClick={() => changeFontScale(0.05)} disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
        </div>
      </div>

      <div className="inv-tabs">
        {ABAS.map(a => (
          <button key={a.key} className={`inv-tab${abaAtiva === a.key ? ' ativo' : ''}`} onClick={() => setAbaAtiva(a.key)}>
            <span className="inv-tab-label">{a.label}</span>
            <span className="inv-tab-desc">{a.desc}</span>
          </button>
        ))}
      </div>

      <div className="inv-body">
        {abaAtiva === 'contagens'     && <AbaContagens    estabelecimentoId={estabelecimentoId} categorias={categorias} />}
        {abaAtiva === 'movimentacoes' && <AbaMovimentacoes estabelecimentoId={estabelecimentoId} />}
        {abaAtiva === 'ajuste'        && <AbaAjusteRapido  estabelecimentoId={estabelecimentoId} />}
      </div>
    </div>
  );
}