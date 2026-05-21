// src/pages/Estabelecimento/Relatorios/Relatorios.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../utils/api';
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

const MODULO_LABEL = {
  pdv:           '🖥️ PDV',
  estoque:       '📦 Estoque',
  clientes:      '👥 Clientes',
  financeiro:    '💰 Financeiro',
  configuracoes: '⚙️ Config',
};

const MODULO_COR = {
  pdv:           'teal',
  estoque:       'blue',
  clientes:      'purple',
  financeiro:    'green',
  configuracoes: 'gray',
};

const ACAO_LABEL = {
  venda_realizada:    '🛒 Venda',
  venda_cancelada:    '❌ Cancelamento',
  produto_criado:     '➕ Produto criado',
  produto_editado:    '✏️ Produto editado',
  produto_excluido:   '🗑️ Produto excluído',
  cliente_criado:     '👤 Cliente criado',
  cliente_editado:    '✏️ Cliente editado',
  cliente_excluido:   '🗑️ Cliente excluído',
  fiado_recebido:     '💰 Fiado recebido',
  config_atualizada:  '⚙️ Config atualizada',
};

/* ── Labels legíveis para campos do meta ─────────────────── */
const META_LABEL = {
  nome:           'Nome',
  preco_venda:    'Preço venda',
  preco_custo:    'Preço custo',
  estoque_atual:  'Estoque',
  estoque_minimo: 'Est. mínimo',
  unidade_medida: null, // usado como contexto, não exibido sozinho
  limite_credito: 'Limite crédito',
  meio_pagamento: 'Pagamento',
  valor:          'Valor',
  itens:          'Itens',
  campos:         null, // ignorado na exibição
};

