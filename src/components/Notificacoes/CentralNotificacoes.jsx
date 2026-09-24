// src/components/Notificacoes/CentralNotificacoes.jsx
// Tela completa da Central de Notificações (comerciante/operador e SuperAdmin):
//   • Caixa de entrada — avisos agrupados (atrasados / hoje / próximos / outros),
//     filtro por categoria e status, busca, seleção em lote, abrir / lida /
//     adiar / não mostrar mais.
//   • Lembretes — criar, editar, concluir (repetição pula pra próxima), excluir.
//   • Preferências — liga/desliga, antecedência, frequência e resumo ao entrar
//     por tipo de aviso.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../utils/api';
import {
  useNotificacoes, ROTULO_GRUPO, OPCOES_ADIAR, tempoRelativo, fmtDataHoraCurta, tocarSom,
} from './NotificacoesContext';
import LembreteModal, { ROTULO_RECORRENCIA } from './LembreteModal';
import Dica from './Dica';
import './Notificacoes.css';

const fmtBRL = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── Menu "Adiar" ─────────────────────────────────────────── */
function MenuAdiar({ onEscolher, compacto = false }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fechar); document.removeEventListener('keydown', esc); };
  }, [aberto]);
  return (
    <div className="ntf-menu-wrap" ref={ref}>
      <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => setAberto(a => !a)} title="Adiar este aviso">
        ⏰{!compacto && ' Adiar'} ▾
      </button>
      {aberto && (
        <div className="ntf-menu" role="menu">
          <span className="ntf-menu-titulo">Lembrar de novo em…</span>
          {OPCOES_ADIAR.map(o => (
            <button key={o.minutos} type="button" role="menuitem" onClick={() => { setAberto(false); onEscolher(o.minutos); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Cartão de um aviso ───────────────────────────────────── */
function CartaoAviso({ item, selecionado, onSelecionar, timezone }) {
  const ntf = useNotificacoes();
  const temAcao = !!item.acao && ['aba', 'rota'].includes(item.acao.tipo);
  const quando = item.data_ref
    ? (item.dia_inteiro
      ? `${fmtDataHoraCurta(item.data_ref, timezone).slice(0, 10)} (dia todo)`
      : fmtDataHoraCurta(item.data_ref, timezone))
    : '';
  return (
    <div className={`ntf-card prio-${item.prioridade}${item.lida ? ' lida' : ''}${item.dispensada ? ' dispensada' : ''}${selecionado ? ' selecionado' : ''}`}>
      <label className="ntf-card-check" title="Selecionar">
        <input type="checkbox" checked={selecionado} onChange={e => onSelecionar(item.chave, e.target.checked)} />
      </label>
      <div className="ntf-card-icone" aria-hidden="true">{item.icone}</div>
      <div className="ntf-card-corpo">
        <div className="ntf-card-linha1">
          {!item.lida && !item.dispensada && <span className="ntf-ponto" title="Não lida" />}
          <span className="ntf-card-titulo">{item.titulo}</span>
          {item.prioridade === 'critica' && <span className="ntf-tag ntf-tag-critica">Urgente</span>}
          {item.prioridade === 'alta' && <span className="ntf-tag ntf-tag-alta">Importante</span>}
          {item.adiada && <span className="ntf-tag ntf-tag-adiada">⏰ volta {tempoRelativo(item.adiada_ate)}</span>}
        </div>
        {item.descricao && <div className="ntf-card-desc">{item.descricao}</div>}
        <div className="ntf-card-meta">
          {quando && <span title={quando}>📅 {quando}{!item.dia_inteiro && item.data_ref?.length > 10 ? ` · ${tempoRelativo(item.data_ref)}` : ''}</span>}
          {item.valor != null && <span className="ntf-card-valor">{fmtBRL(item.valor)}</span>}
          {item.meta?.recorrencia && item.meta.recorrencia !== 'nenhuma' && <span>🔁 {ROTULO_RECORRENCIA[item.meta.recorrencia]}</span>}
          {item.meta?.visibilidade === 'todos' && <span>👥 Para todos</span>}
          {item.meta?.criado_por_nome && <span>por {item.meta.criado_por_nome}</span>}
        </div>
      </div>
      <div className="ntf-card-acoes">
        {temAcao && (
          <button type="button" className="ntf-btn ntf-btn-primario ntf-btn-mini" onClick={() => ntf.abrirAviso(item)}>Abrir →</button>
        )}
        {!item.dispensada && (item.lida
          ? <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => ntf.marcarNaoLidas([item.chave])} title="Marcar como não lida">↺ Não lida</button>
          : <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => ntf.marcarLidas([item.chave])} title="Marcar como lida">✓ Lida</button>)}
        {!item.dispensada && <MenuAdiar onEscolher={(m) => ntf.adiar([item.chave], m)} compacto />}
        {item.dispensada || item.adiada
          ? <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => ntf.restaurar([item.chave])} title="Voltar pra caixa de entrada">↩ Restaurar</button>
          : <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini ntf-btn-perigo-txt" onClick={() => ntf.dispensar([item.chave])} title="Não mostrar mais este aviso (volta se mudar, ex.: novo vencimento)">🔕</button>}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABA: CAIXA DE ENTRADA
   ════════════════════════════════════════════════════════════ */
function CaixaEntrada({ status, setStatus, grupo, setGrupo }) {
  // status: ativas | nao_lidas | adiadas | dispensadas — grupo: todos | atrasado | hoje | proximo | info
  // (ficam na tela da central porque os cartões de resumo do topo também mexem neles)
  const ntf = useNotificacoes();
  const [categoria, setCategoria] = useState('todas');
  const [busca, setBusca]         = useState('');
  const [selecao, setSelecao]     = useState(() => new Set());
  const tz = ntf.dados?.timezone;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ntf.itens.filter(i => {
      if (categoria !== 'todas' && i.categoria !== categoria) return false;
      if (status === 'ativas' && (i.adiada || i.dispensada)) return false;
      if (status === 'nao_lidas' && (i.lida || i.adiada || i.dispensada)) return false;
      if (status === 'adiadas' && (!i.adiada || i.dispensada)) return false;
      if (status === 'dispensadas' && !i.dispensada) return false;
      if (grupo !== 'todos' && i.grupo !== grupo) return false;
      if (termo && !`${i.titulo} ${i.descricao || ''}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [ntf.itens, categoria, status, grupo, busca]);

  const grupos = useMemo(() => {
    const g = { atrasado: [], hoje: [], proximo: [], info: [] };
    filtrados.forEach(i => (g[i.grupo] || g.info).push(i));
    return g;
  }, [filtrados]);

  useEffect(() => { setSelecao(new Set()); }, [categoria, status, grupo, busca]);

  function selecionar(chave, marcado) {
    setSelecao(s => { const n = new Set(s); marcado ? n.add(chave) : n.delete(chave); return n; });
  }
  const todasSelecionadas = filtrados.length > 0 && filtrados.every(i => selecao.has(i.chave));
  const chavesSel = [...selecao];

  const contagemCat = ntf.contagem.por_categoria || {};
  const statusOpcoes = [
    { v: 'ativas', t: 'Caixa de entrada', n: ntf.contagem.total },
    { v: 'nao_lidas', t: 'Não lidas', n: ntf.contagem.nao_lidas },
    { v: 'adiadas', t: 'Adiadas', n: ntf.contagem.adiadas },
    { v: 'dispensadas', t: 'Ocultas', n: ntf.contagem.dispensadas },
  ];

  return (
    <div className="ntf-caixa">
      <aside className="ntf-filtros">
        <span className="ntf-filtros-titulo">Tipos de aviso</span>
        <button type="button" className={`ntf-cat-btn${categoria === 'todas' ? ' ativo' : ''}`} onClick={() => setCategoria('todas')}>
          <span className="ntf-cat-icone">🔔</span><span className="ntf-cat-nome">Todos</span>
          {ntf.contagem.nao_lidas > 0 && <span className="ntf-cat-cont">{ntf.contagem.nao_lidas}</span>}
        </button>
        {ntf.categorias.map(c => {
          const pc = contagemCat[c.id] || { total: 0, nao_lidas: 0 };
          const desligada = ntf.preferencias?.categorias?.[c.id]?.ativo === false;
          return (
            <button key={c.id} type="button" className={`ntf-cat-btn${categoria === c.id ? ' ativo' : ''}${desligada ? ' desligada' : ''}`}
              onClick={() => setCategoria(c.id)} title={desligada ? 'Desligado nas preferências' : c.descricao}>
              <span className="ntf-cat-icone">{c.icone}</span>
              <span className="ntf-cat-nome">{c.label}</span>
              {desligada ? <span className="ntf-cat-off">off</span>
                : pc.nao_lidas > 0 ? <span className="ntf-cat-cont">{pc.nao_lidas}</span>
                : pc.total > 0 ? <span className="ntf-cat-cont suave">{pc.total}</span> : null}
            </button>
          );
        })}
      </aside>

      <section className="ntf-lista-area">
        <div className="ntf-toolbar">
          <div className="ntf-seg" role="tablist">
            {statusOpcoes.map(o => (
              <button key={o.v} type="button" className={status === o.v ? 'ativo' : ''} onClick={() => setStatus(o.v)}>
                {o.t}{o.n > 0 && <span className="ntf-seg-n">{o.n}</span>}
              </button>
            ))}
          </div>
          <input className="ntf-busca" type="search" maxLength={100} placeholder="🔍 Buscar aviso…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>

        {grupo !== 'todos' && (
          <div className="ntf-filtro-ativo">
            <span>Mostrando só: <strong>{ROTULO_GRUPO[grupo]}</strong></span>
            <button type="button" onClick={() => setGrupo('todos')} title="Tirar este filtro">✕ Mostrar todos</button>
          </div>
        )}

        {filtrados.length > 0 && (
          <div className={`ntf-bulk${selecao.size ? ' ativo' : ''}`}>
            <label className="ntf-bulk-check">
              <input type="checkbox" checked={todasSelecionadas}
                onChange={e => setSelecao(e.target.checked ? new Set(filtrados.map(i => i.chave)) : new Set())} />
              {selecao.size ? `${selecao.size} selecionado${selecao.size === 1 ? '' : 's'}` : 'Selecionar todos'}
            </label>
            {selecao.size > 0 ? (
              <div className="ntf-bulk-acoes">
                <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => { ntf.marcarLidas(chavesSel); setSelecao(new Set()); }}>✓ Marcar como lidas</button>
                <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => { ntf.marcarNaoLidas(chavesSel); setSelecao(new Set()); }}>↺ Não lidas</button>
                <MenuAdiar onEscolher={(m) => { ntf.adiar(chavesSel, m); setSelecao(new Set()); }} />
                {status === 'dispensadas' || status === 'adiadas'
                  ? <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => { ntf.restaurar(chavesSel); setSelecao(new Set()); }}>↩ Restaurar</button>
                  : <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini ntf-btn-perigo-txt" onClick={() => { ntf.dispensar(chavesSel); setSelecao(new Set()); }}>🔕 Ocultar</button>}
              </div>
            ) : (
              ntf.contagem.nao_lidas > 0 && status !== 'dispensadas' && (
                <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini"
                  onClick={() => ntf.marcarLidas(filtrados.filter(i => !i.lida && !i.dispensada).map(i => i.chave))}>
                  ✓ Marcar {categoria === 'todas' ? 'todas' : 'estas'} como lidas
                </button>
              )
            )}
          </div>
        )}

        {ntf.carregando && !ntf.dados ? (
          <div className="ntf-vazio"><div className="ntf-spinner" />Carregando notificações…</div>
        ) : ntf.erro && !ntf.dados ? (
          <div className="ntf-vazio">⚠️ {ntf.erro}<button type="button" className="ntf-btn ntf-btn-fantasma" onClick={ntf.recarregar}>Tentar de novo</button></div>
        ) : filtrados.length === 0 ? (
          <div className="ntf-vazio">
            <span className="ntf-vazio-icone">{status === 'dispensadas' ? '🔕' : status === 'adiadas' ? '⏰' : '🎉'}</span>
            <strong>{status === 'dispensadas' ? 'Nenhum aviso oculto' : status === 'adiadas' ? 'Nenhum aviso adiado' : 'Tudo em dia por aqui'}</strong>
            <span>{status === 'ativas' || status === 'nao_lidas' ? 'Quando algo precisar da sua atenção, aparece aqui.' : ''}</span>
          </div>
        ) : (
          ['atrasado', 'hoje', 'proximo', 'info'].map(g => grupos[g].length > 0 && (
            <div key={g} className={`ntf-grupo ntf-grupo-${g}`}>
              <div className="ntf-grupo-titulo">
                <span>{ROTULO_GRUPO[g]}</span>
                <span className="ntf-grupo-n">{grupos[g].length}</span>
              </div>
              {grupos[g].map(item => (
                <CartaoAviso key={item.chave} item={item} selecionado={selecao.has(item.chave)} onSelecionar={selecionar} timezone={tz} />
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ABA: LEMBRETES
   ════════════════════════════════════════════════════════════ */
function AbaLembretes({ abrirNovoInicial = false, onNovoAberto }) {
  const ntf = useNotificacoes();
  const [lista, setLista]         = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState('');
  const [filtro, setFiltro]       = useState('pendentes');
  const [busca, setBusca]         = useState('');
  const [modal, setModal]         = useState(null); // null | {} (novo) | lembrete (editar)
  const [ocupado, setOcupado]     = useState(null);
  const tz = ntf.dados?.timezone;

  async function carregar() {
    setErro('');
    try {
      const resp = await apiFetch('/api/notificacoes/lembretes?status=todos');
      const json = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error(json.error || 'Erro ao carregar lembretes.');
      setLista(json);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => { if (abrirNovoInicial) { setModal({}); onNovoAberto?.(); } }, [abrirNovoInicial]);

  async function acao(l, tipo) {
    if (tipo === 'excluir' && !window.confirm(`Excluir o lembrete "${l.titulo}"?`)) return;
    setOcupado(l.id);
    try {
      const url = tipo === 'excluir' ? `/api/notificacoes/lembretes/${l.id}` : `/api/notificacoes/lembretes/${l.id}/${tipo}`;
      const resp = await apiFetch(url, { method: tipo === 'excluir' ? 'DELETE' : 'POST' });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'Não foi possível concluir a ação.');
      await carregar();
      ntf.recarregar();
    } catch (e) { alert(e.message); }
    finally { setOcupado(null); }
  }

  const agora = Date.now();
  // "dia inteiro" só fica atrasado quando o dia termina
  const limite = (l) => Date.parse(l.data_hora) + (l.dia_inteiro ? 86400000 : 0);
  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter(l => {
    if (filtro === 'pendentes' && l.concluido_em) return false;
    if (filtro === 'concluidos' && !l.concluido_em) return false;
    if (termo && !`${l.titulo} ${l.descricao || ''} ${l.categoria || ''}`.toLowerCase().includes(termo)) return false;
    return true;
  });
  const secoes = filtro === 'concluidos'
    ? [{ id: 'concl', titulo: 'Concluídos', itens: visiveis }]
    : [
      { id: 'atr', titulo: 'Atrasados', itens: visiveis.filter(l => !l.concluido_em && limite(l) <= agora) },
      { id: 'prox', titulo: 'Próximos', itens: visiveis.filter(l => !l.concluido_em && limite(l) > agora) },
      ...(filtro === 'todos' ? [{ id: 'concl', titulo: 'Concluídos', itens: visiveis.filter(l => l.concluido_em) }] : []),
    ];

  return (
    <div className="ntf-lembretes">
      <div className="ntf-toolbar">
        <div className="ntf-seg">
          {[['pendentes', 'Pendentes'], ['concluidos', 'Concluídos'], ['todos', 'Todos']].map(([v, t]) => (
            <button key={v} type="button" className={filtro === v ? 'ativo' : ''} onClick={() => setFiltro(v)}>{t}</button>
          ))}
        </div>
        <input className="ntf-busca" type="search" maxLength={100} placeholder="🔍 Buscar lembrete…" value={busca} onChange={e => setBusca(e.target.value)} />
        <button type="button" className="ntf-btn ntf-btn-primario" onClick={() => setModal({})}>+ Novo lembrete</button>
      </div>

      {erro && <div className="ntf-erro">⚠️ {erro}</div>}
      {carregando ? (
        <div className="ntf-vazio"><div className="ntf-spinner" />Carregando lembretes…</div>
      ) : visiveis.length === 0 ? (
        <div className="ntf-vazio">
          <span className="ntf-vazio-icone">⏰</span>
          <strong>{filtro === 'concluidos' ? 'Nenhum lembrete concluído' : 'Nenhum lembrete por aqui'}</strong>
          <span>Crie lembretes pra pagamentos, entregas, ligações, tarefas da loja… com repetição e aviso antecipado.</span>
          <button type="button" className="ntf-btn ntf-btn-primario" onClick={() => setModal({})}>+ Criar lembrete</button>
        </div>
      ) : secoes.map(s => s.itens.length > 0 && (
        <div key={s.id} className={`ntf-grupo ntf-grupo-${s.id === 'atr' ? 'atrasado' : 'proximo'}`}>
          <div className="ntf-grupo-titulo"><span>{s.titulo}</span><span className="ntf-grupo-n">{s.itens.length}</span></div>
          {s.itens.map(l => {
            const d = new Date(l.data_hora);
            const opt = tz ? { timeZone: tz } : {};
            const dia = d.toLocaleDateString('pt-BR', { ...opt, day: '2-digit' });
            const mes = d.toLocaleDateString('pt-BR', { ...opt, month: 'short' }).replace('.', '');
            const hora = l.dia_inteiro ? 'dia todo' : d.toLocaleTimeString('pt-BR', { ...opt, hour: '2-digit', minute: '2-digit' });
            const atrasado = !l.concluido_em && limite(l) <= agora;
            return (
              <div key={l.id} className={`ntf-lem-item prio-${l.prioridade === 'alta' ? 'alta' : l.prioridade === 'baixa' ? 'baixa' : 'media'}${l.concluido_em ? ' concluido' : ''}${atrasado ? ' atrasado' : ''}`}>
                <div className="ntf-lem-data">
                  <span className="ntf-lem-dia">{dia}</span>
                  <span className="ntf-lem-mes">{mes}</span>
                  <span className="ntf-lem-hora">{hora}</span>
                </div>
                <div className="ntf-card-corpo">
                  <div className="ntf-card-linha1">
                    <span className="ntf-card-titulo">{l.titulo}</span>
                    {l.prioridade === 'alta' && <span className="ntf-tag ntf-tag-alta">Alta</span>}
                    {l.categoria && <span className="ntf-tag">{l.categoria}</span>}
                    {atrasado && <span className="ntf-tag ntf-tag-critica">Atrasado</span>}
                  </div>
                  {l.descricao && <div className="ntf-card-desc">{l.descricao}</div>}
                  <div className="ntf-card-meta">
                    <span>{l.concluido_em ? `✓ Concluído ${tempoRelativo(l.concluido_em)}` : l.dia_inteiro ? (atrasado ? 'dia já passou' : 'dia inteiro') : tempoRelativo(l.data_hora)}</span>
                    {l.recorrencia !== 'nenhuma' && <span>🔁 {ROTULO_RECORRENCIA[l.recorrencia]}</span>}
                    {l.antecedencia_min > 0 && <span>🔔 avisa {rotuloAntecedencia(l.antecedencia_min)} antes</span>}
                    <span>{l.visibilidade === 'todos' ? '👥 Para todos' : '🔒 Só pra mim'}</span>
                    {l.criado_por_nome && <span>por {l.criado_por_nome}</span>}
                  </div>
                </div>
                <div className="ntf-card-acoes">
                  {l.concluido_em
                    ? <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" disabled={ocupado === l.id} onClick={() => acao(l, 'reabrir')}>↺ Reabrir</button>
                    : <button type="button" className="ntf-btn ntf-btn-primario ntf-btn-mini" disabled={ocupado === l.id} onClick={() => acao(l, 'concluir')}
                        title={l.recorrencia !== 'nenhuma' ? 'Concluir e pular pra próxima repetição' : 'Marcar como feito'}>
                        ✓ {l.recorrencia !== 'nenhuma' ? 'Feito (próxima)' : 'Concluir'}
                      </button>}
                  {l.pode_editar && <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => setModal(l)}>✏️ Editar</button>}
                  {l.pode_editar && <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini ntf-btn-perigo-txt" disabled={ocupado === l.id} onClick={() => acao(l, 'excluir')}>🗑</button>}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {modal && (
        <LembreteModal
          lembrete={modal.id ? modal : null}
          contexto={ntf.contexto}
          timezone={tz}
          onFechar={() => setModal(null)}
          onSalvo={() => { setModal(null); carregar(); ntf.recarregar(); }}
        />
      )}
    </div>
  );
}

function rotuloAntecedencia(min) {
  if (min % 1440 === 0) { const d = min / 1440; return `${d} dia${d === 1 ? '' : 's'}`; }
  if (min % 60 === 0) { const h = min / 60; return `${h} h`; }
  return `${min} min`;
}

/* ════════════════════════════════════════════════════════════
   ABA: PREFERÊNCIAS
   ════════════════════════════════════════════════════════════ */
const FREQUENCIAS = [
  { v: 'sempre',  t: 'Sempre que entrar', d: 'Mesmo lida, volta a aparecer como nova a cada login.' },
  { v: 'diaria',  t: '1 vez por dia',     d: 'Lida hoje, volta amanhã se continuar pendente.' },
  { v: 'horas',   t: 'A cada X horas',    d: 'Lida, volta depois do intervalo escolhido.' },
  { v: 'uma_vez', t: 'Só uma vez',        d: 'Lida, só volta se o aviso mudar (ex.: novo vencimento).' },
];

// Explicação de cada campo (ícone "?")
const DICA_ANTECEDENCIA = {
  fiado: 'Quantos dias antes do vencimento do fiado o aviso começa a aparecer. Depois de vencido, continua avisando até o cliente pagar.',
  contas: 'Quantos dias antes do vencimento da conta o aviso começa a aparecer. Depois de vencida, continua avisando até ser marcada como paga.',
  fornecedores: 'Quantos dias antes da data de pagar o fornecedor o aviso começa a aparecer. Continua avisando até a conta ser paga.',
  assinatura: 'Quantos dias antes do vencimento da sua assinatura do sistema o aviso começa a aparecer.',
  licencas: 'Quantos dias antes de a licença de um estabelecimento vencer o aviso começa a aparecer. Vencidas e bloqueadas aparecem sempre.',
  pagamentos: 'Por quantos dias um pagamento recebido continua aparecendo na central.',
  cadastros: 'Por quantos dias um estabelecimento recém-cadastrado continua aparecendo na central.',
};
const DICA_FREQUENCIA = 'Depois que você marca um aviso como lido, quando ele volta a aparecer como novo (se ainda estiver pendente). Sempre que entrar: a cada login. 1 vez por dia: volta no dia seguinte. A cada X horas: volta depois do intervalo. Só uma vez: só volta se o aviso mudar (ex.: novo vencimento).';
const DICA_RESUMO_CAT = 'Se marcado, os avisos deste tipo entram no resumo que aparece ao fazer login. Desmarcado, eles continuam no sininho e na central, só não aparecem no resumo.';
const DICA_ESTOQUE = 'Abaixo do mínimo ou zerado: avisa quando o estoque chega no mínimo cadastrado no produto (ou zera). Só quando zerar: avisa apenas quando acabar.';
const DICA_INTERVALO = 'De quantas em quantas horas um aviso já lido volta a aparecer como novo.';

// Dias de antecedência: opções prontas + "Outro…" pra digitar qualquer número (0 a 365)
function SeletorDias({ valor, onChange, janela }) {
  const opcoes = janela ? [1, 3, 7, 15, 30, 60, 90] : [0, 1, 2, 3, 5, 7, 10, 15, 30];
  const [digitando, setDigitando] = useState(() => !opcoes.includes(valor));
  const [texto, setTexto] = useState(String(valor ?? ''));
  useEffect(() => { setTexto(String(valor ?? '')); }, [valor]);
  const rotulo = (n) => janela ? `${n} dia${n === 1 ? '' : 's'}` : n === 0 ? 'Só no dia / atrasados' : `${n} dia${n === 1 ? '' : 's'} antes`;

  if (digitando) {
    const aplicar = (t) => {
      const n = parseInt(String(t).replace(/\D/g, ''), 10);
      if (Number.isInteger(n)) onChange(Math.min(365, Math.max(janela ? 1 : 0, n)));
    };
    return (
      <div className="ntf-dias-custom">
        <input className="ntf-input" type="text" inputMode="numeric" maxLength={3} value={texto} autoFocus
          onChange={e => { const t = e.target.value.replace(/\D/g, ''); setTexto(t); if (t !== '') aplicar(t); }}
          onBlur={() => { if (texto === '') setTexto(String(valor)); }} aria-label="Número de dias" />
        <span>{janela ? 'dias' : 'dias antes'}</span>
        <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini" onClick={() => setDigitando(false)} title="Voltar pras opções prontas">▾ Opções</button>
      </div>
    );
  }
  return (
    <select className="ntf-select" value={opcoes.includes(valor) ? valor : 'outro'}
      onChange={e => { if (e.target.value === 'outro') { setDigitando(true); return; } onChange(parseInt(e.target.value, 10)); }}>
      {opcoes.map(n => <option key={n} value={n}>{rotulo(n)}</option>)}
      {!opcoes.includes(valor) && <option value="outro" disabled hidden>{rotulo(valor)}</option>}
      <option value="outro">✏️ Outro… (digitar)</option>
    </select>
  );
}

const TEXTO_ANTECEDENCIA = {
  fiado: 'Avisar quantos dias antes do vencimento',
  contas: 'Avisar quantos dias antes do vencimento',
  fornecedores: 'Avisar quantos dias antes da data de pagar',
  assinatura: 'Avisar quantos dias antes de vencer',
  licencas: 'Avisar quantos dias antes de vencer',
  pagamentos: 'Mostrar pagamentos dos últimos',
  cadastros: 'Mostrar cadastros dos últimos',
};

function AbaPreferencias() {
  const ntf = useNotificacoes();
  const [prefs, setPrefs]   = useState(() => ntf.preferencias ? JSON.parse(JSON.stringify(ntf.preferencias)) : null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg]       = useState('');
  const [erro, setErro]     = useState('');

  useEffect(() => {
    if (!prefs && ntf.preferencias) setPrefs(JSON.parse(JSON.stringify(ntf.preferencias)));
  }, [ntf.preferencias]);

  if (!prefs) return <div className="ntf-vazio"><div className="ntf-spinner" />Carregando preferências…</div>;

  const setCat = (id, campo, valor) => { setMsg(''); setPrefs(p => ({ ...p, categorias: { ...p.categorias, [id]: { ...p.categorias[id], [campo]: valor } } })); };
  const setGeral = (campo, valor) => { setMsg(''); setPrefs(p => ({ ...p, [campo]: valor })); };
  const alterado = JSON.stringify(prefs) !== JSON.stringify(ntf.preferencias);

  async function salvar() {
    setSalvando(true); setErro(''); setMsg('');
    try {
      const novas = await ntf.salvarPreferencias(prefs);
      setPrefs(JSON.parse(JSON.stringify(novas)));
      setMsg('✓ Preferências salvas');
    } catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="ntf-prefs">
      <div className="ntf-pref-geral">
        <div className="ntf-pref-geral-item">
          <Chave marcado={prefs.resumo_login} onChange={v => setGeral('resumo_login', v)} />
          <div>
            <strong>Resumo ao entrar <Dica texto="Uma janela que aparece uma vez a cada login com o que está atrasado, vence hoje e nos próximos dias. Cada tipo de aviso escolhe abaixo se entra nesse resumo." /></strong>
            <span>Ao fazer login, mostra um resumo do que está atrasado, vence hoje e nos próximos dias.</span>
          </div>
        </div>
        <div className="ntf-pref-geral-item">
          <Chave marcado={prefs.som} onChange={v => setGeral('som', v)} />
          <div>
            <strong>Som ao chegar notificação nova <Dica texto="Toca um 'plim' curtinho quando aparece um aviso novo enquanto o sistema está aberto. Não toca ao entrar, só quando chega algo novo depois." /></strong>
            <span>Um "plim" discreto quando surgir um aviso novo com o sistema aberto.</span>
            <button type="button" className="ntf-btn ntf-btn-fantasma ntf-btn-mini ntf-btn-som" onClick={tocarSom} title="Ouvir como é o som (mesmo desligado)">🔊 Testar som</button>
          </div>
        </div>
      </div>

      <div className="ntf-pref-grid">
        {ntf.categorias.map(c => {
          const p = prefs.categorias[c.id] || {};
          const temAntecedencia = c.id in TEXTO_ANTECEDENCIA;
          const janela = c.id === 'pagamentos' || c.id === 'cadastros';
          return (
            <div key={c.id} className={`ntf-pref-card${p.ativo ? '' : ' desligado'}`}>
              <div className="ntf-pref-topo">
                <span className="ntf-pref-icone">{c.icone}</span>
                <div className="ntf-pref-nome">
                  <strong>{c.label}</strong>
                  <span>{c.descricao}</span>
                </div>
                <Chave marcado={!!p.ativo} onChange={v => setCat(c.id, 'ativo', v)} />
              </div>

              {p.ativo && (
                <div className="ntf-pref-corpo">
                  {temAntecedencia && (
                    <div className="ntf-pref-campo">
                      <span>{TEXTO_ANTECEDENCIA[c.id]} <Dica texto={DICA_ANTECEDENCIA[c.id]} /></span>
                      <SeletorDias valor={p.antecedencia_dias} janela={janela} onChange={n => setCat(c.id, 'antecedencia_dias', n)} />
                    </div>
                  )}
                  {c.id === 'estoque' && (
                    <label className="ntf-pref-campo">
                      <span>Avisar quando o produto estiver <Dica texto={DICA_ESTOQUE} /></span>
                      <select className="ntf-select" value={p.nivel_estoque || 'baixo'} onChange={e => setCat(c.id, 'nivel_estoque', e.target.value)}>
                        <option value="baixo">Abaixo do mínimo ou zerado</option>
                        <option value="zerado">Só quando zerar</option>
                      </select>
                    </label>
                  )}
                  <div className="ntf-pref-campo">
                    <span>Depois de lido, volta a aparecer… <Dica texto={DICA_FREQUENCIA} /></span>
                    <div className="ntf-seg ntf-seg-quebra">
                      {FREQUENCIAS.map(f => (
                        <button key={f.v} type="button" className={p.frequencia === f.v ? 'ativo' : ''} onClick={() => setCat(c.id, 'frequencia', f.v)} title={f.d}>{f.t}</button>
                      ))}
                    </div>
                    <small className="ntf-pref-dica">{FREQUENCIAS.find(f => f.v === p.frequencia)?.d}</small>
                  </div>
                  {p.frequencia === 'horas' && (
                    <label className="ntf-pref-campo">
                      <span>Intervalo <Dica texto={DICA_INTERVALO} /></span>
                      <select className="ntf-select" value={p.intervalo_horas || 4} onChange={e => setCat(c.id, 'intervalo_horas', parseInt(e.target.value, 10))}>
                        {[1, 2, 3, 4, 6, 8, 12, 24].map(h => <option key={h} value={h}>A cada {h} hora{h === 1 ? '' : 's'}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="ntf-pref-linha">
                    <input type="checkbox" checked={p.no_resumo !== false} onChange={e => setCat(c.id, 'no_resumo', e.target.checked)} />
                    Incluir no resumo ao entrar
                    <Dica texto={DICA_RESUMO_CAT} />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ntf-prefs-rodape">
        {erro && <span className="ntf-erro">⚠️ {erro}</span>}
        {msg && <span className="ntf-ok">{msg}</span>}
        <button type="button" className="ntf-btn ntf-btn-fantasma" disabled={!alterado || salvando}
          onClick={() => { setPrefs(JSON.parse(JSON.stringify(ntf.preferencias))); setMsg(''); }}>Desfazer alterações</button>
        <button type="button" className="ntf-btn ntf-btn-primario" disabled={!alterado || salvando} onClick={salvar}>
          {salvando ? '⏳ Salvando…' : 'Salvar preferências'}
        </button>
      </div>
    </div>
  );
}

function Chave({ marcado, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={marcado} className={`ntf-switch${marcado ? ' on' : ''}`} onClick={() => onChange(!marcado)}>
      <span className="ntf-switch-bola" />
    </button>
  );
}

/* ════════════════════════════════════════════════════════════
   TELA
   ════════════════════════════════════════════════════════════ */
export default function CentralNotificacoes({ abaInicial = 'caixa' }) {
  const ntf = useNotificacoes();
  const [aba, setAba] = useState(() => ntf?.pedidoCentral?.aba || abaInicial);
  const [novoLembrete, setNovoLembrete] = useState(false);
  const [statusCaixa, setStatusCaixa] = useState(() => ntf?.pedidoCentral?.filtro?.status || 'ativas');
  const [grupoCaixa, setGrupoCaixa]   = useState(() => ntf?.pedidoCentral?.filtro?.grupo || 'todos');
  // Pedido vindo do sininho / resumo ("ver central", "+ lembrete"):
  // aplica e descarta, pra não reabrir sozinho numa próxima visita à tela.
  const pedidoTs = ntf?.pedidoCentral?.ts;
  useEffect(() => {
    if (!pedidoTs) return;
    setAba(ntf.pedidoCentral.aba || 'caixa');
    if (ntf.pedidoCentral.novo) setNovoLembrete(true);
    const f = ntf.pedidoCentral.filtro;
    if (f) { setStatusCaixa(f.status || 'ativas'); setGrupoCaixa(f.grupo || 'todos'); }
    ntf.limparPedidoCentral();
  }, [pedidoTs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ntf) return null;
  const c = ntf.contagem;
  const proximos = ntf.itens.filter(i => !i.adiada && !i.dispensada && i.grupo === 'proximo').length;

  // Cartões do topo = atalhos de filtro da caixa de entrada (clicar de novo desfaz)
  const cards = [
    { id: 'nl',   n: c.nao_lidas, t: 'Não lidas',     cls: 'accent', status: 'nao_lidas', grupo: 'todos' },
    { id: 'atr',  n: c.atrasadas, t: 'Atrasados',     cls: 'perigo', status: 'ativas',    grupo: 'atrasado' },
    { id: 'hoje', n: c.hoje,      t: 'Para hoje',     cls: 'alerta', status: 'ativas',    grupo: 'hoje' },
    { id: 'prox', n: proximos,    t: 'Próximos dias', cls: 'info',   status: 'ativas',    grupo: 'proximo' },
    { id: 'adi',  n: c.adiadas,   t: 'Adiados',       cls: 'neutro', status: 'adiadas',   grupo: 'todos' },
  ];
  const cardAtivo = (k) => aba === 'caixa' && statusCaixa === k.status && grupoCaixa === k.grupo;
  function clicarCard(k) {
    setAba('caixa');
    if (cardAtivo(k)) { setStatusCaixa('ativas'); setGrupoCaixa('todos'); return; }
    setStatusCaixa(k.status); setGrupoCaixa(k.grupo);
  }

  return (
    <div className="ntf-root">
      <header className="ntf-header">
        <div className="ntf-header-txt">
          <h1>🔔 Central de Notificações</h1>
          <p>{ntf.contexto === 'admin'
            ? 'Licenças, pagamentos, solicitações, novos cadastros e seus lembretes — tudo num lugar só.'
            : 'Vencimentos de fiado, contas e fornecedores, estoque, assinatura, comunicados e seus lembretes.'}</p>
        </div>
        <div className="ntf-header-acoes">
          <button type="button" className="ntf-btn ntf-btn-fantasma" onClick={ntf.recarregar} title="Atualizar agora">⟳ Atualizar</button>
          <button type="button" className="ntf-btn ntf-btn-primario" onClick={() => { setAba('lembretes'); setNovoLembrete(true); }}>+ Novo lembrete</button>
        </div>
      </header>

      <div className="ntf-stats">
        {cards.map(k => (
          <button key={k.id} type="button" className={`ntf-stat ntf-stat-${k.cls} clicavel${cardAtivo(k) ? ' ativo' : ''}`}
            onClick={() => clicarCard(k)} aria-pressed={cardAtivo(k)}
            title={cardAtivo(k) ? 'Clique de novo pra mostrar todos' : `Mostrar só: ${k.t.toLowerCase()}`}>
            <span className="ntf-stat-n">{k.n}</span>
            <span className="ntf-stat-t">{k.t}</span>
          </button>
        ))}
      </div>

      <nav className="ntf-tabs" role="tablist">
        <button type="button" className={aba === 'caixa' ? 'ativo' : ''} onClick={() => setAba('caixa')}>
          📥 Notificações {c.nao_lidas > 0 && <span className="ntf-tab-n">{c.nao_lidas}</span>}
        </button>
        <button type="button" className={aba === 'lembretes' ? 'ativo' : ''} onClick={() => setAba('lembretes')}>
          ⏰ Lembretes {(c.por_categoria?.lembretes?.total || 0) > 0 && <span className="ntf-tab-n suave">{c.por_categoria.lembretes.total}</span>}
        </button>
        <button type="button" className={aba === 'prefs' ? 'ativo' : ''} onClick={() => setAba('prefs')}>⚙️ Preferências</button>
      </nav>

      <div className="ntf-conteudo">
        {aba === 'caixa' && <CaixaEntrada status={statusCaixa} setStatus={setStatusCaixa} grupo={grupoCaixa} setGrupo={setGrupoCaixa} />}
        {aba === 'lembretes' && <AbaLembretes abrirNovoInicial={novoLembrete} onNovoAberto={() => setNovoLembrete(false)} />}
        {aba === 'prefs' && <AbaPreferencias />}
      </div>
    </div>
  );
}
