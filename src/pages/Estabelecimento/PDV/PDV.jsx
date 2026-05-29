// src/pages/Estabelecimento/PDV/PDV.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModalCamera from './ModalCamera';
import { apiFetch } from '../../../utils/api';
import './PDV.css';

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro',          icone: '💵' },
  { key: 'Pix',      label: 'Pix',               icone: '📱' },
  { key: 'Debito',   label: 'Cartão de Débito',  icone: '💳' },
  { key: 'Credito',  label: 'Cartão de Crédito', icone: '💳' },
  { key: 'Fiado',    label: 'Fiado (Na conta)',   icone: '📋' },
];

/* ════════════════════════════════════════════════════════════
   MODAL DE PAGAMENTO
   ════════════════════════════════════════════════════════════ */
function PagamentoModal({ total, onFinalizar, onCancelar, loading }) {

  const [selectedIndex,      setSelectedIndex]      = useState(0);
  const [meioPagamento,      setMeioPagamento]      = useState('Dinheiro');
  const [metodoConfirmado,   setMetodoConfirmado]   = useState(false);
  const [valorRecebido,      setValorRecebido]      = useState('');
  const [troco,              setTroco]              = useState(0);
  const [termoBuscaCliente,  setTermoBuscaCliente]  = useState('');
  const [resultadosCliente,  setResultadosCliente]  = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [loadingCliente,     setLoadingCliente]     = useState(false);
  const [clienteIndex,       setClienteIndex]       = useState(-1);
  const [erro,               setErro]               = useState('');

  const overlayRef       = useRef(null);
  const inputDinheiroRef = useRef(null);
  const inputClienteRef  = useRef(null);
  const btnConfirmarRef  = useRef(null);
  const listaClienteRef  = useRef(null);
  const listaMeiosRef    = useRef(null);

  useEffect(() => {
    if (!metodoConfirmado) overlayRef.current?.focus();
  }, [metodoConfirmado]);

  useEffect(() => {
    if (!metodoConfirmado) return;
    if (meioPagamento === 'Dinheiro') {
      const val = total.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 });
      setValorRecebido(val);
      setTimeout(() => { inputDinheiroRef.current?.focus(); inputDinheiroRef.current?.select(); }, 0);
    } else if (meioPagamento === 'Fiado' && !clienteSelecionado) {
      setTimeout(() => inputClienteRef.current?.focus(), 0);
    } else {
      setTimeout(() => btnConfirmarRef.current?.focus(), 0);
    }
  }, [metodoConfirmado, meioPagamento]);

  useEffect(() => {
    if (meioPagamento !== 'Dinheiro') return;
    const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
    setTroco(recebido >= total ? recebido - total : 0);
  }, [valorRecebido, total, meioPagamento]);

  useEffect(() => {
    if (clienteIndex < 0 || !listaClienteRef.current) return;
    listaClienteRef.current.children[clienteIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [clienteIndex]);

  useEffect(() => {
    if (!listaMeiosRef.current) return;
    listaMeiosRef.current.children[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  async function buscarCliente(termo) {
    setTermoBuscaCliente(termo);
    setClienteIndex(-1);
    setErro('');
    if (termo.length < 2) { setResultadosCliente([]); return; }
    setLoadingCliente(true);
    try {
      const resp = await apiFetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      setResultadosCliente(await resp.json());
    } catch { setErro('Erro ao buscar clientes.'); }
    finally { setLoadingCliente(false); }
  }

  function selecionarCliente(cli) {
    setClienteSelecionado(cli);
    setResultadosCliente([]);
    setTermoBuscaCliente('');
    setTimeout(() => btnConfirmarRef.current?.focus(), 0);
  }

  function confirmarMetodo(key, idx) {
    setMeioPagamento(key);
    setSelectedIndex(idx);
    setMetodoConfirmado(true);
    setErro('');
    if (key !== 'Fiado') setClienteSelecionado(null);
  }

  function confirmarFinal() {
    setErro('');
    if (meioPagamento === 'Fiado') {
      if (!clienteSelecionado?.id) { setErro('Selecione um cliente para o fiado.'); return; }

      const limite = parseFloat(clienteSelecionado.limite_credito || 0);
      const saldoAtual = parseFloat(clienteSelecionado.saldo_devedor || 0);
      const novoSaldo = saldoAtual + total;

      if (limite > 0 && novoSaldo > limite) {
        const limiteStr = fmt(limite);
        const novoStr = fmt(novoSaldo);
        const ok = window.confirm(
          `⚠️ Limite de crédito excedido!\n\nLimite: ${limiteStr}\nNovo saldo após venda: ${novoStr}\n\nDeseja continuar mesmo assim?`
        );
        if (!ok) return;
      }

      onFinalizar('Fiado', clienteSelecionado.id, { clienteNome: clienteSelecionado.nome });
    } else if (meioPagamento === 'Dinheiro') {
      const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
      if (recebido < parseFloat(total.toFixed(2))) { setErro('Valor recebido insuficiente.'); return; }
      onFinalizar('Dinheiro', null, { valorRecebido: recebido, troco });
    } else {
      onFinalizar(meioPagamento, null, {});
    }
  }

  function handleOverlayKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return; }
    if (e.target.tagName === 'INPUT') return;
    if (!metodoConfirmado) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p + 1) % MEIOS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p - 1 + MEIOS.length) % MEIOS.length); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmarMetodo(MEIOS[selectedIndex].key, selectedIndex); }
    }
  }

  function handleDinheiroKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmarFinal(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
  }

  function handleClienteKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onCancelar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setClienteIndex(p => Math.min(p + 1, resultadosCliente.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setClienteIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (clienteIndex > -1 && resultadosCliente[clienteIndex]) selecionarCliente(resultadosCliente[clienteIndex]);
    }
  }

  return (
    <div className="pdv-modal-overlay" ref={overlayRef} tabIndex={-1} onKeyDown={handleOverlayKey}>
      <div className="pdv-modal" onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-titulo">💳 Finalizar Venda</div>
        <div className="pdv-pagamento-total">
          <span className="pdv-pagamento-total-label">Total a pagar</span>
          <span className="pdv-pagamento-total-valor">{fmt(total)}</span>
        </div>
        {!metodoConfirmado && (
          <>
            <span className="pdv-pagamento-label">Forma de pagamento  ↑ ↓ Enter</span>
            <ul className="pdv-meios-lista" ref={listaMeiosRef}>
              {MEIOS.map((m, i) => (
                <li key={m.key} className={`pdv-meio-item${selectedIndex === i ? ' ativo' : ''}`} onClick={() => confirmarMetodo(m.key, i)}>
                  <span className="pdv-meio-icone">{m.icone}</span>
                  <span style={{ flex: 1 }}>{m.label}</span>
                  {selectedIndex === i && <span className="pdv-meio-enter">↩ Enter</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {metodoConfirmado && (
          <div className="pdv-pagamento-conteudo">
            {meioPagamento === 'Dinheiro' && (
              <>
                <span className="pdv-troco-input-label">Valor recebido (R$)</span>
                <input ref={inputDinheiroRef} className="pdv-troco-input" type="text" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} onKeyDown={handleDinheiroKey} />
                <div className="pdv-troco-display">
                  <span>Troco</span>
                  <strong>{fmt(troco)}</strong>
                </div>
              </>
            )}
            {['Pix', 'Debito', 'Credito'].includes(meioPagamento) && (
              <div className="pdv-pagamento-digital">
                <span className="pdv-pagamento-digital-icone">{MEIOS.find(m => m.key === meioPagamento)?.icone}</span>
                <span className="pdv-pagamento-digital-nome">{MEIOS.find(m => m.key === meioPagamento)?.label}</span>
                <span className="pdv-pagamento-digital-hint">Pressione Enter para confirmar</span>
              </div>
            )}
            {meioPagamento === 'Fiado' && (
              <>
                {clienteSelecionado ? (
                  <div className="pdv-cliente-selecionado">
                    <span className="pdv-cliente-selecionado-nome">📋 {clienteSelecionado.nome}</span>
                    <div className="pdv-cliente-selecionado-info">
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Saldo atual</span>
                        <span className="pdv-cliente-info-valor">{fmt(clienteSelecionado.saldo_devedor)}</span>
                      </div>
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Novo saldo</span>
                        <span className="pdv-cliente-info-valor novo-saldo">{fmt((parseFloat(clienteSelecionado.saldo_devedor) || 0) + total)}</span>
                      </div>
                      {parseFloat(clienteSelecionado.limite_credito || 0) > 0 && (
                        <div className="pdv-cliente-info-item">
                          <span className="pdv-cliente-info-label">Limite</span>
                          <span className={`pdv-cliente-info-valor${(parseFloat(clienteSelecionado.saldo_devedor || 0) + total) > parseFloat(clienteSelecionado.limite_credito) ? ' limite-excedido' : ''}`}>
                            {fmt(clienteSelecionado.limite_credito)}
                            {(parseFloat(clienteSelecionado.saldo_devedor || 0) + total) > parseFloat(clienteSelecionado.limite_credito) && ' ⚠️'}
                          </span>
                        </div>
                      )}
                    </div>
                    <button className="pdv-btn-trocar-cliente" onClick={() => setClienteSelecionado(null)}>↩ Trocar cliente</button>
                  </div>
                ) : (
                  <>
                    <input ref={inputClienteRef} className="pdv-cliente-busca-input" type="text" placeholder="Buscar cliente por nome ou telefone…" value={termoBuscaCliente} onChange={e => buscarCliente(e.target.value)} onKeyDown={handleClienteKey} />
                    {loadingCliente && <div style={{ fontSize: '0.78rem', color: 'var(--est-text-muted)', marginBottom: 6 }}>Buscando…</div>}
                    {resultadosCliente.length > 0 && (
                      <ul className="pdv-cliente-lista" ref={listaClienteRef}>
                        {resultadosCliente.map((cli, i) => (
                          <li key={cli.id} className={`pdv-cliente-item${clienteIndex === i ? ' ativo' : ''}`} onClick={() => selecionarCliente(cli)} onMouseEnter={() => setClienteIndex(i)}>
                            {cli.nome}
                            <span className="pdv-cliente-item-tel">{cli.telefone || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
        {erro && <div className="pdv-pagamento-erro">⚠️ {erro}</div>}
        <div className="pdv-pagamento-acoes">
          <button className="pdv-btn-cancelar" onClick={onCancelar} disabled={loading}>Cancelar (Esc)</button>
          <button ref={btnConfirmarRef} className="pdv-btn-confirmar" onClick={confirmarFinal} disabled={loading || !metodoConfirmado}>
            {loading ? '⏳ Processando…' : '✓ Confirmar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL PÓS-VENDA — pergunta se quer imprimir
   ════════════════════════════════════════════════════════════ */
function ModalPosVenda({ venda, nomeEstabelecimento, onFechar }) {
  const reciboRef    = useRef(null);
  const btnImpRef    = useRef(null);
  const overlayRef   = useRef(null);

  useEffect(() => {
    setTimeout(() => btnImpRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
      if (e.key === 'Enter')  { e.preventDefault(); imprimir(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  const meioLabel = {
    Dinheiro: '💵 Dinheiro',
    Pix:      '📱 Pix',
    Debito:   '💳 Débito',
    Credito:  '💳 Crédito',
    Fiado:    '📋 Fiado',
  }[venda.meioPagamento] || venda.meioPagamento;

  function imprimir() {
    const conteudo = reciboRef.current?.innerHTML;
    if (!conteudo) return;
    const janela = window.open('', '_blank', 'width=400,height=600');
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Recibo</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              width: 80mm;
              padding: 4mm;
              color: #000;
              background: #fff;
            }
            .rec-header { text-align: center; margin-bottom: 8px; }
            .rec-nome { font-size: 15px; font-weight: bold; }
            .rec-data { font-size: 10px; color: #555; margin-top: 2px; }
            .rec-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            .rec-item { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
            .rec-item-nome { flex: 1; }
            .rec-item-qtd { color: #555; margin: 0 6px; white-space: nowrap; }
            .rec-item-val { font-weight: bold; white-space: nowrap; }
            .rec-total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 4px; }
            .rec-pagamento { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
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

  const horarioStr = venda.horario.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="pdv-modal-overlay">
      <div className="pdv-posv-modal" onClick={e => e.stopPropagation()}>

        <div className="pdv-posv-sucesso">
          <span className="pdv-posv-check">✓</span>
          <div>
            <div className="pdv-posv-titulo">Venda registrada!</div>
            <div className="pdv-posv-subtitulo">{fmt(venda.total)} · {meioLabel}</div>
          </div>
        </div>

        {venda.meioPagamento === 'Dinheiro' && venda.troco > 0 && (
          <div className="pdv-posv-troco">
            <span className="pdv-posv-troco-label">Troco</span>
            <span className="pdv-posv-troco-valor">{fmt(venda.troco)}</span>
          </div>
        )}

        {venda.meioPagamento === 'Fiado' && venda.clienteNome && (
          <div className="pdv-posv-fiado">
            📋 Lançado no fiado de <strong>{venda.clienteNome}</strong>
          </div>
        )}

        <div className="pdv-posv-pergunta">
          🖨️ Deseja imprimir o recibo?
        </div>

        <div className="pdv-posv-acoes">
          <button className="pdv-posv-btn-fechar" onClick={onFechar}>
            Fechar <span className="pdv-posv-hint">Esc</span>
          </button>
          <button ref={btnImpRef} className="pdv-posv-btn-imprimir" onClick={imprimir}>
            🖨️ Imprimir recibo <span className="pdv-posv-hint">Enter</span>
          </button>
        </div>

        <div style={{ display: 'none' }}>
          <div ref={reciboRef}>
            <div className="rec-header">
              <div className="rec-nome">{nomeEstabelecimento || 'Estabelecimento'}</div>
              <div className="rec-data">{horarioStr}</div>
            </div>
            <hr className="rec-divider" />
            {venda.itens.map((item, i) => (
              <div key={i} className="rec-item">
                <span className="rec-item-nome">{item.nome}</span>
                <span className="rec-item-qtd">
                  {item.unidade_medida === 'kg'
                    ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                    : `${parseFloat(item.quantidade).toFixed(0)}x`
                  }
                </span>
                <span className="rec-item-val">{fmt(item.preco_venda * item.quantidade)}</span>
              </div>
            ))}
            <hr className="rec-divider" />
            <div className="rec-total-row">
              <span>TOTAL</span>
              <span>{fmt(venda.total)}</span>
            </div>
            <div className="rec-pagamento">
              <span>Pagamento</span>
              <span>{venda.meioPagamento}</span>
            </div>
            {venda.meioPagamento === 'Dinheiro' && venda.valorRecebido && (
              <>
                <div className="rec-pagamento">
                  <span>Recebido</span>
                  <span>{fmt(venda.valorRecebido)}</span>
                </div>
                <div className="rec-pagamento">
                  <span>Troco</span>
                  <span>{fmt(venda.troco)}</span>
                </div>
              </>
            )}
            {venda.meioPagamento === 'Fiado' && venda.clienteNome && (
              <div className="rec-pagamento">
                <span>Cliente</span>
                <span>{venda.clienteNome}</span>
              </div>
            )}
            <hr className="rec-divider" />
            <div className="rec-obrigado">Obrigado!</div>
            <div className="rec-footer">Lucas J. Systems</div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL — PDV
   ════════════════════════════════════════════════════════════ */
export default function PDV({ estabelecimentoId, nomeEstabelecimento, onNavegar }) {
  const [termoBusca,      setTermoBusca]      = useState('');
  const [resultados,      setResultados]      = useState([]);
  const [carrinho,        setCarrinho]        = useState([]);
  const [total,           setTotal]           = useState(0);
  const [loadingBusca,    setLoadingBusca]    = useState(false);
  const [loadingVenda,    setLoadingVenda]    = useState(false);
  const [vendaStatus,     setVendaStatus]     = useState(null);
  const [telaCheia,       setTelaCheia]       = useState(false);
  const [fontScale,       setFontScale]       = useState(() => {
    const saved = localStorage.getItem('pdv-font-scale');
    return saved ? parseFloat(saved) : 1;
  });
  const [buscaIndex,      setBuscaIndex]      = useState(-1);
  const [itemQuantificar, setItemQuantificar] = useState(null);
  const [inputQtd,        setInputQtd]        = useState('1');
  const [editIndex,       setEditIndex]       = useState(null);
  const [showPagamento,   setShowPagamento]   = useState(false);
  const [vendaFinalizada, setVendaFinalizada] = useState(null);
  const [showCamera,      setShowCamera]      = useState(false);
  const [confirmSaida,    setConfirmSaida]    = useState(false);  // confirmação de saída com carrinho cheio
  const [confirmRemover,  setConfirmRemover]  = useState(null);   // idx do item a remover

  const inputBuscaRef   = useRef(null);
  const inputQtdRef     = useRef(null);
  const btnFinalizarRef = useRef(null);
  const resultadosRef   = useRef(null);

  // ── Bipador USB: detecção por timing ─────────────────────
  // O bipador digita tudo muito rápido (< 50ms por tecla).
  // Acumulamos as teclas; se o intervalo médio for de bipador
  // e o comprimento mínimo for atingido, disparamos a busca.
  const barcodeBufferRef    = useRef('');
  const barcodeLastTimeRef  = useRef(0);
  const barcodeTimerRef     = useRef(null);

  const BARCODE_MAX_INTERVAL = 50;   // ms máximo entre teclas de bipador
  const BARCODE_MIN_LENGTH   = 6;    // mínimo de chars para considerar código
  const BARCODE_FLUSH_DELAY  = 100;  // ms de silêncio antes de disparar

  const dispararBuscaBipador = useCallback((codigo) => {
    if (!codigo || codigo.length < BARCODE_MIN_LENGTH) return;
    buscarProdutosPorCodigo(codigo.trim());
  }, [estabelecimentoId]);

  function handleBuscaKeyDown(e) {
    const agora = Date.now();
    const intervalo = agora - barcodeLastTimeRef.current;
    barcodeLastTimeRef.current = agora;

    // Teclas de navegação da lista — passa direto para o handler normal
    if (e.key === 'ArrowDown') { e.preventDefault(); setBuscaIndex(p => Math.min(p + 1, resultados.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setBuscaIndex(p => Math.max(p - 1, 0)); return; }
    if (e.key === 'Escape')    { setTermoBusca(''); setResultados([]); setBuscaIndex(-1); barcodeBufferRef.current = ''; return; }

    // Enter: pode vir do bipador (finaliza sequência) ou do usuário
    if (e.key === 'Enter') {
      e.preventDefault();
      const buffer = barcodeBufferRef.current;
      if (buffer.length >= BARCODE_MIN_LENGTH && intervalo < BARCODE_MAX_INTERVAL * 3) {
        // Enter vindo do bipador logo após uma sequência rápida
        clearTimeout(barcodeTimerRef.current);
        barcodeBufferRef.current = '';
        dispararBuscaBipador(buffer);
      } else {
        // Enter normal do usuário
        barcodeBufferRef.current = '';
        if (buscaIndex > -1 && resultados[buscaIndex]) selecionarProduto(resultados[buscaIndex]);
        else if (!termoBusca.trim() && carrinho.length > 0) btnFinalizarRef.current?.focus();
      }
      return;
    }

    // Caracteres imprimíveis — verificar se é sequência de bipador
    if (e.key.length === 1) {
      if (intervalo < BARCODE_MAX_INTERVAL) {
        // Rápido demais para digitação humana → acumular no buffer do bipador
        barcodeBufferRef.current += e.key;

        // Cancelar timer anterior e reagendar
        clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          const codigo = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          dispararBuscaBipador(codigo);
        }, BARCODE_FLUSH_DELAY);
      } else {
        // Intervalo longo = digitação humana normal; limpar buffer de bipador
        barcodeBufferRef.current = e.key;
      }
    }
  }

  // ── Busca por código de barras exato ─────────────────────
  async function buscarProdutosPorCodigo(codigo) {
    if (!estabelecimentoId) return;
    setTermoBusca(codigo);
    setLoadingBusca(true);
    setBuscaIndex(-1);
    try {
      const resp = await apiFetch(
        `/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(codigo)}`
      );
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setResultados(data);

      // Se retornar exatamente 1 produto, selecionar automaticamente
      if (data.length === 1) {
        setTimeout(() => {
          selecionarProduto(data[0]);
        }, 120);
      } else if (data.length > 1) {
        setBuscaIndex(0);
      } else {
        mostrarStatus('erro', `Código "${codigo}" não encontrado.`);
        limparBusca();
      }
    } catch {
      setResultados([]);
      mostrarStatus('erro', 'Erro ao buscar produto por código.');
    } finally {
      setLoadingBusca(false);
    }
  }

  // ── Callback do modal de câmera ───────────────────────────
  function handleCodigoDetectado(codigo) {
    setShowCamera(false);
    buscarProdutosPorCodigo(codigo);
  }

  useEffect(() => {
    if (!showPagamento && !itemQuantificar && editIndex === null && !showCamera) {
      inputBuscaRef.current?.focus();
    }
  }, [showPagamento, itemQuantificar, editIndex, showCamera]);

  // Atalhos globais do PDV
  useEffect(() => {
    function handleGlobalKey(e) {
      if (e.key === 'Escape') {
        if (confirmRemover !== null) { setConfirmRemover(null); return; }
        if (confirmSaida)            { setConfirmSaida(false);  return; }
      }
      if ((e.key === 'F10' || e.key === 'F2') && !showPagamento && !itemQuantificar && !showCamera && carrinho.length > 0) {
        e.preventDefault();
        setShowPagamento(true);
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setTelaCheia(p => !p);
        return;
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [showPagamento, itemQuantificar, showCamera, carrinho]);

  // Confirmação ao fechar aba/navegar com carrinho cheio
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (carrinho.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [carrinho]);

  // Expõe interceptor de navegação para o painel pai
  // O pai registra uma função; o PDV a preenche com o interceptor atual
  const navegacaoPendenteRef = React.useRef(null);

  useEffect(() => {
    if (!onNavegar) return;
    onNavegar((abaDestino) => {
      if (carrinho.length === 0) return true;  // carrinho vazio — pode navegar
      navegacaoPendenteRef.current = abaDestino;
      setConfirmSaida(true);
      return false; // bloquear — modal decide
    });
  }, [onNavegar, carrinho]);

  useEffect(() => {
    if (itemQuantificar) {
      setTimeout(() => {
        inputQtdRef.current?.focus();
        inputQtdRef.current?.select();
      }, 50);
    }
  }, [itemQuantificar]);

  useEffect(() => {
    setTotal(carrinho.reduce((acc, item) => acc + parseFloat(item.preco_venda) * item.quantidade, 0));
  }, [carrinho]);

  useEffect(() => {
    if (buscaIndex < 0 || !resultadosRef.current) return;
    resultadosRef.current.children[buscaIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [buscaIndex]);

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('pdv-font-scale', next);
      return next;
    });
  }

  async function buscarProdutos(termo) {
    setTermoBusca(termo);
    setBuscaIndex(-1);
    if (!estabelecimentoId || termo.length < 2) { setResultados([]); return; }
    setLoadingBusca(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setResultados(data);
      if (data.length > 0) setBuscaIndex(0);
    } catch { setResultados([]); }
    finally { setLoadingBusca(false); }
  }

  function selecionarProduto(produto) {
    const estoque = parseFloat(produto.estoque_atual);
    if (estoque <= 0) { mostrarStatus('erro', `"${produto.nome}" sem estoque!`); limparBusca(); return; }
    const qtdNoCarrinho = carrinho.filter(i => i.id === produto.id).reduce((acc, i) => acc + i.quantidade, 0);
    if (produto.unidade_medida !== 'kg' && qtdNoCarrinho + 1 > estoque) {
      mostrarStatus('erro', `Estoque máximo de "${produto.nome}" (${estoque} un.) atingido.`);
      limparBusca(); return;
    }
    setInputQtd(produto.unidade_medida === 'kg' ? '1.000' : '1');
    setItemQuantificar(produto);
    setEditIndex(null);
    limparBusca();
  }

  function limparBusca() {
    setTermoBusca(''); setResultados([]); setBuscaIndex(-1);
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  function confirmarQuantidade(e) {
    e?.preventDefault();
    const produto = itemQuantificar;
    const qtd     = parseFloat(inputQtd) || 0;
    if (qtd <= 0) { fecharModalQtd(); return; }
    const estoque = parseFloat(produto.estoque_atual);
    if (editIndex !== null) {
      const outrasQtds = carrinho.filter((item, idx) => item.id === produto.id && idx !== editIndex).reduce((acc, i) => acc + i.quantidade, 0);
      if (outrasQtds + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${produto.unidade_medida}`); return; }
      const novo = [...carrinho]; novo[editIndex] = { ...produto, quantidade: qtd }; setCarrinho(novo);
    } else {
      const qtdJa = carrinho.filter(i => i.id === produto.id).reduce((acc, i) => acc + i.quantidade, 0);
      if (qtdJa + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${produto.unidade_medida}`); return; }
      setCarrinho(prev => [...prev, { ...produto, quantidade: qtd }]);
    }
    fecharModalQtd();
  }

  function fecharModalQtd() {
    setItemQuantificar(null); setEditIndex(null); setInputQtd('1');
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  function editarItem(item, idx) {
    setInputQtd(item.unidade_medida === 'kg' ? parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : String(parseFloat(item.quantidade)));
    setItemQuantificar(item); setEditIndex(idx);
  }

  function removerItem(idx) { setConfirmRemover(idx); }

  async function finalizarVenda(meioPagamento, clienteId, dadosPagamento) {
    setLoadingVenda(true); setVendaStatus(null);
    try {
      const resp = await apiFetch(`/api/vendas/finalizar`, {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId, valor_total: total, meio_pagamento: meioPagamento,
          carrinho: carrinho.map(i => ({ produto_id: i.id, quantidade: parseFloat(i.quantidade), valor_unitario: parseFloat(i.preco_venda) })),
          clienteId,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error?.includes('check constraint') ? 'Falha de estoque. Verifique as quantidades.' : result.error || 'Erro no servidor.');

      setVendaFinalizada({
        itens:         carrinho,
        total,
        meioPagamento,
        clienteId,
        clienteNome:   dadosPagamento?.clienteNome || null,
        valorRecebido: dadosPagamento?.valorRecebido || null,
        troco:         dadosPagamento?.troco || 0,
        horario:       new Date(),
      });

      setCarrinho([]);
      setShowPagamento(false);
    } catch (err) {
      mostrarStatus('erro', `Falha: ${err.message}`); setShowPagamento(false);
    } finally { setLoadingVenda(false); }
  }

  function mostrarStatus(tipo, msg) { setVendaStatus({ tipo, msg }); setTimeout(() => setVendaStatus(null), 4000); }

  function estoqueClass(p) {
    const e = parseFloat(p.estoque_atual), m = parseFloat(p.estoque_minimo);
    if (e <= 0) return 'critico'; if (e <= m) return 'baixo'; return '';
  }

  function estoqueLabel(p) {
    const e = parseFloat(p.estoque_atual);
    return p.unidade_medida === 'kg' ? `${e.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : `${Math.trunc(e)} un`;
  }

  return (
    <div className={`pdv-container${telaCheia ? ' pdv-tela-cheia' : ''}`}>
      {/* Modal de câmera */}
      {showCamera && (
        <ModalCamera
          onCodigoDetectado={handleCodigoDetectado}
          onFechar={() => setShowCamera(false)}
        />
      )}

      {/* Modal confirmação — sair com carrinho cheio */}
      {confirmSaida && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal pdv-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="pdv-confirm-icone">🛒</div>
            <div className="pdv-confirm-titulo">Carrinho não finalizado</div>
            <div className="pdv-confirm-desc">
              Você tem <strong>{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</strong> no carrinho ({fmt(total)}).
              <br />Se sair agora, o carrinho será perdido.
            </div>
            <div className="pdv-modal-acoes">
              <button
                className="pdv-modal-btn-cancelar"
                onClick={() => setConfirmSaida(false)}
              >
                Voltar ao PDV
              </button>
              <button
                className="pdv-modal-btn-confirmar pdv-modal-btn-danger"
                onClick={() => {
                  setConfirmSaida(false);
                  setCarrinho([]);
                  // Retomar a navegação bloqueada
                  if (navegacaoPendenteRef.current && onNavegar) {
                    const aba = navegacaoPendenteRef.current;
                    navegacaoPendenteRef.current = null;
                    // Re-registrar interceptor com carrinho vazio antes de navegar
                    onNavegar(() => true);
                    // Disparar a troca de aba via evento customizado
                    window.dispatchEvent(new CustomEvent('pdv-navegar', { detail: aba }));
                  }
                }}
              >
                Sair e descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmação — remover item do carrinho */}
      {confirmRemover !== null && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal pdv-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="pdv-confirm-icone">🗑️</div>
            <div className="pdv-confirm-titulo">Remover item?</div>
            <div className="pdv-confirm-desc">
              <strong>{carrinho[confirmRemover]?.nome}</strong>
              {carrinho[confirmRemover]?.marca && <span> · {carrinho[confirmRemover].marca}</span>}
              <br />será removido do carrinho.
            </div>
            <div className="pdv-modal-acoes">
              <button
                className="pdv-modal-btn-cancelar"
                onClick={() => setConfirmRemover(null)}
              >
                Cancelar (Esc)
              </button>
              <button
                className="pdv-modal-btn-confirmar pdv-modal-btn-danger"
                onClick={() => {
                  setCarrinho(prev => prev.filter((_, i) => i !== confirmRemover));
                  setConfirmRemover(null);
                }}
              >
                ✕ Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de quantidade */}
      {itemQuantificar && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <div className="pdv-modal-qtd-titulo">{editIndex !== null ? '✏️ Editar item' : '➕ Adicionar item'}</div>
            <div className="pdv-modal-qtd-produto">{itemQuantificar.nome}{itemQuantificar.marca && <span className="pdv-modal-qtd-marca"> · {itemQuantificar.marca}</span>}{' — '}<strong>{fmt(itemQuantificar.preco_venda)}</strong>{' / '}{itemQuantificar.unidade_medida}</div>
            <form onSubmit={confirmarQuantidade}>
              <label className="pdv-modal-qtd-label">{itemQuantificar.unidade_medida === 'kg' ? 'Peso (kg)' : 'Quantidade (un)'}</label>
              <input ref={inputQtdRef} className="pdv-modal-qtd-input" type="number" step={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'} min={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'} value={inputQtd} onChange={e => setInputQtd(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fecharModalQtd(); } }} />
              <div className="pdv-modal-acoes">
                <button type="button" className="pdv-modal-btn-cancelar" onClick={fecharModalQtd}>Cancelar (Esc)</button>
                <button type="submit" className="pdv-modal-btn-confirmar">{editIndex !== null ? '✓ Atualizar (Enter)' : '✓ Adicionar (Enter)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPagamento && <PagamentoModal total={total} onCancelar={() => setShowPagamento(false)} onFinalizar={finalizarVenda} loading={loadingVenda} />}

      {vendaFinalizada && (
        <ModalPosVenda
          venda={vendaFinalizada}
          nomeEstabelecimento={nomeEstabelecimento}
          onFechar={() => {
            setVendaFinalizada(null);
            mostrarStatus('sucesso', `✓ Venda de ${fmt(vendaFinalizada.total)} registrada!`);
          }}
        />
      )}

      <div className="pdv-busca">
        <div className="pdv-busca-row">
          <input
            ref={inputBuscaRef}
            className="pdv-busca-input"
            type="text"
            placeholder="🔍  Nome ou código de barras… (↑ ↓ Enter)"
            value={termoBusca}
            onChange={e => buscarProdutos(e.target.value)}
            onKeyDown={handleBuscaKeyDown}
            disabled={loadingVenda}
            autoComplete="off"
          />
          <button
            className="pdv-btn-camera pdv-btn-camera--desktop-only"
            onClick={() => setShowCamera(true)}
            disabled={loadingVenda}
            title="Ler código de barras pela câmera"
            type="button"
          >
            📷
          </button>
        </div>
        <ul className="pdv-resultados" ref={resultadosRef}>
          {loadingBusca && <li className="pdv-resultados-status"><span>⏳</span>Buscando…</li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length > 1 && <li className="pdv-resultados-status"><span>🔍</span>Nenhum produto encontrado para<br /><strong>"{termoBusca}"</strong></li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length <= 1 && <li className="pdv-resultados-status"><span>🛒</span>Digite o nome ou código do produto</li>}
          {resultados.map((p, i) => (
            <li key={p.id} className={`pdv-produto-card${buscaIndex === i ? ' selecionado' : ''}`} onClick={() => selecionarProduto(p)} onMouseEnter={() => setBuscaIndex(i)}>
              <span className="pdv-card-nome">{p.nome}{p.marca ? <span className="pdv-card-marca"> — {p.marca}</span> : ''}</span>
              <span className="pdv-card-preco">{fmt(p.preco_venda)}</span>
              <span className={`pdv-card-estoque ${estoqueClass(p)}`}>{estoqueLabel(p)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pdv-carrinho" style={{ '--pdv-font-scale': fontScale }}>
        <div className="pdv-carrinho-header">
          <span className="pdv-carrinho-titulo">Resumo da Venda</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {carrinho.length > 0 && <span className="pdv-carrinho-count">{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</span>}
            <button
              className="pdv-zoom-btn"
              onClick={() => changeFontScale(-0.1)}
              disabled={fontScale <= 0.8}
              title="Diminuir fonte"
            >A−</button>
            <button
              className="pdv-zoom-btn"
              onClick={() => changeFontScale(0.1)}
              disabled={fontScale >= 1.6}
              title="Aumentar fonte"
            >A+</button>
            <button
              className="pdv-zoom-btn pdv-btn-tela-cheia"
              onClick={() => setTelaCheia(p => !p)}
              title={telaCheia ? 'Sair da tela cheia (F11)' : 'Tela cheia (F11)'}
            >{telaCheia ? '⊠ Sair' : '⊞ Tela Cheia'}</button>
          </div>
        </div>
        {vendaStatus && <div className={`pdv-status ${vendaStatus.tipo}`}>{vendaStatus.msg}</div>}
        <ul className="pdv-carrinho-lista">
          {carrinho.length === 0 ? (
            <li className="pdv-carrinho-vazio"><span className="pdv-carrinho-vazio-icon">🛒</span><p>Carrinho vazio</p><small>Busque e selecione produtos ao lado</small></li>
          ) : (
            carrinho.map((item, idx) => (
              <li key={`${item.id}-${idx}`} className="pdv-item">
                <div className="pdv-item-info" onClick={() => editarItem(item, idx)}>
                  <span className="pdv-item-nome">{item.nome}{item.marca ? <span className="pdv-item-marca"> · {item.marca}</span> : ''}</span>
                  <span className="pdv-item-qtde">{item.unidade_medida === 'kg' ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : `${parseFloat(item.quantidade).toFixed(0)} un`}{' @ '}{fmt(item.preco_venda)}</span>
                </div>
                <span className="pdv-item-total">{fmt(item.preco_venda * item.quantidade)}</span>
                <button className="pdv-item-remover" onClick={() => removerItem(idx)}>×</button>
              </li>
            ))
          )}
        </ul>
        <div className="pdv-footer">
          <div className="pdv-total">
            <span className="pdv-total-label">Total</span>
            <span className="pdv-total-valor">{fmt(total)}</span>
          </div>
          <button ref={btnFinalizarRef} className="pdv-btn-finalizar" onClick={() => setShowPagamento(true)} disabled={carrinho.length === 0 || loadingVenda} title="F10 ou F2">
            {loadingVenda ? '⏳ Processando…' : `✓ Finalizar Venda${carrinho.length > 0 ? ' (F10)' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}