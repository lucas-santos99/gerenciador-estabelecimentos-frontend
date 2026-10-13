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
  { id: 'volume',      icone: '🥤', nome: 'Bebidas / volume',  tamanhos: ['250 ml', '350 ml', '500 ml', '600 ml', '1 L', '1,5 L', '2 L'] },
  { id: 'peso',        icone: '⚖️', nome: 'Peso / embalagem',  tamanhos: ['250 g', '500 g', '1 kg', '2 kg', '5 kg', '10 kg', '25 kg'] },
  { id: 'porcao',      icone: '🍽️', nome: 'Porções',           tamanhos: ['Pequena', 'Média', 'Grande', 'Família'] },
  { id: 'medidas',     icone: '🔩', nome: 'Medidas (ferragem)', tamanhos: ['1/4"', '3/8"', '1/2"', '3/4"', '1"', '2"'] },
];

// Quais tipos aparecem por padrão em cada tipo de estabelecimento. A loja pode tirar
// qualquer um e adicionar outros (ver `visivel` em modelos_variacao).
const PADRAO_POR_TIPO = {
  loja:         ['roupas', 'calcados', 'calcas', 'inf-roupas', 'inf-calcados', 'unico'],
  mercearia:    [],
  padaria:      [],
  ferragem:     ['medidas'],
  agropecuaria: ['peso'],
  restaurante:  ['porcao'],
  outro:        [],
};
const normalizarTipo = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Tipo desconhecido (ou ainda não informado): mostra os de loja, como era antes.
const padraoDoTipo = (tipoEst) => PADRAO_POR_TIPO[normalizarTipo(tipoEst)] ?? (tipoEst ? [] : MODELOS_PRONTOS.map(m => m.id));

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
  let tipo = null;
  try {
    const r = await apiFetch(`${base(estId)}?completo=1`);
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d)) lista = d; else { lista = d.modelos || []; tipo = d.tipo_estabelecimento || null; }
    }
  } catch { return { rows: [], tipo: null }; }
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
  return { rows: lista, tipo };
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

// Os tipos que esta loja vê: prontos (padrão do tipo de estabelecimento + os que a loja adicionou,
// menos os que tirou, com os tamanhos extras) e os tipos próprios.
export function todosModelos(rows = [], tipoEst = null) {
  const porBase = {};
  rows.filter(m => m.modelo_base).forEach(m => { porBase[m.modelo_base] = m; });
  const padrao = padraoDoTipo(tipoEst);
  const montar = (m) => {
    const extras = ((porBase[m.id]?.tamanhos) || []).filter(t => !m.tamanhos.some(x => x.toLowerCase() === String(t).toLowerCase()));
    return { ...m, extras, tamanhos: [...m.tamanhos, ...extras] };
  };
  const visivel = (m) => { const v = porBase[m.id]?.visivel; return v === true || (v !== false && padrao.includes(m.id)); };
  return [...MODELOS_PRONTOS.filter(visivel).map(montar), ...rows.filter(m => !m.modelo_base).map(m => ({ ...m, icone: '🏷️', proprio: true }))];
}

// Tipos prontos que a loja não está vendo agora (para o "＋ Adicionar tipo").
export function modelosDisponiveis(rows = [], tipoEst = null) {
  const visiveis = new Set(todosModelos(rows, tipoEst).map(m => m.id));
  return MODELOS_PRONTOS.filter(m => !visiveis.has(m.id));
}

// Mostra (true) ou esconde (false) um tipo pronto nesta loja.
export async function definirVisibilidadeModelo(estId, baseId, nome, visivel) {
  const r = await apiFetch(`${base(estId)}/base/${baseId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, visivel }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erro ao salvar o tipo.');
  return d;
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
