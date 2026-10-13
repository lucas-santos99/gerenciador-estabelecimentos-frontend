// src/pages/Estabelecimento/Estoque/GerenciarOpcoesVariacao.jsx
import { confirmar } from '../../../components/Dialogo/dialogo';
import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../utils/api';
import {
  MODELOS_PRONTOS, CORES_BASICAS, GENEROS_BASICOS,
  buscarModelosProprios, criarModeloProprio, excluirModeloProprio, separarValores,
} from './modelosVariacao';
import '../Estoque.css';

const LABEL_ABA = { tamanho: 'Tamanhos', cor: 'Cores', genero: 'Gêneros' };
const LABEL_ABA_SINGULAR = { tamanho: 'tamanho', cor: 'cor', genero: 'gênero' };

export default function GerenciarOpcoesVariacao({ estabelecimentoId, onClose, onAlterado }) {
  const [aba,       setAba]       = useState('tamanho');
  const [opcoes,    setOpcoes]    = useState({ tamanho: [], cor: [], genero: [] });
  const [novoValor, setNovoValor] = useState('');
  const [loading,   setLoading]   = useState(true);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState('');
  const [ocupado,   setOcupado]   = useState(false);

  // Tipos de produto (modelos de tamanho)
  const [proprios,  setProprios]  = useState([]);
  const [modeloId,  setModeloId]  = useState(null);          // modelo aberto
  const [marcados,  setMarcados]  = useState([]);             // tamanhos marcados no modelo aberto
  const [criando,   setCriando]   = useState(false);
  const [novoTipo,  setNovoTipo]  = useState({ nome: '', tamanhos: '' });
  const [agrupar,   setAgrupar]   = useState(false);          // lista: juntos / por tipo
  // Sugestões de cor/gênero (marcação múltipla)
  const [sugMarcadas, setSugMarcadas] = useState({ cor: [], genero: [] });

  const modelos = useMemo(
    () => [...MODELOS_PRONTOS, ...proprios.map(m => ({ ...m, icone: '🏷️', proprio: true }))],
    [proprios]
  );

  async function carregar(primeira = false) {
    if (primeira) setLoading(true);   // só a 1ª carga mostra "Carregando…" (evita a tela piscar)
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao?comId=1`);
      if (resp.ok) setOpcoes(await resp.json());
    } catch { /* fica com a lista vazia se falhar */ }
    setLoading(false);
  }

  useEffect(() => { carregar(true); }, [estabelecimentoId]);
  useEffect(() => { buscarModelosProprios(estabelecimentoId).then(setProprios); }, [estabelecimentoId]);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const jaTem = (tipo, valor) => (opcoes[tipo] || []).some(o => o.valor.toLowerCase() === valor.toLowerCase());

  // Adiciona vários de uma vez (pula os que já existem).
  async function adicionarVarios(tipo, valores) {
    const novos = valores.filter(v => !jaTem(tipo, v));
    if (!novos.length) { setErro('Esses já estão na lista.'); return false; }
    setOcupado(true); setErro('');
    try {
      for (const valor of novos) {
        const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, valor }),
        });
        if (!resp.ok) {
          const d = await resp.json().catch(() => ({}));
          throw new Error(d.error || `Não foi possível adicionar "${valor}".`);
        }
      }
      await carregar();
      onAlterado?.();
      return true;
    } catch (err) {
      setErro(err.message);
      await carregar();
      onAlterado?.();
      return false;
    } finally { setOcupado(false); }
  }

  async function adicionar(e) {
    e.preventDefault();
    const valores = separarValores(novoValor, 30);
    if (!valores.length) return;
    setSalvando(true);
    if (await adicionarVarios(aba, valores)) setNovoValor('');
    setSalvando(false);
  }

  async function remover(opt) {
    if (!(await confirmar({ titulo: `Remover "${opt.valor}"?`, texto: `Ele sai da lista de ${LABEL_ABA[aba].toLowerCase()}. Produtos que já usam esse valor não mudam — ele só deixa de aparecer na lista de sugestões.`, perigo: true, botao: 'Remover' }))) return;
    try {
      await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao/${opt.id}`, { method: 'DELETE' });
      await carregar();
      onAlterado?.();
    } catch { /* se falhar, a lista simplesmente não atualiza */ }
  }

  /* ── tipos de produto ── */
  function abrirModelo(m) {
    if (modeloId === m.id) { setModeloId(null); return; }
    setCriando(false);
    setModeloId(m.id);
    setMarcados(m.tamanhos.filter(t => !jaTem('tamanho', t)));
  }
  const modeloAberto = modelos.find(m => m.id === modeloId) || null;
  function alternarMarcado(t) {
    setMarcados(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  async function adicionarMarcados() {
    if (await adicionarVarios('tamanho', marcados)) setMarcados([]);
  }
  async function excluirModelo(m) {
    if (!(await confirmar({ titulo: `Excluir o tipo "${m.nome}"?`, texto: 'Só o atalho do tipo é apagado. Os tamanhos já cadastrados continuam na sua lista.', perigo: true, botao: 'Excluir' }))) return;
    try {
      await excluirModeloProprio(estabelecimentoId, m.id);
      setProprios(prev => prev.filter(x => x.id !== m.id)); setModeloId(null);
    } catch (err) { setErro(err.message); }
  }
  async function salvarNovoTipo(e) {
    e.preventDefault();
    const nome = novoTipo.nome.trim().slice(0, 40);
    const tamanhos = separarValores(novoTipo.tamanhos, 60);
    if (!nome) { setErro('Dê um nome ao tipo de produto (ex.: Boné).'); return; }
    if (!tamanhos.length) { setErro('Digite os tamanhos desse tipo, separados por vírgula (ex.: 56, 58, 60).'); return; }
    if (modelos.some(m => m.nome.toLowerCase() === nome.toLowerCase())) { setErro('Já existe um tipo com esse nome.'); return; }
    setErro('');
    let novo;
    try { novo = await criarModeloProprio(estabelecimentoId, nome, tamanhos); }
    catch (err) { setErro(err.message); return; }
    setProprios(prev => [...prev, novo]);
    setNovoTipo({ nome: '', tamanhos: '' }); setCriando(false);
    await adicionarVarios('tamanho', tamanhos);
    setModeloId(novo.id); setMarcados([]);
  }

  // Lista cadastrada, juntos ou por tipo
  const lista = opcoes[aba] || [];
  const grupos = useMemo(() => {
    if (aba !== 'tamanho' || !agrupar) return null;
    const usados = new Set();
    const out = [];
    for (const m of modelos) {
      const itens = lista.filter(o => !usados.has(o.id) && m.tamanhos.some(t => t.toLowerCase() === o.valor.toLowerCase()));
      itens.forEach(o => usados.add(o.id));
      if (itens.length) out.push({ titulo: `${m.icone} ${m.nome}`, itens });
    }
    const resto = lista.filter(o => !usados.has(o.id));
    if (resto.length) out.push({ titulo: '📦 Outros', itens: resto });
    return out;
  }, [aba, agrupar, lista, modelos]);

  const chipLista = (opt) => (
    <span key={opt.id} className="prod-opcao-chip">
      {opt.valor}
      <button type="button" onClick={() => remover(opt)} title={`Remover "${opt.valor}"`}>✕</button>
    </span>
  );

  // Sugestões de cor / gênero com marcação múltipla
  const blocoSugestoes = (tipo, titulo, valores) => {
    const faltam = valores.filter(v => !jaTem(tipo, v));
    const sel = sugMarcadas[tipo].filter(v => faltam.includes(v));
    if (!faltam.length) return null;
    return (
      <div className="gov-sug">
        <div className="gov-sug-topo">
          <span className="gov-sug-titulo">{titulo}</span>
          <button type="button" className="etq-link" onClick={() => setSugMarcadas(p => ({ ...p, [tipo]: sel.length === faltam.length ? [] : [...faltam] }))}>
            {sel.length === faltam.length ? 'Limpar' : 'Marcar todas'}
          </button>
        </div>
        <div className="gov-chips">
          {faltam.map(v => (
            <button key={v} type="button" className={`gov-chip${sel.includes(v) ? ' on' : ''}`}
              onClick={() => setSugMarcadas(p => ({ ...p, [tipo]: sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v] }))}>
              {sel.includes(v) ? '✓ ' : '+ '}{v}
            </button>
          ))}
        </div>
        <button type="button" className="gov-btn-principal" disabled={!sel.length || ocupado}
          onClick={async () => { if (await adicionarVarios(tipo, sel)) setSugMarcadas(p => ({ ...p, [tipo]: [] })); }}>
          {ocupado ? 'Adicionando…' : sel.length ? `Adicionar ${sel.length} selecionad${tipo === 'cor' ? 'a' : 'o'}${sel.length > 1 ? 's' : ''}` : 'Marque as opções acima'}
        </button>
      </div>
    );
  };

  const ABAS = [
    { id: 'tamanho', icone: '📏', rotulo: 'Tamanhos' },
    { id: 'cor',     icone: '🎨', rotulo: 'Cores' },
    { id: 'genero',  icone: '🚻', rotulo: 'Gênero' },
  ];

  return (
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal gov-modal" onClick={e => e.stopPropagation()}>

        <div className="gov-topo">
          <span className="gov-topo-icone">⚙️</span>
          <div>
            <div className="gov-titulo">Tamanhos, cores e gênero</div>
            <div className="gov-sub">Cadastre uma vez e use em todos os produtos. Aparecem como sugestão ao montar as variações. Remover daqui não muda produtos que já usam o valor.</div>
          </div>
        </div>

        <div className="gov-abas" role="tablist">
          {ABAS.map(a => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id}
              className={`gov-aba${aba === a.id ? ' ativa' : ''}`} onClick={() => { setAba(a.id); setErro(''); }}>
              <span>{a.icone}</span> {a.rotulo}
              <em>{(opcoes[a.id] || []).length}</em>
            </button>
          ))}
        </div>

        {erro && <div className="prod-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={adicionar} className="gov-add">
          <input maxLength={200} className="prod-input"
            placeholder={aba === 'tamanho' ? 'Digite um ou vários — ex: XG, 48, 50' : aba === 'cor' ? 'Digite uma ou várias — ex: Verde musgo, Azul bebê' : 'Digite um ou vários — ex: Infantil'}
            value={novoValor} onChange={e => setNovoValor(e.target.value)} disabled={salvando} autoFocus />
          <button type="submit" className="gov-btn-principal gov-btn-add" disabled={salvando || !novoValor.trim()} title="Adicionar (ou Enter). Separe vários com vírgula.">
            {salvando ? '…' : '+ Adicionar'}
          </button>
        </form>

        {/* ── Tamanhos: por tipo de produto ── */}
        {aba === 'tamanho' && !loading && (
          <div className="gov-secao">
            <div className="gov-secao-titulo">Por tipo de produto <span>— escolha um para ver os tamanhos dele</span></div>
            <div className="gov-chips">
              {modelos.map(m => (
                <button key={m.id} type="button" className={`gov-tipo${modeloId === m.id ? ' on' : ''}`} onClick={() => abrirModelo(m)}>
                  <span>{m.icone}</span> {m.nome}
                </button>
              ))}
              <button type="button" className={`gov-tipo gov-tipo-novo${criando ? ' on' : ''}`} onClick={() => { setCriando(c => !c); setModeloId(null); setErro(''); }}>
                ＋ Outro produto…
              </button>
            </div>

            {modeloAberto && (
              <div className="gov-painel">
                <div className="gov-painel-topo">
                  <strong>{modeloAberto.icone} {modeloAberto.nome}</strong>
                  <span>
                    <button type="button" className="etq-link" onClick={() => {
                      const faltam = modeloAberto.tamanhos.filter(t => !jaTem('tamanho', t));
                      setMarcados(marcados.length === faltam.length ? [] : faltam);
                    }}>Marcar / limpar todos</button>
                    {modeloAberto.proprio && <button type="button" className="etq-link gov-perigo" onClick={() => excluirModelo(modeloAberto)}>Excluir tipo</button>}
                  </span>
                </div>
                <div className="gov-chips">
                  {modeloAberto.tamanhos.map(t => {
                    const tem = jaTem('tamanho', t);
                    return (
                      <button key={t} type="button" disabled={tem}
                        className={`gov-chip${marcados.includes(t) ? ' on' : ''}${tem ? ' feito' : ''}`}
                        onClick={() => alternarMarcado(t)} title={tem ? 'Já está na sua lista' : ''}>
                        {tem ? '✓ ' : marcados.includes(t) ? '✓ ' : '+ '}{t}
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="gov-btn-principal" disabled={!marcados.length || ocupado} onClick={adicionarMarcados}>
                  {ocupado ? 'Adicionando…' : marcados.length ? `Adicionar ${marcados.length} tamanho${marcados.length > 1 ? 's' : ''}` : 'Todos já estão na sua lista'}
                </button>
              </div>
            )}

            {criando && (
              <form className="gov-painel" onSubmit={salvarNovoTipo}>
                <div className="gov-painel-topo"><strong>🏷️ Novo tipo de produto</strong></div>
                <label className="gov-campo">Nome do produto / tipo
                  <input className="prod-input" maxLength={40} placeholder="ex: Boné, Cinto, Meia" value={novoTipo.nome}
                    onChange={e => setNovoTipo(p => ({ ...p, nome: e.target.value }))} autoFocus />
                </label>
                <label className="gov-campo">Tamanhos (separe com vírgula)
                  <input className="prod-input" maxLength={300} placeholder="ex: 56, 58, 60  ou  Único" value={novoTipo.tamanhos}
                    onChange={e => setNovoTipo(p => ({ ...p, tamanhos: e.target.value }))} />
                </label>
                <button type="submit" className="gov-btn-principal" disabled={ocupado}>Salvar tipo e adicionar os tamanhos</button>
                <small className="gov-nota">O tipo fica salvo na conta da loja e vale em qualquer computador. Você pode organizar do jeito que quiser — ou ignorar e digitar os tamanhos direto no campo acima.</small>
              </form>
            )}
          </div>
        )}

        {/* ── Cores / Gênero: sugestões prontas ── */}
        {aba === 'cor' && !loading && blocoSugestoes('cor', 'Cores mais usadas — marque várias de uma vez', CORES_BASICAS)}
        {aba === 'genero' && !loading && blocoSugestoes('genero', 'Sugestões', GENEROS_BASICOS)}

        {/* ── Lista cadastrada ── */}
        <div className="gov-secao">
          <div className="gov-secao-titulo gov-secao-linha">
            <span>Sua lista de {LABEL_ABA[aba].toLowerCase()} <span>({lista.length})</span></span>
            {aba === 'tamanho' && lista.length > 1 && (
              <span className="gov-seg">
                <button type="button" className={!agrupar ? 'on' : ''} onClick={() => setAgrupar(false)}>Juntos</button>
                <button type="button" className={agrupar ? 'on' : ''} onClick={() => setAgrupar(true)}>Por tipo</button>
              </span>
            )}
          </div>
          {loading ? (
            <div className="gov-vazio">Carregando…</div>
          ) : lista.length === 0 ? (
            <div className="gov-vazio">
              Nenhum{aba === 'cor' ? 'a' : ''} {LABEL_ABA_SINGULAR[aba]} cadastrado{aba === 'cor' ? 'a' : ''} ainda. Use as sugestões acima ou digite no campo.
            </div>
          ) : grupos ? (
            grupos.map(g => (
              <div key={g.titulo} className="gov-grupo">
                <div className="gov-grupo-titulo">{g.titulo}</div>
                <div className="prod-opcoes-chips">{g.itens.map(chipLista)}</div>
              </div>
            ))
          ) : (
            <div className="prod-opcoes-chips">{lista.map(chipLista)}</div>
          )}
        </div>

        <div className="prod-modal-acoes" style={{ marginTop: 14 }}>
          <button type="button" className="prod-modal-btn-cancelar" onClick={onClose}>Fechar (Esc)</button>
        </div>

      </div>
    </div>
  );
}
