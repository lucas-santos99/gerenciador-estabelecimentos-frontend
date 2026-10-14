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
