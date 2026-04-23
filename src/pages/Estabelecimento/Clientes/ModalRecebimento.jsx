// src/pages/Estabelecimento/Clientes/ModalRecebimento.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../Clientes.css';

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro', icone: '💵' },
  { key: 'Pix',      label: 'Pix',      icone: '📱' },
  { key: 'Debito',   label: 'Débito',   icone: '💳' },
  { key: 'Credito',  label: 'Crédito',  icone: '💳' },
];

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ════════════════════════════════════════════════════════════ */
export default function ModalRecebimento({ cliente, onClose, onConfirmar }) {

  const saldo = parseFloat(cliente.saldo_devedor || 0);

  const [valorPago,     setValorPago]     = useState(
    saldo.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 })
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [meioPagamento, setMeioPagamento] = useState('Dinheiro');
  const [loading,       setLoading]       = useState(false);
  const [erro,          setErro]          = useState('');

  const inputRef    = useRef(null);
  const listaRef    = useRef(null);
  const btnRef      = useRef(null);
  const overlayRef  = useRef(null);

  /* ── Foco inicial ─────────────────────────────────────── */
  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, []);

  /* ── Scroll na lista ──────────────────────────────────── */
  useEffect(() => {
    if (!listaRef.current) return;
    const item = listaRef.current.children[selectedIndex];
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  /* ── Teclado global ───────────────────────────────────── */
  function handleOverlayKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.target === inputRef.current) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(p => (p + 1) % MEIOS.length);
      setMeioPagamento(MEIOS[(selectedIndex + 1) % MEIOS.length].key);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const novo = (selectedIndex - 1 + MEIOS.length) % MEIOS.length;
      setSelectedIndex(novo);
      setMeioPagamento(MEIOS[novo].key);
    } else if (e.key === 'Enter' && document.activeElement === listaRef.current) {
      e.preventDefault();
      btnRef.current?.focus();
    }
  }

  /* ── Teclado no input de valor ────────────────────────── */
  function handleInputKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); listaRef.current?.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); listaRef.current?.focus(); }
  }

  /* ── Confirmar ────────────────────────────────────────── */
  async function confirmar(e) {
    e.preventDefault();
    setErro('');

    const valor = parseFloat(valorPago.toString().replace(',', '.'));
    if (isNaN(valor) || valor <= 0) {
      setErro('Valor inválido.');
      inputRef.current?.focus();
      return;
    }
    if (valor > saldo + 0.01) {
      setErro('Valor não pode exceder a dívida.');
      inputRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await onConfirmar(valor, meioPagamento);
      onClose();
    } catch (err) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div
      className="cli-modal-overlay"
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={handleOverlayKey}
    >
      <div className="cli-modal">

        <div className="cli-modal-titulo">💰 Receber pagamento</div>

        {/* Total da dívida */}
        <div className="cli-receb-total">
          <span className="cli-receb-total-label">Dívida de {cliente.nome}</span>
          <span className="cli-receb-total-valor">{fmt(saldo)}</span>
        </div>

        <form onSubmit={confirmar}>

          {/* Valor a receber */}
          <span className="cli-receb-input-label">Valor a receber (R$)  Enter ↵</span>
          <input
            ref={inputRef}
            className="cli-receb-input"
            type="text"
            value={valorPago}
            onChange={e => setValorPago(e.target.value)}
            onKeyDown={handleInputKey}
            disabled={loading}
          />

          {/* Meio de pagamento */}
          <span className="cli-receb-input-label">Meio de pagamento  ↑ ↓</span>
          <ul
            className="cli-meios-lista"
            ref={listaRef}
            tabIndex={0}
          >
            {MEIOS.map((m, i) => (
              <li
                key={m.key}
                className={`cli-meio-item${selectedIndex === i ? ' ativo' : ''}`}
                onClick={() => {
                  setSelectedIndex(i);
                  setMeioPagamento(m.key);
                  btnRef.current?.focus();
                }}
              >
                <span>{m.icone} {m.label}</span>
                {selectedIndex === i && (
                  <span className="cli-meio-enter">↩ Enter</span>
                )}
              </li>
            ))}
          </ul>

          {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

          <div className="cli-modal-acoes">
            <button
              type="button"
              className="cli-modal-btn-cancelar"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar (Esc)
            </button>
            <button
              ref={btnRef}
              type="submit"
              className="cli-modal-btn-salvar"
              disabled={loading}
            >
              {loading ? '⏳ Processando…' : '✓ Confirmar (Enter)'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}