// src/utils/planilha.js
// ============================================================
// PLANILHAS EXCEL (13/10/2026) — troca da biblioteca `xlsx` (SheetJS, com falhas
// de segurança conhecidas e sem correção no npm) e da `xlsx-js-style` por `exceljs`.
//
// Duas partes:
//  1) MODELO: monta a planilha como objetos simples, no mesmo formato que as telas já
//     usavam (células { t, v, f, z, s }, '!cols', '!rows', '!merges', '!autofilter').
//     É só um subconjunto do que o SheetJS oferecia: utils.json_to_sheet, aoa_to_sheet,
//     sheet_add_aoa, book_new, book_append_sheet e os conversores de endereço de célula.
//     Assim as telas continuam montando a planilha do mesmo jeito (só muda o import).
//  2) GRAVAÇÃO: converte o modelo em .xlsx com o exceljs (carregado só na hora de
//     exportar, para não pesar o início do sistema) e baixa o arquivo.
//
// Só GERA arquivos. Não existe leitura de planilha aqui (é a leitura de arquivo de
// terceiros que tornava a biblioteca antiga perigosa).
// ============================================================

/* ══════════════ 1) MODELO ══════════════ */

export function encode_col(c) {
  let s = '';
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function decode_col(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function encode_cell({ r, c }) { return `${encode_col(c)}${r + 1}`; }
export function decode_cell(ref) {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(String(ref));
  if (!m) throw new Error(`Endereço de célula inválido: ${ref}`);
  return { c: decode_col(m[1].toUpperCase()), r: parseInt(m[2], 10) - 1 };
}
export function encode_range(r) { return `${encode_cell(r.s)}:${encode_cell(r.e)}`; }
export function decode_range(ref) {
  const [a, b] = String(ref).split(':');
  const s = decode_cell(a);
  return { s, e: b ? decode_cell(b) : { ...s } };
}

// valor simples → célula; objeto com `t` (ou `f`/`z`/`s`) já é uma célula e vai como está
function criarCelula(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'object' && !(valor instanceof Date)) return { ...valor };
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : { t: 'd', v: valor };
  if (typeof valor === 'number') return Number.isFinite(valor) ? { t: 'n', v: valor } : null;
  if (typeof valor === 'boolean') return { t: 'b', v: valor };
  return { t: 's', v: String(valor) };
}

function atualizarRef(ws, r, c) {
  const atual = ws['!ref'] ? decode_range(ws['!ref']) : { s: { r, c }, e: { r, c } };
  atual.s.r = Math.min(atual.s.r, r); atual.s.c = Math.min(atual.s.c, c);
  atual.e.r = Math.max(atual.e.r, r); atual.e.c = Math.max(atual.e.c, c);
  ws['!ref'] = encode_range(atual);
}

export function sheet_add_aoa(ws, aoa, { origin } = {}) {
  let r0 = 0, c0 = 0;
  if (typeof origin === 'number') r0 = origin;
  else if (typeof origin === 'string') { const o = decode_cell(origin); r0 = o.r; c0 = o.c; }
  else if (origin && typeof origin === 'object') { r0 = origin.r; c0 = origin.c; }
  (aoa || []).forEach((linha, i) => {
    (linha || []).forEach((valor, j) => {
      const cel = criarCelula(valor);
      if (!cel) return;
      ws[encode_cell({ r: r0 + i, c: c0 + j })] = cel;
      atualizarRef(ws, r0 + i, c0 + j);
    });
  });
  return ws;
}

export function aoa_to_sheet(aoa) { return sheet_add_aoa({}, aoa); }

// Linhas = objetos; cabeçalho = chaves na ordem em que aparecem (como o SheetJS fazia)
export function json_to_sheet(linhas) {
  const cabecalho = [];
  (linhas || []).forEach(l => Object.keys(l || {}).forEach(k => { if (!cabecalho.includes(k)) cabecalho.push(k); }));
  const aoa = [cabecalho, ...(linhas || []).map(l => cabecalho.map(k => l?.[k]))];
  const ws = sheet_add_aoa({}, aoa);
  if (!ws['!ref']) ws['!ref'] = 'A1';
  return ws;
}

export function book_new() { return { SheetNames: [], Sheets: {} }; }

const NOME_ABA_INVALIDO = /[\\/?*[\]:]/g;
export function book_append_sheet(wb, ws, nome) {
  let n = String(nome || `Planilha${wb.SheetNames.length + 1}`).replace(NOME_ABA_INVALIDO, '-').slice(0, 31);
  let i = 2;
  while (wb.SheetNames.includes(n)) n = `${n.slice(0, 28)} ${i++}`;
  wb.SheetNames.push(n);
  wb.Sheets[n] = ws;
}

export const utils = {
  encode_col, encode_cell, decode_cell, encode_range, decode_range,
  sheet_add_aoa, aoa_to_sheet, json_to_sheet, book_new, book_append_sheet,
};

/* ══════════════ 2) GRAVAÇÃO (exceljs) ══════════════ */

const argb = (rgb) => {
  const c = String(rgb || '000000').replace('#', '').toUpperCase();
  return c.length === 8 ? c : `FF${c.padStart(6, '0').slice(-6)}`;
};

function estiloExcelJS(s, z) {
  const out = {};
  if (s?.font) {
    const f = s.font;
    out.font = { name: 'Calibri', size: 11 }; // sem nome o Excel/LibreOffice escolhem outra fonte
    if (f.bold) out.font.bold = true;
    if (f.italic) out.font.italic = true;
    if (f.underline) out.font.underline = true;
    if (f.sz) out.font.size = f.sz;
    if (f.name) out.font.name = f.name;
    if (f.color?.rgb) out.font.color = { argb: argb(f.color.rgb) };
  }
  if (s?.fill?.fgColor?.rgb && (s.fill.patternType || 'solid') === 'solid') {
    out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(s.fill.fgColor.rgb) } };
  }
  if (s?.alignment) {
    const a = s.alignment;
    out.alignment = {};
    if (a.horizontal) out.alignment.horizontal = a.horizontal;
    if (a.vertical) out.alignment.vertical = a.vertical === 'center' ? 'middle' : a.vertical; // no exceljs o meio é 'middle'
    if (a.wrapText) out.alignment.wrapText = true;
  }
  if (s?.border) {
    out.border = {};
    ['top', 'bottom', 'left', 'right'].forEach(lado => {
      const b = s.border[lado];
      if (b?.style) out.border[lado] = { style: b.style, ...(b.color?.rgb ? { color: { argb: argb(b.color.rgb) } } : {}) };
    });
  }
  const fmt = z || s?.numFmt;
  if (fmt) out.numFmt = fmt;
  return out;
}

