// src/components/TelaBloqueio.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './TelaBloqueio.css';

export default function TelaBloqueio({ onLogout, nomeFantasia, mercearia_id }) {
  const navigate   = useNavigate();
  const btnRef     = useRef(null);
  const pollingRef = useRef(null);

  const [modalAberto, setModalAberto] = useState(false);
  const [planos,      setPlanos]      = useState(null);
  const [config,      setConfig]      = useState(null);
  const [whatsapp,    setWhatsapp]    = useState("5500000000000");
  const [cobranca,    setCobranca]    = useState(null);
  const [carregando,  setCarregando]  = useState(false);
  const [erro,        setErro]        = useState("");
  const [pago,        setPago]        = useState(false);
  const [copiado,     setCopiado]     = useState(false);
  const [zoom,        setZoom]        = useState(() => parseFloat(localStorage.getItem("bl-zoom") || "1"));

  useEffect(() => {
    btnRef.current?.focus();
    const tema = localStorage.getItem("theme") || "dark";
    document.body.className = tema;
    return () => clearInterval(pollingRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${zoom * 16}px`;
    localStorage.setItem("bl-zoom", zoom);
    return () => { document.documentElement.style.fontSize = ""; };
  }, [zoom]);

  function changeZoom(delta) {
    setZoom(prev => Math.min(1.4, Math.max(0.7, Math.round((prev + delta) * 10) / 10)));
  }

  function toggleTema() {
    const novo = document.body.className === "dark" ? "light" : "dark";
    document.body.className = novo;
    localStorage.setItem("theme", novo);
  }

  async function abrirModal() {
    setModalAberto(true);
    setErro("");
    setCobranca(null);
    setPago(false);
    if (!planos) {
      try {
        const resp = await apiFetch("/api/asaas/planos");
        const data = await resp.json();
        setPlanos(data);
        if (data.whatsapp) setWhatsapp(data.whatsapp);
      } catch {
        setErro("Erro ao carregar planos. Tente novamente.");
      }
    }
    if (!config) {
      try {
        const resp = await apiFetch("/api/asaas/config-tela-bloqueio");
        if (resp.ok) setConfig(await resp.json());
      } catch {}
    }
  }

  async function gerarCobranca() {
    setCarregando(true);
    setErro("");
    try {
      // Cartão (Asaas) e Pix (Efí) são gerados em paralelo — cada um no
      // provedor mais barato pra esse meio de pagamento específico.
      const [respCartao, respPix] = await Promise.all([
        apiFetch(`/api/asaas/gerar-cobranca/${mercearia_id}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plano: "mensal" }),
        }),
        apiFetch(`/api/efi/gerar-cobranca-pix/${mercearia_id}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plano: "mensal" }),
        }),
      ]);

      const dataCartao = await respCartao.json().catch(() => ({}));
      const dataPix     = await respPix.json().catch(() => ({}));

      if (!respCartao.ok && !respPix.ok) {
        setErro(dataPix.error || dataCartao.error || "Erro ao gerar cobrança.");
        return;
      }

      // Mescla os dois — se um dos dois falhar, ainda mostra o outro
      setCobranca({
        valor:              dataPix.valor ?? dataCartao.valor,
        plano:              dataPix.plano ?? dataCartao.plano,
        dias:               dataPix.dias ?? dataCartao.dias,
        due_date:           dataCartao.due_date,
        invoice_url_cartao: dataCartao.invoice_url_cartao || null,
        pix_qr_code:        dataPix.pix_qr_code || null,
        pix_copy_paste:     dataPix.pix_copy_paste || null,
        pix_erro:           !respPix.ok ? (dataPix.error || "Pix indisponível no momento.") : null,
      });
      iniciarPolling();
    } catch {
      setErro("Erro ao gerar cobrança. Verifique sua conexão.");
    } finally {
      setCarregando(false);
    }
  }

  // Confirmação genérica — não importa se veio do Efí (Pix) ou do Asaas
  // (cartão), o resultado final é o mesmo: status_assinatura vira "ativa".
  function iniciarPolling() {
    clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${mercearia_id}`);
        const data = await resp.json();
        if (!resp.ok) return;
        if (data.status_assinatura === "ativa") {
          clearInterval(pollingRef.current);
          setPago(true);
          setTimeout(() => navigate(`/estabelecimentos/${mercearia_id}`, { replace: true }), 3000);
        }
      } catch {}
    }, 5000);
  }

  async function copiarPix() {
    if (!cobranca?.pix_copy_paste) return;
    await navigator.clipboard.writeText(cobranca.pix_copy_paste);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const handleKeyDown = (e) => {
    if (!modalAberto && e.key === "Escape") { e.preventDefault(); onLogout(); }
  };

  const titulo   = config?.titulo   || "Acesso Bloqueado";
  const mensagem = config?.mensagem || `A assinatura de **${nomeFantasia || "seu estabelecimento"}** expirou ou não foi paga.`;
  const info     = config?.info     || "Renove sua licença para continuar usando o sistema.";
  const promo    = config?.promo_ativa ? config.promo_texto : null;

  function renderTexto(texto) {
    const partes = texto.split(/\*\*(.+?)\*\*/g);
    return partes.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p);
  }

  return (
    <div className="bloqueio-container" onKeyDown={handleKeyDown} tabIndex={0}>

      {/* Topbar */}
      <div className="bloqueio-topbar">
        <div className="bloqueio-ljs">
          <span className="bloqueio-ljs-dot" />
          <span className="bloqueio-ljs-nome">Lucas J. Systems</span>
        </div>
        <div className="bloqueio-topbar-acoes">
          <button className="bloqueio-tema-btn" onClick={() => changeZoom(-0.1)} title="Diminuir texto">A−</button>
          <button className="bloqueio-tema-btn" onClick={() => changeZoom(+0.1)} title="Aumentar texto">A+</button>
          <button className="bloqueio-tema-btn" onClick={toggleTema} title="Alternar tema">
            {document.body.className === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div className="bloqueio-icone">🔒</div>
      <h2 className="bloqueio-titulo">{titulo}</h2>
      <p className="bloqueio-msg">{renderTexto(mensagem)}</p>
      <p className="bloqueio-info">{info}</p>

      {promo && <div className="bloqueio-promo">🎉 {promo}</div>}

      <div className="bloqueio-acoes">
        {mercearia_id && (
          <button className="bloqueio-btn bloqueio-btn--primary" onClick={abrirModal}>
            💳 Renovar Licença
          </button>
        )}
        <a className="bloqueio-btn bloqueio-btn--whatsapp"
          href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
          💬 Falar no WhatsApp
        </a>
        <button ref={btnRef} className="bloqueio-btn bloqueio-btn--ghost" onClick={onLogout}>
          Sair da Conta
        </button>
      </div>

      {/* Modal */}
      {modalAberto && (
        <div className="bloqueio-modal-overlay" onClick={() => !cobranca && setModalAberto(false)}>
          <div className="bloqueio-modal" onClick={e => e.stopPropagation()}>

            {pago ? (
              <div className="bloqueio-modal-sucesso">
                <div className="sucesso-icone">✅</div>
                <h3>Pagamento confirmado!</h3>
                <p>Sua licença foi renovada. O sistema será recarregado em instantes...</p>
                <div className="sucesso-loader" />
              </div>

            ) : cobranca ? (
              <>
                <div className="bloqueio-modal-header">
                  <h3>💳 Efetuar Pagamento</h3>
                  <span className="modal-valor">
                    R$ {cobranca.valor.toFixed(2).replace(".", ",")}
                    <small>/mês</small>
                  </span>
                </div>

                <div className="bloqueio-tabs">
                  <div className="bloqueio-tab ativo">📱 Pix</div>
                  {cobranca.invoice_url_cartao && (
                    <button
                      className="bloqueio-tab"
                      onClick={() => window.open(cobranca.invoice_url_cartao, "_blank", "noopener,noreferrer")}
                    >
                      💳 Cartão de Crédito/Débito
                    </button>
                  )}
                </div>

                {cobranca.pix_qr_code ? (
                  <div className="bloqueio-pix">
                    <img src={cobranca.pix_qr_code}
                      alt="QR Code Pix" className="bloqueio-qrcode" />
                    <button className="bloqueio-copiar-pix" onClick={copiarPix}>
                      {copiado ? "✓ Copiado!" : "📋 Copiar código Pix"}
                    </button>
                    <p className="bloqueio-aguardando">⏳ Aguardando confirmação do pagamento...</p>
                  </div>
                ) : (
                  <div className="bloqueio-pix">
                    {cobranca.pix_erro && (
                      <p className="bloqueio-erro">{cobranca.pix_erro} Tente pelo cartão abaixo.</p>
                    )}
                    {cobranca.invoice_url_cartao && (
                      <button
                        className="bloqueio-btn bloqueio-btn--primary"
                        onClick={() => window.open(cobranca.invoice_url_cartao, "_blank", "noopener,noreferrer")}
                      >
                        💳 Pagar com Cartão de Crédito/Débito
                      </button>
                    )}
                  </div>
                )}

                {cobranca.due_date && (
                  <p className="bloqueio-venc-cobranca">
                    Cobrança válida até {new Date(cobranca.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
                  </p>
                )}
                <button className="bloqueio-btn bloqueio-btn--ghost" style={{ marginTop: 4 }}
                  onClick={() => { setCobranca(null); clearInterval(pollingRef.current); }}>
                  ← Voltar
                </button>
              </>

            ) : (
              <>
                <div className="bloqueio-modal-header">
                  <h3>Renovar Licença</h3>
                  <button className="bloqueio-modal-fechar" onClick={() => setModalAberto(false)}>✕</button>
                </div>

                {!planos ? (
                  <div className="bloqueio-carregando">Carregando...</div>
                ) : (
                  <>
                    <p className="bloqueio-modal-desc">
                      Pague via Pix ou Cartão de Crédito. Confirmação automática em segundos.
                    </p>

                    <div className="bloqueio-plano-unico">
                      <div className="plano-unico-nome">Plano Mensal</div>
                      <div className="plano-unico-valor">
                        R$ {planos.mensal.valor.toFixed(2).replace(".", ",")}
                        <span>/mês</span>
                      </div>
                      <div className="plano-unico-desc">30 dias de acesso completo ao sistema</div>
                    </div>

                    {erro && <div className="bloqueio-erro">{erro}</div>}

                    <button className="bloqueio-btn bloqueio-btn--primary"
                      onClick={gerarCobranca} disabled={carregando}>
                      {carregando ? "⏳ Gerando cobrança..." : "Continuar para pagamento →"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}