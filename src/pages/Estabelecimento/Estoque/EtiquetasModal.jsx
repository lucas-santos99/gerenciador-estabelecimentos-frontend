import React, { useState, useMemo, useEffect } from 'react';
import JsBarcode from 'jsbarcode';
import Dica from '../../../components/Notificacoes/Dica';
import { esc } from '../../../utils/relatorioIdentidade';
import './EtiquetasModal.css';

// Tamanhos em mm. "folha" = A4 com várias etiquetas por página (impressora comum).
const TAMANHOS = {
  '50x30': { rotulo: '50 × 30 mm (térmica)', w: 50, h: 30, folha: false },
  '40x25': { rotulo: '40 × 25 mm (térmica)', w: 40, h: 25, folha: false },
  '60x40': { rotulo: '60 × 40 mm (térmica)', w: 60, h: 40, folha: false },
  'a4':    { rotulo: 'Folha A4 (impressora comum)', w: 63.5, h: 38.1, folha: true },
  'custom': { rotulo: 'Outro tamanho (digitar)', w: 50, h: 30, folha: false },
};
const lim = (v, mn, mx, padrao) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.min(mx, Math.max(mn, n)) : padrao; };

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_COPIAS = 500;

function svgBarcode(codigo) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const so_digitos = /^\d+$/.test(codigo);
  const formato = so_digitos && codigo.length === 13 ? 'EAN13' : 'CODE128';
  const opts = { format: formato, displayValue: true, fontSize: 14, margin: 0, height: 40, width: 2 };
  try { JsBarcode(svg, codigo, opts); }
  catch { JsBarcode(svg, codigo, { ...opts, format: 'CODE128' }); } // EAN13 com dígito verificador inválido
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  return new XMLSerializer().serializeToString(svg);
}

function htmlEtiquetas(linhas, tam, mostrarPreco, medida) {
  const t = tam === 'custom' ? { ...TAMANHOS.custom, w: lim(medida.w, 20, 150, 50), h: lim(medida.h, 15, 150, 30) } : TAMANHOS[tam];
  const etiquetas = [];
  linhas.forEach(l => {
    const bc = svgBarcode(l.codigo);
    for (let i = 0; i < l.copias; i++) {
      etiquetas.push(`<div class="et">
        <div class="nome">${esc(l.nome)}</div>
        ${l.detalhe ? `<div class="det">${esc(l.detalhe)}</div>` : ''}
        <div class="bc">${bc}</div>
        ${mostrarPreco ? `<div class="preco">${esc(l.preco)}</div>` : ''}
      </div>`);
    }
  });
  const pagina = t.folha
    ? '@page{size:A4;margin:10mm 6mm}.fl{display:grid;grid-template-columns:repeat(3,63.5mm);gap:0}'
    : `@page{size:${t.w}mm ${t.h}mm;margin:0}.fl{display:block}.et{page-break-after:always}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    ${pagina}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000}
    .et{width:${t.w}mm;height:${t.h}mm;padding:1.5mm 2mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;overflow:hidden;text-align:center}
    .nome{font-size:${t.h < 28 ? 7 : 9}pt;font-weight:bold;line-height:1.1;max-height:2.3em;overflow:hidden;width:100%}
    .det{font-size:${t.h < 28 ? 6 : 8}pt;line-height:1.1}
    .bc{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center}
    .bc svg{max-width:100%;max-height:100%;width:100%;height:100%}
    .preco{font-size:${t.h < 28 ? 9 : 12}pt;font-weight:bold}
  </style></head><body><div class="fl">${etiquetas.join('')}</div></body></html>`;
}

let iframeAtual = null;
function imprimirHtml(html) {
  if (iframeAtual) { iframeAtual.remove(); iframeAtual = null; }
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'Impressão de etiquetas';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.srcdoc = html;
  iframe.onload = () => {
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      }
    }, 200);
  };
  document.body.appendChild(iframe);
  iframeAtual = iframe;
}

