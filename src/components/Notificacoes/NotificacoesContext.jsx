// src/components/Notificacoes/NotificacoesContext.jsx
// ============================================================
// Central de Notificações (23/09/2026) — estado compartilhado entre o sino,
// o resumo ao entrar e a tela da central. Um Provider por painel:
//   - comerciante/operador: PainelEstabelecimento (contexto="estab")
//   - SuperAdmin: LayoutAdmin (contexto="admin")
//
// Leve de propósito:
//   - os avisos são calculados no backend numa chamada só (GET /api/notificacoes);
//   - atualiza pelo tempo real que já existe (sem polling rápido);
//   - quando algo vai mudar sozinho (lembrete chegando, adiamento acabando,
//     virada do dia), o backend diz o horário e a tela agenda UMA atualização;
//   - reserva: 5 min, só com a aba visível.
// ============================================================
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../utils/api';
import { useAvisosEstabelecimento, useAvisosGlobais, usePollingReserva } from '../../utils/realtimeEstab';
import { supabase } from '../../utils/supabaseClient';

const NotificacoesCtx = createContext(null);

const CHAVE_SESSAO = 'ntf-sessao';

// "Sessão" = um login. O token do Supabase traz um session_id que muda a
// cada login (e continua o mesmo nas renovações do token). Guardamos
// junto a hora em que essa sessão abriu o painel — base da frequência
// "sempre que entrar" — e se o resumo ao entrar já foi mostrado.
function lerSessaoLocal() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null'); } catch { return null; }
}
function gravarSessaoLocal(v) {
  try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(v)); } catch { /* ignore */ }
}
async function idDaSessaoAtual() {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '==='.slice((b64.length + 3) % 4)));
    return String(payload.session_id || `${payload.sub}:${data.session.user?.last_sign_in_at || ''}`);
  } catch { return null; }
}
async function inicioSessao() {
  const sid = await idDaSessaoAtual();
  const atual = lerSessaoLocal();
  if (atual && atual.sid === sid && atual.inicio) return atual.inicio;
  const nova = { sid, inicio: new Date().toISOString(), resumo: false };
  gravarSessaoLocal(nova);
  return nova.inicio;
}

// Resumo ao entrar: uma vez por login
export function resumoJaMostrado() {
  return !!lerSessaoLocal()?.resumo;
}
export function marcarResumoMostrado() {
  const atual = lerSessaoLocal();
  if (atual) gravarSessaoLocal({ ...atual, resumo: true });
}

// Som curtinho (dois tons) — só se o usuário ligar nas preferências.
function tocarSom() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [1320, 0.13]].forEach(([freq, atraso]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + atraso);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + atraso + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + atraso + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + atraso);
      o.stop(ctx.currentTime + atraso + 0.25);
    });
    setTimeout(() => ctx.close?.(), 800);
  } catch { /* som é só um extra */ }
}

const TIPOS_TEMPO_REAL = ['clientes', 'vendas', 'financeiro', 'produtos', 'licenca', 'comunicados', 'solicitacoes', 'lembretes'];

