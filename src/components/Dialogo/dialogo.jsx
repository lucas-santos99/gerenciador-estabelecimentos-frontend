// src/components/Dialogo/dialogo.jsx
// Janelas de confirmação, aviso e pergunta do próprio sistema — no lugar dos
// window.confirm / alert / prompt do navegador (que têm cara de erro, não
// seguem o tema e mostram o endereço do site).
//
//   if (!(await confirmar({ titulo: 'Excluir cliente?', texto: '…', perigo: true, botao: 'Excluir' }))) return;
//   avisar('Erro ao salvar.');                       // não precisa de await
//   const motivo = await perguntar({ titulo: '…', rotulo: 'Motivo (opcional)' });   // null = desistiu
//
// Não precisa montar nada no layout: a janela cria o próprio espaço no <body>
// na primeira vez que é chamada. Teclado igual ao do navegador: Enter confirma,
// Esc cancela. Enquanto a janela está aberta, as teclas não chegam à tela de
// trás (senão o Esc fecharia também o modal que está por baixo).
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './Dialogo.css';

let raiz = null;
let fila = [];          // pedidos esperando (um de cada vez na tela)
let avisarHost = null;  // função do componente que redesenha

function garantirHost() {
  if (raiz) return;
  const el = document.createElement('div');
  el.id = 'dlg-raiz';
  document.body.appendChild(el);
  raiz = createRoot(el);
  raiz.render(<Host />);
}

function abrir(pedido) {
  // Clique duplo no mesmo botão não empilha duas janelas iguais
  const igual = fila.find((p) => p.tipo === pedido.tipo && p.titulo === pedido.titulo && p.texto === pedido.texto);
  if (igual) return igual.promessa;
  const item = { ...pedido, id: Date.now() + Math.random() };
  item.promessa = new Promise((resolve) => { item.resolve = resolve; });
  fila.push(item);
  garantirHost();
  if (avisarHost) avisarHost();
  return item.promessa;
}

function normalizar(opcoes) {
  return typeof opcoes === 'string' ? { texto: opcoes } : (opcoes || {});
}

/** Pergunta de sim/não. Devolve true (confirmou) ou false (cancelou / Esc / clicou fora). */
export function confirmar(opcoes) {
  return abrir({ tipo: 'confirmar', ...normalizar(opcoes) });
}

/** Aviso com um botão só. `opcoes.tom`: 'erro' (padrão), 'info' ou 'ok'. */
export function avisar(opcoes) {
  return abrir({ tipo: 'avisar', ...normalizar(opcoes) });
}

/** Pede um texto. Devolve o texto digitado (pode ser vazio) ou null se a pessoa desistiu. */
export function perguntar(opcoes) {
  return abrir({ tipo: 'perguntar', ...normalizar(opcoes) });
}

const ICONE = { perigo: '⚠️', apagar: '🗑️', confirmar: '❓', erro: '⚠️', info: 'ℹ️', ok: '✅', perguntar: '✏️' };

