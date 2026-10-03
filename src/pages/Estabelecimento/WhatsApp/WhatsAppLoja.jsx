// src/pages/Estabelecimento/WhatsApp/WhatsAppLoja.jsx
// ============================================================
// WHATSAPP — tela do dono do estabelecimento (29/09/2026)
// Conhecer os planos, contratar (com aceite dos termos), acompanhar o
// saldo de créditos e o extrato, pedir pacote extra, cancelar e cadastrar
// os números de WhatsApp que podem usar o saldo.
// (02/10/2026) O pagamento é feito aqui mesmo: Pix (QR / copia e cola) ou
// cartão (link seguro). Assim que o provedor confirma, o plano ativa e os
// créditos entram sozinhos — vale para a contratação, a mensalidade de
// cada ciclo (dá pra pagar alguns dias antes) e o pacote extra. Se o
// pagamento pela tela estiver desligado, volta o fluxo "nossa equipe
// combina o pagamento e ativa". A explicação dos créditos é o MESMO
// componente mostrado no painel do SuperAdmin (TabelaCreditos).
// Backend: /api/whatsapp/loja (routes/whatsappLojaRoutes.js).
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../../utils/api";
import { useAuth } from "../../../contexts/AuthProvider";
import { useAvisosEstabelecimento, usePollingReserva } from "../../../utils/realtimeEstab";
import { tiposDoPlano } from "../../../utils/whatsappCustos";
import TabelaCreditos from "../../../components/WhatsApp/TabelaCreditos";
import "./WhatsAppLoja.css";

const API = "/api/whatsapp/loja";

const RECURSO_LABEL = {
  alertas: "Alertas automáticos", consultas: "Perguntas / consultas", pdf: "Relatórios em PDF",
  cadastro: "Cadastro pelo WhatsApp", foto: "Foto de nota / produto", ia_audio: "Áudio",
};
const MOV_LABEL = {
  credito_ciclo: "Créditos do ciclo", pacote: "Pacote extra", consumo: "Uso", estorno: "Estorno",
  ajuste: "Ajuste", expirado: "Expirado",
};
const PEDIDO_LABEL = { consulta: "Pergunta", pdf: "Relatório PDF", cadastro: "Cadastro", foto: "Foto", alerta: "Alerta", conversa: "Mensagem sem consulta" };
// Uso do ciclo por tipo de pedido (30/09) — ordem fixa na tela
const PEDIDO_USO = [
  { id: "consulta", icone: "💬", nome: "Perguntas" },
  { id: "alerta",   icone: "🔔", nome: "Alertas" },
  { id: "pdf",      icone: "📄", nome: "Relatórios em PDF" },
  { id: "cadastro", icone: "📝", nome: "Cadastros" },
  { id: "foto",     icone: "📷", nome: "Fotos" },
  { id: "conversa", icone: "💭", nome: "Mensagens sem consulta" },
];
const PAGO_MSG = {
  ativacao: "Pagamento confirmado! Seu plano está ativo.",
  mensalidade: "Pagamento confirmado! Os créditos do ciclo foram liberados.",
  adiantado: "Pagamento confirmado! A próxima mensalidade já está paga.",
  pacote: "Pagamento confirmado! Os créditos do pacote já estão no saldo.",
  numero_extra: "Pagamento confirmado! O número extra já está liberado: é só cadastrar.",
};
const STATUS_PACOTE = { aguardando: "Aguardando aprovação", aprovado: "Aprovado", recusado: "Recusado", desistiu: "Cancelado por você" };

