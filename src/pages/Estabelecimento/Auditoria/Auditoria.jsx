// src/pages/Estabelecimento/Auditoria/Auditoria.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../../utils/api';
import './Auditoria.css';

/* ── helpers ─────────────────────────────────────────────── */
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
  pdv: '🖥️ PDV', estoque: '📦 Estoque', clientes: '👥 Clientes',
  financeiro: '💰 Financeiro', configuracoes: '⚙️ Config',
  fornecedores: '🚚 Fornecedores', inventario: '📋 Inventário',
  operadores: '🧑‍💼 Operadores',
};
const MODULO_COR = {
  pdv: 'teal', estoque: 'blue', clientes: 'purple',
  financeiro: 'green', configuracoes: 'gray',
  fornecedores: 'orange', inventario: 'cyan',
  operadores: 'pink',
};
const ACAO_LABEL = {
  venda_realizada: '🛒 Venda', venda_cancelada: '❌ Cancelamento',
  produto_criado: '➕ Produto criado', produto_editado: '✏️ Produto editado',
  produto_excluido: '🗑️ Produto excluído', cliente_criado: '👤 Cliente criado',
  cliente_editado: '✏️ Cliente editado', cliente_excluido: '🗑️ Cliente excluído',
  fiado_recebido: '💰 Fiado recebido', config_atualizada: '⚙️ Config atualizada',
};
const META_LABEL = {
  nome: 'Nome', marca: 'Marca', preco_venda: 'Preço venda', preco_custo: 'Preço custo',
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
  if (['preco_venda', 'preco_custo', 'limite_credito', 'valor'].includes(chave))
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

const LIMIT = 30;

/* ════════════════════════════════════════════════════════════ */
export default function Auditoria({ estabelecimentoId, nomeEstabelecimento }) {

  const [fontScale, setFontScale] = useState(() => {
    const s = localStorage.getItem('auditoria-font-scale');
    return s ? parseFloat(s) : 1;
  });
  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('auditoria-font-scale', next);
      return next;
    });
  }

  const [operadores, setOperadores] = useState([]);
  const [filtros, setFiltros] = useState({
    data_inicio: dataHa30(), data_fim: dataHoje(), modulo: '', operador_id: '', acao: '',
  });
  const [registros,   setRegistros]   = useState([]);
  const [totalRegs,   setTotalRegs]   = useState(0);
  const [pagina,      setPagina]      = useState(0);
  const [loadingRegs, setLoadingRegs] = useState(false);

  useEffect(() => {
    apiFetch('/api/auditoria/operadores')
      .then(r => r.ok ? r.json() : []).then(setOperadores).catch(() => {});
  }, []);

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

  useEffect(() => { carregarAuditoria(0); }, [estabelecimentoId]);

  function aplicarFiltros() {
    carregarAuditoria(0);
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="rel-container" style={{ '--rel-font-scale': fontScale }}>

      {/* ── Header ── */}
      <div className="rel-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div className="rel-header-info">
          <h2 className="rel-titulo">🔍 Auditoria</h2>
          <span className="rel-subtitulo">Histórico de tudo que acontece no seu estabelecimento</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button className="rel-zoom-btn" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
          <button className="rel-zoom-btn" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.6} title="Aumentar fonte">A+</button>
        </div>
      </div>

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
    </div>
  );
}