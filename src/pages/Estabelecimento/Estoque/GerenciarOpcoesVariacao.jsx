// src/pages/Estabelecimento/Estoque/GerenciarOpcoesVariacao.jsx
import { confirmar } from '../../../components/Dialogo/dialogo';
import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../../utils/api';
import {
  MODELOS_PRONTOS, CORES_BASICAS, GENEROS_BASICOS,
  buscarModelosProprios, criarModeloProprio, excluirModeloProprio, separarValores,
  todosModelos, salvarExtrasModelo, atualizarModeloProprio,
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

  const modelos = useMemo(() => todosModelos(proprios), [proprios]);
  const [novoNoTipo, setNovoNoTipo] = useState('');
  const [tipoDestino, setTipoDestino] = useState('');   // campo de cima: também colocar no tipo…

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
    const destino = aba === 'tamanho' ? modelos.find(m => m.id === tipoDestino) : null;
    if (destino) {
      const novosNoTipo = valores.filter(t => !destino.tamanhos.some(x => x.toLowerCase() === t.toLowerCase()));
      try { if (novosNoTipo.length) await gravarTamanhosTipo(destino, [...destino.tamanhos, ...novosNoTipo]); }
      catch (err) { setErro(err.message); setSalvando(false); return; }
    }
    const jaTinha = valores.every(v => jaTem(aba, v));
    if (jaTinha && destino) { setNovoValor(''); }            // só entrou no tipo
    else if (await adicionarVarios(aba, valores)) setNovoValor('');
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
    if (modeloId === m.id) { setModeloId(null); setTipoDestino(''); return; }
    setCriando(false);
    setModeloId(m.id);
    setTipoDestino(m.id);
    setMarcados(m.tamanhos.filter(t => jaTem('tamanho', t)));   // marcados = os que ficam na sua lista
  }
  const modeloAberto = modelos.find(m => m.id === modeloId) || null;
  const sigModelo = modeloAberto ? modeloAberto.tamanhos.join('|') : '';
  const sigLista = (opcoes.tamanho || []).map(o => o.valor).join('|');
  useEffect(() => {
    if (modeloAberto) setMarcados(modeloAberto.tamanhos.filter(t => jaTem('tamanho', t)));
  }, [sigLista, sigModelo, modeloId]); // eslint-disable-line
  function alternarMarcado(t) {
    setMarcados(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  // Aplica a seleção do painel: marcados entram na sua lista, desmarcados saem dela.
  async function aplicarSelecao(m) {
    const entrar = m.tamanhos.filter(t => marcados.includes(t) && !jaTem('tamanho', t));
    const sair = (opcoes.tamanho || []).filter(o => m.tamanhos.some(t => t.toLowerCase() === o.valor.toLowerCase()) && !marcados.some(t => t.toLowerCase() === o.valor.toLowerCase()));
    if (sair.length && !(await confirmar({ titulo: `Tirar ${sair.length} tamanho${sair.length > 1 ? 's' : ''} da sua lista?`, texto: `${sair.map(o => o.valor).join(', ')} deixam de aparecer como sugestão. Produtos que já usam esses valores não mudam, e eles continuam no tipo "${m.nome}" para você marcar de novo quando quiser.`, perigo: true, botao: 'Tirar da lista' }))) return;
    setOcupado(true); setErro('');
    try {
      for (const o of sair) await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao/${o.id}`, { method: 'DELETE' });
      if (entrar.length) await adicionarVarios('tamanho', entrar); else { await carregar(); onAlterado?.(); }
    } catch { setErro('Não foi possível atualizar a lista. Tente de novo.'); }
    setOcupado(false);
  }
  // Acrescenta tamanhos (ex.: 56) ao tipo aberto — vale para tipos prontos e próprios.
  async function adicionarAoTipo(m, texto) {
    const novos = separarValores(texto, 60).filter(t => !m.tamanhos.some(x => x.toLowerCase() === t.toLowerCase()));
    if (!novos.length) { setErro('Esse tamanho já está no tipo.'); return; }
    setErro(''); setOcupado(true);
    try {
      await gravarTamanhosTipo(m, [...m.tamanhos, ...novos]);
      setNovoNoTipo('');
      await adicionarVarios('tamanho', novos);
    } catch (err) { setErro(err.message); }
    setOcupado(false);
  }
  async function removerDoTipo(m, t) {
    if (m.proprio && m.tamanhos.length <= 1) { setErro('O tipo precisa ter pelo menos um tamanho. Para tirar o tipo, use "Excluir tipo".'); return; }
    setErro('');
    try { await gravarTamanhosTipo(m, m.tamanhos.filter(x => x !== t)); }
    catch (err) { setErro(err.message); }
  }
  // Grava a nova lista: tipo próprio troca tudo; tipo pronto guarda só os extras.
  async function gravarTamanhosTipo(m, lista) {
    if (m.proprio) {
      const d = await atualizarModeloProprio(estabelecimentoId, m.id, lista);
      setProprios(prev => prev.map(x => x.id === m.id ? { ...x, tamanhos: d.tamanhos } : x));
    } else {
      const extras = lista.filter(t => !MODELOS_PRONTOS.find(b => b.id === m.id).tamanhos.some(x => x.toLowerCase() === t.toLowerCase()));
      const d = await salvarExtrasModelo(estabelecimentoId, m.id, m.nome, extras);
      setProprios(prev => {
        const sem = prev.filter(x => x.modelo_base !== m.id);
        return extras.length ? [...sem, { id: d.id, nome: m.nome, tamanhos: extras, modelo_base: m.id }] : sem;
      });
    }
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
        {aba === 'tamanho' && (
          <label className="gov-destino">Colocar também no tipo:
            <select className="prod-input" value={tipoDestino} onChange={e => setTipoDestino(e.target.value)}>
              <option value="">Nenhum (só na minha lista)</option>
              {modelos.map(m => <option key={m.id} value={m.id}>{m.icone} {m.nome}</option>)}
            </select>
          </label>
        )}

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
                      setMarcados(marcados.length === modeloAberto.tamanhos.length ? [] : [...modeloAberto.tamanhos]);
                    }}>{marcados.length === modeloAberto.tamanhos.length ? 'Limpar todos' : 'Marcar todos'}</button>
                    {modeloAberto.proprio && <button type="button" className="etq-link gov-perigo" onClick={() => excluirModelo(modeloAberto)}>Excluir tipo</button>}
                  </span>
                </div>
                <div className="gov-chips">
                  {modeloAberto.tamanhos.map(t => {
                    const tem = jaTem('tamanho', t);
                    const removivel = modeloAberto.proprio ? true : (modeloAberto.extras || []).includes(t);
                    return (
                      <span key={t} className="gov-chip-wrap">
                        <button type="button"
                          className={`gov-chip${marcados.includes(t) ? ' on' : ''}${tem && !marcados.includes(t) ? ' sair' : ''}`}
                          onClick={() => alternarMarcado(t)}
                          title={marcados.includes(t) ? (tem ? 'Está na sua lista — clique para tirar' : 'Será adicionado — clique para desfazer') : (tem ? 'Será tirado da lista' : 'Clique para adicionar à sua lista')}>
                          {marcados.includes(t) ? '✓ ' : tem ? '− ' : '+ '}{t}
                        </button>
                        {removivel && <button type="button" className="gov-chip-x" title={`Tirar "${t}" deste tipo`} onClick={() => removerDoTipo(modeloAberto, t)}>✕</button>}
                      </span>
                    );
                  })}
                </div>
                <div className="gov-add-tipo">
                  <input className="prod-input" maxLength={120} placeholder={`＋ Outro tamanho para ${modeloAberto.nome} — ex: 56 ou 56, 58`}
                    value={novoNoTipo} onChange={e => setNovoNoTipo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarAoTipo(modeloAberto, novoNoTipo); } }} />
                  <button type="button" className="gov-btn-principal" disabled={!novoNoTipo.trim() || ocupado} onClick={() => adicionarAoTipo(modeloAberto, novoNoTipo)}>Adicionar ao tipo</button>
                </div>
                {(() => {
                  const m = modeloAberto;
                  const entrar = m.tamanhos.filter(t => marcados.includes(t) && !jaTem('tamanho', t)).length;
                  const sair = m.tamanhos.filter(t => !marcados.includes(t) && jaTem('tamanho', t)).length;
                  const txt = [entrar ? `adicionar ${entrar}` : '', sair ? `tirar ${sair}` : ''].filter(Boolean).join(' e ');
                  return (
                    <button type="button" className="gov-btn-principal" disabled={!txt || ocupado} onClick={() => aplicarSelecao(m)}>
                      {ocupado ? 'Atualizando…' : txt ? `Aplicar: ${txt}` : 'Marque ou desmarque para alterar sua lista'}
                    </button>
                  );
                })()}
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
