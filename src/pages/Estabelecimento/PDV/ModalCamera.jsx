/* ════════════════════════════════════════════════════════════
   ModalCamera — componente reutilizável
   Usado em: PDV.jsx, ProdutoModal.jsx
   ════════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef, useCallback } from 'react';

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export default function ModalCamera({ onCodigoDetectado, onFechar }) {
  const videoRef      = useRef(null);
  const readerRef     = useRef(null);
  const detectandoRef = useRef(true);
  const cancelledRef  = useRef(false);

  const [erro,        setErro]        = useState(null);
  const [flash,       setFlash]       = useState(false);
  const [iniciando,   setIniciando]   = useState(true);
  const [cameras,     setCameras]     = useState([]);
  const [camIndex,    setCamIndex]    = useState(0);

  const pararTudo = useCallback(() => {
    if (readerRef.current) {
      try { readerRef.current.reset(); } catch {}
      readerRef.current = null;
    }
  }, []);

  const iniciarCamera = useCallback(async (deviceId) => {
    pararTudo();
    setIniciando(true);
    setErro(null);
    detectandoRef.current = true;

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;

      await reader.decodeFromVideoDevice(
        deviceId || undefined,
        videoRef.current,
        (result) => {
          if (cancelledRef.current || !result || !detectandoRef.current) return;
          detectandoRef.current = false;
          setFlash(true);
          if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
          setTimeout(() => setFlash(false), 600);
          setTimeout(() => onCodigoDetectado(result.getText()), 350);
        }
      );

      if (!cancelledRef.current) setIniciando(false);
    } catch (e) {
      if (cancelledRef.current) return;
      setIniciando(false);
      if (e.name === 'NotAllowedError') {
        setErro('Permissão de câmera negada. Permita o acesso nas configurações do navegador.');
      } else if (e.name === 'NotFoundError') {
        setErro('Nenhuma câmera encontrada neste dispositivo.');
      } else {
        setErro(`Não foi possível acessar a câmera. (${e.name})`);
      }
    }
  }, [pararTudo, onCodigoDetectado]);

  useEffect(() => {
    cancelledRef.current = false;

    async function init() {
      try {
        const permStream = await navigator.mediaDevices.getUserMedia({ video: true });
        permStream.getTracks().forEach(t => t.stop());
        if (cancelledRef.current) return;

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (cancelledRef.current) return;

        setCameras(videoDevices);

        let escolhido = videoDevices.length > 1 ? videoDevices.length - 1 : 0;
        for (let i = 0; i < videoDevices.length; i++) {
          const label = (videoDevices[i].label || '').toLowerCase();
          if (label.includes('back') || label.includes('rear') || label.includes('traseira') || label.includes('environment')) {
            escolhido = i;
            break;
          }
        }

        setCamIndex(escolhido);
        const deviceId = videoDevices.length > 1 ? videoDevices[escolhido].deviceId : undefined;
        await iniciarCamera(deviceId);
      } catch {
        if (!cancelledRef.current) {
          setIniciando(false);
          setErro('Permissão de câmera negada. Permita o acesso nas configurações do navegador.');
        }
      }
    }

    init();
    return () => { cancelledRef.current = true; pararTudo(); };
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFechar]);

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
            <button className="pdv-camera-btn-fechar" onClick={onFechar} title="Fechar (Esc)">✕</button>
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
              <button className="pdv-camera-btn-retry" onClick={() => iniciarCamera(cameras[camIndex]?.deviceId)}>
                Tentar novamente
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            className="pdv-camera-video"
            muted
            playsInline
            autoPlay
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