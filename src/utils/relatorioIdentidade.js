// src/utils/relatorioIdentidade.js
// ============================================================
// IDENTIDADE DOS RELATÓRIOS (23/09/2026)
//
// Um molde só pra cabeçalho e rodapé de TODOS os relatórios do sistema:
//   - PDFs gerados com jsPDF          → novoPdfRelatorio()
//   - páginas de impressão (window.open + print) → htmlIdentidade()
//   - planilhas Excel                  → salvarExcelIdentidade()
//   - recibo térmico do PDV            → identidadeRecibo()
//
// Quem edita: SuperAdmin, na tela "Identidade dos Relatórios"
// (/admin/identidade-relatorios). Fica salvo no backend em
// GET/PUT /superadmin/identidade-relatorios.
//
// Estrutura da configuração (igual à do backend):
//   { versao: 1, padrao: {...}, por_tipo: { <tipo>: {...} } }
// Resolução de cada relatório: IDENTIDADE_PADRAO → padrao → por_tipo[tipo].
// A tela edita os dois: aba "Padrão geral" (opção 1) e aba "Por tipo de
// relatório" (opção 2 — só os campos que mudam naquele tipo).
//
// Por que tem cache: a janela de impressão precisa ser aberta NA HORA do
// clique (senão o navegador bloqueia como pop-up), então não dá pra
// esperar a configuração e as logos chegarem nesse momento. O painel
// pré-carrega tudo ao abrir (prepararIdentidade) e as logos ficam em
// memória já convertidas pra imagem embutida (data URL).
// ============================================================

import jsPDF from 'jspdf';
import * as XLSXS from 'xlsx-js-style';
import { apiFetch } from './api';

/* ── Valores de fábrica ─────────────────────────────────────── */
export const IDENTIDADE_PADRAO = Object.freeze({
  cabecalho_modo:           'loja_e_marca', // 'loja' | 'loja_e_marca'
  nome_sistema:             'Gerenciador de Estabelecimentos',
  marca_nome:               'Lucas J. Systems',
  marca_logo_url:           '',
  sistema_logo_url:         '',
  marca_exibicao:           'logo',   // 'logo' | 'nome' | 'logo_e_nome'
  sistema_exibicao:         'logo',   // 'logo' | 'nome' | 'logo_e_nome'
  escala_cabecalho:         100,      // % (70–160)
  escala_rodape:            100,      // % (70–160)
  alinhamento_cabecalho:    'lados',  // 'lados' (loja à esquerda, título à direita) | 'centro'
  alinhamento_rodape:       'lados',  // 'lados' (marca à esquerda, página à direita) | 'centro'
  cor_faixa:                '#0f172a',
  cor_texto_faixa:          '#e6f7f1',
  cor_destaque:             '#0f766e',
  mostrar_logo_loja:        true,
  mostrar_cnpj:             true,
  mostrar_endereco:         true,
  mostrar_telefone:         true,
  mostrar_email:            false,
  rodape_gerado_por:        'Gerado por {sistema} · {marca}',
  site:                     '',
  instagram:                '',
  whatsapp:                 '',
  email:                    '',
  rodape_texto_livre:       '',
  mostrar_contatos_rodape:  true,
  mostrar_data_geracao:     true,
  mostrar_paginacao:        true,
  recibo_mostrar_logo_loja: true,
  recibo_mostrar_dados_loja: true,
  recibo_mensagem:          'Obrigado!',
  recibo_rodape:            '{marca}',
});

/* Catálogo dos tipos de relatório — ÚNICO lugar onde a lista existe
   (o backend só confere o formato do nome). Relatório novo: usar o molde
   (novoPdfRelatorio / htmlIdentidade / salvarExcelIdentidade) com um
   `tipo` e cadastrar esse tipo aqui — ele aparece sozinho na aba "Por
   tipo de relatório" da tela do SuperAdmin. Nome do tipo: minúsculas,
   números e "_", começando por letra, até 40 caracteres. Não renomear
   um tipo existente (a personalização salva com o nome antigo se perde). */
export const TIPOS_RELATORIO = Object.freeze([
  { tipo: 'financeiro_dre',           label: 'Financeiro — DRE' },
  { tipo: 'financeiro_resumo_dia',    label: 'Financeiro — Resumo do dia' },
  { tipo: 'financeiro_operador',      label: 'Financeiro — Vendas por operador' },
  { tipo: 'financeiro_produtos',      label: 'Financeiro — Relatório de produtos' },
  { tipo: 'financeiro_estoque',       label: 'Financeiro — Estoque' },
  { tipo: 'vendas_historico',         label: 'Relatórios — Histórico de vendas' },
  { tipo: 'vendas_produtos',          label: 'Relatórios — Produtos vendidos' },
  { tipo: 'vendas_operador',          label: 'Relatórios — Vendas por operador' },
  { tipo: 'estoque',                  label: 'Estoque' },
  { tipo: 'clientes',                 label: 'Clientes / Fiado' },
  { tipo: 'clientes_compras',         label: 'Clientes — Histórico de compras' },
  { tipo: 'fornecedores',             label: 'Fornecedores' },
  { tipo: 'inventario',               label: 'Inventário — Contagem' },
  { tipo: 'inventario_movimentacoes', label: 'Inventário — Movimentações' },
  { tipo: 'auditoria',                label: 'Auditoria (SuperAdmin)' },
  { tipo: 'recibo',                   label: 'Recibo do PDV' },
]);

/* ── Estado em memória ──────────────────────────────────────── */
const VALIDADE_CONFIG_MS = 60 * 1000;
const estado = {
  config: null,          // { versao, padrao, por_tipo }
  carregadoEm: 0,
  promessa: null,
  loja: null,            // { nome, logo_url, cnpj, telefone, email, endereco }
  logos: new Map(),      // url -> { dataUrl, w, h } | 'erro'
  logosPendentes: new Map(), // url -> Promise
};

/* ── Utilidades ─────────────────────────────────────────────── */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function corValida(c, reserva) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : reserva;
}

function hexParaRgb(hex) {
  const h = corValida(hex, '#000000').slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const EXIBICOES = ['logo', 'nome', 'logo_e_nome'];
const ALINHAMENTOS = ['lados', 'centro'];
export const ESCALA_MIN = 70;
export const ESCALA_MAX = 160;

function escalaValida(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 100;
  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, n));
}

/** O que mostrar da marca/sistema: { logo: bool, nome: bool } conforme a
 *  opção escolhida e o que existe. Sem logo carregada, cai pro nome. */
function oQueMostrar(exibicao, temLogo, temNome) {
  const logo = temLogo && exibicao !== 'nome';
  const nome = temNome && (exibicao !== 'logo' || !temLogo);
  return { logo, nome };
}

