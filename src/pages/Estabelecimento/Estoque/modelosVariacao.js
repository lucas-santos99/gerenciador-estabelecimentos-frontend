// Modelos de tamanho por tipo de produto + cores básicas (sugestões prontas).
// Os modelos prontos vêm no código; os que o comerciante cria ("Boné",
// "Cinto"…) ficam salvos neste navegador, por estabelecimento.

export const MODELOS_PRONTOS = [
  { id: 'roupas',      icone: '👕', nome: 'Roupas',            tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'] },
  { id: 'calcados',    icone: '👟', nome: 'Calçados',          tamanhos: ['34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'] },
  { id: 'calcas',      icone: '👖', nome: 'Calças / jeans',    tamanhos: ['36', '38', '40', '42', '44', '46', '48', '50', '52'] },
  { id: 'inf-roupas',  icone: '🧒', nome: 'Roupa infantil',    tamanhos: ['RN', 'P', 'M', 'G', '1', '2', '3', '4', '6', '8', '10', '12', '14'] },
  { id: 'inf-calcados',icone: '👶', nome: 'Calçado infantil',  tamanhos: ['16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'] },
  { id: 'unico',       icone: '🎒', nome: 'Acessórios',        tamanhos: ['Único', 'P', 'M', 'G'] },
];

export const CORES_BASICAS = ['Preto', 'Branco', 'Cinza', 'Azul', 'Azul marinho', 'Vermelho', 'Verde', 'Amarelo', 'Rosa', 'Roxo', 'Laranja', 'Marrom', 'Bege', 'Vinho', 'Off-white'];

export const GENEROS_BASICOS = ['Masculino', 'Feminino', 'Unissex', 'Infantil'];

import { apiFetch } from '../../../utils/api';

const chaveAntiga = (estId) => `variacao-modelos-${estId}`;
const base = (estId) => `/api/estabelecimentos/${estId}/modelos-variacao`;

// Tipos criados pelo comerciante, guardados na conta da loja (valem em qualquer
// computador). Se houver tipos da versão antiga (salvos só neste navegador),
// eles são enviados para a conta uma única vez e apagados daqui.
export async function buscarModelosProprios(estId) {
  let lista = [];
  try {
    const r = await apiFetch(base(estId));
    if (r.ok) lista = await r.json();
  } catch { return []; }
  try {
    const bruto = localStorage.getItem(chaveAntiga(estId));
    if (bruto) {
      const antigos = JSON.parse(bruto);
      let tudoCerto = true;
      if (Array.isArray(antigos)) {
        for (const m of antigos) {
          if (!m?.nome || !Array.isArray(m.tamanhos) || lista.some(x => x.nome.toLowerCase() === String(m.nome).toLowerCase())) continue;
          const r = await apiFetch(base(estId), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: m.nome, tamanhos: m.tamanhos }),
          });
          if (r.ok) lista.push(await r.json()); else if (r.status !== 409) tudoCerto = false;
        }
      }
      if (tudoCerto) localStorage.removeItem(chaveAntiga(estId));
    }
  } catch { /* migração é opcional */ }
  return lista;
}

export async function criarModeloProprio(estId, nome, tamanhos) {
  const r = await apiFetch(base(estId), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, tamanhos }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erro ao salvar o tipo de produto.');
  return d;
}

export async function excluirModeloProprio(estId, id) {
  const r = await apiFetch(`${base(estId)}/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error('Erro ao excluir o tipo de produto.');
}

// "P, M; G" -> ['P','M','G'] (sem repetir, até 60 itens, 50 caracteres cada)
export function separarValores(texto, max = 60) {
  const vistos = new Set();
  const out = [];
  for (const parte of String(texto || '').split(/[,;\n]/)) {
    const v = parte.trim().slice(0, 50);
    if (!v || vistos.has(v.toLowerCase())) continue;
    vistos.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// Junta os tipos prontos (com os tamanhos extras que a loja acrescentou) e os tipos próprios.
export function todosModelos(rows = []) {
  const extrasPorBase = {};
  rows.filter(m => m.modelo_base).forEach(m => { extrasPorBase[m.modelo_base] = m.tamanhos || []; });
  const prontos = MODELOS_PRONTOS.map(m => {
    const extras = (extrasPorBase[m.id] || []).filter(t => !m.tamanhos.some(x => x.toLowerCase() === String(t).toLowerCase()));
    return { ...m, extras, tamanhos: [...m.tamanhos, ...extras] };
  });
  return [...prontos, ...rows.filter(m => !m.modelo_base).map(m => ({ ...m, icone: '🏷️', proprio: true }))];
}

// Salva os tamanhos extras de um tipo pronto (lista vazia = remove).
export async function salvarExtrasModelo(estId, baseId, nome, tamanhos) {
  const r = await apiFetch(`${base(estId)}/base/${baseId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, tamanhos }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erro ao salvar o tamanho no tipo.');
  return d;
}

// Troca os tamanhos de um tipo criado pela loja.
export async function atualizarModeloProprio(estId, id, tamanhos) {
  const r = await apiFetch(`${base(estId)}/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tamanhos }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erro ao salvar os tamanhos do tipo.');
  return d;
}
