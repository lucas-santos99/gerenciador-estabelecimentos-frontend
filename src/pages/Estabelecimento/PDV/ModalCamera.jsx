/* ════════════════════════════════════════════════════════════
   ModalCamera — componente reutilizável
   Usado em: PDV.jsx, ProdutoModal.jsx
   ════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef, useCallback } from 'react';

export default function ModalCamera({ onCodigoDetectado, onFechar }) {
  const videoRef       = useRef(null);
  const streamRef      = useRef(null);
  const readerRef      = useRef(null);
  const detectandoRef  = useRef(true);

  const [erro,         setErro]         = useState(null);
  const [flash,        setFlash]        = useState(false);
  const [iniciando,    setIniciando]    = useState(true);
  const [cameras,      setCameras]      = useState([]);   // lista de deviceIds
  const [camIndex,     setCamIndex]     = useState(0);    // índice ativo

  // ── Para o stream e o reader ──────────────────────────────
  const pararStream = useCallback(() => {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Iniciar câmera por deviceId ───────────────────────────
  const iniciarCamera = useCallback(async (deviceId) => {
    pararStream();
    setIniciando(true);
    setErro(null);
    detectandoRef.current = true;

    try {
      // Constraints: se tiver deviceId, usa ele; senão pede environment
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } } }
        : { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      reader.decodeFromStream(stream, videoRef.current, (result) => {
        if (result && detectandoRef.current) {
          detectandoRef.current = false;
          setFlash(true);
          if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
          setTimeout(() => setFlash(false), 600);
          setTimeout(() => onCodigoDetectado(result.getText()), 350);
        }
      });

      setIniciando(false);
    } catch (e) {
      setIniciando(false);
      if (e.name === 'NotAllowedError') {
        setErro('Permissão de câmera negada. Permita o acesso nas configurações do navegador.');
      } else if (e.name === 'NotFoundError') {
        setErro('Nenhuma câmera encontrada neste dispositivo.');
      } else {
        setErro('Não foi possível acessar a câmera. Tente novamente.');
      }
    }
  }, [pararStream, onCodigoDetectado]);

  // ── Enumeração de câmeras + inicialização ─────────────────
  // Estratégia: pedir permissão primeiro (getUserMedia genérico),
  // depois enumerar devices com labels para achar a traseira.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Passo 1: pedir permissão com qualquer câmera para obter labels
        const permStream = await navigator.mediaDevices.getUserMedia({ video: true });
        permStream.getTracks().forEach(t => t.stop());

        if (cancelled) return;

        // Passo 2: enumerar agora que temos permissão (labels disponíveis)
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        if (cancelled) return;

        setCameras(videoDevices);

        // Passo 3: escolher câmera traseira
        // Procurar por label contendo "back", "traseira", "environment", "rear"
        // Se não achar, usar a ÚLTIMA da lista (convenção: traseira é a última no mobile)
        let escolhidaIndex = videoDevices.length > 1 ? videoDevices.length - 1 : 0;
        for (let i = 0; i < videoDevices.length; i++) {
          const label = (videoDevices[i].label || '').toLowerCase();
          if (label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('traseira')) {
            escolhidaIndex = i;
            break;
          }
        }

        setCamIndex(escolhidaIndex);
        await iniciarCamera(videoDevices[escolhidaIndex]?.deviceId || null);
      } catch (e) {
        if (!cancelled) {
          setIniciando(false);
          setErro('Permissão de câmera negada. Permita o acesso nas configurações do navegador.');
        }
      }
    }

    init();
    return () => { cancelled = true; pararStream(); };
  }, []);

  // Esc fecha
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  // ── Trocar câmera (cicla pelo array de devices) ───────────
  function trocarCamera() {
    if (cameras.length < 2) return;
    const novoIndex = (camIndex + 1) % cameras.length;
    setCamIndex(novoIndex);
    iniciarCamera(cameras[novoIndex].deviceId);
  }

  return (
    <div className="pdv-modal-overlay pdv-camera-overlay" onClick={onFechar}>
      <div className="pdv-camera-modal" onClick={e => e.stopPropagation()}>
        <div className="pdv-camera-header">
          <span className="pdv-camera-titulo">📷 Ler Código de Barras</span>
          <div className="pdv-camera-acoes-topo">
            {cameras.length > 1 && (
              <button className="pdv-camera-btn-trocar" onClick={trocarCamera} title="Trocar câmera">
                🔄
              </button>
            )}
            <button className="pdv-camera-btn-fechar" onClick={onFechar} title="Fechar (Esc)">
              ✕
            </button>
          </div>
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
              <button
                className="pdv-camera-btn-retry"
                onClick={() => iniciarCamera(cameras[camIndex]?.deviceId || null)}
              >
                Tentar novamente
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            className="pdv-camera-video"
            muted
            playsInline
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