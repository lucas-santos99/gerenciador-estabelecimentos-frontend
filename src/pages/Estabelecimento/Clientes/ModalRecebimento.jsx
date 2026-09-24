// src/pages/Estabelecimento/Clientes/ModalRecebimento.jsx
//
// Recebimento de fiado — mesmo fluxo e mesmo visual do pagamento do PDV
// (23/09/2026, a pedido do usuário: "é uma área de pagamento também").
// Usado nos dois lugares de Clientes/Fiado:
//   • modo "divida" → botão 💰 Receber do card (valor livre, até a dívida toda);
//   • modo "venda"  → "💰 Pagar esta compra" no detalhe do fiado (valor fixo).
//
// Etapas: forma de pagamento (↑ ↓ Enter) → pagamento (dinheiro com troco,
// Pix pelo sistema com QR Code ou na maquininha, débito/crédito com aviso da
// maquininha) → concluído (resumo + comprovante para imprimir).
//
// Reaproveita as classes do modal de pagamento do PDV importando PDV.css
// explicitamente (convenção "CSS por tela": ou define local, ou importa de
// onde a classe vem). Classes próprias desta tela usam o prefixo cli-rcb-.
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import { identidadeRecibo } from '../../../utils/relatorioIdentidade';
import { TIMEZONE_PADRAO } from '../../../utils/fusoHorario';
import '../PDV/PDV.css';
import '../Clientes.css';

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro',          icone: '💵' },
  { key: 'Pix',      label: 'Pix',               icone: '📱' },
  { key: 'Debito',   label: 'Cartão de Débito',  icone: '💳' },
  { key: 'Credito',  label: 'Cartão de Crédito', icone: '💳' },
];
const MEIO_LABEL = { Dinheiro: '💵 Dinheiro', Pix: '📱 Pix', Debito: '💳 Débito', Credito: '💳 Crédito' };
const MEIO_TEXTO = { Dinheiro: 'Dinheiro', Pix: 'Pix', Debito: 'Débito', Credito: 'Crédito' };

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const arred = (v) => Math.round((parseFloat(v) || 0) * 100) / 100;

// Máscara "tipo calculadora": os dígitos entram da direita pra esquerda e
// a vírgula fica fixa em 2 casas — digita "5350" e já vira "53,50" sozinho.
function digitarValorMascarado(valorBruto) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte "1.234,56" em 1234.56 (nunca só .replace(',', '.')).
function paraFloatBR(valor) {
  return parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
}

// Data + hora no fuso OFICIAL do estabelecimento (não no do navegador).
export function fmtDataHora(iso, timezone = TIMEZONE_PADRAO) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