const brl = (v) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (v, c = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const nfAuto = (v) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dataBR = (s) => {
  if (!s) return "";
  const [a, m, d] = String(s).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const dataHora = (iso) => {
  try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
};
const somarUmDia = (s) => { const dt = new Date(`${String(s).slice(0, 10)}T12:00:00Z`); dt.setUTCDate(dt.getUTCDate() + 1); return dt.toISOString().slice(0, 10); };
const diasAte = (hoje, fim) => Math.round((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000);

// Máscara de telefone: (53) 99123-4567
function mascaraTel(v) {
  const d = String(v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* ── Peças pequenas ─────────────────────────────────────────── */
function Modal({ titulo, children, onFechar, largura = 560, bloqueado }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !bloqueado) onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar, bloqueado]);
  return (
    <div className="wal-overlay" onClick={() => !bloqueado && onFechar()}>
      <div className="wal-modal" style={{ maxWidth: largura }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="wal-modal-head">
          <h3>{titulo}</h3>
          <button type="button" className="wal-x" onClick={onFechar} disabled={bloqueado} aria-label="Fechar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CartaoPlano({ pl, pesos, atual, onEscolher, desabilitado, textoBotao }) {
  const recursos = Object.keys(RECURSO_LABEL).filter(k => pl.recursos?.[k]);
  // Equivalência pelo tipo principal do plano (perguntas; se não tiver, o primeiro incluído)
  const tipos = tiposDoPlano(pl.recursos);
  const principal = tipos.includes("consulta") ? "consulta" : tipos[0];
  const qtd = pesos?.[principal] ? Math.floor(pl.creditos / pesos[principal]) : pl.creditos;
  const nomeEquiv = { consulta: "perguntas respondidas", pdf: "relatórios", cadastro: "cadastros", foto: "fotos lidas", alerta: "alertas" }[principal] || "pedidos";
  return (
    <article className={`wal-plano${pl.destaque ? " destaque" : ""}${atual ? " atual" : ""}`}>
      {pl.destaque && !atual && <span className="wal-plano-selo">⭐ Mais escolhido</span>}
      {atual && <span className="wal-plano-selo atual">Seu plano</span>}
      <h4>{pl.nome}</h4>
      <div className="wal-plano-preco"><strong>{brl(pl.preco)}</strong><span>/mês</span></div>
      <div className="wal-plano-creditos"><strong>{nf(pl.creditos)}</strong> créditos por mês</div>
      <div className="wal-plano-equiv">≈ {nf(qtd)} {nomeEquiv}{tipos.length > 1 ? ", ou qualquer mistura" : ""}</div>
      {pl.descricao && <p className="wal-plano-desc">{pl.descricao}</p>}
      <ul className="wal-plano-rec">
        {recursos.map(k => <li key={k}>✓ {RECURSO_LABEL[k]}</li>)}
        <li>✓ {pl.numeros || 1} número{(pl.numeros || 1) === 1 ? "" : "s"} de WhatsApp</li>
      </ul>
      {onEscolher && (
        <button type="button" className="wal-btn wal-btn-primario" onClick={onEscolher} disabled={desabilitado || atual}>
          {atual ? "Plano atual" : textoBotao}
        </button>
      )}
    </article>
  );
}

/* ── Página ─────────────────────────────────────────────────── */
export default function WhatsAppLoja() {
  const { profile } = useAuth();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [toast, setToast] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const [contratar, setContratar] = useState(null);   // plano escolhido
  const [aceite, setAceite] = useState(false);
  const [confirmar, setConfirmar] = useState(null);   // { titulo, texto, botao, perigo, acao }
  const [mostrarPlanos, setMostrarPlanos] = useState(false);
  const [planoTabela, setPlanoTabela] = useState(null);
  const [extrato, setExtrato] = useState(null);
  const [novoNumero, setNovoNumero] = useState(null); // { usuario_id, telefone }
  const [codigoGerado, setCodigoGerado] = useState(null); // { apelido, telefone_formatado, codigo }
  const [termosNovos, setTermosNovos] = useState(false);  // modal "termos atualizados" (01/10)
  const [aceiteNovo, setAceiteNovo] = useState(false);
  // Zoom da tela (02/10): 80% a 160%, lembrado no navegador
  const [zoom, setZoom] = useState(() => { try { const z = parseFloat(localStorage.getItem("wa-loja-zoom")); return z >= 0.8 && z <= 1.6 ? z : 1; } catch { return 1; } });
  const mudarZoom = (delta) => setZoom(z => {
    const n = delta === 0 ? 1 : Math.min(1.6, Math.max(0.8, Math.round((z + delta) * 10) / 10));
    try { localStorage.setItem("wa-loja-zoom", String(n)); } catch { /* sem armazenamento */ }
    return n;
  });
  const [pagar, setPagar] = useState(null);           // modal de pagamento: { carregando, erro, dados, opcoes } (02/10)

  const avisar = useCallback((msg, tipo = "ok") => setToast({ msg, tipo, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(API);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar.");
      setD(j);
      setErro("");
    } catch (e) {
      setErro(e.message || "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Tempo real (30/09): saldo, uso, extrato, pedidos e números se atualizam
  // sozinhos quando algo muda (uma pergunta respondida, pacote aprovado,
  // plano ativado...). Sem dados no aviso — só recarrega pela mesma rota.
  const extratoAbertoRef = useRef(false);
  extratoAbertoRef.current = !!extrato;
  const recarregarTudo = useCallback(async () => {
    await carregar();
    if (!extratoAbertoRef.current) return;
    try {
      const r = await apiFetch(`${API}/extrato`);
      const j = await r.json();
      if (r.ok && extratoAbertoRef.current) setExtrato(j.movimentos || []);
    } catch { /* mantém o que já está na tela */ }
  }, [carregar]);
  useAvisosEstabelecimento(profile?.mercearia_id, ["whatsapp"], recarregarTudo, { atraso: 600 });
  usePollingReserva(recarregarTudo, 120000);

  async function chamar(caminho, opcoes, msgOk) {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}${caminho}`, opcoes);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível concluir.");
      if (msgOk) avisar(msgOk);
      await carregar();
      if (extrato) setExtrato(null);
      return j;
    } catch (e) {
      avisar(e.message, "erro");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  /* ── Pagamento pela tela (02/10/2026) ─────────────────────── */
  // Gera (ou reaproveita) o Pix + link de cartão do que há pra pagar agora.
  // opcoes: {} = plano/mensalidade; { pacote_id } = pacote extra;
  // { numero_extra: true } = o pedido de número extra em aberto.
  const abrirPagamento = useCallback(async (opcoes = {}) => {
    setPagar({ carregando: true, opcoes });
    try {
      const r = await apiFetch(`${API}/cobranca`, { method: "POST", body: JSON.stringify(opcoes) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível gerar o pagamento.");
      setPagar({ dados: j, opcoes });
    } catch (e) {
      setPagar({ erro: e.message || "Não foi possível gerar o pagamento.", opcoes });
    }
  }, []);

  // Enquanto o modal está aberto, pergunta ao servidor se o pagamento caiu
  // (a cada 5 s e sempre que a pessoa volta pra esta aba, vinda do app do
  // banco ou da página do cartão). Caiu → fecha, avisa e recarrega.
  const grupoPg = pagar?.dados?.grupo || null;
  const tipoPg = pagar?.dados?.tipo || null;
  useEffect(() => {
    if (!grupoPg) return undefined;
    let vivo = true, ocupadoPg = false;
    const conferir = async () => {
      if (ocupadoPg || !vivo) return;
      ocupadoPg = true;
      try {
        const r = await apiFetch(`${API}/cobranca/${grupoPg}`);
        const j = await r.json().catch(() => ({}));
        if (!vivo || !r.ok) return;
        if (j.pago) {
          setPagar(null);
          if (j.resultado === "aplicado" || j.resultado === "adiantado") avisar(PAGO_MSG[j.resultado === "adiantado" ? "adiantado" : tipoPg] || "Pagamento confirmado!");
          else avisar("Recebemos o pagamento, mas ele precisa de conferência. Nossa equipe vai falar com você.", "erro");
          carregar();
        } else if (j.aberta === false) {
          setPagar(p => (p ? { erro: "Este pagamento venceu ou foi cancelado. Gere um novo.", opcoes: p.opcoes } : p));
        }
      } catch { /* tenta de novo na próxima volta */ } finally { ocupadoPg = false; }
    };
    const t = setInterval(conferir, 5000);
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar); window.removeEventListener("focus", aoVoltar); };
  }, [grupoPg, tipoPg, avisar, carregar]);

  const ativa = d?.assinatura || null;
  const pendente = d?.pendente || null;
  const online = !!d?.pagamento_online?.ativo;
  const aPagar = online ? (d?.pagamento_online?.pagar || null) : null;
  const planoRef = planoTabela || (ativa && { nome: ativa.plano_nome, creditos: ativa.creditos, recursos: ativa.recursos }) || d?.planos?.find(p => p.destaque) || d?.planos?.[0] || null;
  const tiposTabela = useMemo(() => (planoRef ? tiposDoPlano(planoRef.recursos) : undefined), [planoRef]);

  async function solicitar() {
    const j = await chamar("/assinar", {
      method: "POST",
      body: JSON.stringify({ plano_id: contratar.id, aceite: true, termos_versao: d.termos.versao }),
    }, online ? "Solicitação registrada! Agora é só pagar para ativar na hora." : "Solicitação enviada! Nossa equipe vai entrar em contato para ativar.");
    if (j) { setContratar(null); setAceite(false); setMostrarPlanos(false); if (online) abrirPagamento({}); }
  }

  async function abrirExtrato() {
    if (extrato) { setExtrato(null); return; }
    try {
      const r = await apiFetch(`${API}/extrato`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar o extrato.");
      setExtrato(j.movimentos || []);
    } catch (e) { avisar(e.message, "erro"); }
  }

  async function salvarNumero() {
    if (!novoNumero.usuario_id) { avisar("Escolha a pessoa que vai usar este número.", "erro"); return; }
    const j = await chamar("/vinculos", { method: "POST", body: JSON.stringify(novoNumero) }, "Número cadastrado.");
    if (j) { setNovoNumero(null); setCodigoGerado({ apelido: j.vinculo.apelido, telefone_formatado: j.vinculo.telefone_formatado, codigo: j.codigo }); }
  }
  // Troca a pessoa ligada ao número (30/09): as consultas passam a seguir
  // as permissões dela no sistema
  async function trocarPessoa(v, usuarioId) {
    if (!usuarioId || usuarioId === v.usuario_id) return;
    await chamar(`/vinculos/${v.id}`, { method: "PATCH", body: JSON.stringify({ usuario_id: usuarioId }) }, "Pessoa do número atualizada.");
  }
  async function gerarCodigo(v) {
    const j = await chamar(`/vinculos/${v.id}/codigo`, { method: "POST" });
    if (j) setCodigoGerado({ apelido: j.vinculo.apelido, telefone_formatado: j.vinculo.telefone_formatado, codigo: j.codigo });
  }

  if (carregando) return <div className="wal-root"><div className="wal-carregando"><div className="wal-spinner" />Carregando…</div></div>;
  if (erro || !d) {
    return (
      <div className="wal-root">
        <div className="wal-erro-geral">
          <strong>Não foi possível abrir o WhatsApp.</strong>
          <span>{erro}</span>
          <button type="button" className="wal-btn" onClick={() => { setCarregando(true); carregar(); }}>Tentar de novo</button>
        </div>
      </div>
    );
  }

  const pct = ativa && ativa.entradas > 0 ? Math.min(100, Math.max(0, (ativa.saldo / ativa.entradas) * 100)) : 0;
  const diasRestantes = ativa ? diasAte(ativa.hoje, ativa.ciclo_fim) + 1 : 0;
  // Ritmo do ciclo: média por dia e previsão de quando o saldo acaba
  const diasPassados = ativa ? Math.max(1, diasAte(ativa.ciclo_inicio, ativa.hoje) + 1) : 1;
  const mediaDia = ativa ? (Number(ativa.usados) || 0) / diasPassados : 0;
  const diasDeSaldo = mediaDia > 0 ? (Number(ativa.saldo) || 0) / mediaDia : Infinity;
  const fimSaldo = ativa && Number.isFinite(diasDeSaldo)
    ? new Date(Date.parse(`${ativa.hoje}T12:00:00Z`) + Math.floor(diasDeSaldo) * 86400000).toISOString().slice(0, 10)
    : null;
  const usoPorPedido = ativa ? PEDIDO_USO.map(t => ({ ...t, ...(ativa.por_pedido?.[t.id] || { pedidos: 0, creditos: 0 }) })).filter(t => t.pedidos > 0 || t.creditos > 0) : [];
  const vinculos = d.vinculos || [];
  const pessoas = d.pessoas || [];
  const podeNumeros = !!(ativa || pendente);
  const semPlanos = !d.planos.length;

  return (
    <div className="wal-root" style={{ zoom }}>
      <header className="wal-cabecalho">
        <div>
          <h2>💬 WhatsApp do sistema</h2>
          <p>Receba alertas e consulte o seu estabelecimento direto pelo WhatsApp. Atendimento automático — o saldo de créditos é seu, use como quiser.</p>
        </div>
        <div className="wal-cabecalho-lado">
          <span className={`wal-status ${d.servico.ativo ? "on" : "off"}`}>
            {d.servico.ativo ? "● No ar" : "● Em breve"}
          </span>
          <div className="wal-zoom" role="group" aria-label="Zoom da tela">
            <button type="button" onClick={() => mudarZoom(-0.1)} disabled={zoom <= 0.8} aria-label="Diminuir zoom">A−</button>
            <button type="button" className="wal-zoom-valor" onClick={() => mudarZoom(0)} title="Voltar para 100%">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => mudarZoom(0.1)} disabled={zoom >= 1.6} aria-label="Aumentar zoom">A+</button>
          </div>
        </div>
      </header>

      {!d.servico.ativo && (
        <div className="wal-aviso info">
          O serviço está em fase de lançamento. Você já pode escolher o plano e cadastrar os números; as mensagens começam assim que o WhatsApp do sistema for liberado.
        </div>
      )}

      {d.ultima_encerrada && !pendente && !ativa && (
        <div className={`wal-aviso ${d.ultima_encerrada.status === "recusada" ? "perigo" : "neutro"}`}>
          {d.ultima_encerrada.status === "recusada"
            ? <>Sua solicitação do plano <strong>{d.ultima_encerrada.plano_nome}</strong> não foi ativada{d.ultima_encerrada.motivo ? <>: {d.ultima_encerrada.motivo}</> : "."} Fale com o suporte se tiver dúvida.</>
            : <>Seu plano <strong>{d.ultima_encerrada.plano_nome}</strong> foi encerrado em {dataHora(d.ultima_encerrada.encerrado_em)}.</>}
        </div>
      )}

      {/* ── Solicitação pendente ─────────────────────────── */}
      {pendente && (
        <section className="wal-card wal-pendente">
          <div className="wal-pendente-icone">⏳</div>
          <div className="wal-pendente-txt">
            <h3>{aPagar?.tipo === "ativacao" ? (ativa ? "Troca de plano: falta só o pagamento" : "Falta só o pagamento") : ativa ? "Troca de plano solicitada" : "Solicitação enviada"}</h3>
            <p>
              Plano <strong>{pendente.plano_nome}</strong> — {brl(pendente.preco)}/mês, {nf(pendente.creditos)} créditos.
              {" "}Pedido em {dataHora(pendente.criado_em)}.
            </p>
            <p className="wal-sutil">
              {aPagar?.tipo === "ativacao"
                ? <>Pague <strong>{brl(aPagar.valor)}</strong> por Pix ou cartão e o plano é ativado na hora, automaticamente.</>
                : "Nossa equipe vai entrar em contato para combinar o pagamento e ativar."}
              {ativa ? " Até lá, o plano atual continua valendo." : ""}
            </p>
          </div>
          {aPagar?.tipo === "ativacao" && (
            <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado} onClick={() => abrirPagamento({})}>💳 Pagar agora</button>
          )}
          <button type="button" className="wal-btn wal-btn-leve" disabled={ocupado}
            onClick={() => setConfirmar({ titulo: "Desistir da solicitação?", texto: `O pedido do plano ${pendente.plano_nome} será cancelado.`, botao: "Desistir", perigo: true, acao: () => chamar("/desistir", { method: "POST" }, "Solicitação cancelada.") })}>
            Desistir
          </button>
        </section>
      )}

      {ativa?.termos_pendentes && (
        <div className="wal-aviso info wal-aviso-termos">
          <div>
            <strong>📜 Os termos do WhatsApp foram atualizados.</strong> {d.termos.novidades || "Leia a versão nova."}
            {" "}Até você aceitar, continua valendo a versão que você aceitou antes.
          </div>
          <button type="button" className="wal-btn wal-btn-primario" onClick={() => { setAceiteNovo(false); setTermosNovos(true); }}>Ler e aceitar</button>
        </div>
      )}

      {/* ── Plano ativo: saldo ───────────────────────────── */}
      {ativa && (
        <section className="wal-card wal-saldo">
          <div className="wal-saldo-topo">
            <div>
              <span className="wal-rotulo">Plano {ativa.plano_nome} · {brl(ativa.valor_mensal ?? ativa.preco)}/mês{ativa.numeros_extras > 0 ? ` (plano ${brl(ativa.preco)} + ${ativa.numeros_extras} número${ativa.numeros_extras === 1 ? "" : "s"} extra${ativa.numeros_extras === 1 ? "" : "s"})` : ""}</span>
              <div className="wal-saldo-num"><strong>{nfAuto(ativa.saldo)}</strong> <span>de {nfAuto(ativa.entradas)} créditos</span></div>
            </div>
            <div className="wal-saldo-ciclo">
              <span className="wal-rotulo">Ciclo</span>
              <strong>{dataBR(ativa.ciclo_inicio)} a {dataBR(ativa.ciclo_fim)}</strong>
              <span className={ativa.cancelar_no_fim ? "wal-perigo-txt" : ""}>
                {ativa.cancelar_no_fim
                  ? `Encerra em ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}`
                  : `Renova em ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"}`}
              </span>
              {d.pagamento_online?.proximo_pago && !ativa.cancelar_no_fim && <span className="wal-ok-txt">✓ Próxima mensalidade já paga</span>}
            </div>
          </div>
          <div className={`wal-barra${pct <= 20 ? " baixo" : ""}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
            title={`${nf(pct)}% do saldo disponível`}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="wal-saldo-rodape">
            <span>Usados neste ciclo: <strong>{nfAuto(ativa.usados)}</strong></span>
            {pct <= 20 && ativa.entradas > 0 && <span className="wal-perigo-txt">Saldo baixo — considere um pacote extra.</span>}
            <span className="wal-ao-vivo" title="Esta tela se atualiza sozinha quando você usa o WhatsApp.">● Atualiza sozinho</span>
          </div>
          {ativa.aguardando_pagamento && (
            <div className="wal-aviso alerta wal-aviso-pausa">
              ⏳ Seu plano renovou em <strong>{dataBR(ativa.ciclo_inicio)}</strong> e está <strong>aguardando o pagamento</strong> da mensalidade do WhatsApp ({brl(ativa.valor_mensal ?? ativa.preco)}).
              {" "}Assim que o pagamento for confirmado, os créditos do novo ciclo entram aqui e o assistente volta a responder na hora.
              {aPagar?.motivo === "ciclo" && (
                <div className="wal-aviso-acao">
                  <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado} onClick={() => abrirPagamento({})}>💳 Pagar agora por Pix ou cartão</button>
                </div>
              )}
            </div>
          )}
          {aPagar?.motivo === "antecipado" && (
            <div className="wal-aviso info wal-aviso-pausa wal-aviso-termos">
              <div>
                🔁 Seu plano renova em <strong>{dataBR(aPagar.ciclo_inicio)}</strong>. Você já pode pagar a próxima mensalidade ({brl(aPagar.valor)}): os créditos novos entram no dia da renovação, sem pausa.
              </div>
              <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado} onClick={() => abrirPagamento({})}>Pagar renovação</button>
            </div>
          )}
          {ativa.pausado_teto && (
            <div className="wal-aviso perigo wal-aviso-pausa">
              ⏸ As consultas pelo WhatsApp estão <strong>pausadas</strong> por uso fora do normal neste ciclo (proteção prevista nos termos). Nossa equipe já foi avisada e vai verificar. O seu saldo continua guardado.
            </div>
          )}

          {/* ── Onde você usou neste ciclo (30/09) ────────── */}
          <div className="wal-uso">
            <span className="wal-rotulo">Onde você usou neste ciclo</span>
            {usoPorPedido.length === 0 ? (
              <p className="wal-sutil">Nenhum uso ainda neste ciclo. Cada pergunta, alerta ou relatório pelo WhatsApp aparece aqui na hora.</p>
            ) : (
              <ul className="wal-uso-lista">
                {usoPorPedido.map(t => {
                  const parte = ativa.usados > 0 ? Math.min(100, (t.creditos / ativa.usados) * 100) : 0;
                  return (
                    <li key={t.id}>
                      <span className="wal-uso-nome">{t.icone} {t.nome}</span>
                      <span className="wal-uso-qtd">{nf(t.pedidos)} {t.pedidos === 1 ? "vez" : "vezes"}</span>
                      <span className="wal-uso-barra" aria-hidden="true"><span style={{ width: `${parte}%` }} /></span>
                      <span className="wal-uso-cred"><strong>{nfAuto(t.creditos)}</strong> crédito{t.creditos === 1 ? "" : "s"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {mediaDia > 0 && (
              <p className={`wal-ritmo${fimSaldo && diasDeSaldo < diasRestantes - 1 ? " alerta" : ""}`}>
                Ritmo: ~{nfAuto(Math.round(mediaDia * 10) / 10)} crédito{mediaDia === 1 ? "" : "s"} por dia.{" "}
                {fimSaldo && diasDeSaldo < diasRestantes - 1
                  ? <>Nesse ritmo, o saldo acaba por volta de <strong>{dataBR(fimSaldo)}</strong>, antes do fim do ciclo.</>
                  : <>Nesse ritmo, o saldo dá até o fim do ciclo.</>}
              </p>
            )}
          </div>
          <div className="wal-acoes">
            <button type="button" className="wal-btn" onClick={abrirExtrato}>{extrato ? "Esconder extrato" : "📄 Ver extrato do ciclo"}</button>
            {!pendente && <button type="button" className="wal-btn" onClick={() => setMostrarPlanos(v => !v)}>{mostrarPlanos ? "Esconder planos" : "🔁 Trocar de plano"}</button>}
            {ativa.cancelar_no_fim ? (
              <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado}
                onClick={() => chamar("/manter", { method: "POST" }, "Pronto! Seu plano continua.")}>Manter meu plano</button>
            ) : (
              <button type="button" className="wal-btn wal-btn-leve" disabled={ocupado}
                onClick={() => setConfirmar({ titulo: "Cancelar o plano?", texto: `O WhatsApp continua funcionando até ${dataBR(ativa.ciclo_fim)} (fim do ciclo). Depois disso o plano é encerrado e os créditos que sobrarem expiram.`, botao: "Cancelar no fim do ciclo", perigo: true, acao: () => chamar("/cancelar", { method: "POST" }, "Cancelamento agendado para o fim do ciclo.") })}>
                Cancelar plano
              </button>
            )}
          </div>

          {extrato && (
            <div className="wal-extrato">
              {extrato.length === 0 ? <p className="wal-sutil">Nenhum movimento neste ciclo.</p> : (
                <table>
                  <thead><tr><th>Quando</th><th>O quê</th><th className="num">Créditos</th></tr></thead>
                  <tbody>
                    {extrato.map(m => (
                      <tr key={m.id}>
                        <td>{dataHora(m.criado_em)}</td>
                        <td>
                          {["credito_ciclo", "pacote"].includes(m.tipo) && m.descricao ? m.descricao : (MOV_LABEL[m.tipo] || m.tipo)}
                          {m.pedido_tipo ? ` · ${PEDIDO_LABEL[m.pedido_tipo] || m.pedido_tipo}` : ""}
                          {m.descricao && !["credito_ciclo", "pacote"].includes(m.tipo) ? <small> — {m.descricao}</small> : null}
                        </td>
                        <td className={`num ${Number(m.quantidade) < 0 ? "neg" : "pos"}`}>{Number(m.quantidade) > 0 ? "+" : ""}{nfAuto(m.quantidade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Pacotes extras ───────────────────────────────── */}
      {ativa && (d.pacotes.length > 0 || d.pacotes_pedidos.length > 0) && (
        <section className="wal-card">
          <h3 className="wal-titulo">Pacotes extras</h3>
          <p className="wal-sutil">Créditos avulsos para quando o saldo acabar antes do fim do mês. Valem até o fim do ciclo atual.</p>
          <div className="wal-pacotes">
            {d.pacotes.map(p => (
              <div key={p.id} className="wal-pacote">
                <div><strong>{p.nome}</strong><span>+{nf(p.creditos)} créditos · {brl(p.preco)}</span></div>
                <button type="button" className="wal-btn" disabled={ocupado}
                  onClick={() => setConfirmar({ titulo: `Pedir ${p.nome}?`, texto: `+${nf(p.creditos)} créditos por ${brl(p.preco)}, válidos até ${dataBR(ativa.ciclo_fim)}. ${online ? "Na sequência você paga por Pix ou cartão e os créditos entram na hora." : "Nossa equipe confirma o pagamento e libera os créditos."}`, botao: online ? "Pedir e pagar" : "Pedir pacote", acao: async () => { const j = await chamar("/pacotes", { method: "POST", body: JSON.stringify({ plano_id: p.id }) }, online ? "Pacote pedido! Falta só o pagamento." : "Pacote pedido! Assim que for aprovado, os créditos entram no saldo."); if (j?.id && online) abrirPagamento({ pacote_id: j.id }); } })}>
                  {online ? "Comprar" : "Pedir"}
                </button>
              </div>
            ))}
          </div>
          {d.pacotes_pedidos.length > 0 && (
            <ul className="wal-pedidos">
              {d.pacotes_pedidos.slice(0, 6).map(p => (
                <li key={p.id}>
                  <span>{p.nome} · {brl(p.preco)} · {dataHora(p.criado_em)}</span>
                  <span className={`wal-chip ${p.status}`}>{p.status === "aguardando" && online ? "Aguardando pagamento" : (STATUS_PACOTE[p.status] || p.status)}</span>
                  {p.status === "aguardando" && online && (
                    <button type="button" className="wal-link" disabled={ocupado} onClick={() => abrirPagamento({ pacote_id: p.id })}>pagar</button>
                  )}
                  {p.status === "aguardando" && (
                    <button type="button" className="wal-link" disabled={ocupado} onClick={() => chamar(`/pacotes/${p.id}/desistir`, { method: "POST" }, "Pedido cancelado.")}>desistir</button>
                  )}
                  {p.status === "recusado" && p.motivo && <small>{p.motivo}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Planos ───────────────────────────────────────── */}
      {(!ativa && !pendente) || mostrarPlanos ? (
        <section className="wal-secao-planos">
          <h3 className="wal-titulo">{ativa ? "Trocar de plano" : "Escolha um plano"}</h3>
          {ativa && <p className="wal-sutil">A troca começa um ciclo novo no dia da ativação, com o saldo cheio do plano novo. O saldo do plano atual não passa para o novo.</p>}
          {semPlanos ? (
            <div className="wal-aviso neutro">Nenhum plano disponível no momento. Fale com o suporte.</div>
          ) : (
            <div className="wal-planos">
              {d.planos.map(pl => (
                <div key={pl.id} onMouseEnter={() => setPlanoTabela(pl)} onFocus={() => setPlanoTabela(pl)}>
                  <CartaoPlano pl={pl} pesos={d.pesos} atual={ativa?.plano_id === pl.id}
                    textoBotao={ativa ? "Trocar para este" : "Escolher este plano"}
                    desabilitado={ocupado || !!pendente}
                    onEscolher={() => { setAceite(false); setContratar(pl); }} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ── Como funcionam os créditos ───────────────────── */}
      <TabelaCreditos pesos={d.pesos} conversaGratis={d.conversa_gratis_dia} creditos={planoRef?.creditos || 150} tipos={tiposTabela}
        titulo={planoRef?.nome ? `Como funcionam os créditos — plano ${planoRef.nome}` : "Como funcionam os créditos"} />

      {/* ── Números vinculados ───────────────────────────── */}
      <section className="wal-card">
        <div className="wal-titulo-linha">
          <h3 className="wal-titulo">Números que usam o saldo</h3>
          {podeNumeros && <span className="wal-contador">{vinculos.length} de {d.limite_numeros}</span>}
        </div>
        {!podeNumeros ? (
          <p className="wal-sutil">Depois de escolher um plano, cadastre aqui os números de WhatsApp (seu, do gerente…) que vão conversar com o sistema.</p>
        ) : (
          <>
            <p className="wal-sutil">Só números cadastrados e confirmados conversam com o sistema. Para confirmar, a pessoa envia o código de 6 dígitos, <strong>pelo WhatsApp daquele número</strong>, para o WhatsApp do sistema.</p>
            <p className="wal-sutil">Cada número fica ligado a uma pessoa da loja e <strong>só consulta o que ela pode ver no sistema</strong> (as mesmas permissões do painel). Depois de confirmado, é só mandar <strong>menu</strong> no WhatsApp.</p>
            {ativa && (
              <div className="wal-extras">
                <div className="wal-extras-conta" aria-label="Quantos números você pode cadastrar">
                  <div><span>Do plano</span><strong>{ativa.numeros}</strong></div>
                  <i aria-hidden="true">+</i>
                  <div><span>Extras</span><strong>{ativa.numeros_extras || 0}</strong>{ativa.numeros_extras > 0 && <small>{brl(ativa.numero_extra_preco)} cada/mês</small>}</div>
                  <i aria-hidden="true">=</i>
                  <div className="total"><span>Pode cadastrar</span><strong>{d.limite_numeros}</strong><small>em uso: {vinculos.length}</small></div>
                </div>
                {(ativa.numeros_extras > 0 || ativa.numeros_extras_pedido > 0 || d.numero_extra?.disponivel) && (
                  <div className="wal-extras-lado">
                    {ativa.numeros_extras_pedido > 0 ? (
                      <div className="wal-extras-pedido">
                        <span>⏳ Pedido de <strong>+{ativa.numeros_extras_pedido} número{ativa.numeros_extras_pedido === 1 ? "" : "s"} extra{ativa.numeros_extras_pedido === 1 ? "" : "s"}</strong> aguardando {online ? "o pagamento" : "aprovação"}.</span>
                        <div className="wal-extras-acoes">
                          {online && <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado} onClick={() => abrirPagamento({ numero_extra: true })}>💳 Pagar agora</button>}
                          <button type="button" className="wal-btn wal-btn-leve" disabled={ocupado}
                            onClick={() => chamar("/numeros-extras/desistir", { method: "POST" }, "Pedido cancelado.")}>Desistir</button>
                        </div>
                      </div>
                    ) : d.numero_extra?.disponivel && (ativa.numeros_extras || 0) < d.numero_extra.max ? (
                      <div className="wal-extras-comprar">
                        <span>Precisa de mais um número? <strong>{brl(d.numero_extra.preco)}/mês</strong> cada{online && d.numero_extra.agora ? <> · hoje você paga só {brl(d.numero_extra.agora.valor)}</> : null}.</span>
                        <button type="button" className="wal-btn wal-btn-primario" disabled={ocupado}
                          onClick={() => setConfirmar(online && d.numero_extra.agora ? {
                        titulo: "Comprar um número extra?",
                        texto: `Mais 1 número de WhatsApp por ${brl(d.numero_extra.preco)}/mês. Hoje você paga só o proporcional aos ${d.numero_extra.agora.dias_restantes} dia${d.numero_extra.agora.dias_restantes === 1 ? "" : "s"} que faltam do ciclo: ${brl(d.numero_extra.agora.proporcional)}${d.numero_extra.agora.proximo > 0 ? ` + ${brl(d.numero_extra.agora.proximo)} do próximo ciclo, que já está pago (total ${brl(d.numero_extra.agora.valor)})` : ""}. A partir da próxima mensalidade entra o valor cheio (vai para ${brl((ativa.valor_mensal ?? ativa.preco) + d.numero_extra.preco)}/mês). Pagou, o número é liberado na hora${d.numero_extra.agora.valor < (d.pagamento_online?.cartao_minimo || 5) ? " (por este valor, só por Pix)" : ""}. Todos os números usam o mesmo saldo de créditos.`,
                        botao: "Comprar e pagar",
                        acao: async () => { const j = await chamar("/numeros-extras", { method: "POST", body: JSON.stringify({ quantidade: 1 }) }, "Pedido registrado! Falta só o pagamento."); if (j) abrirPagamento({ numero_extra: true }); },
                      } : {
                        titulo: "Pedir um número extra?",
                        texto: `Mais 1 número de WhatsApp por ${brl(d.numero_extra.preco)}/mês, somado à mensalidade do WhatsApp (vai para ${brl((ativa.valor_mensal ?? ativa.preco) + d.numero_extra.preco)}/mês). Todos os números usam o mesmo saldo de créditos. Nossa equipe confirma e libera.`,
                        botao: "Pedir número extra",
                        acao: () => chamar("/numeros-extras", { method: "POST", body: JSON.stringify({ quantidade: 1 }) }, "Pedido enviado! Avisaremos quando for liberado."),
                      })}>＋ {online ? "Comprar número extra" : "Pedir número extra"}</button>
                      </div>
                    ) : null}
                    {ativa.numeros_extras > 0 && (
                      <button type="button" className="wal-btn wal-btn-tirar" disabled={ocupado}
                        onClick={() => setConfirmar({
                        icone: "📱", largura: 520,
                        titulo: "Tirar um número extra?",
                        texto: (
                          <>
                            <span className="wal-conf-resumo">
                              <span><small>Números extras</small><strong>{ativa.numeros_extras} → {ativa.numeros_extras - 1}</strong></span>
                              <span><small>Pode cadastrar</small><strong>{d.limite_numeros} → {d.limite_numeros - 1}</strong></span>
                              <span><small>Mensalidade</small><strong>{brl(ativa.valor_mensal ?? ativa.preco)} → {brl((ativa.valor_mensal ?? ativa.preco) - Number(ativa.numero_extra_preco || 0))}</strong></span>
                            </span>
                            <ul className="wal-conf-lista">
                              <li>Vale na hora: você passa a poder cadastrar {d.limite_numeros - 1} número{d.limite_numeros - 1 === 1 ? "" : "s"}.</li>
                              <li><strong>Não há devolução</strong> do que já foi pago por este número no ciclo atual.</li>
                              <li>A mensalidade do WhatsApp cai {brl(ativa.numero_extra_preco)} a partir da próxima renovação ({dataBR(somarUmDia(ativa.ciclo_fim))}).</li>
                              {vinculos.length >= d.limite_numeros && <li className="alerta">Todos os números estão em uso: remova um número da lista antes de tirar o extra.</li>}
                              <li>Se precisar de novo depois, é só comprar outro.</li>
                            </ul>
                          </>
                        ),
                        botao: "Tirar número extra", perigo: true,
                        acao: () => chamar("/numeros-extras/remover", { method: "POST" }, "Número extra retirado."),
                      })}><span aria-hidden="true">−</span> Tirar 1 número extra</button>
                    )}
                  </div>
                )}
              </div>
            )}
            {vinculos.length > 0 && (
              <ul className="wal-numeros">
                {vinculos.map(v => (
                  <li key={v.id}>
                    <div>
                      <strong>{v.pessoa_nome || v.apelido}</strong>
                      <span>{v.telefone_formatado}{v.pessoa_papel ? ` · ${v.pessoa_papel}` : ""}</span>
                      {v.pessoa_invalida && <span className="wal-perigo-txt">Pessoa inativa ou removida — escolha outra para o número voltar a funcionar.</span>}
                    </div>
                    {pessoas.length > 1 || v.pessoa_invalida ? (
                      <label className="wal-numero-pessoa" title="Quem usa este número">
                        <span>Quem usa</span>
                        <select value={v.pessoa_invalida ? "" : (v.usuario_id || "")} disabled={ocupado}
                          onChange={e => trocarPessoa(v, e.target.value)}>
                          {v.pessoa_invalida && <option value="">Escolha…</option>}
                          {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.papel})</option>)}
                        </select>
                      </label>
                    ) : null}
                    <span className={`wal-chip ${v.status === "ativo" ? "aprovado" : v.codigo_expirado ? "recusado" : "aguardando"}`}>
                      {v.status === "ativo" ? "Confirmado" : v.codigo_expirado ? "Código expirado" : "Aguardando código"}
                    </span>
                    <div className="wal-numero-acoes">
                      {v.status === "pendente" && <button type="button" className="wal-link" disabled={ocupado} onClick={() => gerarCodigo(v)}>novo código</button>}
                      <button type="button" className="wal-link perigo" disabled={ocupado}
                        onClick={() => setConfirmar({ titulo: "Remover este número?", texto: `${v.pessoa_nome || v.apelido} (${v.telefone_formatado}) deixa de conversar com o sistema.`, botao: "Remover", perigo: true, acao: () => chamar(`/vinculos/${v.id}`, { method: "DELETE" }, "Número removido.") })}>
                        remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {vinculos.length < d.limite_numeros ? (
              novoNumero ? (
                <div className="wal-novo-numero">
                  <label>
                    <span>Quem vai usar</span>
                    <select value={novoNumero.usuario_id} autoFocus
                      onChange={e => setNovoNumero(n => ({ ...n, usuario_id: e.target.value }))}>
                      <option value="">Escolha a pessoa…</option>
                      {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.papel})</option>)}
                    </select>
                  </label>
                  <label>
                    <span>WhatsApp (com DDD)</span>
                    <input value={novoNumero.telefone} inputMode="tel" placeholder="(53) 99123-4567"
                      onChange={e => setNovoNumero(n => ({ ...n, telefone: mascaraTel(e.target.value) }))}
                      onKeyDown={e => { if (e.key === "Enter") salvarNumero(); }} />
                  </label>
                  <div className="wal-acoes">
                    <button type="button" className="wal-btn wal-btn-leve" onClick={() => setNovoNumero(null)} disabled={ocupado}>Cancelar</button>
                    <button type="button" className="wal-btn wal-btn-primario" onClick={salvarNumero} disabled={ocupado || !novoNumero.usuario_id || novoNumero.telefone.replace(/\D/g, "").length < 10}>Cadastrar e gerar código</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="wal-btn" onClick={() => setNovoNumero({ usuario_id: pessoas.length === 1 ? pessoas[0].id : "", telefone: "" })}>+ Cadastrar número</button>
              )
            ) : (
              <p className="wal-sutil">Você já usa os {d.limite_numeros} número{d.limite_numeros === 1 ? "" : "s"} do seu plano. Para cadastrar outro, remova um{d.numero_extra?.disponivel ? ", peça um número extra" : ""} ou troque de plano.</p>
            )}
          </>
        )}
      </section>

      {/* ── Modal: contratar ─────────────────────────────── */}
      {contratar && (
        <Modal titulo={ativa ? `Trocar para o plano ${contratar.nome}` : `Contratar o plano ${contratar.nome}`} onFechar={() => setContratar(null)} largura={680} bloqueado={ocupado}>
          <div className="wal-resumo">
            <div><span>Valor</span><strong>{brl(contratar.preco)}/mês</strong></div>
            <div><span>Créditos por mês</span><strong>{nf(contratar.creditos)}</strong></div>
            <div><span>Números</span><strong>{contratar.numeros || 1}</strong></div>
          </div>
          <p className="wal-sutil">{online
            ? "Depois de solicitar, você paga por Pix ou cartão aqui mesmo e o plano é ativado na hora. Nada é debitado sem você pagar."
            : "Nesta fase de lançamento, a ativação e o pagamento são combinados com a nossa equipe — nada é cobrado automaticamente agora."}</p>
          <div className="wal-termos" tabIndex={0}>
            <h4>{d.termos.titulo} <small>(versão {d.termos.versao})</small></h4>
            {d.termos.secoes.map(s => (
              <div key={s.t}>
                <strong>{s.t}</strong>
                {s.p.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
          <label className="wal-aceite">
            <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} />
            Li e concordo com os termos do serviço de WhatsApp.
          </label>
          <div className="wal-acoes fim">
            <button type="button" className="wal-btn wal-btn-leve" onClick={() => setContratar(null)} disabled={ocupado}>Voltar</button>
            <button type="button" className="wal-btn wal-btn-primario" onClick={solicitar} disabled={!aceite || ocupado}>
              {ocupado ? "Enviando…" : online ? (ativa ? "Solicitar troca e pagar" : "Solicitar e pagar") : ativa ? "Solicitar troca" : "Solicitar plano"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: termos atualizados (plano ativo) ───────── */}
      {termosNovos && (
        <Modal titulo="Termos atualizados" onFechar={() => setTermosNovos(false)} largura={680} bloqueado={ocupado}>
          {d.termos.novidades && <p className="wal-sutil"><strong>O que mudou:</strong> {d.termos.novidades}</p>}
          <div className="wal-termos" tabIndex={0}>
            <h4>{d.termos.titulo} <small>(versão {d.termos.versao})</small></h4>
            {d.termos.secoes.map(s => (
              <div key={s.t}>
                <strong>{s.t}</strong>
                {s.p.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
          <label className="wal-aceite">
            <input type="checkbox" checked={aceiteNovo} onChange={e => setAceiteNovo(e.target.checked)} />
            Li e concordo com a versão nova dos termos do serviço de WhatsApp.
          </label>
          <div className="wal-acoes fim">
            <button type="button" className="wal-btn wal-btn-leve" onClick={() => setTermosNovos(false)} disabled={ocupado}>Agora não</button>
            <button type="button" className="wal-btn wal-btn-primario" disabled={!aceiteNovo || ocupado}
              onClick={async () => { const j = await chamar("/aceitar-termos", { method: "POST", body: JSON.stringify({ aceite: true, termos_versao: d.termos.versao }) }, "Termos aceitos."); if (j) setTermosNovos(false); }}>
              {ocupado ? "Salvando…" : "Aceitar"}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: pagamento por Pix ou cartão (02/10) ────── */}
      {pagar && (
        <Modal titulo="Pagamento" onFechar={() => setPagar(null)} largura={500}>
          {pagar.carregando ? (
            <div className="wal-pg-carregando"><div className="wal-spinner" />Gerando o pagamento…</div>
          ) : pagar.erro ? (
            <>
              <div className="wal-aviso perigo">{pagar.erro}</div>
              <div className="wal-acoes fim">
                <button type="button" className="wal-btn wal-btn-leve" onClick={() => setPagar(null)}>Fechar</button>
                <button type="button" className="wal-btn wal-btn-primario" onClick={() => abrirPagamento(pagar.opcoes)}>Tentar de novo</button>
              </div>
            </>
          ) : (
            <>
              <div className="wal-pg-topo">
                <span>{pagar.dados.descricao}</span>
                <strong>{brl(pagar.dados.valor)}</strong>
              </div>
              {pagar.dados.pix && (
                <div className="wal-pg-bloco">
                  <h4>Pix</h4>
                  {String(pagar.dados.pix.qr_code || "").startsWith("data:image/") && (
                    <img className="wal-pg-qr" src={pagar.dados.pix.qr_code} alt="QR Code do Pix" />
                  )}
                  <div className="wal-pg-copia">
                    <input readOnly value={pagar.dados.pix.copia_cola} aria-label="Código Pix copia e cola" onFocus={e => e.target.select()} />
                    <button type="button" className="wal-btn wal-btn-primario"
                      onClick={() => { try { navigator.clipboard?.writeText(pagar.dados.pix.copia_cola); avisar("Código Pix copiado."); } catch { /* sem área de transferência */ } }}>Copiar</button>
                  </div>
                  <small>No app do seu banco: Pix → ler QR Code, ou Pix copia e cola.{pagar.dados.pix.expira_em ? ` Vale até ${dataHora(pagar.dados.pix.expira_em)}.` : ""}</small>
                </div>
              )}
              {pagar.dados.cartao && (
                <div className="wal-pg-bloco">
                  <h4>Cartão de crédito</h4>
                  <a className="wal-btn" href={pagar.dados.cartao.url} target="_blank" rel="noopener noreferrer">Pagar com cartão ↗</a>
                  <small>Abre a página segura de pagamento em outra aba. Depois de pagar, volte para cá.</small>
                </div>
              )}
              {(pagar.dados.avisos || []).map((a, i) => <p key={i} className="wal-sutil">{a}</p>)}
              <div className="wal-pg-espera" role="status">
                <div className="wal-spinner" />
                <span>Aguardando o pagamento… A liberação é automática: assim que for confirmado, esta tela atualiza sozinha.</span>
              </div>
            </>
          )}
        </Modal>
      )}

      {/* ── Modal: código gerado ─────────────────────────── */}
      {codigoGerado && (
        <Modal titulo="Código de confirmação" onFechar={() => setCodigoGerado(null)} largura={460}>
          <p className="wal-sutil">Número <strong>{codigoGerado.telefone_formatado}</strong> ({codigoGerado.apelido})</p>
          <div className="wal-codigo" aria-label={`Código ${codigoGerado.codigo.split("").join(" ")}`}>{codigoGerado.codigo}</div>
          <ol className="wal-passos">
            <li>Anote o código (ele não aparece de novo).</li>
            <li>{d.servico.ativo ? "Pelo WhatsApp desse número, envie o código para o WhatsApp do sistema." : "Quando o serviço estiver no ar, envie o código, pelo WhatsApp desse número, para o WhatsApp do sistema."}</li>
            <li>O código vale 24 horas. Se expirar, é só gerar outro aqui.</li>
            {d.servico.ativo && <li>Depois de confirmado, mande <strong>menu</strong> para ver as consultas.</li>}
          </ol>
          <div className="wal-acoes fim">
            <button type="button" className="wal-btn" onClick={() => { try { navigator.clipboard?.writeText(codigoGerado.codigo); avisar("Código copiado."); } catch { /* sem área de transferência */ } }}>Copiar</button>
            <button type="button" className="wal-btn wal-btn-primario" onClick={() => setCodigoGerado(null)}>Pronto</button>
          </div>
        </Modal>
      )}

      {/* ── Modal: confirmação genérica ──────────────────── */}
      {confirmar && (
        <Modal titulo={confirmar.titulo} onFechar={() => setConfirmar(null)} largura={confirmar.largura || 440} bloqueado={ocupado}>
          {confirmar.icone && <div className={`wal-conf-icone${confirmar.perigo ? " perigo" : ""}`} aria-hidden="true">{confirmar.icone}</div>}
          <div className="wal-confirmar-txt">{confirmar.texto}</div>
          <div className="wal-acoes fim">
            <button type="button" className="wal-btn wal-btn-leve" onClick={() => setConfirmar(null)} disabled={ocupado}>Voltar</button>
            <button type="button" className={`wal-btn ${confirmar.perigo ? "wal-btn-perigo" : "wal-btn-primario"}`} disabled={ocupado}
              onClick={async () => { await confirmar.acao(); setConfirmar(null); }}>
              {confirmar.botao}
            </button>
          </div>
        </Modal>
      )}

      {toast && <div key={toast.id} className={`wal-toast ${toast.tipo}`} role="status">{toast.msg}</div>}
    </div>
  );
}
