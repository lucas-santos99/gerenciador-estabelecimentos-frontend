// src/components/TelaBloqueio.jsx
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';
import './TelaBloqueio.css';

export default function TelaBloqueio({ onLogout, nomeFantasia, mercearia_id }) {
  const btnRef = useRef(null);

  // Modal de pagamento
  const [modalAberto,  setModalAberto]  = useState(false);
  const [planos,       setPlanos]       = useState(null);
  const [planoSel,     setPlanoSel]     = useState("mensal");
  const [cobranca,     setCobranca]     = useState(null); // dados da cobrança gerada
  const [carregando,   setCarregando]   = useState(false);
  const [erro,         setErro]         = useState("");
  const [pago,         setPago]         = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    btnRef.current?.focus();
    return () => clearInterval(pollingRef.current);
  }, []);

  // Buscar planos ao abrir modal
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
      } catch {
        setErro("Erro ao carregar planos. Tente novamente.");
      }
    }
  }

  // Gerar cobrança
  async function gerarCobranca() {
    setCarregando(true);
    setErro("");
    try {
      const resp = await apiFetch(`/api/asaas/gerar-cobranca/${mercearia_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano: planoSel }),
      });
      const data = await resp.json();
      if (!resp.ok) { setErro(data.error || "Erro ao gerar cobrança."); return; }
      setCobranca(data);
      iniciarPolling(data.payment_id);
    } catch {
      setErro("Erro ao gerar cobrança. Verifique sua conexão.");
    } finally {
      setCarregando(false);
    }
  }

  // Polling de status — verifica a cada 5s se o pagamento foi confirmado
  function iniciarPolling(paymentId) {
    clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await apiFetch(`/api/asaas/status-pagamento/${paymentId}`);
        const data = await resp.json();
        if (data.status === "RECEIVED" || data.status === "CONFIRMED") {
          clearInterval(pollingRef.current);
          setPago(true);
          // Recarregar a página após 3s para entrar no sistema
          setTimeout(() => window.location.reload(), 3000);
        }
      } catch {}
    }, 5000);
  }

  function copiarPixColaEcola() {
    if (!cobranca?.pix_copy_paste) return;
    navigator.clipboard.writeText(cobranca.pix_copy_paste);
  }

  const handleKeyDown = (e) => {
    if (!modalAberto && (e.key === "Enter" || e.key === "Escape")) {
      e.preventDefault();
      onLogout();
    }
  };

  return (
    <div className="bloqueio-container" onKeyDown={handleKeyDown} tabIndex={0}>

      {/* Ícone */}
      <div className="bloqueio-icone">🔒</div>

      <h2 className="bloqueio-titulo">Acesso Bloqueado</h2>

      <p className="bloqueio-msg">
        A assinatura de <strong>{nomeFantasia || "seu estabelecimento"}</strong> expirou ou não foi paga.
      </p>

      <p className="bloqueio-info">
        Renove sua licença para continuar usando o sistema ou entre em contato pelo WhatsApp.
      </p>

      {/* Ações */}
      <div className="bloqueio-acoes">
        {mercearia_id && (
          <button className="bloqueio-btn bloqueio-btn--primary" onClick={abrirModal}>
            💳 Renovar Licença
          </button>
        )}
        <a
          className="bloqueio-btn bloqueio-btn--whatsapp"
          href="https://wa.me/5500000000000"
          target="_blank"
          rel="noreferrer"
        >
          💬 Falar no WhatsApp
        </a>
        <button ref={btnRef} className="bloqueio-btn bloqueio-btn--ghost" onClick={onLogout}>
          Sair da Conta
        </button>
      </div>

      {/* ═══════════════════════════════════════════
          MODAL DE PAGAMENTO
      ═══════════════════════════════════════════ */}
      {modalAberto && (
        <div className="bloqueio-modal-overlay" onClick={() => !cobranca && setModalAberto(false)}>
          <div className="bloqueio-modal" onClick={e => e.stopPropagation()}>

            {/* Pago com sucesso */}
            {pago ? (
              <div className="bloqueio-modal-sucesso">
                <div className="sucesso-icone">✅</div>
                <h3>Pagamento confirmado!</h3>
                <p>Sua licença foi renovada. O sistema será recarregado em instantes...</p>
                <div className="sucesso-loader" />
              </div>

            /* Cobrança gerada — exibir QR Code e link */
            ) : cobranca ? (
              <>
                <div className="bloqueio-modal-header">
                  <h3>💳 Efetuar Pagamento</h3>
                  <span className="modal-valor">
                    R$ {cobranca.valor.toFixed(2).replace(".", ",")}
                    <small> / {cobranca.plano === "anual" ? "ano" : "mês"}</small>
                  </span>
                </div>

                <div className="bloqueio-tabs">
                  <div className="bloqueio-tab ativo">📱 Pix</div>
                  <a
                    className="bloqueio-tab"
                    href={cobranca.invoice_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    💳 Cartão / Boleto
                  </a>
                </div>

                {/* QR Code Pix */}
                {cobranca.pix_qr_code ? (
                  <div className="bloqueio-pix">
                    <img
                      src={`data:image/png;base64,${cobranca.pix_qr_code}`}
                      alt="QR Code Pix"
                      className="bloqueio-qrcode"
                    />
                    <button className="bloqueio-copiar-pix" onClick={copiarPixColaEcola}>
                      📋 Copiar código Pix
                    </button>
                    <p className="bloqueio-aguardando">
                      ⏳ Aguardando confirmação do pagamento...
                    </p>
                  </div>
                ) : (
                  <div className="bloqueio-pix">
                    <p>QR Code não disponível. Use o link abaixo para pagar:</p>
                    <a href={cobranca.invoice_url} target="_blank" rel="noreferrer" className="bloqueio-btn bloqueio-btn--primary">
                      Abrir página de pagamento
                    </a>
                  </div>
                )}

                <p className="bloqueio-venc-cobranca">
                  Cobrança válida até {new Date(cobranca.due_date + "T12:00:00").toLocaleDateString("pt-BR")}
                </p>

                <button className="bloqueio-btn bloqueio-btn--ghost" style={{ marginTop: 8 }}
                  onClick={() => { setCobranca(null); clearInterval(pollingRef.current); }}>
                  ← Voltar
                </button>
              </>

            /* Seleção de plano */
            ) : (
              <>
                <div className="bloqueio-modal-header">
                  <h3>Renovar Licença</h3>
                  <button className="bloqueio-modal-fechar" onClick={() => setModalAberto(false)}>✕</button>
                </div>

                {!planos ? (
                  <div className="bloqueio-carregando">Carregando planos...</div>
                ) : (
                  <>
                    <p className="bloqueio-modal-desc">
                      Escolha o plano e pague via Pix ou Cartão de Crédito.
                    </p>

                    <div className="bloqueio-planos">
                      {/* Plano Mensal */}
                      <div
                        className={`bloqueio-plano${planoSel === "mensal" ? " selecionado" : ""}`}
                        onClick={() => setPlanoSel("mensal")}
                      >
                        <div className="plano-nome">Mensal</div>
                        <div className="plano-valor">
                          R$ {planos.mensal.valor.toFixed(2).replace(".", ",")}
                          <span>/mês</span>
                        </div>
                        <div className="plano-desc">30 dias de acesso</div>
                      </div>

                      {/* Plano Anual */}
                      <div
                        className={`bloqueio-plano${planoSel === "anual" ? " selecionado" : ""}`}
                        onClick={() => setPlanoSel("anual")}
                      >
                        <div className="plano-badge">💰 Economize R$ {planos.anual.economia.toFixed(2).replace(".", ",")}</div>
                        <div className="plano-nome">Anual</div>
                        <div className="plano-valor">
                          R$ {planos.anual.valor.toFixed(2).replace(".", ",")}
                          <span>/ano</span>
                        </div>
                        <div className="plano-desc">365 dias · 20% de desconto</div>
                      </div>
                    </div>

                    {erro && <div className="bloqueio-erro">{erro}</div>}

                    <button
                      className="bloqueio-btn bloqueio-btn--primary"
                      onClick={gerarCobranca}
                      disabled={carregando}
                    >
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