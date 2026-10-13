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

const chave = (estId) => `variacao-modelos-${estId}`;

export function carregarModelosProprios(estId) {
  try {
    const arr = JSON.parse(localStorage.getItem(chave(estId)) || '[]');
    return Array.isArray(arr) ? arr.filter(m => m && m.id && m.nome && Array.isArray(m.tamanhos)) : [];
  } catch { return []; }
}

export function salvarModelosProprios(estId, lista) {
  try { localStorage.setItem(chave(estId), JSON.stringify(lista)); } catch { /* sem armazenamento: segue sem salvar */ }
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

export function todosModelos(estId) {
  return [...MODELOS_PRONTOS, ...carregarModelosProprios(estId).map(m => ({ ...m, icone: m.icone || '🏷️', proprio: true }))];
}