/* ════════════════════════════════════════════════════════════ */
export default function ModalRecebimento({
  modo = 'divida',
  cliente,
  venda = null,
  estabelecimentoId,
  nomeEstabelecimento,
  timezone = TIMEZONE_PADRAO,
  pixConfig = { modo: 'maquininha', disponivel: false },
  onClose,
  onConcluido,
}) {
  const saldo = arred(Math.max(parseFloat(cliente.saldo_devedor || 0), 0));
  const ehVenda = modo === 'venda' && !!venda;

  // Compra específica: cobra no máximo o que ainda falta da dívida — se
  // parte dela já foi abatida em pagamentos anteriores, sobra menos (ou nada).
  const valorVendaCheio = ehVenda ? arred(venda.valor_total) : 0;
  const valorFixoVenda  = ehVenda ? arred(Math.min(valorVendaCheio, saldo)) : 0;
  const jaQuitadaAntes  = ehVenda && valorFixoVenda <= 0.009;

  const [etapa,         setEtapa]         = useState('meio'); // 'meio' | 'pagamento' | 'concluido'
  const [valorStr,      setValorStr]      = useState(digitarValorMascarado(saldo.toFixed(2)));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [meio,          setMeio]          = useState('Dinheiro');
  const [valorRecebido, setValorRecebido] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [erro,          setErro]          = useState('');
  const [zoom,          setZoom]          = useState(1);
  const [resultado,     setResultado]     = useState(null);

  // Pix pela tela do sistema (BR Code da chave do próprio estabelecimento)
  const [pixModo,     setPixModo]     = useState(pixConfig.modo === 'sistema' && pixConfig.disponivel ? 'sistema' : 'maquininha');
  const [pixDados,    setPixDados]    = useState(null);
  const [gerandoPix,  setGerandoPix]  = useState(false);
  const [pixErro,     setPixErro]     = useState('');
  const [pixRecebido, setPixRecebido] = useState(false);
  const [pixCopiado,  setPixCopiado]  = useState(false);

  const overlayRef       = useRef(null);
  const valorRef         = useRef(null);
  const listaRef         = useRef(null);
  const recebidoRef      = useRef(null);
  const btnConfirmarRef  = useRef(null);
  const pixCheckboxRef   = useRef(null);
  const btnImprimirRef   = useRef(null);
  const btnFecharRef     = useRef(null);
  const comprovanteRef   = useRef(null);

  const valorCobrar = ehVenda ? valorFixoVenda : arred(paraFloatBR(valorStr) || 0);
  const recebidoNum = arred(paraFloatBR(valorRecebido) || 0);
  const troco       = meio === 'Dinheiro' && recebidoNum > valorCobrar ? arred(recebidoNum - valorCobrar) : 0;

  function mudarZoom(delta) {
    setZoom(z => Math.min(1.6, Math.max(0.75, Math.round((z + delta) * 20) / 20)));
  }

  /* ── Foco de cada etapa ───────────────────────────────── */
  useEffect(() => {
    if (etapa === 'meio') {
      setTimeout(() => {
        if (!ehVenda) { valorRef.current?.focus(); valorRef.current?.select(); }
        else if (jaQuitadaAntes) btnConfirmarRef.current?.focus();
        else overlayRef.current?.focus();
      }, 0);
    } else if (etapa === 'pagamento') {
      setTimeout(() => {
        if (meio === 'Dinheiro') { recebidoRef.current?.focus(); recebidoRef.current?.select(); }
        else if (!(meio === 'Pix' && pixModo === 'sistema')) btnConfirmarRef.current?.focus();
      }, 0);
    } else if (etapa === 'concluido') {
      setTimeout(() => btnImprimirRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  useEffect(() => {
    if (!listaRef.current) return;
    listaRef.current.children[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  /* ── Pix pelo sistema: gera ao entrar no pagamento ─────── */
  useEffect(() => {
    if (etapa !== 'pagamento' || meio !== 'Pix' || pixModo !== 'sistema') return;
    gerarPixSistema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, meio, pixModo]);

  // QR pronto → foco no "Confirmo que o Pix caiu" (Enter marca, Enter de novo confirma)
  useEffect(() => {
    if (pixDados && !gerandoPix) setTimeout(() => pixCheckboxRef.current?.focus(), 0);
  }, [pixDados, gerandoPix]);

  async function gerarPixSistema() {
    setGerandoPix(true);
    setPixErro('');
    setPixDados(null);
    setPixRecebido(false);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/pix/gerar`, {
        method: 'POST',
        body:   JSON.stringify({ valor: valorCobrar, descricao: `Recebimento fiado — ${cliente.nome}` }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao gerar Pix.');
      setPixDados(json);
    } catch (e) {
      setPixErro(e.message);
    }
    setGerandoPix(false);
  }

  function copiarPixCopiaECola() {
    if (!pixDados?.payload) return;
    navigator.clipboard?.writeText(pixDados.payload);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2000);
  }

  /* ── Navegação entre etapas ───────────────────────────── */
  function validarValor() {
    if (ehVenda) return true;
    if (!(valorCobrar > 0)) { setErro('Informe o valor a receber.'); valorRef.current?.focus(); return false; }
    if (valorCobrar > saldo + 0.01) { setErro(`O valor não pode passar da dívida (${fmt(saldo)}).`); valorRef.current?.focus(); return false; }
    return true;
  }

  function escolherMeio(idx) {
    setErro('');
    if (!validarValor()) return;
    const key = MEIOS[idx].key;
    setSelectedIndex(idx);
    setMeio(key);
    setPixDados(null); setPixErro(''); setPixRecebido(false);
    if (key === 'Dinheiro') setValorRecebido(digitarValorMascarado(valorCobrar.toFixed(2)));
    setEtapa('pagamento');
  }

  function voltarParaMeio() {
    setErro('');
    setPixDados(null); setPixRecebido(false); setPixErro('');
    setEtapa('meio');
  }

  /* ── Confirmar (grava no backend) ─────────────────────── */
  async function confirmar() {
    if (loading) return;
    setErro('');
    const meioFinal = jaQuitadaAntes ? 'Dinheiro' : meio;

    if (!jaQuitadaAntes) {
      if (!validarValor()) return;
      if (meioFinal === 'Dinheiro' && recebidoNum + 0.001 < valorCobrar) {
        setErro('Valor recebido menor que o valor a pagar.');
        recebidoRef.current?.focus();
        return;
      }
      if (meioFinal === 'Pix' && pixModo === 'sistema' && !pixRecebido) {
        setErro('Confirme que o Pix caiu na conta antes de finalizar.');
        pixCheckboxRef.current?.focus();
        return;
      }
    }

    const extras = {
      valorRecebido: meioFinal === 'Dinheiro' && !jaQuitadaAntes ? recebidoNum : null,
      troco:         meioFinal === 'Dinheiro' && !jaQuitadaAntes ? troco : null,
      pixModo:       meioFinal === 'Pix' ? pixModo : null,
    };

    setLoading(true);
    try {
      const url  = ehVenda ? '/api/clientes/pagar-venda' : '/api/clientes/liquidar';
      const body = ehVenda
        ? { vendaId: venda.venda_id, clienteId: cliente.id, meioPagamento: meioFinal, ...extras }
        : { clienteId: cliente.id, estabelecimentoId, valorPago: valorCobrar, meioPagamento: meioFinal, ...extras };
      const resp = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Erro ao registrar o pagamento.');

      const novoSaldo = data.novo_saldo != null
        ? arred(Math.max(parseFloat(data.novo_saldo), 0))
        : arred(Math.max(saldo - (ehVenda ? valorVendaCheio : valorCobrar), 0));
      setResultado({
        valor:        jaQuitadaAntes ? 0 : valorCobrar,
        meio:         meioFinal,
        quitadaAntes: jaQuitadaAntes,
        recebido:     extras.valorRecebido,
        troco:        extras.troco,
        pixModo:      extras.pixModo,
        dividaAntes:  saldo,
        dividaDepois: novoSaldo,
        horario:      new Date().toISOString(),
      });
      setEtapa('concluido');
      onConcluido?.();
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Teclado ──────────────────────────────────────────── */
  function handleOverlayKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (loading) return;
      if (etapa === 'pagamento') voltarParaMeio();
      else onClose();
      return;
    }
    if (etapa !== 'meio' || jaQuitadaAntes) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p + 1) % MEIOS.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p - 1 + MEIOS.length) % MEIOS.length); }
    else if (e.key === 'Enter') { e.preventDefault(); escolherMeio(selectedIndex); }
  }

  function handleValorKey(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      setErro('');
      if (validarValor()) overlayRef.current?.focus();
    }
  }

  function handleRecebidoKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmar(); }
  }

  function handleConcluidoKey(e, outroRef) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      outroRef.current?.focus();
    }
  }

  /* ── Comprovante (mesmo estilo térmico do recibo do PDV) ─ */
  const idRec = identidadeRecibo();

  function imprimirComprovante() {
    const conteudo = comprovanteRef.current?.innerHTML;
    if (!conteudo) return;
    const alturaJanela = Math.round((window.screen?.availHeight || 900) * 0.92);
    const janela = window.open('', '_blank', `width=480,height=${alturaJanela},top=20,left=100`);
    if (!janela) { setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return; }
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Comprovante de pagamento</title>
          <style>
            @page { size: 80mm auto; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; width: 80mm; padding: 4mm; color: #000; background: #fff; }
            .rec-header { text-align: center; margin-bottom: 8px; }
            .rec-logo { display: block; margin: 0 auto 4px; max-width: 42mm; max-height: 20mm; object-fit: contain; filter: grayscale(1); }
            .rec-nome { font-size: 15px; font-weight: bold; }
            .rec-loja-info { font-size: 9px; color: #333; margin-top: 1px; }
            .rec-data { font-size: 10px; color: #555; margin-top: 2px; }
            .rec-titulo { text-align: center; font-size: 13px; font-weight: bold; margin: 4px 0; letter-spacing: 1px; }
            .rec-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            .rec-item { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
            .rec-item-nome { flex: 1; }
            .rec-item-qtd { color: #555; margin: 0 6px; white-space: nowrap; }
            .rec-item-val { font-weight: bold; white-space: nowrap; }
            .rec-total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 4px; }
            .rec-pagamento { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
            .rec-pagamento-itens { font-size: 9px; color: #555; margin: -2px 0 3px; padding-left: 4px; }
            .rec-assinatura { margin-top: 18px; border-top: 1px solid #000; text-align: center; font-size: 9px; padding-top: 2px; }
            .rec-footer { text-align: center; font-size: 10px; color: #555; margin-top: 8px; }
            .rec-obrigado { font-size: 13px; font-weight: bold; text-align: center; margin: 6px 0 4px; }
          </style>
        </head>
        <body>${conteudo}</body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    setTimeout(() => { janela.print(); janela.close(); }, 300);
  }

  const tituloModal = ehVenda ? '💰 Pagar compra do fiado' : '💰 Receber pagamento';
  const itensVenda  = ehVenda ? (venda.itens || []) : [];

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="pdv-modal-overlay" ref={overlayRef} tabIndex={-1} onKeyDown={handleOverlayKey}>
      <div className="pdv-modal pdv-modal-pagamento cli-rcb-modal" style={{ '--pdv-pag-zoom': zoom }} onClick={e => e.stopPropagation()}>

        <div className="pdv-modal-pagamento-header">
          <div className="pdv-modal-titulo" style={{ marginBottom: 0 }}>{tituloModal}</div>
          <div className="pdv-modal-pagamento-zoom">
            <button type="button" onClick={() => mudarZoom(-0.05)} title="Diminuir">A−</button>
            <button type="button" onClick={() => mudarZoom(0.05)} title="Aumentar">A+</button>
          </div>
        </div>

        {/* ── Etapa concluída ─────────────────────────────── */}
        {etapa === 'concluido' && resultado ? (
          <div className="cli-rcb-concluido">
            <div className="pdv-posv-sucesso">
              <span className="pdv-posv-check">✓</span>
              <div>
                <div className="pdv-posv-titulo">{resultado.quitadaAntes ? 'Compra marcada como quitada!' : 'Pagamento registrado!'}</div>
                <div className="pdv-posv-subtitulo">
                  {resultado.quitadaAntes ? 'Nada a receber — já estava abatida' : `${fmt(resultado.valor)} · ${MEIO_LABEL[resultado.meio] || resultado.meio}`}
                </div>
              </div>
            </div>

            {resultado.meio === 'Dinheiro' && resultado.troco > 0 && (
              <div className="pdv-posv-troco">
                <span className="pdv-posv-troco-label">Troco</span>
                <span className="pdv-posv-troco-valor">{fmt(resultado.troco)}</span>
              </div>
            )}

            <div className="cli-rcb-resumo">
              <div><span>Cliente</span><strong>{cliente.nome}</strong></div>
              <div><span>Dívida antes</span><strong>{fmt(resultado.dividaAntes)}</strong></div>
              <div className={resultado.dividaDepois <= 0.009 ? 'cli-rcb-quitado' : ''}>
                <span>Dívida agora</span>
                <strong>{resultado.dividaDepois <= 0.009 ? '✓ Quitada' : fmt(resultado.dividaDepois)}</strong>
              </div>
            </div>

            <div className="pdv-posv-pergunta">🖨️ Deseja imprimir o comprovante?</div>
            <div className="pdv-ident-pergunta-botoes">
              <button type="button" ref={btnImprimirRef} className="pdv-ident-btn-sim" onClick={imprimirComprovante} onKeyDown={e => handleConcluidoKey(e, btnFecharRef)}>
                🖨️ Sim, imprimir
              </button>
              <button type="button" ref={btnFecharRef} className="pdv-ident-btn-nao" onClick={onClose} onKeyDown={e => handleConcluidoKey(e, btnImprimirRef)}>
                Não, fechar
              </button>
            </div>
            {erro && <div className="pdv-pagamento-erro">⚠️ {erro}</div>}

            {/* Comprovante escondido (vai pra janela de impressão) */}
            <div style={{ display: 'none' }}>
              <div ref={comprovanteRef}>
                <div className="rec-header">
                  {idRec.logoLoja && <img className="rec-logo" src={idRec.logoLoja} alt="" />}
                  <div className="rec-nome">{nomeEstabelecimento || 'Estabelecimento'}</div>
                  {idRec.linhasLoja.map((linha, i) => <div key={i} className="rec-loja-info">{linha}</div>)}
                  <div className="rec-data">{fmtDataHora(resultado.horario, timezone)}</div>
                </div>
                <hr className="rec-divider" />
                <div className="rec-titulo">COMPROVANTE DE PAGAMENTO</div>
                <div className="rec-pagamento"><span>Cliente</span><span>{cliente.nome}</span></div>
                <div className="rec-pagamento">
                  <span>Referente a</span>
                  <span>{ehVenda ? `Compra de ${fmtDataHora(venda.data_venda, timezone)}` : 'Pagamento de fiado'}</span>
                </div>
                {ehVenda && itensVenda.length > 0 && (
                  <>
                    <hr className="rec-divider" />
                    {itensVenda.map((item, i) => (
                      <div key={i} className="rec-item">
                        <span className="rec-item-nome">{item.produto_nome}</span>
                        <span className="rec-item-qtd">
                          {item.unidade_medida === 'kg'
                            ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                            : `${parseFloat(item.quantidade).toFixed(0)}x`}
                        </span>
                        <span className="rec-item-val">{fmt(item.quantidade * item.preco_unitario)}</span>
                      </div>
                    ))}
                    <div className="rec-pagamento"><span>Total da compra</span><span>{fmt(valorVendaCheio)}</span></div>
                    {Math.abs(valorVendaCheio - resultado.valor) > 0.009 && (
                      <div className="rec-pagamento-itens">Parte já abatida em pagamentos anteriores</div>
                    )}
                  </>
                )}
                <hr className="rec-divider" />
                <div className="rec-total-row"><span>VALOR PAGO</span><span>{fmt(resultado.valor)}</span></div>
                {!resultado.quitadaAntes && (
                  <div className="rec-pagamento">
                    <span>Forma</span>
                    <span>{MEIO_TEXTO[resultado.meio] || resultado.meio}{resultado.meio === 'Pix' && resultado.pixModo ? (resultado.pixModo === 'sistema' ? ' (QR Code)' : ' (maquininha)') : ''}</span>
                  </div>
                )}
                {resultado.meio === 'Dinheiro' && resultado.recebido > 0 && (
                  <>
                    <div className="rec-pagamento"><span>Recebido</span><span>{fmt(resultado.recebido)}</span></div>
                    <div className="rec-pagamento"><span>Troco</span><span>{fmt(resultado.troco)}</span></div>
                  </>
                )}
                <hr className="rec-divider" />
                <div className="rec-pagamento"><span>Dívida anterior</span><span>{fmt(resultado.dividaAntes)}</span></div>
                <div className="rec-pagamento"><span>Dívida restante</span><span>{resultado.dividaDepois <= 0.009 ? 'QUITADA' : fmt(resultado.dividaDepois)}</span></div>
                <div className="rec-assinatura">Assinatura</div>
                <hr className="rec-divider" />
                {idRec.mensagem && <div className="rec-obrigado">{idRec.mensagem}</div>}
                {idRec.rodape && <div className="rec-footer">{idRec.rodape}</div>}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ── Total ───────────────────────────────────── */}
            <div className="pdv-pagamento-total">
              <span className="pdv-pagamento-total-label">
                {ehVenda ? 'Valor a pagar desta compra' : `Dívida de ${cliente.nome}`}
              </span>
              <span className="pdv-pagamento-total-valor">{fmt(ehVenda ? valorFixoVenda : saldo)}</span>
              {ehVenda && (
                <span className="cli-rcb-subinfo">
                  {cliente.nome} · compra de {fmtDataHora(venda.data_venda, timezone)}
                  {Math.abs(valorVendaCheio - valorFixoVenda) > 0.009 && (
                    <><br />Compra de {fmt(valorVendaCheio)} — {fmt(arred(valorVendaCheio - valorFixoVenda))} já abatidos em pagamentos anteriores</>
                  )}
                </span>
              )}
              {!ehVenda && etapa === 'pagamento' && (
                <span className="cli-rcb-subinfo">Recebendo agora: <strong>{fmt(valorCobrar)}</strong></span>
              )}
            </div>

            {/* ── Etapa 1: valor + forma de pagamento ─────── */}
            {etapa === 'meio' && (
              jaQuitadaAntes ? (
                <div className="pdv-pagamento-digital">
                  <span className="pdv-pagamento-digital-icone">✅</span>
                  <span className="pdv-pagamento-digital-nome">Nada a receber</span>
                  <span className="pdv-pagamento-digital-hint">
                    O valor desta compra já foi abatido em pagamentos anteriores.<br />
                    Confirme para tirá-la da lista de compras em aberto.
                  </span>
                </div>
              ) : (
                <>
                  {!ehVenda && (
                    <>
                      <span className="pdv-troco-input-label">Valor a receber (R$) — Enter ↵</span>
                      <input
                        ref={valorRef}
                        maxLength={15}
                        className="pdv-troco-input"
                        type="text"
                        inputMode="numeric"
                        value={valorStr}
                        onChange={e => { setErro(''); setValorStr(digitarValorMascarado(e.target.value)); }}
                        onKeyDown={handleValorKey}
                        disabled={loading}
                      />
                      {valorCobrar > 0 && valorCobrar < saldo - 0.009 && (
                        <div className="cli-rcb-parcial">Pagamento parcial — continuam devendo {fmt(arred(saldo - valorCobrar))}</div>
                      )}
                    </>
                  )}
                  <span className="pdv-pagamento-label">Forma de pagamento  ↑ ↓ Enter</span>
                  <ul className="pdv-meios-lista" ref={listaRef}>
                    {MEIOS.map((m, i) => (
                      <li key={m.key} className={`pdv-meio-item${selectedIndex === i ? ' ativo' : ''}`} onClick={() => escolherMeio(i)} onMouseEnter={() => setSelectedIndex(i)}>
                        <span className="pdv-meio-icone">{m.icone}</span>
                        <span style={{ flex: 1 }}>{m.label}</span>
                        {selectedIndex === i && <span className="pdv-meio-enter">↩ Enter</span>}
                      </li>
                    ))}
                  </ul>
                </>
              )
            )}

            {/* ── Etapa 2: pagamento ──────────────────────── */}
            {etapa === 'pagamento' && (
              <div className="pdv-pagamento-conteudo">
                {meio === 'Dinheiro' && (
                  <>
                    <span className="pdv-troco-input-label">Valor recebido (R$)</span>
                    <input
                      ref={recebidoRef}
                      maxLength={15}
                      className="pdv-troco-input"
                      type="text"
                      inputMode="numeric"
                      value={valorRecebido}
                      onChange={e => { setErro(''); setValorRecebido(digitarValorMascarado(e.target.value)); }}
                      onKeyDown={handleRecebidoKey}
                      disabled={loading}
                    />
                    <div className="pdv-troco-display">
                      <span>Troco</span>
                      <strong>{fmt(troco)}</strong>
                    </div>
                  </>
                )}

                {meio === 'Pix' && (
                  <div className="pdv-pagamento-digital">
                    {pixModo === 'maquininha' && (
                      <>
                        <span className="pdv-pagamento-digital-icone">📱</span>
                        <span className="pdv-pagamento-digital-nome">Pix (maquininha)</span>
                        <div className="pdv-pagamento-digital-aviso">
                          <span className="pdv-pagamento-digital-aviso-icone">⚠️</span>
                          Insira <strong>{fmt(valorCobrar)}</strong> na maquininha e finalize o pagamento por lá.<br />
                          Depois, clique em <strong>Confirmar</strong> aqui (ou pressione Enter).
                        </div>
                      </>
                    )}
                    {pixModo === 'sistema' && (
                      <div style={{ width: '100%', textAlign: 'center' }}>
                        {gerandoPix && <div style={{ padding: 'calc(28px * var(--pdv-pag-zoom, 1))', fontSize: 'calc(1.05rem * var(--pdv-pag-zoom, 1))' }}>⏳ Gerando QR Code…</div>}
                        {pixErro && (
                          <div style={{ color: '#dc2626', fontSize: 'calc(1rem * var(--pdv-pag-zoom, 1))', padding: '12px 0' }}>
                            ⚠️ {pixErro}
                            <div style={{ marginTop: 10 }}>
                              <button type="button" onClick={gerarPixSistema} style={{ fontSize: 'calc(0.95rem * var(--pdv-pag-zoom, 1))', padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>Tentar de novo</button>
                            </div>
                          </div>
                        )}
                        {pixDados && !gerandoPix && (
                          <>
                            <img src={pixDados.qrcode_base64} alt="QR Code Pix" style={{ width: 'calc(260px * var(--pdv-pag-zoom, 1))', height: 'calc(260px * var(--pdv-pag-zoom, 1))', margin: '0 auto', display: 'block', borderRadius: 10 }} />
                            <button type="button" onClick={copiarPixCopiaECola}
                              style={{ marginTop: 14, fontSize: 'calc(0.95rem * var(--pdv-pag-zoom, 1))', padding: '9px 20px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                              {pixCopiado ? '✓ Copiado!' : '📋 Copiar Pix Copia e Cola'}
                            </button>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 22, fontSize: 'calc(1.05rem * var(--pdv-pag-zoom, 1))', cursor: 'pointer' }}>
                              <input
                                ref={pixCheckboxRef}
                                type="checkbox"
                                checked={pixRecebido}
                                onChange={e => setPixRecebido(e.target.checked)}
                                style={{ width: 'calc(20px * var(--pdv-pag-zoom, 1))', height: 'calc(20px * var(--pdv-pag-zoom, 1))', cursor: 'pointer' }}
                                onKeyDown={e => {
                                  if (e.key !== 'Enter') return;
                                  e.preventDefault();
                                  if (!pixRecebido) {
                                    setPixRecebido(true);
                                    setTimeout(() => btnConfirmarRef.current?.focus(), 0);
                                  } else {
                                    confirmar();
                                  }
                                }}
                              />
                              Confirmo que o Pix caiu na conta
                            </label>
                          </>
                        )}
                      </div>
                    )}
                    {pixConfig.disponivel && (
                      <button
                        type="button"
                        onClick={() => { setPixModo(m => m === 'sistema' ? 'maquininha' : 'sistema'); setTimeout(() => btnConfirmarRef.current?.focus(), 0); }}
                        style={{ marginTop: 18, fontSize: 'calc(0.9rem * var(--pdv-pag-zoom, 1))', color: '#0f766e', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        {pixModo === 'sistema' ? 'Usar a maquininha em vez disso' : 'Gerar QR Code pelo sistema em vez disso'}
                      </button>
                    )}
                  </div>
                )}

                {['Debito', 'Credito'].includes(meio) && (
                  <div className="pdv-pagamento-digital">
                    <span className="pdv-pagamento-digital-icone">💳</span>
                    <span className="pdv-pagamento-digital-nome">{MEIOS.find(m => m.key === meio)?.label}</span>
                    <div className="pdv-pagamento-digital-aviso">
                      <span className="pdv-pagamento-digital-aviso-icone">⚠️</span>
                      Insira <strong>{fmt(valorCobrar)}</strong> na maquininha e finalize o pagamento por lá.<br />
                      Depois, clique em <strong>Confirmar</strong> aqui (ou pressione Enter).
                    </div>
                  </div>
                )}

                <button type="button" className="pdv-ident-pular cli-rcb-trocar" onClick={voltarParaMeio} disabled={loading}>
                  ← Trocar forma de pagamento (Esc)
                </button>
              </div>
            )}

            {erro && <div className="pdv-pagamento-erro">⚠️ {erro}</div>}

            <div className="pdv-pagamento-acoes">
              <button type="button" className="pdv-btn-cancelar" onClick={onClose} disabled={loading}>Cancelar{etapa === 'meio' ? ' (Esc)' : ''}</button>
              {(etapa === 'pagamento' || jaQuitadaAntes) ? (
                <button type="button" ref={btnConfirmarRef} className="pdv-btn-confirmar" onClick={confirmar} disabled={loading}>
                  {loading ? '⏳ Processando…' : jaQuitadaAntes ? '✓ Marcar como quitada' : `✓ Confirmar ${fmt(valorCobrar)} (Enter)`}
                </button>
              ) : (
                <button type="button" className="pdv-btn-confirmar" onClick={() => escolherMeio(selectedIndex)} disabled={loading}>
                  Continuar → (Enter)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