export function NotificacoesProvider({ contexto = 'estab', estabelecimentoId = null, onNavegar = null, onAbrirCentral = null, children }) {
  const [dados, setDados]         = useState(null); // resposta do GET
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro]           = useState('');
  const naoLidasAnteriorRef       = useRef(null);
  const somRef                    = useRef(false);
  const timerEventoRef            = useRef(null);
  const emAndamentoRef            = useRef(false);
  const pendenteRef               = useRef(false);
  const [pedidoCentral, setPedidoCentral] = useState(null); // { aba, novo, ts }
  const ativo = contexto === 'admin' || !!estabelecimentoId;

  const carregar = useCallback(async () => {
    if (!ativo) return;
    // Evita duas buscas ao mesmo tempo: se chegar outro pedido no meio,
    // faz uma nova busca quando a atual terminar.
    if (emAndamentoRef.current) { pendenteRef.current = true; return; }
    emAndamentoRef.current = true;
    try {
      const sessao = await inicioSessao();
      const resp = await apiFetch(`/api/notificacoes${sessao ? `?sessao_inicio=${encodeURIComponent(sessao)}` : ''}`);
      const json = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(json?.error || 'Erro ao carregar notificações.');
      setDados(json);
      setErro('');
      somRef.current = !!json?.preferencias?.som;
      const nl = json?.contagem?.nao_lidas ?? 0;
      if (naoLidasAnteriorRef.current !== null && nl > naoLidasAnteriorRef.current && somRef.current) tocarSom();
      naoLidasAnteriorRef.current = nl;
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
      emAndamentoRef.current = false;
      if (pendenteRef.current) { pendenteRef.current = false; setTimeout(() => carregar(), 50); }
    }
  }, [ativo]);

  useEffect(() => { carregar(); }, [carregar]);
  // Desligado (ex.: saiu do SuperAdmin): não guarda avisos de outra conta
  useEffect(() => { if (!ativo) { setDados(null); naoLidasAnteriorRef.current = null; } }, [ativo]);

  // Tempo real (painel do estabelecimento) + reserva lenta
  useAvisosEstabelecimento(contexto === 'estab' ? estabelecimentoId : null, TIPOS_TEMPO_REAL, () => carregar(), { ativo: contexto === 'estab' && !!estabelecimentoId, atraso: 800 });
  useAvisosGlobais(['comunicados'], () => carregar(), { ativo: contexto === 'estab', atraso: 800 });
  usePollingReserva(carregar, contexto === 'admin' ? 2 * 60 * 1000 : 5 * 60 * 1000, ativo);

  // Atualização agendada pro próximo momento em que algo muda sozinho
  useEffect(() => {
    clearTimeout(timerEventoRef.current);
    const quando = dados?.proximo_evento_em ? Date.parse(dados.proximo_evento_em) : null;
    if (!quando) return;
    const espera = Math.max(1000, Math.min(quando - Date.now() + 1500, 6 * 3600 * 1000));
    timerEventoRef.current = setTimeout(() => carregar(), espera);
    return () => clearTimeout(timerEventoRef.current);
  }, [dados?.proximo_evento_em, carregar]);

  /* ── Ações sobre os avisos (otimistas: a tela muda na hora) ── */
  const aplicarLocal = useCallback((chaves, fn) => {
    const set = new Set(chaves);
    setDados(d => {
      if (!d) return d;
      const itens = d.itens.map(i => (set.has(i.chave) ? fn(i) : i));
      const visiveis = itens.filter(i => !i.adiada && !i.dispensada);
      const porCat = {};
      Object.keys(d.contagem?.por_categoria || {}).forEach(k => { porCat[k] = { total: 0, nao_lidas: 0 }; });
      visiveis.forEach(i => {
        const pc = porCat[i.categoria] || (porCat[i.categoria] = { total: 0, nao_lidas: 0 });
        pc.total++; if (!i.lida) pc.nao_lidas++;
      });
      const nl = visiveis.filter(i => !i.lida).length;
      naoLidasAnteriorRef.current = nl;
      return {
        ...d, itens,
        contagem: {
          ...d.contagem,
          total: visiveis.length,
          nao_lidas: nl,
          atrasadas: visiveis.filter(i => i.grupo === 'atrasado').length,
          hoje: visiveis.filter(i => i.grupo === 'hoje').length,
          adiadas: itens.filter(i => i.adiada && !i.dispensada).length,
          dispensadas: itens.filter(i => i.dispensada).length,
          por_categoria: porCat,
        },
      };
    });
  }, []);

  const enviarEstado = useCallback(async (chaves, acao, extra = {}) => {
    if (!chaves?.length) return;
    const agoraIso = new Date().toISOString();
    if (acao === 'lida')      aplicarLocal(chaves, i => ({ ...i, lida: true, lida_em: agoraIso, adiada: false }));
    if (acao === 'nao_lida')  aplicarLocal(chaves, i => ({ ...i, lida: false, lida_em: null }));
    if (acao === 'dispensar') aplicarLocal(chaves, i => ({ ...i, dispensada: true }));
    if (acao === 'restaurar') aplicarLocal(chaves, i => ({ ...i, dispensada: false, adiada: false, adiada_ate: null, lida: false }));
    if (acao === 'adiar')     aplicarLocal(chaves, i => ({ ...i, adiada: true, lida: false, adiada_ate: new Date(Date.now() + (extra.minutos || 60) * 60000).toISOString() }));
    try {
      for (let i = 0; i < chaves.length; i += 500) {
        const resp = await apiFetch('/api/notificacoes/estado', {
          method: 'POST',
          body: JSON.stringify({ chaves: chaves.slice(i, i + 500), acao, ...extra }),
        });
        if (!resp.ok) throw new Error();
      }
      if (acao === 'adiar') carregar(); // pega o novo "próximo evento"
    } catch {
      carregar(); // desfaz o otimista se o servidor recusou
    }
  }, [aplicarLocal, carregar]);

  const salvarPreferencias = useCallback(async (preferencias) => {
    const resp = await apiFetch('/api/notificacoes/preferencias', { method: 'PUT', body: JSON.stringify({ preferencias }) });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.error || 'Erro ao salvar preferências.');
    await carregar();
    return json.preferencias;
  }, [carregar]);

  // Abre o lugar do sistema ligado ao aviso (e marca como lido)
  const abrirAviso = useCallback((item) => {
    if (!item) return;
    if (!item.lida) enviarEstado([item.chave], 'lida');
    if (item.acao && onNavegar) onNavegar(item.acao, item);
  }, [enviarEstado, onNavegar]);

  // Leva pra tela da central já na aba certa ('caixa' | 'lembretes' | 'lembretes-novo' | 'prefs')
  const irParaCentral = useCallback((aba = 'caixa') => {
    const novo = aba === 'lembretes-novo';
    setPedidoCentral({ aba: novo ? 'lembretes' : aba, novo, ts: Date.now() });
    onAbrirCentral?.();
  }, [onAbrirCentral]);

  const valor = useMemo(() => ({
    contexto,
    estabelecimentoId,
    dados,
    itens: dados?.itens || [],
    contagem: dados?.contagem || { total: 0, nao_lidas: 0, atrasadas: 0, hoje: 0, adiadas: 0, dispensadas: 0, por_categoria: {} },
    categorias: dados?.categorias || [],
    preferencias: dados?.preferencias || null,
    carregando,
    erro,
    recarregar: carregar,
    marcarLidas:    (chaves) => enviarEstado(chaves, 'lida'),
    marcarNaoLidas: (chaves) => enviarEstado(chaves, 'nao_lida'),
    adiar:          (chaves, minutos) => enviarEstado(chaves, 'adiar', { minutos }),
    dispensar:      (chaves) => enviarEstado(chaves, 'dispensar'),
    restaurar:      (chaves) => enviarEstado(chaves, 'restaurar'),
    salvarPreferencias,
    abrirAviso,
    onNavegar,
    pedidoCentral,
    irParaCentral,
    limparPedidoCentral: () => setPedidoCentral(null),
  }), [contexto, estabelecimentoId, dados, carregando, erro, carregar, enviarEstado, salvarPreferencias, abrirAviso, onNavegar, pedidoCentral, irParaCentral]);

  return <NotificacoesCtx.Provider value={valor}>{children}</NotificacoesCtx.Provider>;
}

