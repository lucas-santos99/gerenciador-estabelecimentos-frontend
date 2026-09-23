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

  const ALTURA_FAIXA = 13;

  // Rodapé: uma linha por informação ("Gerado por…", contatos, texto
  // livre) — a altura da faixa acompanha quantas linhas tiver.
  const linhasRodape = [];
  const geradoPor = aplicarMarcadores(id.rodape_gerado_por, id);
  if (geradoPor)             linhasRodape.push({ t: geradoPor, b: true });
  const contatosRodape = linhaContatos(id);
  if (contatosRodape)        linhasRodape.push({ t: contatosRodape, b: false });
  if (id.rodape_texto_livre) linhasRodape.push({ t: id.rodape_texto_livre, b: false });
  const ALTURA_RODAPE = Math.max(11, 5 + linhasRodape.length * 3.6);

  let y = M;

  /* Faixa da marca (só no modo "loja + minha marca") */
  if (id.cabecalho_modo === 'loja_e_marca') {
    doc.setFillColor(...corFaixa);
    doc.rect(0, 0, W, ALTURA_FAIXA, 'F');
    const logoMarca = logoPronta(id.marca_logo_url);
    if (logoMarca) {
      const { w, h } = caberImagem(logoMarca, 55, 8);
      doc.addImage(logoMarca.dataUrl, 'PNG', M, (ALTURA_FAIXA - h) / 2, w, h);
    } else if (id.marca_nome) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...corTextoFaixa);
      doc.text(textoPdf(id.marca_nome), M, ALTURA_FAIXA / 2 + 1.5);
    }
    const logoSistema = logoPronta(id.sistema_logo_url);
    if (logoSistema) {
      const { w, h } = caberImagem(logoSistema, 55, 8);
      doc.addImage(logoSistema.dataUrl, 'PNG', W - M - w, (ALTURA_FAIXA - h) / 2, w, h);
    } else if (id.nome_sistema) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...corTextoFaixa);
      doc.text(textoPdf(id.nome_sistema), W - M, ALTURA_FAIXA / 2 + 1.3, { align: 'right' });
    }
    y = ALTURA_FAIXA + 6;
  }

  /* Bloco da loja (esquerda) + título do relatório (direita) */
  const topo = y;
  const larguraUtil = W - 2 * M;
  let xTexto = M;
  let alturaLogo = 0;

  const logoLoja = loja && id.mostrar_logo_loja ? logoPronta(loja.logo_url) : null;
  if (logoLoja) {
    const { w, h } = caberImagem(logoLoja, 26, 20);
    doc.addImage(logoLoja.dataUrl, 'PNG', M, topo, w, h);
    xTexto = M + w + 4;
    alturaLogo = h;
  }

  const larguraEsq = larguraUtil * 0.56 - (xTexto - M);
  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  const linhasEsq = loja
    ? linhasDadosLoja(loja, id)
    : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);

  let yEsq = topo + 5;
  if (nomeEsq) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
    const partes = doc.splitTextToSize(textoPdf(nomeEsq), larguraEsq);
    doc.text(partes, xTexto, yEsq);
    yEsq += partes.length * 5.4;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(95, 100, 110);
  linhasEsq.forEach(l => {
    const partes = doc.splitTextToSize(textoPdf(l), larguraEsq);
    doc.text(partes, xTexto, yEsq);
    yEsq += partes.length * 3.8;
  });

  const larguraDir = larguraUtil * 0.42;
  let yDir = topo + 5;
  if (titulo) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...corDestaque);
    const partes = doc.splitTextToSize(textoPdf(titulo), larguraDir);
    doc.text(partes, W - M, yDir, { align: 'right' });
    yDir += partes.length * 5;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(95, 100, 110);
  if (subtitulo) {
    const partes = doc.splitTextToSize(textoPdf(subtitulo), larguraDir);
    doc.text(partes, W - M, yDir, { align: 'right' });
    yDir += partes.length * 4;
  }
  if (id.mostrar_data_geracao) {
    doc.setFontSize(7.5);
    doc.text(`Gerado em ${geradoEm}`, W - M, yDir, { align: 'right' });
    yDir += 3.6;
  }

  const fimBloco = Math.max(topo + alturaLogo, yEsq - 2, yDir - 2);
  const yLinha = fimBloco + 3;
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
        doc.text(doc.splitTextToSize(tituloCurto, larguraUtil * 0.8)[0] || '', M, 10);
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
      let xR = M;
      if (logoMarca) {
        const { w, h } = caberImagem(logoMarca, 30, 6);
        doc.addImage(logoMarca.dataUrl, 'PNG', M, yR + (ALTURA_RODAPE - h) / 2, w, h);
        xR = M + w + 4;
      }
      const larguraTextoRodape = W - M - xR - 30;
      doc.setTextColor(...corTextoFaixa);
      const yInicio = yR + (ALTURA_RODAPE - (linhasRodape.length - 1) * 3.6) / 2 + 1;
      linhasRodape.forEach((l, i) => {
        doc.setFont('helvetica', l.b ? 'bold' : 'normal');
        doc.setFontSize(l.b ? 7.5 : 6.8);
        const txt = doc.splitTextToSize(textoPdf(l.t), larguraTextoRodape)[0] || '';
        doc.text(txt, xR, yInicio + i * 3.6);
      });
      if (id.mostrar_paginacao) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
        doc.text(`Página ${p} de ${total}`, W - M, yR + ALTURA_RODAPE / 2 + 1.2, { align: 'right' });
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
    /** Igual ao salvar, mas devolve o PDF (Blob) em vez de baixar — usado na prévia. */
    finalizarBlob() {
      desenharRodapes();
      return doc.output('blob');
    },
  };
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

  const faixa = id.cabecalho_modo === 'loja_e_marca'
    ? (() => {
        const sm = srcLogo(id.marca_logo_url);
        const ss = srcLogo(id.sistema_logo_url);
        return `
          <div class="idr-faixa">
            <div class="idr-faixa-esq">${sm ? `<img src="${esc(sm)}" alt="">` : `<span class="idr-faixa-marca">${esc(id.marca_nome)}</span>`}</div>
            <div class="idr-faixa-dir">${ss ? `<img src="${esc(ss)}" alt="">` : `<span>${esc(id.nome_sistema)}</span>`}</div>
          </div>`;
      })()
    : '';

  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  const linhasEsq = loja
    ? linhasDadosLoja(loja, id)
    : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);
  const srcLoja = loja && id.mostrar_logo_loja ? srcLogo(loja.logo_url) : '';

  const cabecalho = `
    <header class="idr-cab">
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
  const srcMarca = srcLogo(id.marca_logo_url);
  const rodape = `
    <footer class="idr-rod">
      <div class="idr-rod-esq">
        ${srcMarca ? `<img src="${esc(srcMarca)}" alt="">` : ''}
        <div>
          ${gerado ? `<div class="idr-rod-gerado">${esc(gerado)}</div>` : ''}
          ${contatos ? `<div class="idr-rod-linha">${esc(contatos)}</div>` : ''}
          ${id.rodape_texto_livre ? `<div class="idr-rod-linha">${esc(id.rodape_texto_livre)}</div>` : ''}
        </div>
      </div>
      ${id.mostrar_data_geracao ? `<div class="idr-rod-dir">${esc(geradoEm)}</div>` : ''}
    </footer>`;

  const css = `
    .idr-cab, .idr-rod { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-family: Arial, Helvetica, sans-serif; }
    .idr-cab { margin-bottom: 14px; }
    .idr-faixa { display: flex; align-items: center; justify-content: space-between; gap: 16px;
      background: ${id.cor_faixa}; color: ${id.cor_texto_faixa}; padding: 8px 14px; border-radius: 6px; margin-bottom: 12px; }
    .idr-faixa img { max-height: 28px; max-width: 220px; display: block; }
    .idr-faixa-marca { font-weight: 800; font-size: 15px; letter-spacing: .3px; }
    .idr-faixa-dir { font-size: 11px; opacity: .92; text-align: right; }
    .idr-bloco { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px;
      padding-bottom: 10px; border-bottom: 2px solid ${id.cor_destaque}; }
    .idr-loja { display: flex; align-items: flex-start; gap: 12px; min-width: 0; }
    .idr-loja-logo { max-width: 90px; max-height: 70px; object-fit: contain; display: block; }
    .idr-loja-nome { font-size: 18px; font-weight: 800; color: #111827; line-height: 1.2; }
    .idr-loja-info { font-size: 10.5px; color: #5f646e; margin-top: 2px; }
    .idr-titulo-bloco { text-align: right; flex-shrink: 0; max-width: 45%; }
    .idr-titulo { font-size: 15px; font-weight: 800; color: ${id.cor_destaque}; }
    .idr-sub { font-size: 11px; color: #5f646e; margin-top: 3px; }
    .idr-gerado { font-size: 9.5px; color: #8a8f98; margin-top: 3px; }
    .idr-rod { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-top: 22px;
      background: ${id.cor_faixa}; color: ${id.cor_texto_faixa}; padding: 8px 14px; border-radius: 6px;
      page-break-inside: avoid; break-inside: avoid; }
    .idr-rod-esq { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .idr-rod-esq img { max-height: 20px; max-width: 120px; display: block; }
    .idr-rod-gerado { font-size: 10.5px; font-weight: 700; }
    .idr-rod-linha { font-size: 9.5px; opacity: .9; margin-top: 1px; }
    .idr-rod-dir { font-size: 9.5px; opacity: .9; white-space: nowrap; }
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

  // Linhas do cabeçalho
  const cab = [];
  const faixa = {
    fill: { patternType: 'solid', fgColor: { rgb: rgbHex(id.cor_faixa) } },
    font: { bold: true, sz: 11, color: { rgb: rgbHex(id.cor_texto_faixa) } },
    alignment: { vertical: 'center' },
  };
  if (id.cabecalho_modo === 'loja_e_marca') {
    cab.push({ v: [id.marca_nome, id.nome_sistema].filter(Boolean).join('   ·   '), s: faixa, hpt: 22 });
  }
  const nomeEsq = loja ? (loja.nome || '') : (id.nome_sistema || id.marca_nome || '');
  if (nomeEsq) cab.push({ v: nomeEsq, s: { font: { bold: true, sz: 14, color: { rgb: '111827' } } }, hpt: 22 });
  const dados = loja ? linhasDadosLoja(loja, id) : (id.marca_nome && id.marca_nome !== nomeEsq ? [id.marca_nome] : []);
  dados.forEach(l => cab.push({ v: l, s: { font: { sz: 9, color: { rgb: '5F646E' } } } }));
  if (titulo) cab.push({ v: titulo, s: { font: { bold: true, sz: 12, color: { rgb: rgbHex(id.cor_destaque) } } }, hpt: 20 });
  const linhaSub = [subtitulo, id.mostrar_data_geracao ? `Gerado em ${geradoEm}` : ''].filter(Boolean).join('   ·   ');
  if (linhaSub) cab.push({ v: linhaSub, s: { font: { sz: 9, color: { rgb: '5F646E' } } } });
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
    for (let c = colIni; c <= colFim; c++) {
      const ref = U.encode_cell({ r, c });
      ws[ref] = c === colIni ? { t: 's', v: l.v, s: l.s } : { t: 's', v: '', s: l.s };
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
  if (gerado)                rod.push({ v: gerado, s: { ...faixa, font: { ...faixa.font, sz: 10 } } });
  if (contatos)              rod.push({ v: contatos, s: { ...faixa, font: { sz: 9, color: { rgb: rgbHex(id.cor_texto_faixa) } } } });
  if (id.rodape_texto_livre) rod.push({ v: id.rodape_texto_livre, s: { ...faixa, font: { sz: 9, color: { rgb: rgbHex(id.cor_texto_faixa) } } } });
  let ultima = fimDados;
  rod.forEach((l, i) => {
    const r = fimDados + 2 + i;
    for (let c = colIni; c <= colFim; c++) {
      ws[U.encode_cell({ r, c })] = c === colIni ? { t: 's', v: l.v, s: l.s } : { t: 's', v: '', s: l.s };
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