function urlImagemSegura(u) {
  return typeof u === 'string' && /^(https:\/\/|data:image\/)[^\s"'<>]*$/.test(u) ? u : '';
}

function aplicarMarcadores(texto, id) {
  return String(texto || '')
    .replace(/\{sistema\}/g, id.nome_sistema || '')
    .replace(/\{marca\}/g, id.marca_nome || '')
    .replace(/\s*·\s*$/, '').replace(/^\s*·\s*/, '')
    .trim();
}

function agoraFormatado() {
  return new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function instagramFormatado(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  return s.startsWith('@') ? s : `@${s}`;
}

/** Contatos do rodapé numa linha só: site · @insta · WhatsApp · e-mail */
function linhaContatos(id) {
  if (!id.mostrar_contatos_rodape) return '';
  const partes = [];
  if (id.site)      partes.push(String(id.site).replace(/^https?:\/\//i, '').replace(/\/$/, ''));
  if (id.instagram) partes.push(instagramFormatado(id.instagram));
  if (id.whatsapp)  partes.push(`WhatsApp ${id.whatsapp}`);
  if (id.email)     partes.push(id.email);
  return partes.join('  ·  ');
}

/** Linhas de dados da loja (CNPJ, telefone, e-mail, endereço) conforme os "mostrar_*". */
function linhasDadosLoja(loja, id) {
  if (!loja) return [];
  const linha1 = [];
  if (id.mostrar_cnpj && loja.cnpj)         linha1.push(`CNPJ ${loja.cnpj}`);
  if (id.mostrar_telefone && loja.telefone) linha1.push(`Tel. ${loja.telefone}`);
  if (id.mostrar_email && loja.email)       linha1.push(loja.email);
  const linhas = [];
  if (linha1.length) linhas.push(linha1.join('  ·  '));
  if (id.mostrar_endereco && loja.endereco) linhas.push(loja.endereco);
  return linhas;
}

/* ── Configuração ───────────────────────────────────────────── */

/**
 * Busca a configuração no backend (com cache de 60s). Nunca lança erro:
 * se o backend não responder, segue com o que tiver (ou com os valores
 * de fábrica) — relatório nenhum deixa de sair por causa disso.
 */
export async function carregarIdentidade({ forcar = false } = {}) {
  const fresca = estado.config && Date.now() - estado.carregadoEm < VALIDADE_CONFIG_MS;
  if (fresca && !forcar) return estado.config;
  if (estado.promessa) return estado.promessa;

  estado.promessa = (async () => {
    try {
      const resp = await apiFetch('/superadmin/identidade-relatorios');
      if (resp.ok) {
        const cfg = await resp.json();
        estado.config = {
          versao: 1,
          padrao: cfg?.padrao && typeof cfg.padrao === 'object' ? cfg.padrao : {},
          por_tipo: cfg?.por_tipo && typeof cfg.por_tipo === 'object' ? cfg.por_tipo : {},
        };
        estado.carregadoEm = Date.now();
      }
    } catch { /* segue com o cache/valores de fábrica */ }
    finally { estado.promessa = null; }
    return estado.config;
  })();
  return estado.promessa;
}

/** Troca a configuração em memória (ex.: logo depois de salvar na tela do SuperAdmin). */
export function definirConfigIdentidade(cfg) {
  estado.config = {
    versao: 1,
    padrao: cfg?.padrao || {},
    por_tipo: cfg?.por_tipo || {},
  };
  estado.carregadoEm = Date.now();
  precarregarLogos();
}

/**
 * Dados do estabelecimento que aparecem no cabeçalho. O painel chama isso
 * com a resposta de /api/estabelecimentos/dados/:id (que ele já busca).
 */
export function definirLojaIdentidade(dados) {
  if (!dados) { estado.loja = null; return; }
  estado.loja = {
    nome:     dados.nome_fantasia || dados.nome || '',
    logo_url: dados.logo_url || '',
    cnpj:     dados.cnpj || '',
    telefone: dados.telefone || '',
    email:    dados.email_contato || '',
    endereco: dados.endereco_completo || '',
  };
  precarregarLogos();
}

/** Atualiza só a logo da loja (tela de Configurações troca a logo). */
export function definirLogoLojaIdentidade(url) {
  if (!estado.loja) estado.loja = { nome: '', logo_url: '' };
  estado.loja = { ...estado.loja, logo_url: url || '' };
  precarregarLogos();
}

/** Mistura valores de fábrica → padrão → tipo. */
export function resolverIdentidade(tipo, configOverride) {
  const cfg = configOverride || estado.config || {};
  const doTipo = (tipo && cfg.por_tipo && Object.prototype.hasOwnProperty.call(cfg.por_tipo, tipo) && cfg.por_tipo[tipo]) || {};
  const id = { ...IDENTIDADE_PADRAO, ...(cfg.padrao || {}), ...doTipo };
  id.cor_faixa       = corValida(id.cor_faixa, IDENTIDADE_PADRAO.cor_faixa);
  id.cor_texto_faixa = corValida(id.cor_texto_faixa, IDENTIDADE_PADRAO.cor_texto_faixa);
  id.cor_destaque    = corValida(id.cor_destaque, IDENTIDADE_PADRAO.cor_destaque);
  if (!['loja', 'loja_e_marca'].includes(id.cabecalho_modo)) id.cabecalho_modo = IDENTIDADE_PADRAO.cabecalho_modo;
  if (!EXIBICOES.includes(id.marca_exibicao))   id.marca_exibicao   = IDENTIDADE_PADRAO.marca_exibicao;
  if (!EXIBICOES.includes(id.sistema_exibicao)) id.sistema_exibicao = IDENTIDADE_PADRAO.sistema_exibicao;
  id.escala_cabecalho = escalaValida(id.escala_cabecalho);
  id.escala_rodape    = escalaValida(id.escala_rodape);
  if (!ALINHAMENTOS.includes(id.alinhamento_cabecalho)) id.alinhamento_cabecalho = IDENTIDADE_PADRAO.alinhamento_cabecalho;
  if (!ALINHAMENTOS.includes(id.alinhamento_rodape))    id.alinhamento_rodape    = IDENTIDADE_PADRAO.alinhamento_rodape;
  return id;
}

/**
 * Pré-carrega tudo (configuração + logos). Chamar ao abrir o painel.
 * Também pode ser aguardado antes de gerar um PDF/Excel.
 */
export async function prepararIdentidade({ forcar = false, tempoMaximoMs = 3000 } = {}) {
  const tarefa = (async () => {
    await carregarIdentidade({ forcar });
    await precarregarLogos();
  })();
  // Nunca segura o relatório por mais que `tempoMaximoMs`.
  await Promise.race([tarefa, new Promise(r => setTimeout(r, tempoMaximoMs))]);
}

/* ── Logos (convertidas pra PNG embutido) ───────────────────── */

async function converterLogo(url) {
  const resp = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!resp.ok) throw new Error(`logo ${resp.status}`);
  const blob = await resp.blob();
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = falha;
      i.src = objUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('logo sem dimensão');
    const MAX = 900; // suficiente pra impressão, sem pesar o PDF
    const escala = Math.min(1, MAX / Math.max(w, h));
    w = Math.max(1, Math.round(w * escala));
    h = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL('image/png'), w, h };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function carregarLogo(url) {
  const u = urlImagemSegura(url);
  if (!u) return Promise.resolve(null);
  if (estado.logos.has(u)) return Promise.resolve(estado.logos.get(u));
  if (estado.logosPendentes.has(u)) return estado.logosPendentes.get(u);
  const p = converterLogo(u)
    .then(r => { estado.logos.set(u, r); return r; })
    .catch(() => { estado.logos.set(u, 'erro'); return 'erro'; })
    .finally(() => estado.logosPendentes.delete(u));
  estado.logosPendentes.set(u, p);
  return p;
}

function precarregarLogos(configOverride, lojaOverride) {
  const id = resolverIdentidade(null, configOverride);
  const urls = new Set([id.marca_logo_url, id.sistema_logo_url]);
  const cfg = configOverride || estado.config;
  Object.values(cfg?.por_tipo || {}).forEach(t => { urls.add(t.marca_logo_url); urls.add(t.sistema_logo_url); });
  const loja = lojaOverride || estado.loja;
  if (loja?.logo_url) urls.add(loja.logo_url);
  return Promise.all([...urls].filter(Boolean).map(carregarLogo));
}

/** Logo já carregada (ou null). Síncrono — usa só o que está em memória. */
function logoPronta(url) {
  const u = urlImagemSegura(url);
  if (!u) return null;
  const r = estado.logos.get(u);
  return r && r !== 'erro' ? r : null;
}

/** Endereço pra usar em <img>: embutido se já carregou, senão o próprio link. */
function srcLogo(url) {
  const pronta = logoPronta(url);
  if (pronta) return pronta.dataUrl;
  const u = urlImagemSegura(url);
  if (u && estado.logos.get(u) === 'erro') return '';
  return u;
}

/* ════════════════════════════════════════════════════════════
   PDF (jsPDF)
   ════════════════════════════════════════════════════════════ */

// A fonte padrão do jsPDF (Helvetica) não tem emoji nem alguns símbolos:
// tira o que ela não sabe desenhar pra não sair lixo no PDF.
function textoPdf(v) {
  return String(v ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\u0009\u000A\u000D -~ -ÿ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function caberImagem(img, maxW, maxH) {
  const r = img.w / img.h;
  let w = maxW, h = maxW / r;
  if (h > maxH) { h = maxH; w = maxH * r; }
  return { w, h };
}

/**
 * Cria um PDF já com o cabeçalho da identidade na 1ª página.
 * Uso:
 *   const rel = await novoPdfRelatorio({ tipo: 'estoque', titulo: 'Relatório de Estoque', subtitulo: 'Período: ...' });
 *   autoTable(rel.doc, { ...rel.tabela, startY: rel.y, head, body, ... });
 *   rel.salvar('Estoque.pdf');
 * `rel.tabela` traz margens (pra tabela não passar por cima do cabeçalho/
 * rodapé nas páginas seguintes) e a cor de destaque no cabeçalho da tabela.
 */
export async function novoPdfRelatorio({
  tipo = 'geral', titulo = '', subtitulo = '', orientacao = 'portrait',
  configOverride = null, lojaOverride = null, semLoja = false,
} = {}) {
  if (configOverride || lojaOverride) {
    await Promise.race([precarregarLogos(configOverride, lojaOverride), new Promise(r => setTimeout(r, 3000))]);
  } else {
    await prepararIdentidade();
  }

  const id   = resolverIdentidade(tipo, configOverride);
  const loja = semLoja ? null : (lojaOverride || estado.loja);
  const doc  = new jsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const geradoEm = agoraFormatado();
  const corFaixa = hexParaRgb(id.cor_faixa);
  const corTextoFaixa = hexParaRgb(id.cor_texto_faixa);
  const corDestaque = hexParaRgb(id.cor_destaque);

  // Tamanhos ajustáveis na tela do SuperAdmin (70% a 160%)
  const sc = id.escala_cabecalho / 100;
  const sr = id.escala_rodape / 100;
  const ALTURA_FAIXA = 13 * sc;

  // Rodapé: uma linha por informação ("Gerado por…", contatos, texto
  // livre) — a altura da faixa acompanha quantas linhas tiver.
  const linhasRodape = [];
  const geradoPor = aplicarMarcadores(id.rodape_gerado_por, id);
  if (geradoPor)             linhasRodape.push({ t: geradoPor, b: true });
  const contatosRodape = linhaContatos(id);
  if (contatosRodape)        linhasRodape.push({ t: contatosRodape, b: false });
  if (id.rodape_texto_livre) linhasRodape.push({ t: id.rodape_texto_livre, b: false });
  const PASSO_RODAPE = 3.6 * sr;
  // Centralizado (23/09): tudo empilhado no meio — marca em cima, depois as
  // linhas de texto e a paginação por último.
  const rodCentro = id.alinhamento_rodape === 'centro';
  const cabCentro = id.alinhamento_cabecalho === 'centro';
  const temMarcaRodape = oQueMostrar(id.marca_exibicao, !!logoPronta(id.marca_logo_url), !!id.marca_nome);
  const ALTURA_MARCA_RODAPE = (temMarcaRodape.logo || temMarcaRodape.nome) ? 6.5 * sr : 0;
  const linhasCentro = linhasRodape.length + (id.mostrar_paginacao ? 1 : 0);
  const ALTURA_RODAPE = rodCentro
    ? Math.max(11 * sr, 5 * sr + ALTURA_MARCA_RODAPE + linhasCentro * PASSO_RODAPE)
    : Math.max(11 * sr, 5 * sr + linhasRodape.length * PASSO_RODAPE);

  // Desenha logo e/ou nome (conforme "exibicao") centralizado na altura
  // `yCentro`. Com `direita`, `x` é a borda direita. Devolve a largura usada.
  function desenharMarca({ logo, nome, exibicao, x, yCentro, alturaLogo, larguraMaxLogo, fonte, negrito, direita = false, medir = false }) {
    const quer = oQueMostrar(exibicao, !!logo, !!nome);
    let wLogo = 0, hLogo = 0;
    if (quer.logo) ({ w: wLogo, h: hLogo } = caberImagem(logo, larguraMaxLogo, alturaLogo));
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(fonte);
    const txt = quer.nome ? textoPdf(nome) : '';
    const wTxt = txt ? doc.getTextWidth(txt) : 0;
    const espaco = quer.logo && txt ? alturaLogo * 0.4 : 0;
    const total = wLogo + espaco + wTxt;
    if (medir) return total; // só mede a largura, sem desenhar
    let cx = direita ? x - total : x;
    if (quer.logo) {
      doc.addImage(logo.dataUrl, 'PNG', cx, yCentro - hLogo / 2, wLogo, hLogo);
      cx += wLogo + espaco;
    }
    if (txt) {
      doc.setTextColor(...corTextoFaixa);
      doc.text(txt, cx, yCentro + fonte * 0.3528 * 0.35);
    }
    return total;
  }

  let y = M;

  /* Faixa da marca (só no modo "loja + minha marca") */
  if (id.cabecalho_modo === 'loja_e_marca') {
    doc.setFillColor(...corFaixa);
    doc.rect(0, 0, W, ALTURA_FAIXA, 'F');
    const argMarca = {
      logo: logoPronta(id.marca_logo_url), nome: id.marca_nome, exibicao: id.marca_exibicao,
      yCentro: ALTURA_FAIXA / 2, alturaLogo: 8 * sc, larguraMaxLogo: 55 * sc, fonte: 11 * sc, negrito: true,
    };
    const argSistema = {
      logo: logoPronta(id.sistema_logo_url), nome: id.nome_sistema, exibicao: id.sistema_exibicao,
      yCentro: ALTURA_FAIXA / 2, alturaLogo: 8 * sc, larguraMaxLogo: 55 * sc, fonte: 8.5 * sc, negrito: false,
    };
    if (cabCentro) {
      // Marca e sistema juntos no meio da faixa, separados por um traço
      const wM = desenharMarca({ ...argMarca, x: 0, medir: true });
      const wS = desenharMarca({ ...argSistema, x: 0, medir: true });
      const vao = wM > 0 && wS > 0 ? 10 * sc : 0;
      let xc = (W - (wM + vao + wS)) / 2;
      if (wM > 0) desenharMarca({ ...argMarca, x: xc });
      if (vao) {
        doc.setDrawColor(...corTextoFaixa); doc.setLineWidth(0.3);
        doc.line(xc + wM + vao / 2, ALTURA_FAIXA * 0.3, xc + wM + vao / 2, ALTURA_FAIXA * 0.7);
      }
      if (wS > 0) desenharMarca({ ...argSistema, x: xc + wM + vao });
    } else {
      desenharMarca({ ...argMarca, x: M });
      desenharMarca({ ...argSistema, x: W - M, direita: true });
    }
    y = ALTURA_FAIXA + 6 * sc;
  }

  /* Bloco da loja (esquerda) + título do relatório (direita) */
  const topo = y;
  const larguraUtil = W - 2 * M;
  let xTexto = M;
  let alturaLogo = 0;

  const logoLoja = loja && id.mostrar_logo_loja ? logoPronta(loja.logo_url) : null;
  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  const linhasEsq = loja
    ? linhasDadosLoja(loja, id)
    : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);

  let fimBloco;
  if (cabCentro) {
    // Centralizado: logo, nome da loja, dados, título, subtítulo e data,
    // um embaixo do outro, no meio da página.
    const cx = W / 2;
    let yc = topo;
    if (logoLoja) {
      const { w, h } = caberImagem(logoLoja, 30 * sc, 18 * sc);
      doc.addImage(logoLoja.dataUrl, 'PNG', cx - w / 2, yc, w, h);
      yc += h + 3 * sc;
    }
    yc += 4 * sc;
    if (nomeEsq) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13 * sc); doc.setTextColor(20, 20, 20);
      const partes = doc.splitTextToSize(textoPdf(nomeEsq), larguraUtil);
      doc.text(partes, cx, yc, { align: 'center' });
      yc += partes.length * 5.4 * sc;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8 * sc); doc.setTextColor(95, 100, 110);
    linhasEsq.forEach(l => {
      const partes = doc.splitTextToSize(textoPdf(l), larguraUtil);
      doc.text(partes, cx, yc, { align: 'center' });
      yc += partes.length * 3.8 * sc;
    });
    if (titulo) {
      yc += 2.5 * sc;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12 * sc); doc.setTextColor(...corDestaque);
      const partes = doc.splitTextToSize(textoPdf(titulo), larguraUtil);
      doc.text(partes, cx, yc, { align: 'center' });
      yc += partes.length * 5 * sc;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5 * sc); doc.setTextColor(95, 100, 110);
    if (subtitulo) {
      const partes = doc.splitTextToSize(textoPdf(subtitulo), larguraUtil);
      doc.text(partes, cx, yc, { align: 'center' });
      yc += partes.length * 4 * sc;
    }
    if (id.mostrar_data_geracao) {
      doc.setFontSize(7.5 * sc);
      doc.text(`Gerado em ${geradoEm}`, cx, yc, { align: 'center' });
      yc += 3.6 * sc;
    }
    fimBloco = yc - 2 * sc;
  } else {
    if (logoLoja) {
      const { w, h } = caberImagem(logoLoja, 26 * sc, 20 * sc);
      doc.addImage(logoLoja.dataUrl, 'PNG', M, topo, w, h);
      xTexto = M + w + 4 * sc;
      alturaLogo = h;
    }

    const larguraEsq = larguraUtil * 0.56 - (xTexto - M);

    let yEsq = topo + 5 * sc;
    if (nomeEsq) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13 * sc); doc.setTextColor(20, 20, 20);
      const partes = doc.splitTextToSize(textoPdf(nomeEsq), larguraEsq);
      doc.text(partes, xTexto, yEsq);
      yEsq += partes.length * 5.4 * sc;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8 * sc); doc.setTextColor(95, 100, 110);
    linhasEsq.forEach(l => {
      const partes = doc.splitTextToSize(textoPdf(l), larguraEsq);
      doc.text(partes, xTexto, yEsq);
      yEsq += partes.length * 3.8 * sc;
    });

    const larguraDir = larguraUtil * 0.42;
    let yDir = topo + 5 * sc;
    if (titulo) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12 * sc); doc.setTextColor(...corDestaque);
      const partes = doc.splitTextToSize(textoPdf(titulo), larguraDir);
      doc.text(partes, W - M, yDir, { align: 'right' });
      yDir += partes.length * 5 * sc;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5 * sc); doc.setTextColor(95, 100, 110);
    if (subtitulo) {
      const partes = doc.splitTextToSize(textoPdf(subtitulo), larguraDir);
      doc.text(partes, W - M, yDir, { align: 'right' });
      yDir += partes.length * 4 * sc;
    }
    if (id.mostrar_data_geracao) {
      doc.setFontSize(7.5 * sc);
      doc.text(`Gerado em ${geradoEm}`, W - M, yDir, { align: 'right' });
      yDir += 3.6 * sc;
    }

    fimBloco = Math.max(topo + alturaLogo, yEsq - 2 * sc, yDir - 2 * sc);
  }
  const yLinha = fimBloco + 3 * sc;
  doc.setDrawColor(...corDestaque);
  doc.setLineWidth(0.6);
  doc.line(M, yLinha, W - M, yLinha);

  const MARGEM_TOPO_OUTRAS = 18;

  function desenharRodapes() {
    const total = doc.getNumberOfPages();
    const logoMarca = logoPronta(id.marca_logo_url);
    const tituloCurto = textoPdf([nomeEsq, titulo].filter(Boolean).join(' - '));

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);

      // Cabeçalho resumido nas páginas 2 em diante
      if (p > 1) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(95, 100, 110);
        if (cabCentro) doc.text(doc.splitTextToSize(tituloCurto, larguraUtil * 0.6)[0] || '', W / 2, 10, { align: 'center' });
        else doc.text(doc.splitTextToSize(tituloCurto, larguraUtil * 0.8)[0] || '', M, 10);
        if (id.mostrar_data_geracao) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
          doc.text(geradoEm, W - M, 10, { align: 'right' });
        }
        doc.setDrawColor(...corDestaque); doc.setLineWidth(0.3);
        doc.line(M, 12.5, W - M, 12.5);
      }

      // Faixa do rodapé
      const yR = H - ALTURA_RODAPE;
      doc.setFillColor(...corFaixa);
      doc.rect(0, yR, W, ALTURA_RODAPE, 'F');

      if (rodCentro) {
        // Tudo centralizado: marca em cima, linhas de texto e a paginação embaixo
        const larguraCentro = W - 2 * M;
        const altConteudo = ALTURA_MARCA_RODAPE + linhasCentro * PASSO_RODAPE;
        let yc = yR + (ALTURA_RODAPE - altConteudo) / 2;
        if (ALTURA_MARCA_RODAPE) {
          const argM = {
            logo: logoMarca, nome: id.marca_nome, exibicao: id.marca_exibicao,
            yCentro: yc + ALTURA_MARCA_RODAPE / 2, alturaLogo: 5 * sr, larguraMaxLogo: 30 * sr, fonte: 7.5 * sr, negrito: true,
          };
          const wM = desenharMarca({ ...argM, x: 0, medir: true });
          desenharMarca({ ...argM, x: (W - wM) / 2 });
          yc += ALTURA_MARCA_RODAPE;
        }
        doc.setTextColor(...corTextoFaixa);
        const textos = linhasRodape.map(l => ({ ...l }));
        if (id.mostrar_paginacao) textos.push({ t: `Página ${p} de ${total}`, b: false });
        textos.forEach((l, i) => {
          doc.setFont('helvetica', l.b ? 'bold' : 'normal');
          let fonte = (l.b ? 7.5 : 6.8) * sr;
          const minimo = fonte * 0.7;
          let txt = textoPdf(l.t);
          doc.setFontSize(fonte);
          while (doc.getTextWidth(txt) > larguraCentro && fonte > minimo) { fonte -= 0.25; doc.setFontSize(fonte); }
          if (doc.getTextWidth(txt) > larguraCentro) {
            while (txt.length > 1 && doc.getTextWidth(txt + '...') > larguraCentro) txt = txt.slice(0, -1);
            txt = txt.trimEnd() + '...';
          }
          doc.text(txt, W / 2, yc + (i + 0.75) * PASSO_RODAPE, { align: 'center' });
        });
        continue;
      }

      const larguraMarca = desenharMarca({
        logo: logoMarca, nome: id.marca_nome, exibicao: id.marca_exibicao,
        x: M, yCentro: yR + ALTURA_RODAPE / 2, alturaLogo: 6 * sr, larguraMaxLogo: 30 * sr, fonte: 7.5 * sr, negrito: true,
      });
      const xR = larguraMarca > 0 ? M + larguraMarca + 5 * sr : M;
      const larguraTextoRodape = W - M - xR - 30 * sr;
      doc.setTextColor(...corTextoFaixa);
      const yInicio = yR + (ALTURA_RODAPE - (linhasRodape.length - 1) * PASSO_RODAPE) / 2 + 1 * sr;
      linhasRodape.forEach((l, i) => {
        doc.setFont('helvetica', l.b ? 'bold' : 'normal');
        // Texto maior que o espaço: diminui a letra até caber (até 70% do
        // tamanho); se ainda assim não couber, corta com "...".
        let fonte = (l.b ? 7.5 : 6.8) * sr;
        const minimo = fonte * 0.7;
        let txt = textoPdf(l.t);
        doc.setFontSize(fonte);
        while (doc.getTextWidth(txt) > larguraTextoRodape && fonte > minimo) {
          fonte -= 0.25;
          doc.setFontSize(fonte);
        }
        if (doc.getTextWidth(txt) > larguraTextoRodape) {
          while (txt.length > 1 && doc.getTextWidth(txt + '...') > larguraTextoRodape) txt = txt.slice(0, -1);
          txt = txt.trimEnd() + '...';
        }
        doc.text(txt, xR, yInicio + i * PASSO_RODAPE);
      });
      if (id.mostrar_paginacao) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5 * sr);
        doc.text(`Página ${p} de ${total}`, W - M, yR + ALTURA_RODAPE / 2 + 1.2 * sr, { align: 'right' });
      }
    }
  }

  return {
    doc,
    y: yLinha + 5,
    identidade: id,
    largura: W,
    margem: M,
    tabela: {
      margin: { top: MARGEM_TOPO_OUTRAS, bottom: ALTURA_RODAPE + 5, left: M, right: M },
      headStyles: { fillColor: corDestaque, textColor: 255 },
    },
    /** Desenha rodapés/cabeçalhos das páginas e baixa o arquivo. */
    salvar(nomeArquivo) {
      desenharRodapes();
      doc.save(nomeArquivo);
    },
    /** Desenha rodapés e abre direto a tela de impressão (sem baixar). */
    imprimir() {
      desenharRodapes();
      imprimirPdfBlob(doc.output('blob'));
    },
    /** `modo` 'imprimir' → tela de impressão; qualquer outro → baixa o arquivo.
     *  (Os botões chamam a função sem argumento ou com o evento do clique,
     *  que cai no "baixar".) */
    concluir(modo, nomeArquivo) {
      if (modo === 'imprimir') this.imprimir();
      else this.salvar(nomeArquivo);
    },
    /** Igual ao salvar, mas devolve o PDF (Blob) em vez de baixar — usado na prévia. */
    finalizarBlob() {
      desenharRodapes();
      return doc.output('blob');
    },
  };
}