export default function EtiquetasModal({ produto, onFechar }) {
  const sufixo = produto.unidade_medida === 'kg' ? '/kg' : '';
  const itens = useMemo(() => {
    const temVar = produto.tem_variacoes && (produto.variacoes || []).length > 0;
    if (!temVar) {
      return [{
        chave: 'p', nome: produto.nome, detalhe: produto.marca || '',
        codigo: (produto.codigo_barras || '').trim(),
        preco: fmt(produto.preco_venda) + sufixo,
      }];
    }
    return produto.variacoes.map((v, i) => ({
      chave: v.id || `v${i}`, nome: produto.nome,
      detalhe: [v.tamanho, v.cor, v.genero].map(x => (x || '').trim()).filter(Boolean).join(' · '),
      codigo: (v.codigo_barras || '').trim(),
      preco: fmt(v.preco_venda != null ? v.preco_venda : produto.preco_venda) + sufixo,
    }));
  }, [produto]);

  const [copias, setCopias] = useState(() => Object.fromEntries(itens.map(i => [i.chave, i.codigo ? 1 : 0])));
  const [tam, setTam] = useState(() => localStorage.getItem('etiqueta-tamanho') || '50x30');
  const [mostrarPreco, setMostrarPreco] = useState(() => localStorage.getItem('etiqueta-preco') !== 'nao');
  const [medida, setMedida] = useState(() => { try { return JSON.parse(localStorage.getItem('etiqueta-medida')) || { w: '50', h: '30' }; } catch { return { w: '50', h: '30' }; } });
  const [erro, setErro] = useState('');

  const total = itens.reduce((s, i) => s + (i.codigo ? (copias[i.chave] || 0) : 0), 0);

  function ajustar(chave, valor) {
    const n = Math.max(0, Math.min(MAX_COPIAS, parseInt(valor, 10) || 0));
    setCopias(p => ({ ...p, [chave]: n }));
  }
  function todas(n) {
    setCopias(Object.fromEntries(itens.map(i => [i.chave, i.codigo ? n : 0])));
  }

  function imprimir() {
    setErro('');
    const linhas = itens.filter(i => i.codigo && (copias[i.chave] || 0) > 0)
      .map(i => ({ ...i, copias: copias[i.chave] }));
    if (!linhas.length) { setErro('Coloque a quantidade de pelo menos uma etiqueta.'); return; }
    if (total > 1000) { setErro('Máximo de 1000 etiquetas por impressão.'); return; }
    try { localStorage.setItem('etiqueta-tamanho', tam); localStorage.setItem('etiqueta-preco', mostrarPreco ? 'sim' : 'nao'); localStorage.setItem('etiqueta-medida', JSON.stringify(medida)); } catch { /* ignora */ }
    try { imprimirHtml(htmlEtiquetas(linhas, tam, mostrarPreco, medida)); }
    catch { setErro('Não foi possível gerar as etiquetas. Confira se os códigos de barras estão corretos.'); }
  }

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFechar]);

  const semCodigo = itens.filter(i => !i.codigo).length;

  return (
    <div className="prod-modal-overlay" onClick={onFechar}>
      <div className="prod-modal etq-modal" onClick={e => e.stopPropagation()}>
        <h2 className="etq-titulo">🏷️ Imprimir etiquetas</h2>
        <p className="etq-sub">{produto.nome}</p>

        <div className="etq-opcoes">
          <label className="etq-campo">
            <span>Tamanho da etiqueta <Dica texto="Térmica = rolo de etiquetas adesivas (uma por página). Folha A4 = impressora comum, 3 colunas por folha (compre folha de etiqueta adesiva compatível). Na tela de impressão, deixe a escala em 100% e sem margens." /></span>
            <select className="prod-input" value={tam} onChange={e => setTam(e.target.value)}>
              {Object.entries(TAMANHOS).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}
            </select>
          </label>
          {tam === 'custom' && (
            <div className="etq-medida">
              <label>Largura (mm) <input className="prod-input" inputMode="decimal" value={medida.w} onChange={e => setMedida(m => ({ ...m, w: e.target.value }))} /></label>
              <label>Altura (mm) <input className="prod-input" inputMode="decimal" value={medida.h} onChange={e => setMedida(m => ({ ...m, h: e.target.value }))} /></label>
              <small>Meça a etiqueta do seu rolo (de 20 a 150 mm).</small>
            </div>
          )}
          <label className="etq-check">
            <input type="checkbox" checked={mostrarPreco} onChange={e => setMostrarPreco(e.target.checked)} />
            Mostrar preço na etiqueta
          </label>
        </div>

        <div className="etq-lista">
          {itens.map(i => (
            <div key={i.chave} className={`etq-linha${i.codigo ? '' : ' sem-codigo'}`}>
              <div className="etq-info">
                <strong>{i.detalhe || i.nome}</strong>
                <small>{i.codigo ? `${i.codigo} · ${i.preco}` : 'Sem código de barras — gere em Editar produto'}</small>
              </div>
              <input
                type="number" min="0" max={MAX_COPIAS} className="prod-input etq-qtd"
                value={copias[i.chave] ?? 0} disabled={!i.codigo}
                onChange={e => ajustar(i.chave, e.target.value)}
                aria-label={`Quantidade de etiquetas de ${i.detalhe || i.nome}`}
              />
            </div>
          ))}
        </div>

        {itens.length > 1 && (
          <div className="etq-atalhos">
            <button type="button" className="etq-link" onClick={() => todas(1)}>1 de cada</button>
            <button type="button" className="etq-link" onClick={() => todas(0)}>Zerar</button>
            {semCodigo > 0 && <span className="etq-aviso">{semCodigo} sem código</span>}
          </div>
        )}

        {erro && <div className="etq-erro">{erro}</div>}

        <div className="etq-rodape">
          <button type="button" className="prod-modal-btn-cancelar" onClick={onFechar}>Fechar</button>
          <button type="button" className="prod-modal-btn-salvar" onClick={imprimir} disabled={total === 0}>
            🖨️ Imprimir {total > 0 ? `(${total})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