export function useNotificacoes() {
  return useContext(NotificacoesCtx);
}

/* ── Utilidades de exibição ─────────────────────────────────── */
export const ROTULO_GRUPO = {
  atrasado: 'Atrasados',
  hoje: 'Hoje',
  proximo: 'Próximos dias',
  info: 'Outros avisos',
};

export const OPCOES_ADIAR = [
  { minutos: 60, label: '1 hora' },
  { minutos: 180, label: '3 horas' },
  { minutos: 24 * 60, label: 'Amanhã (24h)' },
  { minutos: 3 * 24 * 60, label: '3 dias' },
  { minutos: 7 * 24 * 60, label: '1 semana' },
];

export function tempoRelativo(iso) {
  if (!iso) return '';
  const alvo = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? Date.parse(`${iso}T12:00:00`) : Date.parse(iso);
  if (Number.isNaN(alvo)) return '';
  const diff = alvo - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const h = Math.round(abs / 3600000);
  const d = Math.round(abs / 86400000);
  const txt = min < 1 ? 'agora' : min < 60 ? `${min} min` : h < 24 ? `${h} h` : `${d} dia${d === 1 ? '' : 's'}`;
  if (txt === 'agora') return 'agora';
  return diff < 0 ? `há ${txt}` : `em ${txt}`;
}

export function fmtDataHoraCurta(iso, timezone) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      ...(timezone ? { timeZone: timezone } : {}), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

/* ── Levar o usuário até o item certo (Clientes, Financeiro, Estoque) ──
   O aviso guarda o destino em sessionStorage e dispara um evento; a tela
   de destino consome quando monta (ou na hora, se já estiver aberta). */
const CHAVE_DESTINO = 'ntf-destino';

export function enviarDestino(acao) {
  try { sessionStorage.setItem(CHAVE_DESTINO, JSON.stringify({ ...acao, ts: Date.now() })); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('ntf-destino'));
}

export function useDestinoNotificacao(aba, aoChegar) {
  const fnRef = useRef(aoChegar);
  fnRef.current = aoChegar;
  useEffect(() => {
    function consumir() {
      let d = null;
      try { d = JSON.parse(sessionStorage.getItem(CHAVE_DESTINO) || 'null'); } catch { d = null; }
      if (!d || d.aba !== aba || Date.now() - (d.ts || 0) > 60000) return;
      try { sessionStorage.removeItem(CHAVE_DESTINO); } catch { /* ignore */ }
      fnRef.current?.(d);
    }
    consumir();
    window.addEventListener('ntf-destino', consumir);
    return () => window.removeEventListener('ntf-destino', consumir);
  }, [aba]);
}
