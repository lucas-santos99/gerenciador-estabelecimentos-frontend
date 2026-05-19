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

/* ════════════════════════════════════════════════════════════ */
export default function Relatorios({ estabelecimentoId }) {

  const [abaAtiva,    setAbaAtiva]    = useState('auditoria');
  const [operadores,  setOperadores]  = useState([]);
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
    if (abaAtiva === 'resumo')    carregarResumo();
  }, [abaAtiva]);

  function aplicarFiltros() {
    if (abaAtiva === 'auditoria') carregarAuditoria(0);
    if (abaAtiva === 'resumo')    carregarResumo();
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="rel-container">

      {/* ── Header ── */}
      <div className="rel-header">
        <div className="rel-header-info">
          <h2 className="rel-titulo">📊 Relatórios</h2>
          <span className="rel-subtitulo">Auditoria de ações e resumo por operador</span>
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="rel-tabs">
        {[
          { key: 'auditoria', label: '📋 Auditoria' },
          { key: 'resumo',    label: '👥 Por operador' },
        ].map(t => (
          <button
            key={t.key}
            className={`rel-tab${abaAtiva === t.key ? ' ativo' : ''}`}
            onClick={() => setAbaAtiva(t.key)}
          >
            {t.label}
          </button>
        ))}
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
                <option value="merchant">Merchant</option>
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
                    <div className="rel-registro-esq">
                      <span className="rel-registro-modulo">
                        {MODULO_LABEL[r.modulo] || r.modulo}
                      </span>
                      <span className="rel-registro-acao">
                        {ACAO_LABEL[r.acao] || r.acao}
                      </span>
                      <div className="rel-registro-desc-wrap">
                        <span className="rel-registro-desc">{r.descricao}</span>
                        {r.meta?.depois && (
                          <span className="rel-registro-meta">
                            {Object.entries(r.meta.depois)
                              .filter(([, v]) => v !== null && v !== undefined)
                              .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}`)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rel-registro-dir">
                      <span className="rel-registro-usuario">
                        {r.usuario_nome || 'Merchant'}
                      </span>
                      <span className="rel-registro-hora">
                        {formatarDataHora(r.criado_em)}
                      </span>
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

      {/* ── Conteúdo: Resumo por operador ── */}
      {abaAtiva === 'resumo' && (
        <div className="rel-body">
          {loadingRes ? (
            <div className="rel-loading"><div className="rel-spinner" /> Carregando…</div>
          ) : resumo.length === 0 ? (
            <div className="rel-vazio">
              <span className="rel-vazio-icone">👥</span>
              <p>Nenhuma ação registrada no período</p>
            </div>
          ) : (
            <div className="rel-resumo-lista">
              {resumo.map((op, i) => (
                <div key={i} className="rel-resumo-card">
                  <div className="rel-resumo-avatar">
                    {(op.nome || 'M')[0].toUpperCase()}
                  </div>
                  <div className="rel-resumo-info">
                    <span className="rel-resumo-nome">{op.nome || 'Merchant'}</span>
                    <div className="rel-resumo-modulos">
                      {Object.entries(op.por_modulo).map(([mod, qtd]) => (
                        <span key={mod} className={`rel-resumo-mod rel-mod-${MODULO_COR[mod] || 'gray'}`}>
                          {MODULO_LABEL[mod] || mod}: {qtd}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="rel-resumo-total">
                    <span className="rel-resumo-total-num">{op.total}</span>
                    <span className="rel-resumo-total-label">ações</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}