/* Formata o valor do meta de forma legível */
function formatarMetaValor(chave, valor, meta) {
  if (chave === 'estoque_atual' || chave === 'estoque_minimo') {
    const unidade = meta?.unidade_medida || 'un';
    if (unidade === 'kg') {
      return `${parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
    }
    return `${parseFloat(valor).toLocaleString('pt-BR')} un`;
  }
  if (chave === 'preco_venda' || chave === 'preco_custo' || chave === 'limite_credito' || chave === 'valor') {
    return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR');
  return String(valor);
}

/* Calcula campos que mudaram entre antes e depois */
function calcularDiff(antes, depois) {
  if (!antes || !depois) return null;
  const campos = Object.keys(depois).filter(k =>
    META_LABEL[k] !== null &&
    META_LABEL[k] !== undefined &&
    k !== 'unidade_medida' &&
    String(antes[k]) !== String(depois[k])
  );
  return campos.length > 0 ? campos : null;
}

/* ════════════════════════════════════════════════════════════ */
export default function Relatorios({ estabelecimentoId, nomeEstabelecimento }) {

  const [abaAtiva,    setAbaAtiva]    = useState('auditoria');
  const [operadores,  setOperadores]  = useState([]);
  const [fontScale,   setFontScale]   = useState(() => {
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
  const [filtros, setFiltros] = useState({
    data_inicio:  dataHa30(),
    data_fim:     dataHoje(),
    modulo:       '',
    operador_id:  '',
    acao:         '',
  });

  // Auditoria
  const [registros,   setRegistros]   = useState([]);
  const [totalRegs,   setTotalRegs]   = useState(0);
  const [pagina,      setPagina]      = useState(0);
  const [loadingRegs, setLoadingRegs] = useState(false);
  const LIMIT = 30;

  // Resumo
  const [resumo,      setResumo]      = useState([]);
  const [loadingRes,  setLoadingRes]  = useState(false);

  /* ── Carregar operadores para filtro ─────────────────────── */
  useEffect(() => {
    apiFetch('/api/auditoria/operadores')
      .then(r => r.ok ? r.json() : [])
      .then(setOperadores)
      .catch(() => {});
  }, []);

  /* ── Carregar auditoria ──────────────────────────────────── */
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

  /* ── Carregar resumo ─────────────────────────────────────── */
  const carregarResumo = useCallback(async () => {
    setLoadingRes(true);
    try {
      const params = new URLSearchParams({
        ...(filtros.data_inicio && { data_inicio: filtros.data_inicio }),
        ...(filtros.data_fim    && { data_fim:    filtros.data_fim }),
      });
      const resp = await apiFetch(`/api/auditoria/resumo?${params}`);
      if (!resp.ok) throw new Error();
      setResumo(await resp.json());
    } catch { setResumo([]); }
    finally { setLoadingRes(false); }
  }, [filtros.data_inicio, filtros.data_fim]);

  useEffect(() => {
    if (abaAtiva === 'auditoria') carregarAuditoria(0);
  }, [abaAtiva]);

  function aplicarFiltros() {
    if (abaAtiva === 'auditoria') carregarAuditoria(0);
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="rel-container" style={{ '--rel-font-scale': fontScale }}>

      {/* ── Header ── */}
      <div className="rel-header">
        <div className="rel-header-info">
          <h2 className="rel-titulo">📊 Relatórios</h2>
          <span className="rel-subtitulo">Histórico de ações por módulo e operador</span>
        </div>
      </div>

      {/* ── Abas + zoom ── */}
      <div className="rel-tabs" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`rel-tab${abaAtiva === 'auditoria' ? ' ativo' : ''}`}
            onClick={() => setAbaAtiva('auditoria')}
          >📋 Auditoria</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="fin-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
          <button className="fin-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.6} title="Aumentar fonte">A+</button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="rel-filtros">
        <div className="rel-filtro-group">
          <label className="rel-filtro-label">De</label>
          <input
            className="rel-filtro-input"
            type="date"
            value={filtros.data_inicio}
            onChange={e => setFiltros(p => ({ ...p, data_inicio: e.target.value }))}
          />
        </div>
        <div className="rel-filtro-group">
          <label className="rel-filtro-label">Até</label>
          <input
            className="rel-filtro-input"
            type="date"
            value={filtros.data_fim}
            onChange={e => setFiltros(p => ({ ...p, data_fim: e.target.value }))}
          />
        </div>
        {abaAtiva === 'auditoria' && (
          <>
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">Módulo</label>
              <select
                className="rel-filtro-select"
                value={filtros.modulo}
                onChange={e => setFiltros(p => ({ ...p, modulo: e.target.value }))}
              >
                <option value="">Todos</option>
                {Object.entries(MODULO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="rel-filtro-group">
              <label className="rel-filtro-label">Operador</label>
              <select
                className="rel-filtro-select"
                value={filtros.operador_id}
                onChange={e => setFiltros(p => ({ ...p, operador_id: e.target.value }))}
              >
                <option value="">Todos</option>
                <option value="merchant">{nomeEstabelecimento || 'Administrador'}</option>
                {operadores.map(op => (
                  <option key={op.id} value={op.id}>{op.nome}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <button className="rel-btn-filtrar" onClick={aplicarFiltros}>
          🔍 Filtrar
        </button>
      </div>

      {/* ── Conteúdo: Auditoria ── */}
      {abaAtiva === 'auditoria' && (
        <div className="rel-body">
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

                    {/* Linha principal */}
                    <div className="rel-registro-corpo">

                      {/* Linha 1 — badges + usuário/hora */}
                      <div className="rel-registro-linha1">
                        <div className="rel-registro-badges">
                          <span className="rel-registro-modulo">
                            {MODULO_LABEL[r.modulo] || r.modulo}
                          </span>
                          <span className="rel-registro-acao">
                            {ACAO_LABEL[r.acao] || r.acao}
                          </span>
                        </div>
                        <div className="rel-registro-dir">
                          <span className="rel-registro-usuario">
                            {r.usuario_nome || nomeEstabelecimento || 'Administrador'}
                          </span>
                          <span className="rel-registro-hora">
                            {formatarDataHora(r.criado_em)}
                          </span>
                        </div>
                      </div>

                      {/* Linha 2 — descrição + meta */}
                      <div className="rel-registro-linha2">
                        <span className="rel-registro-desc">{r.descricao}</span>
                        {(() => {
                          const diff = calcularDiff(r.meta?.antes, r.meta?.depois);
                          // Com antes+depois: mostra só o que mudou com seta
                          if (diff) {
                            return (
                              <div className="rel-registro-meta">
                                {diff.map(k => (
                                  <span key={k} className="rel-meta-tag rel-meta-tag--diff">
                                    <span className="rel-meta-key">{META_LABEL[k] || k}</span>
                                    <span className="rel-meta-val rel-meta-val--old">
                                      {formatarMetaValor(k, r.meta.antes[k], r.meta.antes)}
                                    </span>
                                    <span className="rel-meta-seta">→</span>
                                    <span className="rel-meta-val rel-meta-val--new">
                                      {formatarMetaValor(k, r.meta.depois[k], r.meta.depois)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          // Sem antes (registros antigos ou criação): mostra depois normalmente
                          if (r.meta?.depois) {
                            return (
                              <div className="rel-registro-meta">
                                {Object.entries(r.meta.depois)
                                  .filter(([k]) => META_LABEL[k] !== null && META_LABEL[k] !== undefined && k !== 'unidade_medida')
                                  .map(([k, v]) => (
                                    <span key={k} className="rel-meta-tag">
                                      <span className="rel-meta-key">{META_LABEL[k] || k}</span>
                                      <span className="rel-meta-val">
                                        {formatarMetaValor(k, v, r.meta.depois)}
                                      </span>
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

              {/* Paginação */}
              <div className="rel-paginacao">
                <span className="rel-paginacao-info">
                  {pagina * LIMIT + 1}–{Math.min((pagina + 1) * LIMIT, totalRegs)} de {totalRegs}
                </span>
                <div className="rel-paginacao-btns">
                  <button
                    className="rel-pag-btn"
                    disabled={pagina === 0}
                    onClick={() => carregarAuditoria(pagina - 1)}
                  >← Anterior</button>
                  <button
                    className="rel-pag-btn"
                    disabled={(pagina + 1) * LIMIT >= totalRegs}
                    onClick={() => carregarAuditoria(pagina + 1)}
                  >Próximo →</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}