function Host() {
  const [, redesenhar] = useState(0);
  const [valor, setValor] = useState('');
  const caixaRef = useRef(null);
  const focoAnterior = useRef(null);
  const atual = fila[0] || null;
  const idAtual = atual ? atual.id : null;

  useEffect(() => {
    avisarHost = () => redesenhar((n) => n + 1);
    avisarHost();   // pedido que chegou antes de o componente montar
    return () => { avisarHost = null; };
  }, []);

  function fechar(resposta) {
    const p = fila.shift();
    if (!p) return;
    setValor('');   // a próxima pergunta começa em branco
    redesenhar((n) => n + 1);
    // devolve o foco pra onde estava (navegação por teclado das telas)
    const volta = focoAnterior.current;
    if (!fila.length && volta && document.contains(volta)) {
      try { volta.focus({ preventScroll: true }); } catch { /* sem foco */ }
    }
    p.resolve(resposta);
  }
  const cancelar  = () => fechar(atual.tipo === 'confirmar' ? false : atual.tipo === 'perguntar' ? null : undefined);
  const confirma  = () => fechar(atual.tipo === 'confirmar' ? true : atual.tipo === 'perguntar' ? valor.trim() : undefined);

  // Abriu uma janela nova: guarda o foco, limpa o campo e foca o botão/campo certo
  useEffect(() => {
    if (!idAtual) return;
    if (!focoAnterior.current || !caixaRef.current?.contains(document.activeElement)) {
      focoAnterior.current = document.activeElement;
    }
    if (atual.valorInicial) setValor(atual.valorInicial);
    const t = setTimeout(() => {
      const alvo = caixaRef.current?.querySelector('[data-dlg-foco]');
      if (alvo) alvo.focus();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAtual]);

  // Teclado: tudo fica na janela enquanto ela está aberta
  useEffect(() => {
    if (!idAtual) return;
    function tecla(e) {
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); cancelar(); return; }
      if (e.key === 'Enter') {
        // tecla presa (repetição) não confirma sozinha a janela que acabou de abrir
        if (e.repeat) { e.preventDefault(); return; }
        const el = document.activeElement;
        if (el && el.tagName === 'TEXTAREA' && e.shiftKey) return;   // Shift+Enter = nova linha
        e.preventDefault();
        if (el && el.dataset && el.dataset.dlgCancelar !== undefined) cancelar(); else confirma();
        return;
      }
      if (e.key === 'Tab') {
        const itens = Array.from(caixaRef.current?.querySelectorAll('button, textarea, input') || []);
        if (!itens.length) return;
        e.preventDefault();
        const i = itens.indexOf(document.activeElement);
        const prox = e.shiftKey ? (i <= 0 ? itens.length - 1 : i - 1) : (i === itens.length - 1 ? 0 : i + 1);
        itens[prox].focus();
      }
    }
    const parar = (e) => e.stopImmediatePropagation();
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('keyup', parar, true);
    window.addEventListener('keypress', parar, true);
    return () => {
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('keyup', parar, true);
      window.removeEventListener('keypress', parar, true);
    };
  });

  if (!atual) return null;

  const perigo = !!atual.perigo;
  const tom = atual.tipo === 'avisar' ? (atual.tom || 'erro') : perigo ? 'perigo' : atual.tipo === 'perguntar' ? 'perguntar' : 'confirmar';
  const titulo = atual.titulo
    || (atual.tipo === 'avisar' ? (tom === 'erro' ? 'Não deu certo' : tom === 'ok' ? 'Pronto' : 'Aviso')
      : atual.tipo === 'perguntar' ? 'Informe' : 'Confirmar');
  const txtOk = atual.botao || (atual.tipo === 'avisar' ? 'Entendi' : 'Confirmar');

  return (
    <div className="dlg-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) cancelar(); }}>
      <div className={`dlg-caixa dlg-${tom}`} ref={caixaRef} role={atual.tipo === 'avisar' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="dlg-titulo">
        <div className="dlg-topo">
          <span className="dlg-icone" aria-hidden="true">{atual.icone || (perigo && /^(Excluir|Remover|Apagar)/.test(txtOk) ? ICONE.apagar : ICONE[tom])}</span>
          <h3 className="dlg-titulo" id="dlg-titulo">{titulo}</h3>
        </div>
        {atual.texto && <div className="dlg-texto">{atual.texto}</div>}
        {atual.detalhe && <div className="dlg-detalhe">{atual.detalhe}</div>}
        {atual.tipo === 'perguntar' && (
          <label className="dlg-campo">
            {atual.rotulo && <span className="dlg-rotulo">{atual.rotulo}</span>}
            <textarea
              className="dlg-input" rows={2} data-dlg-foco
              maxLength={atual.maximo || 300}
              placeholder={atual.placeholder || ''}
              value={valor} onChange={(e) => setValor(e.target.value)}
            />
          </label>
        )}
        <div className="dlg-botoes">
          {atual.tipo !== 'avisar' && (
            <button type="button" className="dlg-btn dlg-btn-sec" data-dlg-cancelar onClick={cancelar}>
              {atual.botaoCancelar || 'Cancelar'} <kbd>Esc</kbd>
            </button>
          )}
          <button
            type="button"
            className={`dlg-btn ${perigo ? 'dlg-btn-perigo' : 'dlg-btn-pri'}`}
            {...(atual.tipo !== 'perguntar' ? { 'data-dlg-foco': true } : {})}
            onClick={confirma}
          >
            {txtOk} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