/** Converte o modelo em um Workbook do exceljs. */
export async function montarWorkbookExcelJS(wb) {
  const { default: ExcelJS } = await import('exceljs');
  const saida = new ExcelJS.Workbook();
  saida.creator = 'Gerenciador de Estabelecimentos';
  saida.created = new Date();

  (wb.SheetNames || []).forEach(nome => {
    const ws = wb.Sheets[nome];
    if (!ws) return;
    const aba = saida.addWorksheet(nome);

    Object.keys(ws).forEach(ref => {
      if (ref[0] === '!') return;
      const cel = ws[ref];
      if (!cel) return;
      const { r, c } = decode_cell(ref);
      const alvo = aba.getCell(r + 1, c + 1);
      if (cel.f) alvo.value = { formula: String(cel.f).replace(/^=/, ''), result: cel.v };
      else if (cel.v !== undefined && cel.v !== null) alvo.value = cel.v;
      const estilo = estiloExcelJS(cel.s, cel.z);
      if (estilo.font) alvo.font = estilo.font;
      if (estilo.fill) alvo.fill = estilo.fill;
      if (estilo.alignment) alvo.alignment = estilo.alignment;
      if (estilo.border) alvo.border = estilo.border;
      if (estilo.numFmt) alvo.numFmt = estilo.numFmt;
    });

    (ws['!cols'] || []).forEach((col, i) => {
      if (!col) return;
      if (col.wch) aba.getColumn(i + 1).width = col.wch + 0.83; // mesmo respiro que o SheetJS dava
      else if (col.wpx) aba.getColumn(i + 1).width = Math.max(1, (col.wpx - 5) / 7);
    });
    (ws['!rows'] || []).forEach((linha, i) => {
      if (linha?.hpt) aba.getRow(i + 1).height = linha.hpt;
    });
    (ws['!merges'] || []).forEach(m => aba.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1));
    if (ws['!autofilter']?.ref) aba.autoFilter = ws['!autofilter'].ref;
  });
  return saida;
}

/** Bytes do .xlsx (usado também nos testes). */
export async function gerarXlsx(wb) {
  const saida = await montarWorkbookExcelJS(wb);
  return saida.xlsx.writeBuffer();
}

/** Gera e baixa o arquivo. */
export async function salvarXlsx(wb, nomeArquivo) {
  const buffer = await gerarXlsx(wb);
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
