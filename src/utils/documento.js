// Conferência do dígito verificador de CPF e CNPJ.
// É só uma conferência opcional (botão "Validar" nas telas do SuperAdmin):
// salvar nunca depende dela, para poder cadastrar dados de teste.

function soDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

export function cpfValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const tam of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * (tam + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[tam])) return false;
  }
  return true;
}

export function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  for (const tam of [12, 13]) {
    const pesos = tam === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[tam])) return false;
  }
  return true;
}

// tipo: 'cpf' | 'cnpj'. Devolve { ok, mensagem }.
export function verificarDocumento(valor, tipo) {
  const d = soDigitos(valor);
  const rotulo = tipo === 'cnpj' ? 'CNPJ' : 'CPF';
  const esperado = tipo === 'cnpj' ? 14 : 11;
  if (d.length === 0) return { ok: false, mensagem: `Digite o ${rotulo} para conferir.` };
  if (d.length !== esperado) return { ok: false, mensagem: `${rotulo} incompleto: faltam ${esperado - d.length} dígitos.` };
  const ok = tipo === 'cnpj' ? cnpjValido(d) : cpfValido(d);
  return ok
    ? { ok: true, mensagem: `${rotulo} válido.` }
    : { ok: false, mensagem: `Os dígitos verificadores do ${rotulo} não conferem. Pode salvar mesmo assim (ex.: cadastro de teste).` };
}
