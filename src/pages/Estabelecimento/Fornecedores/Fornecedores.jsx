// src/pages/Estabelecimento/Fornecedores/Fornecedores.jsx
import React, { useState, useEffect } from 'react';
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

const CONDICAO_LABEL = {
  a_vista: 'À vista', '7_dias': '7 dias', '15_dias': '15 dias',
  '30_dias': '30 dias', '45_dias': '45 dias', '60_dias': '60 dias', outro: 'Combinar',
};

/* ════════════════════════════════════════════════════════════ */
export default function Fornecedores({ estabelecimentoId, permissoes = null, isMerchant = true }) {
  const [lista,        setLista]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [busca,        setBusca]        = useState('');

  const [modalForm,      setModalForm]      = useState(null); // null | 'novo' | fornecedor (editar)
  const [modalCompra,    setModalCompra]    = useState(false);
  const [fornecedorParaCompra, setFornecedorParaCompra] = useState(null);
  const [detalhesId,     setDetalhesId]     = useState(null);

  const pode = (perm) => isMerchant || (permissoes || []).includes(perm);

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
          {pode('fornecedores') && (
            <button className="cli-btn verde" onClick={() => setModalCompra(true)}>🧾 Lançar Compra</button>
          )}
          {pode('fornecedores') && (
            <button className="cli-btn azul" onClick={() => setModalForm('novo')}>+ Novo Fornecedor</button>
          )}
        </div>
      </div>

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
                {f.condicao_pagamento && <span className="forn-card-condicao">{CONDICAO_LABEL[f.condicao_pagamento] || f.condicao_pagamento}</span>}
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

      {modalForm && (
        <FornecedorModal
          fornecedor={modalForm === 'novo' ? null : modalForm}
          onClose={() => setModalForm(null)}
          onSalvo={carregar}
        />
      )}

      {modalCompra && (
        <LancarCompraModal
          estabelecimentoId={estabelecimentoId}
          fornecedorPreselecionado={fornecedorParaCompra}
          onClose={() => { setModalCompra(false); setFornecedorParaCompra(null); }}
          onSalvo={carregar}
        />
      )}

      {detalhesId && (
        <DetalhesFornecedor
          fornecedorId={detalhesId}
          onFechar={() => setDetalhesId(null)}
          onAtualizar={carregar}
        />
      )}

    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DETALHES DO FORNECEDOR — histórico de compras + produtos
════════════════════════════════════════════════════════════ */
function DetalhesFornecedor({ fornecedorId, onFechar, onAtualizar }) {
  const [dados,   setDados]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [aba,     setAba]     = useState('compras'); // 'compras' | 'produtos'
  const [cancelando, setCancelando] = useState(null);

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

  return (
    <div className="cli-modal-overlay" onClick={onFechar}>
      <div className="cli-modal forn-modal-detalhes" onClick={e => e.stopPropagation()}>

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

            <div className="forn-abas">
              <button className={`forn-aba-btn${aba === 'compras' ? ' ativo' : ''}`} onClick={() => setAba('compras')}>Histórico de Compras</button>
              <button className={`forn-aba-btn${aba === 'produtos' ? ' ativo' : ''}`} onClick={() => setAba('produtos')}>Produtos Fornecidos</button>
            </div>

            <div className="forn-detalhes-body">
              {aba === 'compras' && (
                dados.compras.length === 0 ? (
                  <div className="cli-vazio" style={{ padding: 30 }}><p>Nenhuma compra registrada ainda.</p></div>
                ) : (
                  dados.compras.map(c => (
                    <div key={c.id} className={`forn-compra-linha${c.status === 'cancelada' ? ' cancelada' : ''}`}>
                      <div>
                        <strong>{fmtData(c.data_compra)}</strong>
                        {c.numero_nota && <span className="forn-compra-nota"> · Nota {c.numero_nota}</span>}
                        {c.status === 'cancelada' && <span className="forn-compra-tag-cancelada"> · Cancelada</span>}
                      </div>
                      <span className="forn-compra-forma">{c.forma_pagamento === 'a_vista' ? 'À vista' : 'A prazo'}</span>
                      <span className="forn-compra-valor">{fmt(c.valor_total)}</span>
                      {c.status === 'ativa' && (
                        <button className="forn-compra-cancelar" disabled={cancelando === c.id} onClick={() => cancelarCompra(c.id)}>
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
                      <span className="forn-produto-preco">Último preço: {fmt(p.ultimo_preco)}{p.unidade_medida === 'kg' ? '/kg' : '/un'}</span>
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
    </div>
  );
}