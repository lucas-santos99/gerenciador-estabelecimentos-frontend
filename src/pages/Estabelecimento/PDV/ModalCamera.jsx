/* ════════════════════════════════════════════════════════════
   ModalCamera — componente reutilizável
   Usado em: PDV.jsx, ProdutoModal.jsx
   ════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';

const SCANNER_ID = 'pdv-camera-scanner-region';

export default function ModalCamera({ onCodigoDetectado, onFechar }) {
  const scannerRef    = useRef(null);
  const detectandoRef = useRef(true);

  const [erro,      setErro]      = useState(null);
  const [erroDetalhe, setErroDetalhe] = useState('');
  const [flash,     setFlash]     = useState(false);
  const [iniciando, setIniciando] = useState(true);

  // ── Parar scanner ─────────────────────────────────────────
  async function pararScanner() {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }
  }

  // ── Iniciar scanner ───────────────────────────────────────
  async function iniciarScanner() {
    await pararScanner();
    setIniciando(true);
    setErro(null);
    setErroDetalhe('');
    detectandoRef.current = true;

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      const scanner = new Html5Qrcode(SCANNER_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },  // câmera traseira no mobile
        {
          fps: 15,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.5,
          disableFlip: false,
        },
        (decodedText) => {
          if (!detectandoRef.current) return;
          detectandoRef.current = false;
          setFlash(true);
          if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
          setTimeout(() => setFlash(false), 600);
          setTimeout(() => onCodigoDetectado(decodedText), 350);
        },
        () => {} // erros de frame são normais, ignorar
      );

      setIniciando(false);
    } catch (e) {
      setIniciando(false);
      const msg = (e?.message || e || '').toString().toLowerCase();
      if (msg.includes('permission') || msg.includes('notallowed')) {
        setErro('Permissão de câmera negada. Toque em "Tentar novamente" ou permita nas configurações do navegador.');
      } else if (msg.includes('notfound') || msg.includes('not found')) {
        setErro('Nenhuma câmera encontrada neste dispositivo.');
      } else if (msg.includes('in use') || msg.includes('notreadable')) {
        setErro('Câmera em uso por outro app. Feche outros apps e tente novamente.');
      } else {
        setErro('Não foi possível acessar a câmera.');
        setErroDetalhe(String(e?.name || '') + (e?.message ? ': ' + e.message : ''));
      }
    }
  }

  useEffect(() => {
    iniciarScanner();
    return () => { pararScanner(); };
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  return (
    <div className="pdv-modal-overlay pdv-camera-overlay" onClick={onFechar}>
      <div className="pdv-camera-modal" onClick={e => e.stopPropagation()}>

        <div className="pdv-camera-header">
          <span className="pdv-camera-titulo">📷 Ler Código de Barras</span>
          <button className="pdv-camera-btn-fechar" onClick={onFechar} title="Fechar (Esc)">
            ✕
          </button>
        </div>

        <div className={`pdv-camera-visor${flash ? ' pdv-camera-flash' : ''}`}>
          {iniciando && !erro && (
            <div className="pdv-camera-loading">
              <span className="pdv-camera-loading-icon">⏳</span>
              <span>Iniciando câmera…</span>
            </div>
          )}
          {erro && (
            <div className="pdv-camera-erro-visor">
              <span>📵</span>
              <p>{erro}</p>
              {erroDetalhe ? <p className="pdv-camera-erro-detalhe">{erroDetalhe}</p> : null}
              <button className="pdv-camera-btn-retry" onClick={iniciarScanner}>
                Tentar novamente
              </button>
            </div>
          )}
          {/* html5-qrcode renderiza o vídeo dentro deste div */}
          <div
            id={SCANNER_ID}
            className="pdv-camera-scanner-div"
            style={{ opacity: iniciando || erro ? 0 : 1 }}
          />
          {!iniciando && !erro && (
            <div className="pdv-camera-mira">
              <div className="pdv-camera-mira-linha" />
              <div className="pdv-camera-mira-cantos">
                <span className="pdv-camera-canto pdv-canto-tl" />
                <span className="pdv-camera-canto pdv-canto-tr" />
                <span className="pdv-camera-canto pdv-canto-bl" />
                <span className="pdv-camera-canto pdv-canto-br" />
              </div>
            </div>
          )}
        </div>

        <div className="pdv-camera-dica">
          Aponte a câmera para o código de barras ou QR Code
        </div>
      </div>
    </div>
  );
}