/* Abre a tela de impressão do navegador com o PDF, sem baixar nada.
   Carrega o PDF num iframe invisível da própria página e manda imprimir
   (não depende de pop-up, então não é bloqueado mesmo depois de esperar
   a identidade/logos carregarem). Se o navegador não deixar imprimir
   pelo iframe, abre o PDF numa aba nova, com o botão de imprimir dele. */
let iframeImpressao = null;
let urlImpressao = null;
export function imprimirPdfBlob(blob) {
  if (iframeImpressao) { iframeImpressao.remove(); iframeImpressao = null; }
  if (urlImpressao) { URL.revokeObjectURL(urlImpressao); urlImpressao = null; }
  const url = URL.createObjectURL(blob);
  urlImpressao = url;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'Impressão';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch {
        window.open(url, '_blank');
      }
    }, 150);
  };
  iframe.src = url;
  document.body.appendChild(iframe);
  iframeImpressao = iframe;
}

/* ════════════════════════════════════════════════════════════
   IMPRESSÃO (HTML em janela nova)
   ════════════════════════════════════════════════════════════ */

/**
 * Cabeçalho, rodapé e CSS prontos pra colar numa página de impressão.
 * Síncrono — usa o que já está em memória (a janela tem que abrir na hora
 * do clique). Aproveita pra atualizar o cache em segundo plano.
 *   const idr = htmlIdentidade({ tipo, titulo, subtitulo });
 *   `<style>${idr.css} ...</style> ... <body>${idr.cabecalho} ... ${idr.rodape}</body>`
 */
