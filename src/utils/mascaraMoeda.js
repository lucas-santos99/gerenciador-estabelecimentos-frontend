// Máscara de dinheiro "andando a vírgula" enquanto digita: 1 → 0,01 · 12 → 0,12 · 1234 → 12,34.
// Mesmo comportamento já usado no Produto, Cliente e PDV. Devolve '' se não houver dígitos.
export function digitarValorMascarado(valorBruto, casasDecimais = 2) {
  const digitos = String(valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / Math.pow(10, casasDecimais);
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais });
}

// "1.234,56" → 1234.56 (NaN se vazio/ inválido)
export function valorBRparaNumero(texto) {
  const t = String(texto || '').trim().replace(/[R$\s]/g, '');
  return parseFloat(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

// Digitação livre de decimal (peso/quantidade em kg): o que a pessoa digita é o que vale.
// "1" → "1" · "1,5" → "1,5" · "1.350" → "1,350" (ponto vira vírgula) · "999" → "999".
// Aceita uma vírgula só e no máximo `casas` casas depois dela; sem zero à esquerda sobrando.
export function digitarDecimalLivre(valorBruto, casas = 3, maxInteiros = 6) {
  let t = String(valorBruto || '').replace(/[^\d.,]/g, '').replace(/\./g, ',');
  const i = t.indexOf(',');
  let inteiro = i === -1 ? t : t.slice(0, i);
  let dec = i === -1 ? null : t.slice(i + 1).replace(/,/g, '').slice(0, casas);
  inteiro = inteiro.replace(/^0+(?=\d)/, '').slice(0, maxInteiros);
  if (dec === null) return inteiro;
  return (inteiro || '0') + ',' + dec;
}
