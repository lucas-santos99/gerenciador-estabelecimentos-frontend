// Telefone e e-mail: máscara, conferência e mensagem de erro.
// Mesma regra usada no servidor (be/utils/contato.js).

export function soDigitosTel(v) {
  return String(v || '').replace(/\D/g, '');
}

// Aceita colar com +55 / 55 na frente: tira o código do país antes de formatar.
function semPais(d) {
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}

// "5399194732" -> "(53) 9919-4732" ; "53991947320" -> "(53) 99194-7320"
export function mascararTelefone(v) {
  const d = semPais(soDigitosTel(v)).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Fixo: DDD + 8 dígitos (começa em 2–5). Celular: DDD + 9 + 8 dígitos.
export function telefoneValido(v) {
  const d = semPais(soDigitosTel(v));
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || String(ddd).includes('0')) return false;
  if (/^(\d)\1+$/.test(d.slice(2))) return false; // 00000000, 99999999…
  if (d.length === 11) return d[2] === '9';
  return /[2-5]/.test(d[2]);
}

// Devolve '' quando está ok (ou vazio e opcional); senão o texto do erro.
export function erroTelefone(v, rotulo = 'Telefone', obrigatorio = false) {
  const d = soDigitosTel(v);
  if (!d) return obrigatorio ? `${rotulo}: informe o número com DDD.` : '';
  return telefoneValido(v) ? '' : `${rotulo} inválido. Use DDD + número, ex.: (53) 99194-7320.`;
}

export function emailValido(v) {
  const e = String(v || '').trim();
  if (e.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);
}

export function erroEmail(v, rotulo = 'E-mail', obrigatorio = false) {
  const e = String(v || '').trim();
  if (!e) return obrigatorio ? `${rotulo}: informe um e-mail.` : '';
  return emailValido(e) ? '' : `${rotulo} inválido. Use o formato nome@dominio.com.`;
}