export function htmlIdentidade({
  tipo = 'geral', titulo = '', subtitulo = '', configOverride = null, lojaOverride = null, semLoja = false,
} = {}) {
  if (!configOverride) carregarIdentidade().then(() => precarregarLogos()).catch(() => {});

  const id   = resolverIdentidade(tipo, configOverride);
  const loja = semLoja ? null : (lojaOverride || estado.loja);
  const geradoEm = agoraFormatado();

  // Logo e/ou nome, conforme a opção de exibição escolhida
  const marcaHtml = (src, nome, exibicao, classeNome) => {
    const quer = oQueMostrar(exibicao, !!src, !!nome);
    return `${quer.logo ? `<img src="${esc(src)}" alt="">` : ''}${quer.nome ? `<span class="${classeNome}">${esc(nome)}</span>` : ''}`;
  };

  const faixa = id.cabecalho_modo === 'loja_e_marca'
    ? `
          <div class="idr-faixa">
            <div class="idr-faixa-esq">${marcaHtml(srcLogo(id.marca_logo_url), id.marca_nome, id.marca_exibicao, 'idr-faixa-marca')}</div>
            <div class="idr-faixa-dir">${marcaHtml(srcLogo(id.sistema_logo_url), id.nome_sistema, id.sistema_exibicao, 'idr-faixa-sistema')}</div>
          </div>`
    : '';

  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  const linhasEsq = loja
    ? linhasDadosLoja(loja, id)
    : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);
  const srcLoja = loja && id.mostrar_logo_loja ? srcLogo(loja.logo_url) : '';

  const cabecalho = `
    <header class="idr-cab${id.alinhamento_cabecalho === 'centro' ? ' idr-centro' : ''}">
      ${faixa}
      <div class="idr-bloco">
        <div class="idr-loja">
          ${srcLoja ? `<img class="idr-loja-logo" src="${esc(srcLoja)}" alt="">` : ''}
          <div>
            ${nomeEsq ? `<div class="idr-loja-nome">${esc(nomeEsq)}</div>` : ''}
            ${linhasEsq.map(l => `<div class="idr-loja-info">${esc(l)}</div>`).join('')}
          </div>
        </div>
        <div class="idr-titulo-bloco">
          ${titulo ? `<div class="idr-titulo">${esc(titulo)}</div>` : ''}
          ${subtitulo ? `<div class="idr-sub">${esc(subtitulo)}</div>` : ''}
          ${id.mostrar_data_geracao ? `<div class="idr-gerado">Gerado em ${esc(geradoEm)}</div>` : ''}
        </div>
      </div>
    </header>`;

  const gerado = aplicarMarcadores(id.rodape_gerado_por, id);
  const contatos = linhaContatos(id);
  const marcaRodape = marcaHtml(srcLogo(id.marca_logo_url), id.marca_nome, id.marca_exibicao, 'idr-rod-marca');
  const rodape = `
    <footer class="idr-rod${id.alinhamento_rodape === 'centro' ? ' idr-centro' : ''}">
      <div class="idr-rod-esq">
        ${marcaRodape ? `<div class="idr-rod-marca-box">${marcaRodape}</div>` : ''}
        <div>
          ${gerado ? `<div class="idr-rod-gerado">${esc(gerado)}</div>` : ''}
          ${contatos ? `<div class="idr-rod-linha">${esc(contatos)}</div>` : ''}
          ${id.rodape_texto_livre ? `<div class="idr-rod-linha">${esc(id.rodape_texto_livre)}</div>` : ''}
        </div>
      </div>
      ${id.mostrar_data_geracao ? `<div class="idr-rod-dir">${esc(geradoEm)}</div>` : ''}
    </footer>`;

  // Tamanhos ajustáveis (escala_cabecalho / escala_rodape, em %)
  const c = (v) => `${(v * id.escala_cabecalho / 100).toFixed(1)}px`;
  const r = (v) => `${(v * id.escala_rodape / 100).toFixed(1)}px`;
  const css = `
    .idr-cab, .idr-rod { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; }
    .idr-cab { margin-bottom: ${c(14)}; }
    .idr-faixa { display: flex; align-items: center; justify-content: space-between; gap: ${c(16)};
      background: ${id.cor_faixa}; color: ${id.cor_texto_faixa}; padding: ${c(8)} ${c(14)}; border-radius: 6px; margin-bottom: ${c(12)}; }
    .idr-faixa-esq, .idr-faixa-dir { display: flex; align-items: center; gap: ${c(10)}; min-width: 0; }
    .idr-faixa img { max-height: ${c(28)}; max-width: ${c(220)}; display: block; }
    .idr-faixa-marca { font-weight: 800; font-size: ${c(15)}; letter-spacing: .3px; white-space: nowrap; }
    .idr-faixa-sistema { font-size: ${c(11)}; opacity: .92; white-space: nowrap; }
    .idr-faixa-dir { justify-content: flex-end; text-align: right; }
    .idr-bloco { display: flex; justify-content: space-between; align-items: flex-start; gap: ${c(18)};
      padding-bottom: ${c(10)}; border-bottom: 2px solid ${id.cor_destaque}; }
    .idr-loja { display: flex; align-items: flex-start; gap: ${c(12)}; min-width: 0; }
    .idr-loja-logo { max-width: ${c(90)}; max-height: ${c(70)}; object-fit: contain; display: block; }
    .idr-loja-nome { font-size: ${c(18)}; font-weight: 800; color: #111827; line-height: 1.2; }
    .idr-loja-info { font-size: ${c(10.5)}; color: #5f646e; margin-top: 2px; }
    .idr-titulo-bloco { text-align: right; flex-shrink: 0; max-width: 45%; }
    .idr-titulo { font-size: ${c(15)}; font-weight: 800; color: ${id.cor_destaque}; }
    .idr-sub { font-size: ${c(11)}; color: #5f646e; margin-top: 3px; }
    .idr-gerado { font-size: ${c(9.5)}; color: #8a8f98; margin-top: 3px; }
    .idr-rod { display: flex; justify-content: space-between; align-items: center; gap: ${r(14)}; margin-top: 22px;
      background: ${id.cor_faixa}; color: ${id.cor_texto_faixa}; padding: ${r(8)} ${r(14)}; border-radius: 6px;
      page-break-inside: avoid; break-inside: avoid; }
    .idr-rod-esq { display: flex; align-items: center; gap: ${r(12)}; min-width: 0; }
    .idr-rod-marca-box { display: flex; align-items: center; gap: ${r(8)}; flex-shrink: 0; }
    .idr-rod-marca-box img { max-height: ${r(20)}; max-width: ${r(120)}; display: block; }
    .idr-rod-marca { font-size: ${r(11)}; font-weight: 800; white-space: nowrap; }
    .idr-rod-gerado { font-size: ${r(10.5)}; font-weight: 700; }
    .idr-rod-linha { font-size: ${r(9.5)}; opacity: .9; margin-top: 1px; }
    .idr-rod-dir { font-size: ${r(9.5)}; opacity: .9; white-space: nowrap; }
    /* Alinhamento centralizado (23/09) */
    .idr-cab.idr-centro .idr-faixa { justify-content: center; }
    .idr-cab.idr-centro .idr-faixa-dir { justify-content: center; border-left: 1px solid currentColor; padding-left: ${c(14)}; }
    .idr-cab.idr-centro .idr-faixa-dir:first-child { border-left: 0; padding-left: 0; }
    .idr-cab.idr-centro .idr-bloco { flex-direction: column; align-items: center; text-align: center; gap: ${c(8)}; }
    .idr-cab.idr-centro .idr-loja { flex-direction: column; align-items: center; gap: ${c(6)}; }
    .idr-cab.idr-centro .idr-titulo-bloco { text-align: center; max-width: 100%; }
    .idr-rod.idr-centro { flex-direction: column; justify-content: center; text-align: center; gap: ${r(4)}; }
    .idr-rod.idr-centro .idr-rod-esq { flex-direction: column; gap: ${r(4)}; }
  `;

  return { css, cabecalho, rodape, identidade: id };
}

