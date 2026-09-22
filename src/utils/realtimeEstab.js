// src/utils/realtimeEstab.js
// ============================================================
// Atualização em tempo real (Supabase Realtime — Broadcast), 22/09/2026
//
// Como funciona: gatilhos no banco mandam um aviso curto sempre que algo
// muda — { tipo: 'produtos', ids: [...] } — num canal privado:
//   estab:<mercearia_id>  → só quem é daquele estabelecimento consegue ouvir
//   global                → comunicados / config de notificação de cobrança
// O aviso NÃO traz dados: a tela só chama de novo a mesma rota do backend
// que ela já usa. Regras de negócio, permissões e filtros continuam todos
// no backend, como sempre.
//
// Tipos de aviso: produtos, categorias, clientes, vendas, financeiro,
// solicitacoes, comunicados, licenca, cobranca_notif — e '*' (conexão
// voltou depois de cair, ou a aba voltou a ficar visível: pode ter
// perdido algum aviso nesse meio-tempo, então toda tela recarrega).
//
// Um canal por tópico, compartilhado entre todas as telas abertas (não
// abre uma conexão nova por componente) e fechado sozinho quando a última
// tela que usava sai.
// ============================================================

import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

const canais = new Map(); // topic -> { channel, ouvintes:Set, jaConectou }

function emitir(entrada, payload) {
  entrada.ouvintes.forEach(fn => {
    try { fn(payload || {}); } catch (e) { console.error('[realtime] ouvinte falhou:', e); }
  });
}

function abrirCanal(topic) {
  const entrada = { channel: null, ouvintes: new Set(), jaConectou: false, fechado: false };
  canais.set(topic, entrada);

  (async () => {
    // Canal privado precisa do token do usuário logado — o supabase-js
    // já troca o token sozinho quando ele é renovado (refresh).
    try { await supabase.realtime.setAuth(); } catch { /* segue sem travar */ }
    if (entrada.fechado) return;

    entrada.channel = supabase
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'mudanca' }, (msg) => emitir(entrada, msg?.payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Reconexão: pode ter perdido avisos enquanto estava fora do ar.
          if (entrada.jaConectou) emitir(entrada, { tipo: '*' });
          entrada.jaConectou = true;
        }
      });
  })();

  return entrada;
}

/**
 * Assina os avisos de um tópico. Retorna a função pra cancelar.
 * Uso direto (fora de componente React). Nas telas, prefira os hooks abaixo.
 */
export function assinarTopico(topic, ouvinte) {
  if (!topic) return () => {};
  const entrada = canais.get(topic) || abrirCanal(topic);
  entrada.ouvintes.add(ouvinte);

  return () => {
    entrada.ouvintes.delete(ouvinte);
    if (entrada.ouvintes.size === 0) {
      entrada.fechado = true;
      canais.delete(topic);
      if (entrada.channel) supabase.removeChannel(entrada.channel);
    }
  };
}

/**
 * Hook base: chama `aoMudar(resumo)` quando chegar aviso de um dos `tipos`.
 * - Agrupa avisos seguidos (debounce) — uma venda com 10 itens vira UMA
 *   recarga, não dez.
 * - `resumo` = { tipos:Set, ids:Set|null } — ids null quando algum aviso
 *   não trouxe a lista (recarregar tudo).
 * - Também dispara com tipo '*' quando a aba volta a ficar visível
 *   (navegador pode ter pausado a conexão enquanto estava em segundo plano).
 */
export function useAvisosTempoReal(topic, tipos, aoMudar, { atraso = 350, ativo = true } = {}) {
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const tiposChave = (tipos || []).join(',');

  useEffect(() => {
    if (!topic || !ativo) return;
    const aceitos = new Set(tiposChave.split(',').filter(Boolean));
    let timer = null;
    let pendente = null;

    function acumular(payload) {
      const tipo = payload?.tipo;
      if (tipo !== '*' && !aceitos.has(tipo)) return;
      if (!pendente) pendente = { tipos: new Set(), ids: new Set() };
      pendente.tipos.add(tipo);
      if (tipo === '*' || !Array.isArray(payload.ids)) pendente.ids = null;
      else if (pendente.ids) payload.ids.forEach(id => pendente.ids.add(id));

      clearTimeout(timer);
      timer = setTimeout(() => {
        const resumo = pendente;
        pendente = null;
        try { aoMudarRef.current?.(resumo); } catch (e) { console.error('[realtime] aoMudar falhou:', e); }
      }, atraso);
    }

    const cancelar = assinarTopico(topic, acumular);

    function aoVoltarAba() {
      if (document.visibilityState === 'visible') acumular({ tipo: '*' });
    }
    document.addEventListener('visibilitychange', aoVoltarAba);

    return () => {
      clearTimeout(timer);
      cancelar();
      document.removeEventListener('visibilitychange', aoVoltarAba);
    };
  }, [topic, tiposChave, atraso, ativo]);
}

/** Avisos do próprio estabelecimento (estoque, clientes, financeiro...). */
export function useAvisosEstabelecimento(estabelecimentoId, tipos, aoMudar, opcoes) {
  useAvisosTempoReal(estabelecimentoId ? `estab:${estabelecimentoId}` : null, tipos, aoMudar, opcoes);
}

/** Avisos globais (comunicados, config de notificação de cobrança). */
export function useAvisosGlobais(tipos, aoMudar, opcoes) {
  useAvisosTempoReal('global', tipos, aoMudar, opcoes);
}

/**
 * Polling de reserva — mais lento que o antigo, só pra cobrir o caso raro
 * de o tempo real estar fora do ar sem a gente perceber. Não roda com a
 * aba em segundo plano (quando a aba volta, os hooks acima já recarregam).
 */
export function usePollingReserva(fn, intervaloMs, ativo = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!ativo || !intervaloMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fnRef.current?.();
    }, intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs, ativo]);
}
