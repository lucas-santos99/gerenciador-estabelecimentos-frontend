// src/pages/Estabelecimento/Clientes/ModalRecebimento.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import '../Clientes.css';

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro', icone: '💵' },
  { key: 'Pix',      label: 'Pix',      icone: '📱' },
  { key: 'Debito',   label: 'Débito',   icone: '💳' },
  { key: 'Credito',  label: 'Crédito',  icone: '💳' },
];

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Máscara "tipo calculadora": os dígitos entram da direita pra esquerda e
// a vírgula fica fixa em 2 casas — digita "5350" e já vira "53,50" sozinho.
function digitarValorMascarado(valorBruto) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte um número no formato brasileiro (com ponto de milhar e vírgula
// decimal) pra float de verdade — usar sempre no lugar de um simples
// .replace(',', '.'), que quebra se tiver ponto de milhar no meio.
function paraFloatBR(valor) {
  return parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
}

/* ════════════════════════════════════════════════════════════ */
export default function ModalRecebimento({ cliente, onClose, onConfirmar, estabelecimentoId, pixConfig = { modo: 'maquininha', disponivel: false } }) {

  const saldo = parseFloat(cliente.saldo_devedor || 0);

  const [valorPago,     setValorPago]     = useState(
    saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [meioPagamento, setMeioPagamento] = useState('Dinheiro');
  const [loading,       setLoading]       = useState(false);
  const [erro,          setErro]          = useState('');

  // Pix pela tela do sistema
  const [pixModo,     setPixModo]     = useState(pixConfig.modo === 'sistema' && pixConfig.disponivel ? 'sistema' : 'maquininha');
  const [pixDados,    setPixDados]    = useState(null);
  const [gerandoPix,  setGerandoPix]  = useState(false);
  const [pixErro,     setPixErro]     = useState('');
  const [pixRecebido, setPixRecebido] = useState(false);
  const [pixCopiado,  setPixCopiado]  = useState(false);

  const inputRef    = useRef(null);
  const listaRef    = useRef(null);
  const btnRef      = useRef(null);
  const overlayRef  = useRef(null);

  /* ── Foco inicial ─────────────────────────────────────── */
  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, []);

  /* ── Gera o Pix quando o meio selecionado é Pix-sistema ──── */
  useEffect(() => {
    if (meioPagamento !== 'Pix' || pixModo !== 'sistema') return;
    gerarPixSistema();
  }, [meioPagamento, pixModo]);

  async function gerarPixSistema() {
    const valor = paraFloatBR(valorPago);
    if (isNaN(valor) || valor <= 0) return;
    setGerandoPix(true);
    setPixErro('');
    setPixDados(null);
    setPixRecebido(false);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/pix/gerar`, {
        method: 'POST',
        body:   JSON.stringify({ valor, descricao: `Recebimento fiado — ${cliente.nome}` }),
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

    const valor = paraFloatBR(valorPago);
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
    if (meioPagamento === 'Pix' && pixModo === 'sistema' && !pixRecebido) {
      setErro('Confirme que o Pix foi recebido antes de finalizar.');
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
            onChange={e => setValorPago(digitarValorMascarado(e.target.value))}
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

          {meioPagamento === 'Pix' && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              {pixModo === 'maquininha' && (
                <div style={{ fontSize: '0.82rem', color: 'var(--cli-text-muted, #64748b)' }}>
                  📱 Pix pela maquininha — confirme normalmente
                </div>
              )}
              {pixModo === 'sistema' && (
                <>
                  {gerandoPix && <div style={{ padding: 12 }}>⏳ Gerando QR Code…</div>}
                  {pixErro && (
                    <div style={{ color: '#dc2626', fontSize: '0.82rem', padding: '8px 0' }}>
                      ⚠️ {pixErro}
                      <div style={{ marginTop: 6 }}>
                        <button type="button" onClick={gerarPixSistema} style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>Tentar de novo</button>
                      </div>
                    </div>
                  )}
                  {pixDados && !gerandoPix && (
                    <>
                      <img src={pixDados.qrcode_base64} alt="QR Code Pix" style={{ width: 160, height: 160, margin: '0 auto', display: 'block', borderRadius: 8 }} />
                      <button type="button" onClick={copiarPixCopiaECola}
                        style={{ marginTop: 8, fontSize: '0.76rem', padding: '4px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                        {pixCopiado ? '✓ Copiado!' : '📋 Copiar Pix Copia e Cola'}
                      </button>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 12, fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={pixRecebido} onChange={e => setPixRecebido(e.target.checked)} />
                        Confirmo que o Pix caiu na conta
                      </label>
                    </>
                  )}
                </>
              )}
              {pixConfig.disponivel && (
                <button
                  type="button"
                  onClick={() => setPixModo(m => m === 'sistema' ? 'maquininha' : 'sistema')}
                  style={{ marginTop: 10, fontSize: '0.74rem', color: '#0f766e', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {pixModo === 'sistema' ? 'Usar a maquininha em vez disso' : 'Gerar QR Code pelo sistema em vez disso'}
                </button>
              )}
            </div>
          )}

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