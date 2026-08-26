// src/components/RenovacaoAntecipada.jsx
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/api';
import { hojeStrTZ, fimDiaTZ, diasEntre, TIMEZONE_PADRAO } from '../utils/fusoHorario';
import './RenovacaoAntecipada.css';

/* ════════════════════════════════════════════════════════════
   Banner + modal de renovação ANTES de vencer. Só aparece quando
   a licença está ativa e dentro da janela de dias configurada
   (config_sistema: cobranca_dias_aviso). Reaproveita os mesmos
   endpoints de cobrança que a TelaBloqueio já usa — o webhook já
   acumula os 30 dias a partir do vencimento atual, então pagar
   adiantado nunca faz o estabelecimento perder dias.
════════════════════════════════════════════════════════════ */
export default function RenovacaoAntecipada({ merceariaId, nomeEstabelecimento, dataVencimento, statusAssinatura, timezone = TIMEZONE_PADRAO, onRenovado }) {
  const pollingRef = useRef(null);
  const visibilidadeHandlerRef = useRef(null); // handler de 'visibilitychange' ativo, se houver

  const [diasAviso,   setDiasAviso]   = useState(null); // null = ainda não sabemos, não decide nada
  const [modalAberto, setModalAberto] = useState(false);
  const [planos,      setPlanos]      = useState(null);
  const [cobranca,    setCobranca]    = useState(null);
  const [carregando,  setCarregando]  = useState(false);
  const [erro,        setErro]        = useState("");
  const [pago,        setPago]        = useState(false);
  const [copiado,     setCopiado]     = useState(false);

  useEffect(() => {
    apiFetch('/superadmin/config-cobranca')
      .then(r => r.ok ? r.json() : null)
      .then(d => setDiasAviso(d?.dias_aviso ?? 5))
      .catch(() => setDiasAviso(5));
    return () => pararPolling();
  }, []);

  // Tick a cada 60s só pra manter a contagem regressiva do último dia
  // atualizada — não precisa de nada mais preciso que isso.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const diasRestantes = (() => {
    if (!dataVencimento) return null;
    return diasEntre(hojeStrTZ(timezone), dataVencimento);
  })();

  // No último dia, troca "vence hoje" por uma contagem em horas/minutos
  // até o fim do dia NO FUSO DO ESTABELECIMENTO — bem mais claro que
  // está vencendo ali mesmo, e consistente pra qualquer um que olhar.
  const contagemHoje = (() => {
    if (diasRestantes !== 0 || !dataVencimento) return null;
    const fimDoDia    = fimDiaTZ(dataVencimento, timezone);
    const msRestantes = fimDoDia - new Date();
    if (msRestantes <= 0) return "a qualquer momento";
    const horas   = Math.floor(msRestantes / (1000 * 60 * 60));
    const minutos = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
    return horas > 0 ? `em ${horas}h ${minutos}min` : `em ${minutos}min`;
  })();

  // Só mostra o banner se: já sabemos a janela configurada, a licença
  // está ativa (se já venceu, quem cuida disso é a Tela de Bloqueio,
  // não esse banner), e o vencimento cai dentro da janela.
  const deveMostrar =
    diasAviso !== null &&
    statusAssinatura === 'ativa' &&
    diasRestantes !== null &&
    diasRestantes >= 0 &&
    diasRestantes <= diasAviso;

  async function abrirModal() {
    setModalAberto(true);
    setErro("");
    setCobranca(null);
    setPago(false);
    if (!planos) {
      try {
        const resp = await apiFetch("/api/asaas/planos");
        setPlanos(await resp.json());
      } catch {
        setErro("Erro ao carregar planos. Tente novamente.");
      }
    }
  }

  async function gerarCobranca() {
    setCarregando(true);
    setErro("");
    try {
      const [respCartao, respPix] = await Promise.all([
        apiFetch(`/api/asaas/gerar-cobranca/${merceariaId}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ plano: "mensal" }),
        }),
        apiFetch(`/api/efi/gerar-cobranca-pix/${merceariaId}`, {
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

      setCobranca({
        valor:              dataPix.valor ?? dataCartao.valor,
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

  // Para o polling de confirmação de pagamento e remove o listener de
  // 'visibilitychange' associado, se houver — centralizado aqui pra não
  // vazar o listener em nenhum dos pontos que interrompem o polling.
  function pararPolling() {
    clearInterval(pollingRef.current);
    if (visibilidadeHandlerRef.current) {
      document.removeEventListener("visibilitychange", visibilidadeHandlerRef.current);
      visibilidadeHandlerRef.current = null;
    }
  }

  // Como o pagamento acontece ANTES de vencer, a licença já está
  // "ativa" — não dá pra usar isso como sinal de sucesso (sempre seria
  // true). O sinal real aqui é a DATA DE VENCIMENTO ter mudado.
  //
  // ⚠️ BUG REAL corrigido (26/08, mesma causa do fix aplicado na
  // TelaBloqueio.jsx): o cartão abre o checkout do Asaas numa aba nova
  // (`window.open`), deixando essa aba (com o `setInterval` do polling)
  // em segundo plano — navegadores throttlam/pausam timers em abas em
  // background, então a confirmação só era percebida bem depois (ou só
  // com F5). Agora também verifica assim que a aba volta a ficar
  // visível, sem depender do próximo tick do interval.
  function iniciarPolling() {
    pararPolling();
    const vencimentoAntes = dataVencimento;

    const verificar = async () => {
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${merceariaId}`);
        const data = await resp.json();
        if (!resp.ok) return;
        if (data.data_vencimento && data.data_vencimento !== vencimentoAntes) {
          pararPolling();
          setPago(true);
          onRenovado?.(data);
          setTimeout(() => setModalAberto(false), 2500);
        }
      } catch {}
    };

    const aoVoltarAba = () => {
      if (document.visibilityState === "visible") verificar();
    };
    visibilidadeHandlerRef.current = aoVoltarAba;
    document.addEventListener("visibilitychange", aoVoltarAba);

    pollingRef.current = setInterval(verificar, 5000);
  }

  async function copiarPix() {
    if (!cobranca?.pix_copy_paste) return;
    await navigator.clipboard.writeText(cobranca.pix_copy_paste);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (!deveMostrar) return null;

  const urgente = diasRestantes <= 2;

  return (
    <>
      <div className={`renov-banner${urgente ? ' renov-banner--urgente' : ''}`} onClick={abrirModal}>
        <div className="renov-banner-icone">{urgente ? '⏰' : '📅'}</div>
        <div className="renov-banner-texto">
          <strong>
            {diasRestantes === 0
              ? `Sua assinatura vence hoje — ${contagemHoje}!`
              : `Sua assinatura vence em ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`}
          </strong>
          <span>Renove agora e continue sem interrupção no acesso.</span>
        </div>
        <button className="renov-banner-btn" onClick={e => { e.stopPropagation(); abrirModal(); }}>
          💳 Renovar agora
        </button>
      </div>

      {modalAberto && (
        <div className="renov-modal-overlay" onClick={() => !cobranca && setModalAberto(false)}>
          <div className="renov-modal" onClick={e => e.stopPropagation()}>

            {pago ? (
              <div className="renov-modal-sucesso">
                <div className="renov-sucesso-icone">✅</div>
                <h3>Pagamento confirmado!</h3>
                <p>Sua licença foi renovada com sucesso.</p>
              </div>

            ) : cobranca ? (
              <>
                <div className="renov-modal-header">
                  <h3>💳 Efetuar Pagamento</h3>
                  <span className="renov-modal-valor">
                    R$ {cobranca.valor?.toFixed(2).replace(".", ",")}
                    <small>/mês</small>
                  </span>
                </div>

                <div className="renov-tabs">
                  <div className="renov-tab ativo">📱 Pix</div>
                  {cobranca.invoice_url_cartao && (
                    <button
                      className="renov-tab"
                      onClick={() => window.open(cobranca.invoice_url_cartao, "_blank", "noopener,noreferrer")}
                    >
                      💳 Cartão de Crédito/Débito
                    </button>
                  )}
                </div>

                {cobranca.pix_qr_code ? (
                  <div className="renov-pix">
                    <img src={cobranca.pix_qr_code} alt="QR Code Pix" className="renov-qrcode" />
                    <button className="renov-copiar-pix" onClick={copiarPix}>
                      {copiado ? "✓ Copiado!" : "📋 Copiar código Pix"}
                    </button>
                    <p className="renov-aguardando">⏳ Aguardando confirmação do pagamento...</p>
                  </div>
                ) : (
                  <div className="renov-pix">
                    {cobranca.pix_erro && <p className="renov-erro">{cobranca.pix_erro} Tente pelo cartão abaixo.</p>}
                    {cobranca.invoice_url_cartao && (
                      <button className="renov-btn renov-btn--primary"
                        onClick={() => window.open(cobranca.invoice_url_cartao, "_blank", "noopener,noreferrer")}>
                        💳 Pagar com Cartão de Crédito/Débito
                      </button>
                    )}
                  </div>
                )}

                <button className="renov-btn renov-btn--ghost" style={{ marginTop: 8 }}
                  onClick={() => { setCobranca(null); pararPolling(); }}>
                  ← Voltar
                </button>
              </>

            ) : (
              <>
                <div className="renov-modal-header">
                  <h3>Renovar Licença Antecipadamente</h3>
                  <button className="renov-modal-fechar" onClick={() => setModalAberto(false)}>✕</button>
                </div>

                {!planos ? (
                  <div className="renov-carregando">Carregando...</div>
                ) : (
                  <>
                    <p className="renov-modal-desc">
                      Pagando agora, os 30 dias somam a partir do seu vencimento atual
                      ({new Date(dataVencimento + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" })}) — você não perde nenhum dia já pago.
                    </p>

                    <div className="renov-plano-unico">
                      <div className="renov-plano-nome">Plano Mensal</div>
                      <div className="renov-plano-valor">
                        R$ {planos.mensal.valor.toFixed(2).replace(".", ",")}
                        <span>/mês</span>
                      </div>
                      <div className="renov-plano-desc">+30 dias de acesso, somados ao seu vencimento atual</div>
                    </div>

                    {erro && <div className="renov-erro">{erro}</div>}

                    <button className="renov-btn renov-btn--primary"
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
    </>
  );
}