// src/pages/Estabelecimento/Estoque/GerenciarOpcoesVariacao.jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../../utils/api';
import '../Estoque.css';

// Sugestões prontas de gênero/público — cobre tanto lojas de moda quanto
// qualquer outro tipo de estabelecimento que queira usar essa dimensão.
// Aparecem como um atalho de "adicionar tudo de uma vez" quando a lista
// de gênero ainda tá vazia; o comerciante pode remover as que não usa.
const SUGESTOES_GENERO = ['Masculino', 'Feminino', 'Unissex', 'Infantil'];

const LABEL_ABA = { tamanho: 'Tamanhos', cor: 'Cores', genero: 'Gêneros' };
const LABEL_ABA_SINGULAR = { tamanho: 'tamanho', cor: 'cor', genero: 'gênero' };

export default function GerenciarOpcoesVariacao({ estabelecimentoId, onClose, onAlterado }) {
  const [aba,       setAba]       = useState('tamanho');
  const [opcoes,    setOpcoes]    = useState({ tamanho: [], cor: [], genero: [] });
  const [novoValor, setNovoValor] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState('');
  const [adicionandoSugestoes, setAdicionandoSugestoes] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao?comId=1`);
      if (resp.ok) setOpcoes(await resp.json());
    } catch { /* fica com a lista vazia se falhar */ }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [estabelecimentoId]);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  async function adicionar(e) {
    e.preventDefault();
    if (!novoValor.trim()) return;
    setSalvando(true);
    setErro('');
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tipo: aba, valor: novoValor.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao adicionar.');
      setNovoValor('');
      await carregar();
      onAlterado?.();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function remover(opt) {
    if (!window.confirm(`Remover "${opt.valor}" da lista de ${LABEL_ABA[aba].toLowerCase()}?\n\nProdutos que já usam esse valor não são afetados — isso só tira ele da sugestão do autocomplete.`)) return;
    try {
      await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao/${opt.id}`, { method: 'DELETE' });
      await carregar();
      onAlterado?.();
    } catch { /* se falhar, a lista simplesmente não atualiza — sem drama */ }
  }

  // Adiciona de uma vez as sugestões prontas de gênero (Masculino, Feminino,
  // Unissex, Infantil) — atalho pra não ter que digitar uma por uma.
  async function adicionarSugestoesGenero() {
    setAdicionandoSugestoes(true);
    try {
      for (const valor of SUGESTOES_GENERO) {
        if ((opcoes.genero || []).some(o => o.valor.toLowerCase() === valor.toLowerCase())) continue;
        await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tipo: 'genero', valor }),
        });
      }
      await carregar();
      onAlterado?.();
    } catch { /* falha parcial não é grave — o que entrou, entrou */ }
    setAdicionandoSugestoes(false);
  }

  const lista = opcoes[aba] || [];

  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>

        <div className="prod-modal-titulo">⚙️ Gerenciar tamanhos, cores e gênero</div>
        <p className="prod-label-hint" style={{ display: 'block', marginBottom: 14, lineHeight: 1.5 }}>
          São as opções sugeridas no autocomplete ao cadastrar uma variação de produto. Remover um valor daqui não afeta produtos que já usam ele.
        </p>

        <div className="prod-unidade-toggle" style={{ marginBottom: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
          <button type="button" className={`prod-unidade-btn${aba === 'tamanho' ? ' ativo' : ''}`} onClick={() => setAba('tamanho')}>
            <span className="prod-unidade-icon">📏</span>
            <span className="prod-unidade-label">Tamanhos</span>
          </button>
          <button type="button" className={`prod-unidade-btn${aba === 'cor' ? ' ativo' : ''}`} onClick={() => setAba('cor')}>
            <span className="prod-unidade-icon">🎨</span>
            <span className="prod-unidade-label">Cores</span>
          </button>
          <button type="button" className={`prod-unidade-btn${aba === 'genero' ? ' ativo' : ''}`} onClick={() => setAba('genero')}>
            <span className="prod-unidade-icon">🚻</span>
            <span className="prod-unidade-label">Gênero</span>
          </button>
        </div>

        {erro && <div className="prod-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={adicionar} className="prod-codigo-row" style={{ marginBottom: 14 }}>
          <input
            className="prod-input"
            placeholder={aba === 'tamanho' ? 'Novo tamanho — ex: XG' : aba === 'cor' ? 'Nova cor — ex: Verde musgo' : 'Novo gênero — ex: Infantil'}
            value={novoValor}
            onChange={e => setNovoValor(e.target.value)}
            disabled={salvando}
            autoFocus
          />
          <button type="submit" className="prod-btn-scan" disabled={salvando || !novoValor.trim()} title="Adicionar">
            {salvando ? '…' : '+'}
          </button>
        </form>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--est-text-muted)', fontSize: '0.85rem' }}>
            Carregando…
          </div>
        ) : lista.length === 0 ? (
          <div className="prod-variacoes-vazio">
            Nenhum{aba === 'cor' ? 'a' : ''} {LABEL_ABA_SINGULAR[aba]} cadastrado{aba === 'cor' ? 'a' : ''} ainda.
            {aba === 'genero' && (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="prod-btn-gerenciar-opcoes"
                  onClick={adicionarSugestoesGenero}
                  disabled={adicionandoSugestoes}
                >
                  {adicionandoSugestoes ? '…' : '+ Adicionar sugestões (Masculino, Feminino, Unissex, Infantil)'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="prod-opcoes-chips">
            {lista.map(opt => (
              <span key={opt.id} className="prod-opcao-chip">
                {opt.valor}
                <button type="button" onClick={() => remover(opt)} title={`Remover "${opt.valor}"`}>✕</button>
              </span>
            ))}
          </div>
        )}

        <div className="prod-modal-acoes" style={{ marginTop: 18 }}>
          <button type="button" className="prod-modal-btn-cancelar" onClick={onClose}>Fechar (Esc)</button>
        </div>

      </div>
    </div>
  );
}