/* ════════════════════════════════════════════════════════════
   RECIBO (impressora térmica, preto e branco)
   ════════════════════════════════════════════════════════════ */

/** Dados prontos pro recibo do PDV. Síncrono. */
export function identidadeRecibo() {
  const id = resolverIdentidade('recibo');
  const loja = estado.loja;
  const logoLoja = loja && id.recibo_mostrar_logo_loja ? srcLogo(loja.logo_url) : '';
  const linhasLoja = loja && id.recibo_mostrar_dados_loja ? linhasDadosLoja(loja, id) : [];
  return {
    logoLoja,
    linhasLoja,
    mensagem: id.recibo_mensagem || '',
    rodape: aplicarMarcadores(id.recibo_rodape, id),
    contatos: linhaContatos(id),
  };
}

/* ════════════════════════════════════════════════════════════
   EXCEL
   ════════════════════════════════════════════════════════════ */

const { utils: U } = XLSXS;

function rgbHex(hex) { return corValida(hex, '#000000').slice(1).toUpperCase(); }

// Fórmulas (ex.: total com SUM(K2:K40)) precisam acompanhar as linhas que
// desceram pro cabeçalho caber. Todas as abas descem o mesmo tanto, então
// referência pra outra aba também continua certa. Texto entre aspas não
// é mexido.
function deslocarFormula(f, n) {
  return String(f).split('"').map((trecho, i) => (i % 2 === 1 ? trecho : trecho.replace(
    /(^|[^A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g,
    (_, antes, d1, col, d2, lin) => `${antes}${d1}${col}${d2}${parseInt(lin, 10) + n}`,
  ))).join('"');
}

function larguraAutomatica(ws, linhaInicial, linhaFinal, colIni, colFim) {
  const cols = [];
  for (let c = colIni; c <= colFim; c++) {
    let max = 8;
    for (let r = linhaInicial; r <= linhaFinal; r++) {
      const cel = ws[U.encode_cell({ r, c })];
      if (!cel || cel.v === undefined || cel.v === null) continue;
      const txt = cel.w || String(cel.v);
      max = Math.max(max, Math.min(60, txt.length + 2));
    }
    cols.push({ wch: max });
  }
  return cols;
}

/** Desloca a planilha pra baixo, põe cabeçalho da identidade em cima e rodapé embaixo. */
function aplicarIdentidadeNaPlanilha(ws, id, loja, { titulo, subtitulo, geradoEm }) {
  const range = ws['!ref'] ? U.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const colIni = range.s.c;
  const colFim = Math.max(range.e.c, colIni + 3); // pelo menos 4 colunas pro texto do cabeçalho

  // Tamanhos ajustáveis (escala_cabecalho / escala_rodape, em %).
  // Planilha não leva imagem: a marca e o sistema entram sempre como texto.
  const kc = id.escala_cabecalho / 100;
  const kr = id.escala_rodape / 100;
  const tam = (v, k) => Math.round(v * k * 2) / 2;

  // Linhas do cabeçalho
  const cab = [];
  // Alinhamento (23/09): 'centro' centraliza as linhas do cabeçalho/rodapé
  // (as células já são mescladas na largura da tabela).
  const alinCab = id.alinhamento_cabecalho === 'centro' ? { horizontal: 'center' } : {};
  const alinRod = id.alinhamento_rodape === 'centro' ? { horizontal: 'center' } : {};
  const faixa = {
    fill: { patternType: 'solid', fgColor: { rgb: rgbHex(id.cor_faixa) } },
    font: { bold: true, sz: tam(11, kc), color: { rgb: rgbHex(id.cor_texto_faixa) } },
    alignment: { vertical: 'center' },
  };
  if (id.cabecalho_modo === 'loja_e_marca') {
    cab.push({ v: [id.marca_nome, id.nome_sistema].filter(Boolean).join('   ·   '), s: faixa, hpt: tam(22, kc) });
  }
  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  if (nomeEsq) cab.push({ v: nomeEsq, s: { font: { bold: true, sz: tam(14, kc), color: { rgb: '111827' } } }, hpt: tam(22, kc) });
  const dados = loja ? linhasDadosLoja(loja, id) : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);
  dados.forEach(l => cab.push({ v: l, s: { font: { sz: tam(9, kc), color: { rgb: '5F646E' } } } }));
  if (titulo) cab.push({ v: titulo, s: { font: { bold: true, sz: tam(12, kc), color: { rgb: rgbHex(id.cor_destaque) } } }, hpt: tam(20, kc) });
  const linhaSub = [subtitulo, id.mostrar_data_geracao ? `Gerado em ${geradoEm}` : ''].filter(Boolean).join('   ·   ');
  if (linhaSub) cab.push({ v: linhaSub, s: { font: { sz: tam(9, kc), color: { rgb: '5F646E' } } } });
  cab.push({ v: '', s: {} }); // respiro antes da tabela

  const N = cab.length;

  // Desloca todas as células N linhas pra baixo (mantém valor, formato e estilo)
  const novas = {};
  Object.keys(ws).forEach(k => {
    if (k[0] === '!') return;
    const pos = U.decode_cell(k);
    const cel = ws[k];
    if (cel && cel.f) cel.f = deslocarFormula(cel.f, N);
    novas[U.encode_cell({ r: pos.r + N, c: pos.c })] = cel;
    delete ws[k];
  });
  Object.assign(ws, novas);

  const merges = (ws['!merges'] || []).map(m => ({ s: { r: m.s.r + N, c: m.s.c }, e: { r: m.e.r + N, c: m.e.c } }));
  const linhasAltura = ws['!rows'] ? [...ws['!rows']] : [];
  const alturas = [];

  cab.forEach((l, i) => {
    const r = range.s.r + i;
    const s = { ...l.s, alignment: { ...(l.s.alignment || {}), ...alinCab } };
    for (let c = colIni; c <= colFim; c++) {
      const ref = U.encode_cell({ r, c });
      ws[ref] = c === colIni ? { t: 's', v: l.v, s } : { t: 's', v: '', s };
    }
    merges.push({ s: { r, c: colIni }, e: { r, c: colFim } });
    alturas[r] = l.hpt ? { hpt: l.hpt } : undefined;
  });

  // Cabeçalho da tabela (1ª linha dos dados): destaca se ainda não tiver estilo
  const linhaTabela = range.s.r + N;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cel = ws[U.encode_cell({ r: linhaTabela, c })];
    if (cel && !cel.s) {
      cel.s = {
        fill: { patternType: 'solid', fgColor: { rgb: rgbHex(id.cor_destaque) } },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        alignment: { vertical: 'center' },
      };
    }
  }

  // Rodapé
  const fimDados = range.e.r + N;
  const rod = [];
  const gerado = aplicarMarcadores(id.rodape_gerado_por, id);
  const contatos = linhaContatos(id);
  if (gerado)                rod.push({ v: gerado, s: { ...faixa, font: { ...faixa.font, sz: tam(10, kr) } } });
  if (contatos)              rod.push({ v: contatos, s: { ...faixa, font: { sz: tam(9, kr), color: { rgb: rgbHex(id.cor_texto_faixa) } } } });
  if (id.rodape_texto_livre) rod.push({ v: id.rodape_texto_livre, s: { ...faixa, font: { sz: tam(9, kr), color: { rgb: rgbHex(id.cor_texto_faixa) } } } });
  let ultima = fimDados;
  rod.forEach((l, i) => {
    const r = fimDados + 2 + i;
    const s = { ...l.s, alignment: { ...(l.s.alignment || {}), ...alinRod } };
    for (let c = colIni; c <= colFim; c++) {
      ws[U.encode_cell({ r, c })] = c === colIni ? { t: 's', v: l.v, s } : { t: 's', v: '', s };
    }
    merges.push({ s: { r, c: colIni }, e: { r, c: colFim } });
    ultima = r;
  });

  ws['!merges'] = merges;
  const rowsFinal = alturas.slice(0, range.s.r + N);
  linhasAltura.forEach((v, i) => { rowsFinal[i + N] = v; });
  ws['!rows'] = rowsFinal;
  if (ws['!autofilter']?.ref) {
    const af = U.decode_range(ws['!autofilter'].ref);
    af.s.r += N; af.e.r += N;
    ws['!autofilter'] = { ref: U.encode_range(af) };
  }
  if (!ws['!cols']) ws['!cols'] = larguraAutomatica(ws, linhaTabela, fimDados, range.s.c, range.e.c);
  ws['!ref'] = U.encode_range({ s: { r: range.s.r, c: colIni }, e: { r: ultima, c: Math.max(colFim, range.e.c) } });
}

/**
 * Coloca cabeçalho/rodapé da identidade em TODAS as abas do Excel e baixa.
 * Funciona com planilha montada pelo 'xlsx' ou pelo 'xlsx-js-style'
 * (a gravação é sempre pelo xlsx-js-style, que é quem grava as cores).
 *   await salvarExcelIdentidade(wb, 'Estoque.xlsx', { tipo: 'estoque', titulo: 'Relatório de Estoque' });
 */
export async function salvarExcelIdentidade(wb, nomeArquivo, {
  tipo = 'geral', titulo = '', subtitulo = '', configOverride = null, lojaOverride = null, semLoja = false,
} = {}) {
  if (!configOverride) await prepararIdentidade({ tempoMaximoMs: 2000 });
  const id = resolverIdentidade(tipo, configOverride);
  const loja = semLoja ? null : (lojaOverride || estado.loja);
  const geradoEm = agoraFormatado();
  (wb.SheetNames || []).forEach(nome => {
    const ws = wb.Sheets[nome];
    if (ws) aplicarIdentidadeNaPlanilha(ws, id, loja, { titulo, subtitulo, geradoEm });
  });
  XLSXS.writeFile(wb, nomeArquivo);
}

/* Só pros testes/prévia: permite montar a planilha sem baixar. */
export function _aplicarIdentidadeExcelSemSalvar(wb, meta = {}) {
  const id = resolverIdentidade(meta.tipo || 'geral', meta.configOverride);
  const loja = meta.semLoja ? null : (meta.lojaOverride || estado.loja);
  (wb.SheetNames || []).forEach(nome => aplicarIdentidadeNaPlanilha(wb.Sheets[nome], id, loja, {
    titulo: meta.titulo || '', subtitulo: meta.subtitulo || '', geradoEm: agoraFormatado(),
  }));
  return wb;
}
