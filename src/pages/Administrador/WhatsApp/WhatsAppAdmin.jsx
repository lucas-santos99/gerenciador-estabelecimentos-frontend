// src/pages/Administrador/WhatsApp/WhatsAppAdmin.jsx
// ============================================================
// WHATSAPP — painel do SuperAdmin (24/09/2026)
// Estrutura pronta ANTES de conectar o número na Meta:
//   - Planos e pacotes extras (preço, créditos, recursos) com a conta do
//     "pior caso" ao vivo: custo máximo, preço mínimo e margem;
//   - Custos e parâmetros (preços da Meta, custo da IA, pesos, travas,
//     impostos/taxas, tetos) + simulador "e se";
//   - Uso do mês (a partir do registro whatsapp_envios);
//   - Cobrança automática da mensalidade (custo do admin, fora dos planos);
//   - Histórico de alterações.
// Qualquer SuperAdmin vê; só o master altera (pode_editar vem do backend).
// As contas usam src/utils/whatsappCustos.js (espelho do backend).
// Detalhes e decisões: doc do Projeto claude/whatsapp-planos-2026-09-24.md
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";
import TabelaCreditos from "../../../components/WhatsApp/TabelaCreditos";
import { apiFetch } from "../../../utils/api";
import { useAvisosGlobais } from "../../../utils/realtimeEstab";
import {
  TIPOS_PEDIDO, normalizarParametros, aplicarDolarAuto, piorCasoPorPedido,
  custoMaxPorCredito, calcularPlano, iaEmReais,
} from "../../../utils/whatsappCustos";
import "../SuperAdmins/SuperAdmins.css";
import "./WhatsAppAdmin.css";

const API = "/api/whatsapp/admin";
const ABAS_VALIDAS = ["conexao", "planos", "lojas", "custos", "uso", "cobranca", "historico"];

const TIPO_LABEL = { consulta: "Consulta", pdf: "Relatório PDF", cadastro: "Cadastro", foto: "Foto", alerta: "Alerta" };
const TIPO_PLURAL = { consulta: "consultas", pdf: "relatórios em PDF", cadastro: "cadastros", foto: "fotos lidas", alerta: "alertas" };
const TIPO_DICA = {
  consulta: "Uma pergunta do comerciante (ex.: “quanto vendi hoje?”) e a resposta.",
  pdf: "Pedido de um relatório em PDF enviado pelo WhatsApp.",
  cadastro: "Cadastrar algo pelo WhatsApp (produto, despesa…), com confirmação.",
  foto: "Foto de nota ou produto lida pela IA e confirmada pelo comerciante.",
  alerta: "Aviso automático enviado pelo sistema (estoque baixo, conta vencendo…).",
};
const RECURSOS = [
  { k: "alertas", label: "Alertas automáticos", dica: "Avisos que o sistema manda sozinho (fiado vencendo, estoque baixo, contas, resumo do dia). Cada alerta gasta o peso de “Alerta” (padrão 0,5 crédito)." },
  { k: "consultas", label: "Perguntas / consultas", dica: "O comerciante pergunta (“quanto vendi hoje?”, “quantas Coca tenho?”) e recebe a resposta. 1 consulta completa = 1 crédito (padrão)." },
  { k: "pdf", label: "Relatórios em PDF", dica: "Pedir um relatório e receber o PDF pelo WhatsApp. 1 pedido = 1 crédito (padrão)." },
  { k: "cadastro", label: "Cadastro pelo WhatsApp", dica: "Cadastrar ou ajustar algo (produto, estoque, receber fiado) com confirmação e PIN. 1 pedido = 2 créditos (padrão)." },
  { k: "foto", label: "Foto de nota / produto", dica: "Mandar foto de nota ou contagem; a IA lê e o comerciante confirma antes de gravar. 1 pedido = 4 créditos (padrão)." },
  { k: "ia_audio", label: "Áudio (IA)", dica: "Aceitar perguntas por áudio (a IA transcreve). Custo de frações de centavo; gasta o mesmo crédito do tipo de pedido." },
];
const ACAO_TETO = {
  pausar: "Pausar as respostas até o próximo ciclo (alertas continuam)",
  modelo_barato: "Trocar para o modelo de IA mais barato",
  so_avisar: "Só me avisar (não muda nada pra loja)",
};
const PRESETS_IA = [
  { nome: "Gemini 2.5 Flash-Lite", rotulo: "Econômico — Gemini 2.5 Flash-Lite", interp: 0.001, img: 0.004 },
  { nome: "Claude Haiku 4.5", rotulo: "Mais caro — Claude Haiku 4.5", interp: 0.009, img: 0.018 },
];
const SITUACAO = {
  ok: { cls: "ok", txt: "Margem saudável" },
  margem_baixa: { cls: "alerta", txt: "Margem abaixo do mínimo" },
  abaixo_minimo: { cls: "perigo", txt: "Abaixo do preço mínimo" },
};
const ACAO_HIST = {
  criado: "Criou", editado: "Editou", ativado: "Ativou", desativado: "Desativou",
  excluido: "Excluiu", parametros: "Alterou os parâmetros",
};

/* ── Formatação ─────────────────────────────────────────────── */
const brl = (v, casas = 2) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const nf = (v, casas = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dataHora = (iso) => {
  try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return ""; }
};
const mesAtual = () => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return d.slice(0, 7);
};
const numStr = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const lerNum = (s) => {
  const n = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Atualização imutável num caminho ("meta.preco_resposta")
function comValor(obj, caminho, valor) {
  const partes = caminho.split(".");
  const novo = { ...obj };
  let cur = novo;
  for (let i = 0; i < partes.length - 1; i++) {
    cur[partes[i]] = { ...(cur[partes[i]] || {}) };
    cur = cur[partes[i]];
  }
  cur[partes[partes.length - 1]] = valor;
  return novo;
}
const pegar = (obj, caminho) => caminho.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/* ── Componentes pequenos (fora do principal pra não perder o foco) ── */
// lado: "cima" (padrão) | "baixo" (dentro de tabela com rolagem) | "esq" (perto da borda direita)
function Dica({ texto, lado }) {
  if (!texto) return null;
  return (
    <span className={`wa-dica${lado ? ` ${lado}` : ""}`} tabIndex={0} aria-label={texto}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      ?<span className="wa-dica-balao" role="tooltip">{texto}</span>
    </span>
  );
}

function Campo({ label, dica, valor, onChange, prefixo, sufixo, disabled, largura, tipo = "decimal" }) {
  return (
    <label className="wa-campo" style={largura ? { maxWidth: largura } : undefined}>
      <span className="wa-campo-label">{label} <Dica texto={dica} /></span>
      <span className={`wa-campo-input${disabled ? " desab" : ""}`}>
        {prefixo && <span className="wa-campo-afixo">{prefixo}</span>}
        <input
          type="text" inputMode={tipo === "inteiro" ? "numeric" : "decimal"}
          value={numStr(valor)} disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ""))}
        />
        {sufixo && <span className="wa-campo-afixo">{sufixo}</span>}
      </span>
    </label>
  );
}

function Selo({ situacao }) {
  const s = SITUACAO[situacao] || SITUACAO.ok;
  return <span className={`wa-selo ${s.cls}`}>{s.txt}</span>;
}

function Secao({ titulo, sub, children, icone }) {
  return (
    <section className="wa-secao">
      <header className="wa-secao-head">
        {icone && <span className="wa-secao-icone">{icone}</span>}
        <div>
          <h3>{titulo}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      <div className="wa-secao-corpo">{children}</div>
    </section>
  );
}

/* ── Página ─────────────────────────────────────────────────── */
export default function WhatsAppAdmin() {
  // ?aba=lojas (link da Central de Notificações) abre direto na aba certa
  const [aba, setAba] = useState(() => {
    try { const a = new URLSearchParams(window.location.search).get("aba"); return ABAS_VALIDAS.includes(a) ? a : "planos"; } catch { return "planos"; }
  });
  const [pendLojas, setPendLojas] = useState(0);
  const [numeroMeta, setNumeroMeta] = useState(null); // número conectado na Meta (30/09)
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [toast, setToast] = useState(null);
  const [podeEditar, setPodeEditar] = useState(false);

  const [salvo, setSalvo] = useState(null);   // parâmetros como estão no banco (normalizados)
  const [rasc, setRasc] = useState(null);     // rascunho em edição (pode ter texto)
  const [salvandoParams, setSalvandoParams] = useState(false);
  const [cotacao, setCotacao] = useState(null);   // { valor, fonte, data, atualizado_em, erro? }
  const [atualizandoDolar, setAtualizandoDolar] = useState(false);

  const [planos, setPlanos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [lojas, setLojas] = useState(null);

  const avisar = useCallback((msg, tipo = "ok") => {
    setToast({ msg, tipo, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const carregarPlanos = useCallback(async () => {
    const r = await apiFetch(`${API}/planos`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Erro ao carregar os planos.");
    setPlanos(j.planos || []);
    setPodeEditar(!!j.pode_editar);
  }, []);

  const carregarHistorico = useCallback(async () => {
    const r = await apiFetch(`${API}/historico`);
    const j = await r.json();
    if (r.ok) setHistorico(Array.isArray(j) ? j : []);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch(`${API}/parametros`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Erro ao carregar.");
        if (!vivo) return;
        setSalvo(j.parametros);
        setRasc(j.parametros);
        setCotacao(j.cotacao || null);
        setPodeEditar(!!j.pode_editar);
        await carregarPlanos();
        // Contador da aba Lojas (pedidos esperando) — sem travar a página se falhar
        apiFetch(`${API}/assinaturas`).then(r2 => r2.json().then(j2 => {
          if (vivo && r2.ok) setPendLojas((j2.pendentes?.length || 0) + (j2.pacotes?.length || 0));
        })).catch(() => {});
      } catch (e) {
        if (vivo) setErro(e.message || "Erro ao carregar.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [carregarPlanos]);

  // Tempo real (30/09): loja pediu/trocou plano ou pacote → contador da
  // aba Lojas atualiza sozinho (a própria aba também recarrega).
  const atualizarContadorLojas = useCallback(() => {
    apiFetch(`${API}/assinaturas`).then(r2 => r2.json().then(j2 => {
      if (r2.ok) setPendLojas((j2.pendentes?.length || 0) + (j2.pacotes?.length || 0));
    })).catch(() => {});
  }, []);
  useAvisosGlobais(["whatsapp_admin"], atualizarContadorLojas, { atraso: 800 });

  // Situação do número na Meta, pro aviso do topo (sem travar a página)
  useEffect(() => {
    apiFetch(`${API}/conexao`).then(r => r.json().then(j => {
      if (r.ok && j.numero?.display_phone_number) setNumeroMeta(j.numero.display_phone_number);
    })).catch(() => {});
  }, []);

  useEffect(() => {
    if (aba === "historico") carregarHistorico();
    if (aba === "cobranca" && lojas === null) {
      apiFetch(`${API}/lojas`).then(r => r.json().then(j => setLojas(r.ok && Array.isArray(j) ? j : []))).catch(() => setLojas([]));
    }
  }, [aba, carregarHistorico, lojas]);

  // Parâmetros "de verdade" do rascunho (texto → número, limites)
  // Com o dólar automático, a folga digitada já muda a conta ao vivo.
  const pRasc = useMemo(() => (rasc ? aplicarDolarAuto(normalizarParametros(rasc), cotacao) : null), [rasc, cotacao]);
  const sujo = useMemo(
    () => !!(salvo && pRasc && JSON.stringify(pRasc) !== JSON.stringify(aplicarDolarAuto(normalizarParametros(salvo), cotacao))),
    [salvo, pRasc, cotacao]
  );
  const pSalvo = useMemo(() => (salvo ? normalizarParametros(salvo) : null), [salvo]);

  const setP = useCallback((caminho, valor) => setRasc(r => comValor(r, caminho, valor)), []);

  async function salvarParametros() {
    setSalvandoParams(true);
    try {
      const r = await apiFetch(`${API}/parametros`, { method: "PUT", body: JSON.stringify({ parametros: pRasc }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar.");
      setSalvo(j.parametros);
      setRasc(j.parametros);
      if (j.cotacao !== undefined) setCotacao(j.cotacao);
      await carregarPlanos();
      avisar("Parâmetros salvos.");
    } catch (e) {
      avisar(e.message, "erro");
    } finally {
      setSalvandoParams(false);
    }
  }

  // "↻ Atualizar agora": busca a cotação do dia no servidor. Só troca o
  // dólar (salvo e rascunho) — não mexe em mais nada que esteja sendo editado.
  async function atualizarDolar() {
    setAtualizandoDolar(true);
    try {
      const r = await apiFetch(`${API}/dolar/atualizar`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao atualizar a cotação.");
      setCotacao(j.cotacao || null);
      setSalvo(s => comValor(s, "ia.dolar", j.parametros.ia.dolar));
      setRasc(x => comValor(x, "ia.dolar", j.parametros.ia.dolar));
      await carregarPlanos();
      if (j.cotacao?.erro) avisar(j.cotacao.erro, "erro");
      else avisar(`Dólar atualizado: ${brl(j.cotacao.valor, 4)}`);
    } catch (e) {
      avisar(e.message, "erro");
    } finally {
      setAtualizandoDolar(false);
    }
  }

  const abas = [
    { id: "conexao", label: "Conexão", icone: "🔌" },
    { id: "planos", label: "Planos", icone: "📦" },
    { id: "lojas", label: "Lojas", icone: "🏪", badge: pendLojas },
    { id: "custos", label: "Custos e parâmetros", icone: "🧮", sujo },
    { id: "uso", label: "Uso do mês", icone: "📊" },
    { id: "cobranca", label: "Cobrança de mensalidades", icone: "🔔", sujo },
    { id: "historico", label: "Histórico", icone: "🕘" },
  ];

  return (
    <LayoutAdmin>
      <div className="sa-wrapper wa-root">
        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">SuperAdmin · Serviço adicional</span>
            <h1 className="sa-page-title">WhatsApp <span>planos e custos</span></h1>
          </div>
        </div>

        {carregando ? (
          <div className="sa-loading"><div className="sa-spinner" />Carregando…</div>
        ) : erro ? (
          <div className="wa-erro-geral">
            <strong>Não foi possível abrir o painel.</strong>
            <span>{erro}</span>
            <small>Se acabou de atualizar o sistema, confira se o SQL 11 (tabelas do WhatsApp) já foi rodado no Supabase.</small>
          </div>
        ) : (
          <>
            <div className={`wa-status ${pSalvo?.integracao?.ativo ? "on" : numeroMeta ? "teste" : "off"}`}>
              <span className="wa-status-bola" />
              <div>
                <strong>{pSalvo?.integracao?.ativo ? `Número conectado${numeroMeta ? ` (${numeroMeta})` : ""} e liberado para as lojas` : numeroMeta ? `Número conectado (${numeroMeta}) — em testes` : "Aguardando número brasileiro"}</strong>
                <span>
                  {pSalvo?.integracao?.ativo
                    ? "Envios e respostas ativos."
                    : numeroMeta
                      ? "O número já envia e recebe mensagens. As lojas ainda veem \"Em breve\" — libere na aba Conexão quando os testes estiverem ok."
                      : "Nada é enviado ainda. Já dá pra montar os planos, os custos e as regras; tudo passa a valer quando o número for conectado na Meta."}
                </span>
              </div>
            </div>

            {!podeEditar && (
              <div className="wa-somente-leitura">🔒 Você pode visualizar tudo. Só o SuperAdmin master altera planos e parâmetros.</div>
            )}

            <nav className="wa-abas" role="tablist">
              {abas.map(a => (
                <button key={a.id} type="button" role="tab" aria-selected={aba === a.id}
                  className={aba === a.id ? "ativo" : ""} onClick={() => setAba(a.id)}>
                  <span aria-hidden="true">{a.icone}</span> {a.label}
                  {a.sujo && <span className="wa-aba-ponto" title="Alterações não salvas" />}
                  {a.badge > 0 && <span className="wa-aba-badge" title="Esperando você">{a.badge}</span>}
                </button>
              ))}
            </nav>

            {aba === "planos" && (
              <AbaPlanos planos={planos} params={pSalvo} podeEditar={podeEditar}
                recarregar={carregarPlanos} avisar={avisar} />
            )}
            {aba === "custos" && (
              <AbaCustos rasc={rasc} p={pRasc} setP={setP} setRasc={setRasc} podeEditar={podeEditar}
                cotacao={cotacao} onAtualizarDolar={atualizarDolar} atualizandoDolar={atualizandoDolar}
                planos={planos} pSalvo={pSalvo} />
            )}
            {aba === "uso" && <AbaUso />}
            {aba === "conexao" && (
              <AbaConexao podeEditarPagina={podeEditar} avisar={avisar} liberado={!!salvo?.integracao?.ativo}
                onLiberado={(ativo) => {
                  setSalvo(s => (s ? { ...s, integracao: { ...s.integracao, ativo } } : s));
                  setRasc(r => (r ? { ...r, integracao: { ...r.integracao, ativo } } : r));
                }} />
            )}
            {aba === "lojas" && <AbaLojas podeEditarPagina={podeEditar} avisar={avisar} onPendentes={setPendLojas} />}
            {aba === "cobranca" && (
              <AbaCobranca rasc={rasc} p={pRasc} setP={setP} podeEditar={podeEditar} lojas={lojas} />
            )}
            {aba === "historico" && <AbaHistorico itens={historico} />}

            {sujo && podeEditar && (aba === "custos" || aba === "cobranca") && (
              <div className="wa-barra-salvar">
                <span>Você tem alterações não salvas nos parâmetros.</span>
                <div>
                  <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setRasc(salvo)} disabled={salvandoParams}>Descartar</button>
                  <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={salvarParametros} disabled={salvandoParams}>
                    {salvandoParams ? "Salvando…" : "Salvar parâmetros"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {toast && <div key={toast.id} className={`wa-toast ${toast.tipo}`} role="status">{toast.msg}</div>}
      </div>
    </LayoutAdmin>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA PLANOS
   ══════════════════════════════════════════════════════════════ */
const PLANO_VAZIO = {
  tipo: "plano", nome: "", descricao: "", preco: "", creditos: "", numeros: "1",
  recursos: { alertas: true, consultas: true, pdf: true, cadastro: false, foto: false, ia_audio: false },
  destaque: false, ordem: "0", ativo: true,
};

function AbaPlanos({ planos, params, podeEditar, recarregar, avisar }) {
  const [modal, setModal] = useState(null);       // { plano|null }
  const [excluir, setExcluir] = useState(null);
  const [confirmAtivar, setConfirmAtivar] = useState(null); // { plano, msg }
  const [ocupado, setOcupado] = useState(false);

  const mensais = planos.filter(p => p.tipo !== "pacote");
  const pacotes = planos.filter(p => p.tipo === "pacote");
  const cmc = params ? custoMaxPorCredito(params) : 0;

  async function alternarAtivo(plano, confirmar = false) {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/planos/${plano.id}/ativo`, {
        method: "PATCH", body: JSON.stringify({ ativo: !plano.ativo, confirmar_abaixo_minimo: confirmar }),
      });
      const j = await r.json();
      if (r.status === 409 && j.codigo === "ABAIXO_MINIMO") { setConfirmAtivar({ plano, msg: j.error }); return; }
      if (!r.ok) throw new Error(j.error || "Erro ao alterar.");
      setConfirmAtivar(null);
      await recarregar();
      avisar(plano.ativo ? `“${plano.nome}” desativado.` : `“${plano.nome}” ativado.`);
    } catch (e) { avisar(e.message, "erro"); } finally { setOcupado(false); }
  }

  async function confirmarExcluir() {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}/planos/${excluir.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao excluir.");
      setExcluir(null);
      await recarregar();
      avisar("Plano excluído.");
    } catch (e) { avisar(e.message, "erro"); } finally { setOcupado(false); }
  }

  const grade = (lista, vazio) => (
    lista.length === 0 ? <div className="wa-vazio-mini">{vazio}</div> : (
      <div className="wa-planos-grade">
        {lista.map(pl => (
          <CartaoPlano key={pl.id} pl={pl} podeEditar={podeEditar} ocupado={ocupado}
            onEditar={() => setModal({ plano: pl })}
            onAtivo={() => alternarAtivo(pl)}
            onExcluir={() => setExcluir(pl)} />
        ))}
      </div>
    )
  );

  return (
    <div className="wa-aba">
      <div className="wa-faixa-info">
        <div>
          <span className="wa-faixa-rot">Custo máximo por crédito <Dica texto="O quanto um crédito pode custar pra você no pior caso: o tipo de pedido mais caro, usando tudo que as travas permitem (envios da Meta + IA). É a base do preço mínimo de cada plano." /></span>
          <strong>{brl(cmc, 4)}</strong>
        </div>
        <div>
          <span className="wa-faixa-rot">Impostos + taxa do pagamento <Dica texto="Soma dos impostos e da taxa do meio de pagamento, descontada de todo preço. Muda em Custos e parâmetros → Preço mínimo dos planos." /></span>
          <strong>{nf((params?.precificacao.impostos_pct || 0) + (params?.precificacao.taxa_gateway_pct || 0), 1)}%</strong>
        </div>
        <div>
          <span className="wa-faixa-rot">Margem de segurança <Dica texto="Folga multiplicada sobre o pior caso (× 1,30 = 30% a mais), pra aguentar alta do dólar ou reajuste da Meta sem prejuízo." /></span>
          <strong>× {nf(params?.precificacao.margem_seguranca, 2)}</strong>
        </div>
        {podeEditar && (
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => setModal({ plano: null })}>+ Novo plano ou pacote</button>
        )}
      </div>

      {planos.length === 0 ? (
        <div className="wa-vazio">
          <div className="wa-vazio-icone">📦</div>
          <h3>Nenhum plano criado ainda</h3>
          <p>
            Crie os planos mensais (ex.: “Básico — 150 créditos”) e, se quiser, pacotes extras pra quem acabar o saldo antes do fim do mês.
            O painel mostra na hora o preço mínimo pra não sair no prejuízo.
          </p>
          {podeEditar && <button type="button" className="sa-btn sa-btn-primary" onClick={() => setModal({ plano: null })}>Criar o primeiro plano</button>}
        </div>
      ) : (
        <>
          <h3 className="wa-subtitulo">Planos mensais <span>{mensais.length}</span>
            <Dica texto="Assinatura mensal: o saldo de créditos renova todo mês e não acumula." /></h3>
          {grade(mensais, "Nenhum plano mensal.")}
          <h3 className="wa-subtitulo">Pacotes extras <span>{pacotes.length}</span>
            <Dica texto="Créditos avulsos pra quando o saldo do mês acabar. Valem até o fim do ciclo." /></h3>
          {grade(pacotes, "Nenhum pacote extra. Opcional: créditos avulsos pra quem acabar o saldo antes do fim do mês.")}
        </>
      )}

      {params && (
        <div className="wa-previa-creditos">
          <div className="wa-previa-rotulo">
            👁️ Prévia — é isto que o comerciante vai ver na tela de contratação do WhatsApp
            <Dica texto="Mesma explicação usada na tela da loja. Os números seguem os pesos salvos em Custos e parâmetros; o exemplo usa os créditos do primeiro plano mensal ativo." />
          </div>
          <TabelaCreditos pesos={params.pesos}
            creditos={(mensais.find(p => p.ativo) || mensais[0])?.creditos || 150} />
        </div>
      )}

      {modal && (
        <ModalPlano plano={modal.plano} params={params} onFechar={() => setModal(null)}
          onSalvo={async (msg) => { setModal(null); await recarregar(); avisar(msg); }} />
      )}

      {excluir && (
        <div className="sa-modal-overlay" onClick={() => !ocupado && setExcluir(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sa-modal-icon danger">🗑️</div>
            <div className="sa-modal-title">Excluir “{excluir.nome}”?</div>
            <div className="sa-modal-subtitle">
              Some da lista de planos. Fica registrado no histórico. Se só quiser parar de oferecer, prefira <strong>desativar</strong>.
            </div>
            <div className="sa-modal-actions">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setExcluir(null)} disabled={ocupado}>Cancelar</button>
              <button type="button" className="sa-btn sa-btn-danger" onClick={confirmarExcluir} disabled={ocupado}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {confirmAtivar && (
        <div className="sa-modal-overlay" onClick={() => !ocupado && setConfirmAtivar(null)}>
          <div className="sa-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sa-modal-icon danger">⚠️</div>
            <div className="sa-modal-title">Ativar abaixo do preço mínimo?</div>
            <div className="sa-modal-subtitle">{confirmAtivar.msg} No pior caso, esse plano dá prejuízo.</div>
            <div className="sa-modal-actions">
              <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setConfirmAtivar(null)} disabled={ocupado}>Cancelar</button>
              <button type="button" className="sa-btn sa-btn-warning" onClick={() => alternarAtivo(confirmAtivar.plano, true)} disabled={ocupado}>Ativar mesmo assim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartaoPlano({ pl, podeEditar, ocupado, onEditar, onAtivo, onExcluir }) {
  const c = pl.calculo || {};
  const recursos = RECURSOS.filter(r => pl.recursos?.[r.k]);
  return (
    <article className={`wa-plano${pl.ativo ? "" : " inativo"}${pl.destaque ? " destaque" : ""}`}>
      <header>
        <div>
          <h4>{pl.nome} {pl.destaque && <span className="wa-estrela" title="Destaque">★</span>}</h4>
          {!pl.ativo && <span className="wa-tag-inativo">Desativado</span>}
        </div>
        <div className="wa-plano-preco">
          <strong>{brl(pl.preco)}</strong>
          <span>{pl.tipo === "pacote" ? "avulso" : "/mês"}</span>
        </div>
      </header>
      {pl.descricao && <p className="wa-plano-desc">{pl.descricao}</p>}
      <div className="wa-plano-creditos">
        <strong>{nf(pl.creditos)}</strong> créditos
        {pl.numeros > 1 && <span> · {pl.numeros} números</span>}
        <Dica texto={`1 crédito = 1 consulta completa (pergunta + resposta). ${nf(pl.creditos)} créditos ≈ ${nf(pl.creditos)} consultas, ou metade disso em cadastros, ou o dobro em alertas — o comerciante mistura como quiser.`} />
      </div>
      {recursos.length > 0 && (
        <div className="wa-chips">{recursos.map(r => <span key={r.k} className="wa-chip">{r.label}</span>)}</div>
      )}
      <dl className="wa-plano-conta">
        <div><dt>Custo no pior caso <Dica texto="Quanto você pagaria (Meta + IA) se o comerciante gastasse TODOS os créditos do jeito mais caro possível. No uso normal o custo real fica bem abaixo disso." /></dt><dd>{brl(c.custo_pior)}</dd></div>
        <div><dt>Impostos + taxa <Dica texto="Parte do preço que vai pra impostos e pra taxa do meio de pagamento (Pix/cartão). Percentuais definidos em Custos e parâmetros." /></dt><dd>{brl(c.impostos_taxas)}</dd></div>
        <div className="forte"><dt>Sobra pra você <Dica texto="Preço − custo no pior caso − impostos e taxa. É o seu lucro mínimo garantido, mesmo se a loja usar tudo do jeito mais caro." /></dt><dd className={c.margem < 0 ? "neg" : ""}>{brl(c.margem)} <small>({nf(c.margem_pct, 1)}%)</small></dd></div>
        <div><dt>Preço mínimo <Dica texto="Menor preço que cobre o pior caso com a margem de segurança e os impostos/taxa. Abaixo disso o plano pode dar prejuízo — o sistema pede confirmação." /></dt><dd>{brl(c.preco_minimo)}</dd></div>
      </dl>
      <Selo situacao={c.situacao} />
      {podeEditar && (
        <footer>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onEditar} disabled={ocupado}>Editar</button>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onAtivo} disabled={ocupado}>{pl.ativo ? "Desativar" : "Ativar"}</button>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm wa-btn-excluir" onClick={onExcluir} disabled={ocupado}>Excluir</button>
        </footer>
      )}
      {pl.atualizado_por_nome && <small className="wa-plano-rodape">Alterado por {pl.atualizado_por_nome} · {dataHora(pl.atualizado_em)}</small>}
    </article>
  );
}

function ModalPlano({ plano, params, onFechar, onSalvo }) {
  const [f, setF] = useState(() => plano ? {
    tipo: plano.tipo, nome: plano.nome, descricao: plano.descricao || "",
    preco: numStr(plano.preco), creditos: String(plano.creditos), numeros: String(plano.numeros || 1),
    recursos: { ...PLANO_VAZIO.recursos, ...(plano.recursos || {}) },
    destaque: !!plano.destaque, ordem: String(plano.ordem ?? 0), ativo: !!plano.ativo,
  } : { ...PLANO_VAZIO, recursos: { ...PLANO_VAZIO.recursos } });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setRec = (k, v) => setF(x => ({ ...x, recursos: { ...x.recursos, [k]: v } }));

  const creditos = parseInt(f.creditos, 10) || 0;
  const calc = useMemo(
    () => calcularPlano({ preco: lerNum(f.preco), creditos, recursos: f.recursos }, params),
    [f.preco, creditos, f.recursos, params]
  );
  const cabe = TIPOS_PEDIDO
    .filter(t => t === "alerta" ? f.recursos.alertas : t === "consulta" ? f.recursos.consultas : f.recursos[t])
    .map(t => ({ t, qtd: Math.floor(creditos / params.pesos[t]) }));

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape" && !salvando) onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar, salvando]);

  async function salvar(confirmarAbaixo = false) {
    setErro("");
    if (!f.nome.trim()) return setErro("Informe o nome.");
    if (creditos < 1) return setErro("Informe quantos créditos o plano dá.");
    if (String(f.preco).trim() === "") return setErro("Informe o preço.");
    setSalvando(true);
    try {
      const corpo = {
        tipo: f.tipo, nome: f.nome.trim(), descricao: f.descricao.trim(),
        preco: lerNum(f.preco), creditos, numeros: parseInt(f.numeros, 10) || 1,
        recursos: f.recursos, destaque: f.destaque, ordem: parseInt(f.ordem, 10) || 0, ativo: f.ativo,
        confirmar_abaixo_minimo: confirmarAbaixo,
      };
      const r = await apiFetch(plano ? `${API}/planos/${plano.id}` : `${API}/planos`, {
        method: plano ? "PUT" : "POST", body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (r.status === 409 && j.codigo === "ABAIXO_MINIMO") { setConfirmar(j.error); return; }
      if (!r.ok) throw new Error(j.error || "Erro ao salvar.");
      onSalvo(plano ? "Plano atualizado." : (f.tipo === "pacote" ? "Pacote criado." : "Plano criado."));
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="sa-modal-overlay" onClick={() => !salvando && onFechar()}>
      <div className="sa-modal wa-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Plano de WhatsApp">
        <div className="wa-modal-head">
          <div className="sa-modal-title">{plano ? `Editar “${plano.nome}”` : "Novo plano ou pacote"}</div>
          <button type="button" className="wa-x" onClick={onFechar} aria-label="Fechar" disabled={salvando}>×</button>
        </div>

        <div className="wa-modal-corpo">
          <div className="wa-modal-form">
            <div className="wa-seg-linha">
              <div className="wa-seg">
                <button type="button" className={f.tipo === "plano" ? "ativo" : ""} onClick={() => set("tipo", "plano")}>Plano mensal</button>
                <button type="button" className={f.tipo === "pacote" ? "ativo" : ""} onClick={() => set("tipo", "pacote")}>Pacote extra</button>
              </div>
              <Dica lado="baixo" texto="Plano mensal: o comerciante assina e recebe o saldo de créditos todo mês (não acumula). Pacote extra: créditos avulsos pra quem acabou o saldo antes do fim do mês; valem até o fim do ciclo." />
            </div>
            <label className="wa-campo">
              <span className="wa-campo-label">Nome <Dica texto="Nome que o comerciante vê na hora de contratar (ex.: Básico, Completo, +100 créditos)." /></span>
              <input className="sa-input" value={f.nome} maxLength={80} onChange={e => set("nome", e.target.value)} placeholder={f.tipo === "pacote" ? "Ex.: +100 créditos" : "Ex.: Básico"} autoFocus />
            </label>
            <label className="wa-campo">
              <span className="wa-campo-label">Descrição <small>(o comerciante vê)</small> <Dica texto="Texto curto explicando pra quem o plano serve. Aparece embaixo do nome na tela de contratação. Opcional." /></span>
              <textarea className="sa-input" rows={2} maxLength={500} value={f.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Ex.: Ideal pra quem quer alertas e perguntas do dia a dia." />
            </label>
            <div className="wa-linha">
              <Campo label="Preço" prefixo="R$" valor={f.preco} onChange={v => set("preco", v)}
                dica={f.tipo === "pacote" ? "Valor cobrado uma vez pelo pacote." : "Valor mensal cobrado do comerciante."} />
              <Campo label="Créditos" tipo="inteiro" valor={f.creditos} onChange={v => set("creditos", v.replace(/\D/g, ""))}
                dica="Saldo que o comerciante recebe por mês (ou no pacote). Ele gasta como quiser; cada tipo de pedido consome um peso." />
              <Campo label="Números" tipo="inteiro" valor={f.numeros} onChange={v => set("numeros", v.replace(/\D/g, ""))} largura={110}
                dica="Quantos números de WhatsApp da loja podem usar o saldo (dono, gerente…)." />
            </div>
            <div className="wa-campo">
              <span className="wa-campo-label">O que o plano inclui <Dica texto="Os tipos marcados entram na conta do custo máximo. Sem nenhum marcado, a conta considera todos." /></span>
              <div className="wa-checks">
                {RECURSOS.map(r => (
                  <label key={r.k} className="wa-check">
                    <input type="checkbox" checked={!!f.recursos[r.k]} onChange={e => setRec(r.k, e.target.checked)} />
                    {r.label} <Dica texto={r.dica} />
                  </label>
                ))}
              </div>
            </div>
            <div className="wa-linha wa-linha-baixo">
              <label className="wa-check"><input type="checkbox" checked={f.destaque} onChange={e => set("destaque", e.target.checked)} /> Destacar (“mais escolhido”) <Dica texto="Marca o plano com uma estrela e um selo de destaque na tela de contratação, pra chamar atenção." /></label>
              <label className="wa-check"><input type="checkbox" checked={f.ativo} onChange={e => set("ativo", e.target.checked)} /> Ativo (oferecido às lojas) <Dica texto="Desmarcado, o plano fica salvo mas não aparece pra contratar. Quem já assinou continua com ele." /></label>
              <Campo label="Ordem" tipo="inteiro" valor={f.ordem} onChange={v => set("ordem", v.replace(/[^\d-]/g, ""))} largura={90}
                dica="Posição na lista (menor aparece primeiro)." />
            </div>
          </div>

          <aside className="wa-calc">
            <h4>Conta ao vivo <Dica lado="esq" texto="Recalcula a cada tecla com os parâmetros salvos em Custos e parâmetros. Quem decide de verdade ao salvar é o servidor, com a mesma conta." /></h4>
            <dl>
              <div><dt>Custo máx. por crédito <Dica lado="esq" texto="O quanto 1 crédito pode custar pra você no pior caso: o tipo de pedido mais caro incluído no plano, usando tudo que as travas permitem (mensagens da Meta + IA)." /></dt><dd>{brl(calc.custo_max_credito, 4)}</dd></div>
              <div><dt>Custo no pior caso <Dica lado="esq" texto="Quanto você pagaria (Meta + IA) se o comerciante gastasse TODOS os créditos do jeito mais caro possível. No uso normal o custo real fica bem abaixo disso." /></dt><dd>{brl(calc.custo_pior)}</dd></div>
              <div><dt>Impostos + taxa <Dica lado="esq" texto="Parte do preço que vai pra impostos e pra taxa do meio de pagamento (Pix/cartão). Percentuais definidos em Custos e parâmetros." /></dt><dd>{brl(calc.impostos_taxas)}</dd></div>
              <div className="forte"><dt>Sobra pra você <Dica lado="esq" texto="Preço − custo no pior caso − impostos e taxa. É o seu lucro mínimo garantido, mesmo se a loja usar tudo do jeito mais caro." /></dt><dd className={calc.margem < 0 ? "neg" : ""}>{brl(calc.margem)} <small>({nf(calc.margem_pct, 1)}%)</small></dd></div>
            </dl>
            <div className="wa-calc-min">
              <span>Preço mínimo <Dica lado="esq" texto="Menor preço que cobre o pior caso com a margem de segurança e os impostos/taxa. Abaixo disso o plano pode dar prejuízo — o sistema pede confirmação." /></span>
              <strong>{brl(calc.preco_minimo)}</strong>
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={!creditos}
                title="Preenche o preço com o mínimo, arredondado pra cima (ex.: 21,67 → 21,70)"
                onClick={() => set("preco", numStr((Math.ceil(calc.preco_minimo * 10) / 10).toFixed(2)))}>Usar o mínimo</button>
            </div>
            {creditos > 0 && <Selo situacao={calc.situacao} />}
            {creditos > 0 && cabe.length > 0 && (
              <div className="wa-cabe">
                <span>Com {nf(creditos)} créditos dá pra fazer, por exemplo: <Dica lado="esq" texto="Cada linha é “se usar tudo só nisso”. 1 crédito = 1 consulta completa (a pergunta e a resposta, incluindo confirmação). Pesos editáveis em Custos e parâmetros." /></span>
                <ul>{cabe.map(c => <li key={c.t}><strong>{nf(c.qtd)}</strong> {TIPO_PLURAL[c.t]}</li>)}</ul>
                <small>…ou qualquer mistura, até acabar o saldo.</small>
              </div>
            )}
          </aside>
        </div>

        {erro && <div className="wa-erro">{erro}</div>}
        {confirmar && (
          <div className="wa-confirmar">
            <strong>⚠️ {confirmar}</strong>
            <span>No pior caso esse plano dá prejuízo. Quer salvar assim mesmo?</span>
            <div>
              <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setConfirmar(null)} disabled={salvando}>Voltar e ajustar</button>
              <button type="button" className="sa-btn sa-btn-warning sa-btn-sm" onClick={() => salvar(true)} disabled={salvando}>Salvar mesmo assim</button>
            </div>
          </div>
        )}
        <div className="sa-modal-actions">
          <button type="button" className="sa-btn sa-btn-ghost" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button type="button" className="sa-btn sa-btn-primary" onClick={() => salvar(false)} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA CUSTOS E PARÂMETROS
   ══════════════════════════════════════════════════════════════ */
function AbaCustos({ rasc, p, setP, setRasc, podeEditar, planos, pSalvo, cotacao, onAtualizarDolar, atualizandoDolar }) {
  const d = !podeEditar;
  const pc = useMemo(() => piorCasoPorPedido(p), [p]);
  const maxTipo = TIPOS_PEDIDO.reduce((a, t) => (pc[t].por_credito > pc[a].por_credito ? t : a), TIPOS_PEDIDO[0]);
  const cmc = custoMaxPorCredito(p);
  const cmcSalvo = pSalvo ? custoMaxPorCredito(pSalvo) : cmc;

  // Impacto nos planos se salvar o rascunho
  const impacto = useMemo(() => planos.map(pl => {
    const antes = pl.calculo || calcularPlano(pl, pSalvo);
    const depois = calcularPlano(pl, p);
    return { pl, antes, depois };
  }).filter(x => x.antes.situacao !== x.depois.situacao || Math.abs(x.antes.preco_minimo - x.depois.preco_minimo) >= 0.01),
  [planos, p, pSalvo]);

  const C = (caminho, label, props = {}) => (
    <Campo label={label} valor={pegar(rasc, caminho)} onChange={v => setP(caminho, v)} disabled={d} {...props} />
  );

  return (
    <div className="wa-aba wa-custos">
      <div className="wa-custos-grade">
        <div className="wa-custos-col">
          <Secao icone="💬" titulo="Preços da Meta (por mensagem entregue)"
            sub="A Meta não cobra mensalidade. Mensagens recebidas são grátis. Conferir a tabela em BRL todo mês.">
            <div className="wa-linha">
              {C("meta.preco_resposta", "Resposta (janela 24h)", { prefixo: "R$", dica: "Cada mensagem que o sistema manda respondendo o comerciante dentro de 24h da mensagem dele. Cobrada a partir de 01/10/2026 (preço de utilidade)." })}
              {C("meta.preco_utilidade", "Alerta / utilidade", { prefixo: "R$", dica: "Mensagem que o sistema inicia (alerta, lembrete de cobrança). Categoria utilidade." })}
            </div>
            <div className="wa-linha">
              {C("meta.respostas_gratis_mes", "Respostas grátis por mês", { tipo: "inteiro", dica: "Franquia provável da Meta (a confirmar após 01/10). Só entra como desconto no uso real — NUNCA no preço mínimo dos planos." })}
              {C("meta.preco_marketing", "Marketing (só referência)", { prefixo: "R$", dica: "Não usamos mensagens de marketing. Fica só pra comparação." })}
            </div>
          </Secao>

          <SecaoIA rasc={rasc} p={p} setP={setP} setRasc={setRasc} d={d} C={C}
            cotacao={cotacao} onAtualizarDolar={onAtualizarDolar} atualizandoDolar={atualizandoDolar} />

          <Secao icone="⚖️" titulo="Pesos: quantos créditos cada pedido gasta"
            sub="O comerciante tem um saldo único e usa como quiser. Pedido completo conta uma vez (confirmações e correções já estão dentro). A tabela que o comerciante vê está na aba Planos.">
            <div className="wa-linha wa-linha-5">
              {TIPOS_PEDIDO.map(t => (
                <React.Fragment key={t}>{C(`pesos.${t}`, TIPO_LABEL[t], { dica: TIPO_DICA[t] })}</React.Fragment>
              ))}
            </div>
          </Secao>
        </div>

        <div className="wa-custos-col">
          <Secao icone="🛡️" titulo="Travas por pedido (o que garante o pior caso)"
            sub="Limite de mensagens e de leituras da IA dentro de um pedido. Passou disso, o sistema encerra educadamente e pede pra começar de novo.">
            <table className="wa-tabela wa-tabela-travas">
              <thead><tr><th>Pedido <Dica lado="baixo" texto="Tipo de pedido completo (do começo ao fim, com confirmações e correções)." /></th><th>Envios máx. <Dica texto="Quantas mensagens o sistema pode mandar dentro de um pedido (resposta, confirmação, correção…)." /></th><th>Leituras IA máx. <Dica texto="Quantas vezes a IA pode interpretar mensagens dentro do pedido (inclui correções)." /></th></tr></thead>
              <tbody>
                {TIPOS_PEDIDO.map(t => (
                  <tr key={t}>
                    <td>{TIPO_LABEL[t]}</td>
                    <td><Campo label="" tipo="inteiro" valor={pegar(rasc, `travas.envios.${t}`)} onChange={v => setP(`travas.envios.${t}`, v)} disabled={d} /></td>
                    <td><Campo label="" tipo="inteiro" valor={pegar(rasc, `travas.interpretacoes.${t}`)} onChange={v => setP(`travas.interpretacoes.${t}`, v)} disabled={d} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="wa-linha">
              {C("travas.correcoes_max", "Correções por pedido", { tipo: "inteiro", dica: "Quantas vezes o comerciante pode corrigir antes de o pedido ser encerrado." })}
              {C("travas.pedidos_por_minuto", "Pedidos por minuto", { tipo: "inteiro", dica: "Proteção contra uso em massa ou robô." })}
              {C("travas.pedidos_por_dia", "Pedidos por dia", { tipo: "inteiro", dica: "Limite diário por loja, mesmo com saldo." })}
            </div>
          </Secao>

          <Secao icone="🏷️" titulo="Preço mínimo dos planos"
            sub="Preço mínimo = créditos × custo máx. por crédito × margem de segurança ÷ (1 − impostos − taxa).">
            <div className="wa-linha">
              {C("precificacao.impostos_pct", "Impostos", { sufixo: "%", dica: "Imposto sobre o que você recebe (ex.: Simples/MEI/carnê-leão). Confirme com seu contador." })}
              {C("precificacao.taxa_gateway_pct", "Taxa do pagamento", { sufixo: "%", dica: "Taxa do meio de pagamento (Pix, cartão, boleto…)." })}
            </div>
            <div className="wa-linha">
              {C("precificacao.margem_seguranca", "Margem de segurança", { prefixo: "×", dica: "Multiplicador de folga sobre o pior caso (1,3 = 30% a mais) pra cobrir alta do dólar ou da Meta." })}
              {C("precificacao.margem_minima_pct", "Margem mínima desejada", { sufixo: "%", dica: "Se a sobra do plano ficar abaixo disso, o plano aparece em amarelo." })}
            </div>
          </Secao>

          <Secao icone="🚦" titulo="Tetos de gasto"
            sub="Proteção extra além das travas: gasto real de cada loja e do sistema inteiro no mês.">
            <div className="wa-linha">
              {C("teto_loja.aviso_pct", "Avisar em", { tipo: "inteiro", sufixo: "% do plano", dica: "Quando o custo real de uma loja chegar a essa % do valor que ela paga, você recebe um aviso." })}
              {C("teto_loja.acao_pct", "Agir em", { tipo: "inteiro", sufixo: "% do plano", dica: "Quando chegar a essa %, o sistema toma a ação abaixo (a loja paga R$ 30 e já gastou R$ 21 → 70%)." })}
            </div>
            <label className="wa-campo">
              <span className="wa-campo-label">Ação ao atingir o limite <Dica texto="O que o sistema faz quando o custo real de uma loja chega ao “Agir em”. É um disjuntor raro: no uso normal o saldo de créditos acaba bem antes." /></span>
              <select className="sa-input" value={pegar(rasc, "teto_loja.acao")} disabled={d} onChange={e => setP("teto_loja.acao", e.target.value)}>
                {Object.entries(ACAO_TETO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="wa-linha">
              {C("teto_global.mensal_reais", "Teto global do mês", { prefixo: "R$", dica: "Gasto total máximo com a Meta + IA no mês (todas as lojas). Acima disso você é avisado. 0 = sem teto." })}
              {C("custos_fixos.chip_mensal", "Chip / custo fixo", { prefixo: "R$", sufixo: "/mês", dica: "Recarga do chip do número central ou outro custo fixo. Entra no custo do mês." })}
            </div>
          </Secao>
        </div>
      </div>

      <Secao icone="📐" titulo="Pior caso por pedido"
        sub={`Tudo que as travas permitem, com os valores acima${JSON.stringify(p) !== JSON.stringify(pSalvo) ? " (ainda não salvos)" : ""}.`}>
        <div className="wa-tabela-rolagem">
          <table className="wa-tabela">
            <thead><tr>
              <th>Pedido</th>
              <th>Meta <Dica lado="baixo" texto="Envios máximos da trava × preço da mensagem (resposta ou alerta)." /></th>
              <th>IA <Dica lado="baixo" texto="Leituras máximas da IA × custo por interpretação (+ leitura da foto, no pedido por foto), em reais com IOF." /></th>
              <th>Total <Dica lado="baixo" texto="Meta + IA: o máximo que um pedido desse tipo pode custar." /></th>
              <th>Peso <Dica lado="baixo" texto="Quantos créditos esse pedido gasta do saldo do comerciante." /></th>
              <th>Custo por crédito <Dica lado="baixo" texto="Total ÷ peso. O maior valor da coluna (marcado) vira o custo máximo por crédito usado no preço mínimo." /></th>
            </tr></thead>
            <tbody>
              {TIPOS_PEDIDO.map(t => (
                <tr key={t} className={t === maxTipo ? "wa-linha-max" : ""}>
                  <td>{TIPO_LABEL[t]}</td>
                  <td>{brl(pc[t].meta, 4)}</td>
                  <td>{brl(pc[t].ia, 4)}</td>
                  <td>{brl(pc[t].total, 4)}</td>
                  <td>{nf(pc[t].peso, 1)}</td>
                  <td><strong>{brl(pc[t].por_credito, 4)}</strong>{t === maxTipo && <span className="wa-tag-max">maior</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="wa-nota">
          Custo máximo por crédito: <strong>{brl(cmc, 4)}</strong>
          {Math.abs(cmc - cmcSalvo) >= 0.00005 && <> (salvo hoje: {brl(cmcSalvo, 4)})</>}
        </p>
        {impacto.length > 0 && (
          <div className="wa-impacto">
            <strong>Se salvar, muda nos planos:</strong>
            <ul>
              {impacto.map(({ pl, antes, depois }) => (
                <li key={pl.id}>
                  <span>{pl.nome} ({brl(pl.preco)})</span>
                  <span>mínimo {brl(antes.preco_minimo)} → <strong>{brl(depois.preco_minimo)}</strong></span>
                  {antes.situacao !== depois.situacao && <Selo situacao={depois.situacao} />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Secao>

      <Simulador />
    </div>
  );
}

/* ── IA: modelos (atalhos + os que o admin cadastrar) e dólar do dia ── */
function SecaoIA({ rasc, p, setP, setRasc, d, C, cotacao, onAtualizarDolar, atualizandoDolar }) {
  const [novo, setNovo] = useState(null); // { nome, interp, img } enquanto o formulário está aberto
  const [erroNovo, setErroNovo] = useState("");
  const extras = Array.isArray(pegar(rasc, "ia.modelos")) ? pegar(rasc, "ia.modelos") : [];
  const modeloAtual = pegar(rasc, "ia.modelo");
  const auto = pegar(rasc, "ia.dolar_auto") !== false;

  const usar = (nome, interp, img) =>
    setRasc(r => comValor(comValor(comValor(r, "ia.modelo", nome), "ia.usd_por_interpretacao", interp), "ia.usd_por_imagem", img));

  function adicionar() {
    const nome = (novo.nome || "").trim();
    if (!nome) return setErroNovo("Informe o nome do modelo.");
    const todos = [...PRESETS_IA.map(x => x.nome), ...extras.map(x => x.nome)].map(x => x.toLowerCase());
    if (todos.includes(nome.toLowerCase())) return setErroNovo("Já existe um modelo com esse nome.");
    if (extras.length >= 20) return setErroNovo("Limite de 20 modelos cadastrados.");
    const m = { nome, usd_por_interpretacao: lerNum(novo.interp), usd_por_imagem: lerNum(novo.img) };
    setRasc(r => {
      const lista = [...(Array.isArray(pegar(r, "ia.modelos")) ? pegar(r, "ia.modelos") : []), m];
      return comValor(r, "ia.modelos", lista);
    });
    usar(m.nome, m.usd_por_interpretacao, m.usd_por_imagem);
    setNovo(null); setErroNovo("");
  }
  function remover(nome) {
    setRasc(r => comValor(r, "ia.modelos", (pegar(r, "ia.modelos") || []).filter(x => x.nome !== nome)));
  }

  const dataCot = cotacao?.data || cotacao?.atualizado_em;
  let quando = "";
  if (dataCot) {
    // PTAX/AwesomeAPI mandam "AAAA-MM-DD HH:MM:SS.mmm" no horário de Brasília
    const dt = new Date(String(dataCot).replace(" ", "T").replace(/(\.\d{3})\d*$/, "$1"));
    if (!Number.isNaN(dt.getTime())) quando = dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  return (
    <Secao icone="🤖" titulo="Custo da IA (cobrado em dólar)"
      sub="A IA não é da Meta: é cobrada à parte pelo provedor escolhido, no cartão internacional (com IOF).">
      <div className="wa-campo">
        <span className="wa-campo-label">Modelos <Dica texto="Clique num modelo pra usar os custos dele na conta. Os dois primeiros são atalhos fixos; você pode cadastrar outros com o custo que o provedor cobra (US$ por interpretação e por foto)." /></span>
        <div className="wa-presets">
          {PRESETS_IA.map(pr => (
            <button key={pr.nome} type="button" disabled={d}
              className={`wa-preset${modeloAtual === pr.nome ? " ativo" : ""}`}
              onClick={() => usar(pr.nome, pr.interp, pr.img)}>
              {pr.rotulo}
              <small>US$ {numStr(pr.interp)} / interpretação · US$ {numStr(pr.img)} / foto</small>
            </button>
          ))}
          {extras.map(m => (
            <div key={m.nome} className={`wa-preset wa-preset-extra${modeloAtual === m.nome ? " ativo" : ""}`}>
              <button type="button" className="wa-preset-usar" disabled={d}
                onClick={() => usar(m.nome, m.usd_por_interpretacao, m.usd_por_imagem)}>
                {m.nome}
                <small>US$ {numStr(m.usd_por_interpretacao)} / interpretação · US$ {numStr(m.usd_por_imagem)} / foto</small>
              </button>
              {!d && <button type="button" className="wa-preset-x" aria-label={`Remover ${m.nome}`} title="Remover da lista" onClick={() => remover(m.nome)}>×</button>}
            </div>
          ))}
          {!d && !novo && (
            <button type="button" className="wa-preset wa-preset-novo"
              onClick={() => { setErroNovo(""); setNovo({ nome: "", interp: numStr(p.ia.usd_por_interpretacao), img: numStr(p.ia.usd_por_imagem) }); }}>
              + Adicionar modelo
              <small>Cadastrar outro provedor ou modelo</small>
            </button>
          )}
        </div>
      </div>

      {novo && (
        <div className="wa-novo-modelo">
          <label className="wa-campo">
            <span className="wa-campo-label">Nome do modelo <Dica texto="Ex.: GPT-4.1 mini, Gemini 2.5 Flash. Só pra você identificar." /></span>
            <input className="sa-input" value={novo.nome} maxLength={60} autoFocus placeholder="Ex.: GPT-4.1 mini"
              onChange={e => setNovo(x => ({ ...x, nome: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } if (e.key === "Escape") setNovo(null); }} />
          </label>
          <div className="wa-linha">
            <Campo label="US$ por interpretação" prefixo="US$" valor={novo.interp} onChange={v => setNovo(x => ({ ...x, interp: v }))}
              dica="Quanto o provedor cobra pra ler uma mensagem e decidir o que fazer (~6.000 tokens de entrada + 400 de saída). Calcule pela tabela de preço por milhão de tokens do provedor." />
            <Campo label="US$ por foto" prefixo="US$" valor={novo.img} onChange={v => setNovo(x => ({ ...x, img: v }))}
              dica="Custo extra de ler uma imagem (nota fiscal, produto). Use 0 se o modelo não lê imagem." />
          </div>
          {erroNovo && <div className="wa-erro">{erroNovo}</div>}
          <div className="wa-novo-modelo-acoes">
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" onClick={adicionar}>Adicionar e usar</button>
          </div>
        </div>
      )}

      <label className="wa-campo">
        <span className="wa-campo-label">Modelo em uso <Dica texto="Nome do modelo de IA que interpreta as mensagens (só informativo). Clicar num modelo acima preenche nome e custos de uma vez." /></span>
        <input className="sa-input" value={modeloAtual || ""} maxLength={80} disabled={d} onChange={e => setP("ia.modelo", e.target.value)} />
      </label>
      <div className="wa-linha">
        {C("ia.usd_por_interpretacao", "Por interpretação", { prefixo: "US$", dica: "Custo de a IA ler a mensagem e decidir o que fazer (~6.000 tokens de entrada + 400 de saída)." })}
        {C("ia.usd_por_imagem", "Por foto lida", { prefixo: "US$", dica: "Custo extra de a IA ler uma foto (nota fiscal, produto)." })}
      </div>

      <div className="wa-dolar">
        <label className={`wa-toggle${d ? " desab" : ""}`}>
          <input type="checkbox" checked={auto} disabled={d} onChange={e => setP("ia.dolar_auto", e.target.checked)} />
          <span className="wa-toggle-trilho"><span /></span>
          <span>Dólar do dia automático</span>
          <Dica texto="Ligado: o sistema busca a cotação oficial (Banco Central, PTAX de venda) no máximo a cada 6 horas e soma a folga. Desligado: você digita o valor." />
        </label>
        {auto && (
          <div className="wa-dolar-info">
            {cotacao?.valor ? (
              <span>
                Cotação: <strong>{brl(cotacao.valor, 4)}</strong>
                {cotacao.fonte && <> · {cotacao.fonte}</>}
                {quando && <> · {quando}</>}
                {" "}+ folga de {nf(p.ia.dolar_folga_pct, 1)}% = <strong>{brl(p.ia.dolar, 4)}</strong>
              </span>
            ) : (
              <span>Cotação ainda não disponível — usando o valor salvo ({brl(p.ia.dolar, 4)}).</span>
            )}
            {cotacao?.erro && <span className="wa-dolar-erro">{cotacao.erro}</span>}
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={onAtualizarDolar} disabled={atualizandoDolar}>
              {atualizandoDolar ? "Atualizando…" : "↻ Atualizar agora"}
            </button>
          </div>
        )}
      </div>
      <div className="wa-linha">
        {auto
          ? C("ia.dolar_folga_pct", "Folga sobre a cotação", { sufixo: "%", dica: "O cartão internacional cobra um pouco acima da cotação oficial (spread). Essa folga cobre isso e pequenas variações do dia. Sugestão: 4% a 6%." })
          : C("ia.dolar", "Dólar", { prefixo: "R$", dica: "Cotação usada na conta, digitada por você. Use um valor um pouco acima do atual pra ter folga." })}
        {C("ia.iof_pct", "IOF", { sufixo: "%", dica: "IOF do cartão em compras internacionais." })}
      </div>
      <p className="wa-nota">
        Em reais: {brl(iaEmReais(p.ia.usd_por_interpretacao, p), 4)} por interpretação · {brl(iaEmReais(p.ia.usd_por_imagem, p), 4)} por foto
        {auto && <> (dólar usado: {brl(p.ia.dolar, 4)})</>}.
      </p>
    </Secao>
  );
}

function Simulador() {
  const [s, setS] = useState({ meta_pct: "20", dolar: "", usd_interp: "" });
  const [res, setRes] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function simular() {
    setCarregando(true); setErro("");
    try {
      const r = await apiFetch(`${API}/simular`, {
        method: "POST",
        body: JSON.stringify({
          meta_pct: lerNum(s.meta_pct),
          dolar: s.dolar === "" ? null : lerNum(s.dolar),
          usd_interp: s.usd_interp === "" ? null : lerNum(s.usd_interp),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao simular.");
      setRes(j);
    } catch (e) { setErro(e.message); } finally { setCarregando(false); }
  }

  return (
    <Secao icone="🔮" titulo="Simulador “e se…”"
      sub="Testa um cenário sem mudar nada: usa os parâmetros SALVOS e aplica só o que você mudar aqui.">
      <div className="wa-linha wa-sim-form">
        <Campo label="Meta sobe" sufixo="%" valor={s.meta_pct} onChange={v => setS(x => ({ ...x, meta_pct: v }))}
          dica="Aumento (ou queda, com sinal de menos) no preço das mensagens da Meta." />
        <Campo label="Dólar a" prefixo="R$" valor={s.dolar} onChange={v => setS(x => ({ ...x, dolar: v }))}
          dica="Deixe vazio pra manter o dólar salvo." />
        <Campo label="IA por interpretação" prefixo="US$" valor={s.usd_interp} onChange={v => setS(x => ({ ...x, usd_interp: v }))}
          dica="Ex.: 0,009 pra ver como fica com um modelo mais caro. Vazio = manter." />
        <button type="button" className="sa-btn sa-btn-purple" onClick={simular} disabled={carregando}>{carregando ? "Calculando…" : "Simular"}</button>
      </div>
      {erro && <div className="wa-erro">{erro}</div>}
      {res && (
        <>
          <p className="wa-nota">
            Custo máximo por crédito: {brl(res.custo_max_credito_atual, 4)} → <strong>{brl(res.custo_max_credito_simulado, 4)}</strong>
          </p>
          {res.planos.length === 0 ? <div className="wa-vazio-mini">Crie planos pra ver o impacto em cada um.</div> : (
            <div className="wa-tabela-rolagem">
              <table className="wa-tabela">
                <thead><tr>
                  <th>Plano</th><th>Preço</th>
                  <th>Sobra hoje <Dica lado="baixo" texto="Lucro mínimo do plano com os parâmetros salvos hoje." /></th>
                  <th>Sobra no cenário <Dica lado="baixo" texto="Lucro mínimo se o cenário simulado acontecer. Negativo = prejuízo no pior caso." /></th>
                  <th>Mínimo no cenário <Dica lado="baixo" texto="Preço mínimo que o plano precisaria ter nesse cenário." /></th>
                  <th>Situação</th>
                </tr></thead>
                <tbody>
                  {res.planos.map(pl => (
                    <tr key={pl.id} className={pl.ativo ? "" : "wa-linha-inativa"}>
                      <td>{pl.nome}{!pl.ativo && <small> (desativado)</small>}</td>
                      <td>{brl(pl.preco)}</td>
                      <td>{brl(pl.atual.margem)} <small>({nf(pl.atual.margem_pct, 1)}%)</small></td>
                      <td className={pl.simulado.margem < 0 ? "neg" : ""}>{brl(pl.simulado.margem)} <small>({nf(pl.simulado.margem_pct, 1)}%)</small></td>
                      <td>{brl(pl.simulado.preco_minimo)}</td>
                      <td><Selo situacao={pl.simulado.situacao} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Secao>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA USO DO MÊS
   ══════════════════════════════════════════════════════════════ */
const TIPO_ENVIO = {
  alerta: "Alertas", resposta: "Respostas", cobranca_mensalidade: "Cobrança da mensalidade",
  teste: "Testes", recebida: "Recebidas (Meta grátis; custo = IA)",
};

/* ══════════════════════════════════════════════════════════════
   ABA CONEXÃO — número real na Meta, webhook, teste (30/09)
   ══════════════════════════════════════════════════════════════ */
const NOME_STATUS = { APPROVED: "Aprovado", PENDING_REVIEW: "Em análise", DECLINED: "Recusado", EXPIRED: "Expirado", NONE: "—", AVAILABLE_WITHOUT_REVIEW: "Liberado" };
const QUALIDADE = { GREEN: ["Alta", "ok"], YELLOW: ["Média", "atencao"], RED: ["Baixa", "perigo"], UNKNOWN: ["Sem dados ainda", ""], NA: ["Sem dados ainda", ""] };
const LIMITE_TIER = { TIER_50: "50", TIER_250: "250", TIER_1K: "1.000", TIER_2K: "2.000", TIER_10K: "10.000", TIER_100K: "100.000", TIER_UNLIMITED: "Ilimitado" };
const STATUS_MSG = { enviado: "Enviada", entregue: "Entregue", lido: "Lida", falhou: "Falhou", recebido: "Recebida" };

function ItemConfig({ ok, nome, variavel, texto }) {
  return (
    <li className={`wa-conf-item ${ok ? "ok" : "falta"}`}>
      <span className="wa-conf-marca" aria-hidden="true">{ok ? "✓" : "✗"}</span>
      <div><span><strong>{nome}</strong> <code>{variavel}</code></span><small>{texto}</small></div>
    </li>
  );
}

function AbaConexao({ podeEditarPagina, avisar, liberado, onLiberado }) {
  const [c, setC] = useState(null);
  const [erro, setErro] = useState("");
  const [msgs, setMsgs] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [tel, setTel] = useState("");
  const [texto, setTexto] = useState("Teste do Gerenciador de Estabelecimentos ✅");

  const carregar = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([apiFetch(`${API}/conexao`), apiFetch(`${API}/mensagens?limite=30`)]);
      const j1 = await r1.json(); const j2 = await r2.json();
      if (!r1.ok) throw new Error(j1.error || "Erro ao carregar.");
      setC(j1); setErro("");
      setMsgs(r2.ok && Array.isArray(j2) ? j2 : []);
    } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pode = !!(c?.pode_editar ?? podeEditarPagina);

  async function acao(caminho, corpo, msgOk) {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}${caminho}`, { method: "POST", body: JSON.stringify(corpo || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível concluir.");
      if (msgOk) avisar(msgOk);
      await carregar();
      return j;
    } catch (e) { avisar(e.message, "erro"); return null; }
    finally { setOcupado(false); }
  }

  async function copiar(t) {
    try { await navigator.clipboard.writeText(t); avisar("Copiado."); } catch { avisar("Não foi possível copiar.", "erro"); }
  }

  if (erro) return <div className="wa-aba"><div className="wa-erro">{erro}</div></div>;
  if (!c) return <div className="wa-aba"><div className="sa-loading"><div className="sa-spinner" /></div></div>;

  const n = c.numero;
  const q = QUALIDADE[n?.quality_rating] || QUALIDADE.UNKNOWN;
  const tudoConfigurado = c.config.token && c.config.app_secret && c.config.verify_token;

  return (
    <div className="wa-aba">
      <p className="wa-nota">
        Aqui fica a ligação com a Meta: o número do sistema, os avisos que a Meta manda para o servidor (webhook) e um envio de teste.
        Os segredos ficam só nas variáveis do Railway — esta tela mostra apenas se estão preenchidos.
      </p>

      <div className="wa-custos-grade">
        <Secao icone="📱" titulo="Número do sistema">
          {!c.config.token ? (
            <div className="wa-vazio-mini">Falta o token (<code>WHATSAPP_TOKEN</code>) no Railway.</div>
          ) : !n ? (
            <div className="wa-erro">{c.erro || "Não foi possível ler o número na Meta."}</div>
          ) : (
            <dl className="wa-conexao-dados">
              <div><dt>Número</dt><dd><strong>{n.display_phone_number}</strong></dd></div>
              <div><dt>Nome exibido <Dica lado="baixo" texto="Nome que aparece no topo da conversa. A Meta revisa; enquanto estiver em análise, pode aparecer só o número." /></dt>
                <dd>{n.verified_name} <span className={`wa-pilula ${n.name_status === "APPROVED" ? "ok" : n.name_status === "DECLINED" ? "perigo" : "atencao"}`}>{NOME_STATUS[n.name_status] || n.name_status || "—"}</span></dd></div>
              <div><dt>Qualidade <Dica lado="baixo" texto="Nota da Meta pelas reações das pessoas (bloqueios, denúncias). Baixa pode reduzir o limite de envios." /></dt>
                <dd><span className={`wa-pilula ${q[1]}`}>{q[0]}</span></dd></div>
              <div><dt>Limite de conversas iniciadas <Dica lado="baixo" texto="Quantas pessoas diferentes o sistema pode chamar primeiro em 24h. Respostas a quem mandou mensagem não contam. Sobe sozinho com o uso ou com a verificação da empresa." /></dt>
                <dd>{LIMITE_TIER[n.messaging_limit_tier] || "250 (padrão sem verificação)"} / 24h</dd></div>
              <div><dt>ID do número</dt><dd><code>{c.config.phone_number_id}</code></dd></div>
            </dl>
          )}
        </Secao>

        <Secao icone="🔐" titulo="Configuração do servidor" sub="Variáveis do Railway (serviço do backend).">
          <ul className="wa-conf-lista">
            <ItemConfig ok={c.config.token} nome="Token permanente" variavel="WHATSAPP_TOKEN" texto="Usuário do sistema da Meta — envia as mensagens." />
            <ItemConfig ok={c.config.app_secret} nome="Chave secreta do app" variavel="WHATSAPP_APP_SECRET" texto="Confere se o aviso veio mesmo da Meta. Sem ela, nada é recebido." />
            <ItemConfig ok={c.config.verify_token} nome="Frase do webhook" variavel="WHATSAPP_VERIFY_TOKEN" texto="Uma frase qualquer escolhida por você; a mesma vai no painel da Meta." />
          </ul>
          {!tudoConfigurado && <p className="wa-nota">Depois de salvar uma variável no Railway, o servidor reinicia sozinho; volte aqui e clique em Atualizar.</p>}
        </Secao>
      </div>

      <Secao icone="📨" titulo="Avisos da Meta (webhook)" sub="É por aqui que o sistema recebe as mensagens e sabe se as enviadas foram entregues/lidas.">
        <div className="wa-campo">
          <span className="wa-campo-label">URL de callback (cole no painel da Meta)</span>
          <div className="wa-copiar">
            <code>{c.webhook_url}</code>
            <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => copiar(c.webhook_url)}>Copiar</button>
          </div>
        </div>
        <p className="wa-nota">Em <strong>Verificar token</strong>, no painel da Meta, use a mesma frase de <code>WHATSAPP_VERIFY_TOKEN</code>. Depois assine o campo <strong>messages</strong>.</p>
        <div className="wa-linha">
          <span className={`wa-pilula ${c.webhook_assinado ? "ok" : "atencao"}`}>
            {c.webhook_assinado ? "Conta do WhatsApp enviando avisos para o app" : c.webhook_assinado === false ? "Conta ainda não envia avisos para o app" : "—"}
          </span>
          {pode && c.config.token && !c.webhook_assinado && (
            <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={ocupado}
              onClick={() => acao("/conexao/assinar-webhook", null, "Pronto! A conta passa a enviar os avisos.")}>Ligar avisos desta conta</button>
          )}
        </div>
      </Secao>

      <Secao icone="🏪" titulo="Liberar para as lojas">
        <label className={`wa-toggle${!pode || ocupado ? " desab" : ""}`}>
          <input type="checkbox" checked={!!liberado} disabled={!pode || ocupado}
            onChange={async e => { const j = await acao("/conexao/liberar", { ativo: e.target.checked }, e.target.checked ? "WhatsApp liberado para as lojas." : "WhatsApp pausado para as lojas."); if (j) onLiberado(j.ativo); }} />
          <span className="wa-toggle-trilho"><span /></span>
          <span>{liberado ? "Liberado: a tela das lojas mostra o serviço no ar" : "Em testes: a tela das lojas mostra \"Em breve\""}</span>
          <Dica texto="Enquanto estiver em testes, as lojas já podem contratar e cadastrar números, mas a tela avisa que o serviço ainda está em lançamento." />
        </label>
      </Secao>

      {pode && (
        <Secao icone="🧪" titulo="Mensagem de teste">
          <p className="wa-nota">
            A Meta só deixa o sistema mandar texto livre para quem falou com ele nas últimas 24h. Antes, mande um <strong>"oi"</strong> do seu
            WhatsApp para <strong>{n?.display_phone_number || "o número do sistema"}</strong> (o sistema vai responder sozinho) e depois teste aqui.
          </p>
          <div className="wa-teste">
            <label className="wa-campo">
              <span className="wa-campo-label">Para (DDD + número)</span>
              <input className="sa-input" inputMode="tel" maxLength={20} placeholder="(53) 99999-9999" value={tel} onChange={e => setTel(e.target.value)} />
            </label>
            <label className="wa-campo wa-teste-texto">
              <span className="wa-campo-label">Mensagem</span>
              <input className="sa-input" maxLength={1000} value={texto} onChange={e => setTexto(e.target.value)} />
            </label>
            <button type="button" className="sa-btn sa-btn-primary" disabled={ocupado || !c.config.token || !tel.trim() || !texto.trim()}
              onClick={() => acao("/teste", { telefone: tel, texto }, "Mensagem enviada! Confira no celular.")}>Enviar teste</button>
          </div>
        </Secao>
      )}

      <Secao icone="🗒️" titulo="Últimas mensagens" sub="Enviadas e recebidas pelo número do sistema (as 30 mais recentes).">
        <div className="wa-linha" style={{ marginBottom: 10 }}>
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado} onClick={carregar}>↻ Atualizar</button>
        </div>
        {!msgs || msgs.length === 0 ? <div className="wa-vazio-mini">Nenhuma mensagem ainda.</div> : (
          <div className="wa-tabela-rolagem">
            <table className="wa-tabela">
              <thead><tr><th>Quando</th><th></th><th>Número</th><th>Loja</th><th>Tipo</th><th>Situação</th></tr></thead>
              <tbody>
                {msgs.map(m => (
                  <tr key={m.id}>
                    <td className="wa-nowrap">{new Date(m.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td title={m.direcao === "entrada" ? "Recebida" : "Enviada"}>{m.direcao === "entrada" ? "↘" : "↗"}</td>
                    <td className="wa-nowrap">{m.destino_formatado || m.destino}</td>
                    <td>{m.loja_nome || <span className="wa-sutil-txt">—</span>}</td>
                    <td>{TIPO_ENVIO[m.tipo] || m.tipo}</td>
                    <td>
                      <span className={`wa-pilula ${m.status === "falhou" ? "perigo" : m.status === "lido" || m.status === "entregue" ? "ok" : ""}`}>{STATUS_MSG[m.status] || m.status}</span>
                      {m.status === "falhou" && <small className="wa-msg-erro">{m.erro_explicado || m.erro_mensagem || `Erro ${m.erro_codigo}`}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA LOJAS — planos contratados, pedidos, pacotes (29/09)
   ══════════════════════════════════════════════════════════════ */
const STATUS_ASSIN = { recusada: "Recusada", cancelada: "Cancelada", substituida: "Trocou de plano", desistiu: "Desistiu" };
const MOV_TIPO = { credito_ciclo: "Créditos do ciclo", pacote: "Pacote extra", consumo: "Uso", estorno: "Estorno", ajuste: "Ajuste", expirado: "Expirado" };
const dataBRs = (s) => { if (!s) return ""; const [a, m, d] = String(s).slice(0, 10).split("-"); return `${d}/${m}/${a}`; };

function AbaLojas({ podeEditarPagina, avisar, onPendentes }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [modal, setModal] = useState(null); // { tipo, item, motivo, quantidade, imediato }
  const [extrato, setExtrato] = useState(null); // { item, movimentos }
  const [verEncerradas, setVerEncerradas] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await apiFetch(`${API}/assinaturas`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar.");
      setD(j); setErro("");
      onPendentes((j.pendentes?.length || 0) + (j.pacotes?.length || 0));
    } catch (e) { setErro(e.message); }
  }, [onPendentes]);
  useEffect(() => { carregar(); }, [carregar]);
  useAvisosGlobais(["whatsapp_admin"], carregar, { atraso: 800 });

  const pode = !!(d?.pode_editar ?? podeEditarPagina);

  async function acao(caminho, corpo, msg) {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}${caminho}`, { method: "POST", body: JSON.stringify(corpo || {}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível concluir.");
      avisar(msg);
      setModal(null);
      await carregar();
    } catch (e) { avisar(e.message, "erro"); } finally { setOcupado(false); }
  }

  async function abrirExtrato(item) {
    try {
      const r = await apiFetch(`${API}/assinaturas/${item.id}/extrato`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar o extrato.");
      setExtrato({ item, movimentos: j.movimentos || [] });
    } catch (e) { avisar(e.message, "erro"); }
  }

  if (erro) return <div className="wa-erro-geral"><strong>Não foi possível carregar os planos das lojas.</strong><span>{erro}</span><small>Se acabou de atualizar o sistema, confira se o SQL 12 já foi rodado no Supabase.</small></div>;
  if (!d) return <div className="sa-loading"><div className="sa-spinner" /></div>;

  const nada = !d.pendentes.length && !d.pacotes.length && !d.ativas.length;

  return (
    <div className="wa-aba wa-lojas-aba">
      <div className="wa-aviso-cobranca">
        <strong>Nesta fase, a ativação é manual.</strong> A loja escolhe o plano e aceita os termos; você combina o pagamento e ativa aqui. Ao ativar, começa o ciclo de 1 mês com o saldo do plano. Troca de plano começa um ciclo novo; o saldo do plano antigo expira.
      </div>

      {nada && (
        <div className="wa-vazio">
          <div className="wa-vazio-icone">🏪</div>
          <h3>Nenhuma loja com plano ainda</h3>
          <p>Quando um estabelecimento escolher um plano no menu <strong>WhatsApp</strong> do painel dele, o pedido aparece aqui pra você ativar.</p>
        </div>
      )}

      {d.pendentes.length > 0 && (
        <Secao icone="⏳" titulo={`Pedindo ativação (${d.pendentes.length})`} sub="Confirme o pagamento combinado antes de ativar.">
          <ul className="wa-pedidos">
            {d.pendentes.map(p => (
              <li key={p.id}>
                <div className="wa-pedido-info">
                  <strong>{p.loja_nome}</strong>
                  <span>{p.troca_de ? <>Troca de <em>{p.troca_de}</em> para </> : "Plano "}<strong>{p.plano_nome}</strong> · {brl(p.preco)}/mês · {nf(p.creditos)} créditos · {p.numeros} número{p.numeros === 1 ? "" : "s"}</span>
                  <small>Pedido por {p.solicitado_por_nome || "—"} em {dataHora(p.criado_em)} · aceitou os termos v{p.termos_versao}</small>
                </div>
                {pode && (
                  <div className="wa-pedido-acoes">
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado} onClick={() => setModal({ tipo: "recusar", item: p, motivo: "" })}>Recusar</button>
                    <button type="button" className="sa-btn sa-btn-success sa-btn-sm" disabled={ocupado} onClick={() => setModal({ tipo: "ativar", item: p })}>Ativar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.pacotes.length > 0 && (
        <Secao icone="➕" titulo={`Pacotes extras pedidos (${d.pacotes.length})`} sub="Ao aprovar, os créditos entram no ciclo atual da loja.">
          <ul className="wa-pedidos">
            {d.pacotes.map(p => (
              <li key={p.id}>
                <div className="wa-pedido-info">
                  <strong>{p.loja_nome}</strong>
                  <span>{p.nome} · +{nf(p.creditos)} créditos · {brl(p.preco)}</span>
                  <small>Pedido por {p.solicitado_por_nome || "—"} em {dataHora(p.criado_em)}</small>
                </div>
                {pode && (
                  <div className="wa-pedido-acoes">
                    <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado} onClick={() => setModal({ tipo: "recusar_pacote", item: p, motivo: "" })}>Recusar</button>
                    <button type="button" className="sa-btn sa-btn-success sa-btn-sm" disabled={ocupado}
                      onClick={() => acao(`/pacotes/${p.id}/aprovar`, {}, `Pacote aprovado: +${nf(p.creditos)} créditos para ${p.loja_nome}.`)}>Aprovar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.ativas.length > 0 && (
        <Secao icone="✅" titulo={`Planos ativos (${d.ativas.length})`}>
          <div className="wa-tabela-rolagem">
            <table className="wa-tabela wa-tabela-lojas">
              <thead><tr>
                <th>Loja</th><th>Plano</th><th>Ciclo</th>
                <th>Saldo <Dica lado="baixo" texto="Créditos disponíveis no ciclo atual / total que entrou no ciclo (plano + pacotes + ajustes)." /></th>
                <th></th>
              </tr></thead>
              <tbody>
                {d.ativas.map(a => {
                  const pct = a.entradas > 0 ? Math.max(0, Math.min(100, (a.saldo / a.entradas) * 100)) : 0;
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.loja_nome}</strong>{a.cancelar_no_fim && <span className="wa-tag-encerra">encerra no fim do ciclo</span>}</td>
                      <td>{a.plano_nome}<small> · {brl(a.preco)}/mês</small></td>
                      <td className="wa-nowrap">{dataBRs(a.ciclo_inicio)} a {dataBRs(a.ciclo_fim)}</td>
                      <td className="wa-saldo-cel">
                        <span>{nf(a.saldo, a.saldo % 1 ? 1 : 0)} / {nf(a.entradas)}</span>
                        <div className={`wa-barra${pct <= 20 ? " baixa" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                      </td>
                      <td className="wa-acoes-cel">
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => abrirExtrato(a)}>Extrato</button>
                        {pode && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado} onClick={() => setModal({ tipo: "ajuste", item: a, quantidade: "", motivo: "" })}>Ajustar</button>}
                        {pode && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm wa-btn-excluir" disabled={ocupado} onClick={() => setModal({ tipo: "encerrar", item: a, imediato: false, motivo: "" })}>Encerrar</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      {d.encerradas.length > 0 && (
        <div className="wa-encerradas">
          <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => setVerEncerradas(v => !v)}>
            {verEncerradas ? "Esconder" : "Ver"} encerrados nos últimos 60 dias ({d.encerradas.length})
          </button>
          {verEncerradas && (
            <ul className="wa-pedidos">
              {d.encerradas.map(e => (
                <li key={e.id}>
                  <div className="wa-pedido-info">
                    <strong>{e.loja_nome}</strong>
                    <span>{e.plano_nome} · {brl(e.preco)}/mês · <em>{STATUS_ASSIN[e.status] || e.status}</em></span>
                    <small>{dataHora(e.encerrado_em)}{e.encerrado_por_nome ? ` · ${e.encerrado_por_nome}` : ""}{e.motivo ? ` · ${e.motivo}` : ""}</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {modal && (
        <div className="sa-modal-overlay" onClick={() => !ocupado && setModal(null)}>
          <div className="sa-modal wa-modal-lojas" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            {modal.tipo === "ativar" && (<>
              <div className="sa-modal-icon">✅</div>
              <div className="sa-modal-title">Ativar o plano de {modal.item.loja_nome}?</div>
              <div className="sa-modal-subtitle">
                {modal.item.troca_de ? <>Troca de <strong>{modal.item.troca_de}</strong> para </> : null}<strong>{modal.item.plano_nome}</strong> — {brl(modal.item.preco)}/mês, {nf(modal.item.creditos)} créditos.
                {" "}O ciclo começa hoje e vai até a véspera do mesmo dia do mês que vem.{modal.item.troca_de ? " O saldo do plano atual expira." : ""}
              </div>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-success" disabled={ocupado}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/ativar`, {}, `Plano ${modal.item.plano_nome} ativado para ${modal.item.loja_nome}.`)}>Ativar agora</button>
              </div>
            </>)}
            {(modal.tipo === "recusar" || modal.tipo === "recusar_pacote") && (<>
              <div className="sa-modal-icon danger">✋</div>
              <div className="sa-modal-title">Recusar {modal.tipo === "recusar" ? "a solicitação" : "o pacote"} de {modal.item.loja_nome}?</div>
              <div className="sa-modal-subtitle">A loja vê o motivo na tela do WhatsApp dela.</div>
              <label className="wa-campo">
                <span className="wa-campo-label">Motivo (opcional)</span>
                <textarea className="sa-input" rows={2} maxLength={300} value={modal.motivo} placeholder="Ex.: aguardando o pagamento"
                  onChange={e => setModal(m => ({ ...m, motivo: e.target.value }))} />
              </label>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Voltar</button>
                <button type="button" className="sa-btn sa-btn-danger" disabled={ocupado}
                  onClick={() => acao(modal.tipo === "recusar" ? `/assinaturas/${modal.item.id}/recusar` : `/pacotes/${modal.item.id}/recusar`, { motivo: modal.motivo }, "Recusado.")}>Recusar</button>
              </div>
            </>)}
            {modal.tipo === "ajuste" && (<>
              <div className="sa-modal-icon">🧮</div>
              <div className="sa-modal-title">Ajustar créditos de {modal.item.loja_nome}</div>
              <div className="sa-modal-subtitle">Soma (ex.: 20) ou tira (ex.: -20) créditos do ciclo atual. Fica no extrato da loja com o motivo.</div>
              <div className="wa-linha">
                <Campo label="Créditos" valor={modal.quantidade} onChange={v => setModal(m => ({ ...m, quantidade: v }))} largura={140} />
                <label className="wa-campo">
                  <span className="wa-campo-label">Motivo</span>
                  <input className="sa-input" maxLength={300} value={modal.motivo} placeholder="Ex.: cortesia, compensação de falha"
                    onChange={e => setModal(m => ({ ...m, motivo: e.target.value }))} />
                </label>
              </div>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-primary" disabled={ocupado || !lerNum(modal.quantidade) || !modal.motivo.trim()}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/ajuste`, { quantidade: modal.quantidade, motivo: modal.motivo }, "Créditos ajustados.")}>Salvar ajuste</button>
              </div>
            </>)}
            {modal.tipo === "encerrar" && (<>
              <div className="sa-modal-icon danger">⏹️</div>
              <div className="sa-modal-title">Encerrar o plano de {modal.item.loja_nome}?</div>
              <div className="wa-escolhas">
                <label className={`wa-escolha${!modal.imediato ? " ativo" : ""}`}>
                  <input type="radio" checked={!modal.imediato} onChange={() => setModal(m => ({ ...m, imediato: false }))} />
                  <span><strong>No fim do ciclo ({dataBRs(modal.item.ciclo_fim)})</strong><small>A loja usa até lá; depois o plano encerra sozinho.</small></span>
                </label>
                <label className={`wa-escolha${modal.imediato ? " ativo" : ""}`}>
                  <input type="radio" checked={!!modal.imediato} onChange={() => setModal(m => ({ ...m, imediato: true }))} />
                  <span><strong>Agora</strong><small>O saldo restante expira na hora e os pacotes pendentes são recusados.</small></span>
                </label>
              </div>
              <label className="wa-campo">
                <span className="wa-campo-label">Motivo (opcional)</span>
                <input className="sa-input" maxLength={300} value={modal.motivo} onChange={e => setModal(m => ({ ...m, motivo: e.target.value }))} />
              </label>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Voltar</button>
                <button type="button" className="sa-btn sa-btn-danger" disabled={ocupado}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/encerrar`, { imediato: !!modal.imediato, motivo: modal.motivo }, modal.imediato ? "Plano encerrado." : "Encerramento agendado para o fim do ciclo.")}>Encerrar</button>
              </div>
            </>)}
          </div>
        </div>
      )}

      {extrato && (
        <div className="sa-modal-overlay" onClick={() => setExtrato(null)}>
          <div className="sa-modal wa-modal-lojas wa-modal-extrato" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="wa-modal-head">
              <div className="sa-modal-title">Extrato — {extrato.item.loja_nome}</div>
              <button type="button" className="wa-x" onClick={() => setExtrato(null)} aria-label="Fechar">×</button>
            </div>
            <p className="wa-nota">Ciclo {dataBRs(extrato.item.ciclo_inicio)} a {dataBRs(extrato.item.ciclo_fim)} · saldo {nf(extrato.item.saldo, extrato.item.saldo % 1 ? 1 : 0)} de {nf(extrato.item.entradas)}</p>
            {extrato.movimentos.length === 0 ? <div className="wa-vazio-mini">Nenhum movimento.</div> : (
              <div className="wa-tabela-rolagem wa-extrato-rolagem">
                <table className="wa-tabela">
                  <thead><tr><th>Quando</th><th>O quê</th><th>Créditos</th></tr></thead>
                  <tbody>
                    {extrato.movimentos.map(m => (
                      <tr key={m.id}>
                        <td className="wa-nowrap">{dataHora(m.criado_em)}</td>
                        <td>{MOV_TIPO[m.tipo] || m.tipo}{m.descricao ? <small> — {m.descricao}</small> : null}{m.criado_por_nome ? <small> · {m.criado_por_nome}</small> : null}</td>
                        <td className={Number(m.quantidade) < 0 ? "neg" : ""}><strong>{Number(m.quantidade) > 0 ? "+" : ""}{nf(m.quantidade, Number(m.quantidade) % 1 ? 1 : 0)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AbaUso() {
  const [mes, setMes] = useState(mesAtual);
  const [u, setU] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro("");
    apiFetch(`${API}/uso?mes=${mes}`)
      .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error || "Erro."); if (vivo) setU(j); }))
      .catch(e => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [mes]);

  const pctTeto = u && u.teto_global > 0 ? Math.min(100, (u.custo_total / u.teto_global) * 100) : null;

  return (
    <div className="wa-aba">
      <div className="wa-uso-topo">
        <label className="wa-campo" style={{ maxWidth: 200 }}>
          <span className="wa-campo-label">Mês</span>
          <input type="month" className="sa-input" value={mes} max={mesAtual()} onChange={e => e.target.value && setMes(e.target.value)} />
        </label>
      </div>

      {carregando ? <div className="sa-loading"><div className="sa-spinner" /></div> : erro ? <div className="wa-erro">{erro}</div> : u && (
        <>
          <p className="wa-nota">
            O mesmo número atende duas coisas, contadas <strong>separadas</strong> abaixo: o <strong>uso dos estabelecimentos</strong> (o serviço
            que você vende nos planos) e o <strong>seu uso</strong> (cobrança automática da mensalidade e testes, que é custo seu e sai da mensalidade).
          </p>

          {u.total_mensagens === 0 && (
            <div className="wa-vazio">
              <div className="wa-vazio-icone">📭</div>
              <h3>Nenhuma mensagem neste mês</h3>
              <p>O registro começa quando o número for conectado. Cada envio e cada mensagem recebida entra aqui com o custo estimado da Meta e da IA, já separado entre lojas e seu uso.</p>
            </div>
          )}

          {/* ── Estabelecimentos ─────────────────────────────── */}
          <div className="wa-uso-bloco">
            <div className="wa-uso-bloco-topo">
              <h3>🏪 Uso dos estabelecimentos</h3>
              <span>Alertas, respostas da IA e mensagens recebidas das lojas. É o que os planos pagam.</span>
            </div>
            <div className="wa-cards">
              <div className="wa-card"><span>Mensagens <Dica lado="baixo" texto="Mensagens das lojas no mês: alertas enviados, respostas e mensagens recebidas." /></span><strong>{nf(u.lojas?.mensagens ?? 0)}</strong></div>
              <div className="wa-card"><span>Meta <Dica lado="baixo" texto="Custo estimado das mensagens enviadas às lojas (a Meta não cobra as recebidas)." /></span><strong>{brl(u.lojas?.custo_meta ?? 0)}</strong></div>
              <div className="wa-card"><span>IA <Dica lado="baixo" texto="Custo estimado da IA (tokens) para responder as lojas, em reais com IOF." /></span><strong>{brl(u.lojas?.custo_ia ?? 0)}</strong></div>
              <div className="wa-card ok"><span>Franquia grátis <Dica lado="baixo" texto="Desconto estimado das respostas gratuitas do mês (se a franquia da Meta se confirmar). Respostas são sempre das lojas." /></span><strong>− {brl(u.lojas?.desconto_respostas_gratis ?? 0)}</strong></div>
              <div className="wa-card destaque"><span>Custo das lojas <Dica lado="baixo" texto="Meta + IA − franquia grátis, só do uso das lojas." /></span><strong>{brl(u.lojas?.custo_total ?? 0)}</strong></div>
            </div>
            {u.receita_planos && (
              <div className="wa-cards wa-cards-receita">
                <div className="wa-card ok"><span>Receita dos planos <Dica lado="baixo" texto="Ciclos de plano iniciados no mês (preço contratado de cada loja) + pacotes extras aprovados no mês. Nesta fase o pagamento é combinado à parte — confira se foi recebido." /></span><strong>{brl(u.receita_planos.total)}</strong>
                  <small>{nf(u.receita_planos.ciclos)} ciclo{u.receita_planos.ciclos === 1 ? "" : "s"} · pacotes {brl(u.receita_planos.pacotes)}</small></div>
                {u.lojas?.sobra != null && (
                  <div className={`wa-card ${u.lojas.sobra >= 0 ? "ok" : "perigo"}`}><span>Sobra do serviço <Dica lado="baixo" texto="Receita dos planos − custo das lojas − chip do número. Não inclui o seu uso (cobrança da mensalidade). Ainda sem descontar impostos e taxa do pagamento." /></span><strong>{brl(u.lojas.sobra)}</strong><small>antes de impostos e taxas</small></div>
                )}
              </div>
            )}
            {(u.lojas?.mensagens ?? 0) === 0 ? (
              <div className="wa-vazio-mini">Nenhuma mensagem de estabelecimento neste mês.</div>
            ) : (
              <div className="wa-custos-grade">
                <Secao icone="🗂️" titulo="Por tipo">
                  <TabelaTipos porTipo={u.lojas.por_tipo} />
                </Secao>
                <Secao icone="🏪" titulo="Por estabelecimento">
                  {u.por_loja.length === 0 ? <div className="wa-vazio-mini">Nenhum uso por loja.</div> : (
                    <div className="wa-tabela-rolagem">
                      <table className="wa-tabela">
                        <thead><tr><th>Loja</th><th>Msgs</th><th>Créditos <Dica lado="baixo" texto="Créditos gastos pela loja no mês." /></th><th>Meta</th><th>IA</th><th>Total <Dica lado="esq" texto="Custo real da loja no mês — é o que o teto por loja (50%/70%) compara com o valor do plano." /></th></tr></thead>
                        <tbody>
                          {u.por_loja.map(l => (
                            <tr key={l.mercearia_id}>
                              <td>{l.nome}</td><td>{nf(l.mensagens)}</td><td>{nf(l.creditos, 1)}</td>
                              <td>{brl(l.custo_meta)}</td><td>{brl(l.custo_ia)}</td><td><strong>{brl(l.custo_total)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Secao>
              </div>
            )}
          </div>

          {/* ── Seu uso ───────────────────────────────────────── */}
          <div className="wa-uso-bloco seu">
            <div className="wa-uso-bloco-topo">
              <h3>👤 Seu uso</h3>
              <span>Cobrança automática da mensalidade e testes. Custo seu, fora dos planos (sai da mensalidade).</span>
            </div>
            <div className="wa-cards">
              <div className="wa-card"><span>Mensagens <Dica lado="baixo" texto="Lembretes de cobrança da mensalidade e mensagens de teste enviados no mês." /></span><strong>{nf(u.seu?.mensagens ?? 0)}</strong></div>
              <div className="wa-card"><span>Meta <Dica lado="baixo" texto="Custo estimado dessas mensagens na Meta." /></span><strong>{brl(u.seu?.custo_meta ?? 0)}</strong></div>
              <div className="wa-card"><span>IA <Dica lado="baixo" texto="Custo de IA do seu uso (normalmente zero: a cobrança é um modelo pronto, sem IA)." /></span><strong>{brl(u.seu?.custo_ia ?? 0)}</strong></div>
              <div className="wa-card destaque"><span>Seu custo <Dica lado="baixo" texto="Meta + IA do seu uso no mês." /></span><strong>{brl(u.seu?.custo_total ?? 0)}</strong></div>
            </div>
            {(u.seu?.mensagens ?? 0) === 0 ? (
              <div className="wa-vazio-mini">Nenhuma mensagem sua neste mês.</div>
            ) : (
              <Secao icone="🗂️" titulo="Por tipo">
                <TabelaTipos porTipo={u.seu.por_tipo} />
              </Secao>
            )}
          </div>

          {/* ── Total do número ──────────────────────────────── */}
          <div className="wa-uso-bloco total">
            <div className="wa-uso-bloco-topo">
              <h3>📊 Total do número</h3>
              <span>Tudo somado: lojas + seu uso + chip. É o que a Meta e a IA vão cobrar de você no mês.</span>
            </div>
            <div className="wa-cards">
              <div className="wa-card"><span>Mensagens <Dica lado="baixo" texto="Todas as mensagens registradas no mês: enviadas e recebidas." /></span><strong>{nf(u.total_mensagens)}</strong></div>
              <div className="wa-card"><span>Chip / fixo <Dica lado="baixo" texto="Custo fixo do mês (recarga do chip do número central), definido em Custos e parâmetros." /></span><strong>{brl(u.custo_fixo_chip)}</strong></div>
              <div className={`wa-card destaque${u.acima_teto_global ? " perigo" : ""}`}>
                <span>Custo total estimado <Dica lado="baixo" texto="Custo das lojas + seu custo + chip. A barra compara com o teto global do mês." /></span><strong>{brl(u.custo_total)}</strong>
                {pctTeto !== null && (
                  <div className="wa-barra" title={`${nf(pctTeto, 0)}% do teto de ${brl(u.teto_global)}`}>
                    <div style={{ width: `${pctTeto}%` }} />
                  </div>
                )}
                {pctTeto !== null && <small>{nf(pctTeto, 0)}% do teto de {brl(u.teto_global)}</small>}
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
}

function TabelaTipos({ porTipo }) {
  const linhas = Object.entries(porTipo || {});
  if (!linhas.length) return <div className="wa-vazio-mini">Nada no mês.</div>;
  return (
    <table className="wa-tabela">
      <thead><tr><th>Tipo</th><th>Qtd. <Dica lado="baixo" texto="Quantidade de mensagens desse tipo no mês." /></th><th>Custo <Dica lado="baixo" texto="Meta + IA dessas mensagens." /></th></tr></thead>
      <tbody>
        {linhas.map(([k, v]) => (
          <tr key={k}><td>{TIPO_ENVIO[k] || k}</td><td>{nf(v.quantidade)}</td><td>{brl(v.custo)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA COBRANÇA DE MENSALIDADES (custo do admin, fora dos planos)
   ══════════════════════════════════════════════════════════════ */
function ListaDias({ titulo, dica, lista, onChange, disabled, sufixo }) {
  const [novo, setNovo] = useState("");
  const dias = Array.isArray(lista) ? lista : [];
  function adicionar() {
    const n = parseInt(novo, 10);
    if (!Number.isInteger(n) || n < 0 || n > 60 || dias.map(Number).includes(n)) { setNovo(""); return; }
    onChange([...dias, n].map(Number).sort((a, b) => b - a).slice(0, 10));
    setNovo("");
  }
  return (
    <div className="wa-campo">
      <span className="wa-campo-label">{titulo} <Dica texto={dica} /></span>
      <div className="wa-dias">
        {dias.length === 0 && <span className="wa-dias-vazio">Nenhum</span>}
        {dias.map(dd => (
          <span key={dd} className="wa-dia">
            {Number(dd) === 0 ? "No dia" : `${dd} dia${Number(dd) === 1 ? "" : "s"} ${sufixo}`}
            {!disabled && <button type="button" aria-label={`Remover ${dd}`} onClick={() => onChange(dias.filter(x => Number(x) !== Number(dd)))}>×</button>}
          </span>
        ))}
        {!disabled && dias.length < 10 && (
          <span className="wa-dia-novo">
            <input type="text" inputMode="numeric" placeholder="dias" value={novo} maxLength={2}
              onChange={e => setNovo(e.target.value.replace(/\D/g, ""))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); adicionar(); } }} />
            <button type="button" onClick={adicionar} disabled={novo === ""}>+ Adicionar</button>
          </span>
        )}
      </div>
    </div>
  );
}

function AbaCobranca({ rasc, p, setP, podeEditar, lojas }) {
  const d = !podeEditar;
  const [busca, setBusca] = useState("");
  const desligadas = new Set(p.cobranca_auto.lojas_desligadas);
  const ativo = pegar(rasc, "cobranca_auto.ativo") === true;
  const lista = (lojas || []).filter(l => !busca.trim() || (l.nome_fantasia || "").toLowerCase().includes(busca.trim().toLowerCase()));
  const envios = p.cobranca_auto.dias_antes.length + p.cobranca_auto.dias_depois.length;
  const nLojas = lojas ? lojas.filter(l => !desligadas.has(l.id)).length : null;

  function alternarLoja(id) {
    const s = new Set(p.cobranca_auto.lojas_desligadas);
    if (s.has(id)) s.delete(id); else s.add(id);
    setP("cobranca_auto.lojas_desligadas", [...s]);
  }

  return (
    <div className="wa-aba">
      <div className="wa-aviso-cobranca">
        <strong>Custo seu, fora dos planos.</strong> Os lembretes de mensalidade saem do número central e são pagos por você (preço de alerta/utilidade da Meta).
        A tela <em>Cobranças</em> manual continua funcionando normalmente; isto é só um reforço automático e só começa a enviar quando o número estiver conectado.
      </div>

      <Secao icone="🔔" titulo="Lembrete automático da mensalidade">
        <label className={`wa-toggle${d ? " desab" : ""}`}>
          <input type="checkbox" checked={ativo} disabled={d} onChange={e => setP("cobranca_auto.ativo", e.target.checked)} />
          <span className="wa-toggle-trilho"><span /></span>
          <span>{ativo ? "Ligado: enviar lembretes pelo WhatsApp" : "Desligado"}</span>
          <Dica texto="Quando ligado (e com o número conectado), o sistema manda sozinho o lembrete de vencimento da mensalidade pelo WhatsApp, nos dias escolhidos abaixo." />
        </label>

        <div className={`wa-cobranca-regras${ativo ? "" : " apagado"}`}>
          <ListaDias titulo="Avisar antes do vencimento" sufixo="antes" lista={pegar(rasc, "cobranca_auto.dias_antes")} disabled={d}
            onChange={v => setP("cobranca_auto.dias_antes", v)} dica="Quantos dias antes do vencimento mandar o lembrete. Pode ter vários (ex.: 3 e 1). 0 = no dia." />
          <ListaDias titulo="Avisar depois de vencer" sufixo="depois" lista={pegar(rasc, "cobranca_auto.dias_depois")} disabled={d}
            onChange={v => setP("cobranca_auto.dias_depois", v)} dica="Se ainda não pagou: quantos dias depois do vencimento avisar de novo." />
          <p className="wa-nota">
            Até {envios} mensage{envios === 1 ? "m" : "ns"} por loja em cada ciclo
            {nLojas !== null && <> · {nLojas} loja{nLojas === 1 ? "" : "s"} recebendo</>}
            {nLojas !== null && <> · custo máximo ≈ <strong>{brl(envios * nLojas * p.meta.preco_utilidade)}</strong>/mês</>}
            {" "}(para quem paga em dia, os avisos “depois” não saem).
          </p>
        </div>
      </Secao>

      <Secao icone="🏪" titulo="Lojas que NÃO recebem o lembrete automático"
        sub="Ex.: quem paga por outro canal, combinou diferente ou pediu pra não receber.">
        <p className="wa-nota">Desmarque a loja pra ela não receber o lembrete automático. <Dica texto="Marcada = recebe. A loja desmarcada continua podendo ser cobrada manualmente pela tela Cobranças." /></p>
        <input className="sa-input wa-busca" placeholder="Buscar loja…" value={busca} onChange={e => setBusca(e.target.value)} />
        {lojas === null ? <div className="sa-loading"><div className="sa-spinner" /></div> : lista.length === 0 ? (
          <div className="wa-vazio-mini">{busca ? "Nenhuma loja encontrada." : "Nenhum estabelecimento cadastrado."}</div>
        ) : (
          <ul className="wa-lojas">
            {lista.map(l => {
              const off = desligadas.has(l.id);
              return (
                <li key={l.id} className={off ? "off" : ""}>
                  <label>
                    <input type="checkbox" checked={!off} disabled={d} onChange={() => alternarLoja(l.id)} />
                    <span className="wa-loja-nome">{l.nome_fantasia || "Sem nome"}</span>
                  </label>
                  <span className="wa-loja-info">
                    {l.data_vencimento ? `vence ${new Date(`${String(l.data_vencimento).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}` : "sem vencimento"}
                    {off && <em> · não recebe</em>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   ABA HISTÓRICO
   ══════════════════════════════════════════════════════════════ */
const ROTULO_PARAM = {
  "meta.preco_utilidade": "Preço alerta", "meta.preco_resposta": "Preço resposta", "meta.preco_marketing": "Preço marketing",
  "meta.respostas_gratis_mes": "Respostas grátis", "ia.modelo": "Modelo de IA", "ia.usd_por_interpretacao": "IA por interpretação (US$)",
  "ia.usd_por_imagem": "IA por foto (US$)", "ia.dolar": "Dólar", "ia.dolar_auto": "Dólar automático",
  "ia.dolar_folga_pct": "Folga sobre o dólar %", "ia.modelos": "Modelos de IA cadastrados", "ia.iof_pct": "IOF %", "precificacao.impostos_pct": "Impostos %",
  "precificacao.taxa_gateway_pct": "Taxa pagamento %", "precificacao.margem_seguranca": "Margem de segurança",
  "precificacao.margem_minima_pct": "Margem mínima %", "teto_loja.aviso_pct": "Teto loja: aviso %", "teto_loja.acao_pct": "Teto loja: ação %",
  "teto_loja.acao": "Teto loja: ação", "teto_global.mensal_reais": "Teto global", "custos_fixos.chip_mensal": "Chip/mês",
  "cobranca_auto.ativo": "Cobrança automática", "cobranca_auto.dias_antes": "Cobrança: dias antes",
  "cobranca_auto.dias_depois": "Cobrança: dias depois", "cobranca_auto.lojas_desligadas": "Cobrança: lojas fora",
  "integracao.ativo": "Integração ativa",
};
function achatar(o, pre = "", out = {}) {
  if (o && typeof o === "object" && !Array.isArray(o)) {
    Object.entries(o).forEach(([k, v]) => achatar(v, pre ? `${pre}.${k}` : k, out));
  } else out[pre] = o;
  return out;
}
const fmtValor = (v) => {
  if (Array.isArray(v) && v.some(x => x && typeof x === "object")) return v.map(x => x.nome || "?").join(", ") || "—";
  if (Array.isArray(v)) return v.length > 4 ? `${v.length} itens` : (v.join(", ") || "—");
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return v % 1 ? nf(v, 4).replace(/0+$/, "").replace(/,$/, "") : nf(v);
  return v == null || v === "" ? "—" : String(v);
};

function mudancas(item) {
  if (item.acao === "parametros") {
    const a = achatar(item.antes || {}), b = achatar(item.depois || {});
    return Object.keys(b).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map(k => `${ROTULO_PARAM[k] || k.replace(/^(pesos|travas)\./, (m, g) => (g === "pesos" ? "Peso " : "Trava "))}: ${fmtValor(a[k])} → ${fmtValor(b[k])}`);
  }
  if (item.acao === "editado" && item.antes && item.depois) {
    const campos = [["nome", "Nome"], ["preco", "Preço"], ["creditos", "Créditos"], ["numeros", "Números"], ["ativo", "Ativo"], ["destaque", "Destaque"], ["descricao", "Descrição"], ["ordem", "Ordem"]];
    const out = campos.filter(([k]) => JSON.stringify(item.antes[k]) !== JSON.stringify(item.depois[k]))
      .map(([k, r]) => `${r}: ${k === "preco" ? brl(item.antes[k]) : fmtValor(item.antes[k])} → ${k === "preco" ? brl(item.depois[k]) : fmtValor(item.depois[k])}`);
    if (JSON.stringify(item.antes.recursos) !== JSON.stringify(item.depois.recursos)) out.push("Recursos alterados");
    return out;
  }
  if (item.acao === "criado" && item.depois) return [`${brl(item.depois.preco)} · ${nf(item.depois.creditos)} créditos`];
  return [];
}

function AbaHistorico({ itens }) {
  if (!itens.length) {
    return <div className="wa-vazio"><div className="wa-vazio-icone">🕘</div><h3>Nada alterado ainda</h3><p>Cada mudança em planos e parâmetros aparece aqui, com quem fez e quando.</p></div>;
  }
  return (
    <div className="wa-aba">
      <ul className="wa-hist">
        {itens.map(h => {
          const m = mudancas(h);
          return (
            <li key={h.id}>
              <div className="wa-hist-topo">
                <span className={`wa-hist-acao ${h.acao}`}>{ACAO_HIST[h.acao] || h.acao}</span>
                {h.plano_nome && <strong>{h.plano_nome}</strong>}
                <span className="wa-hist-quem">{h.usuario_nome || "—"} · {dataHora(h.criado_em)}</span>
              </div>
              {m.length > 0 && <ul className="wa-hist-mud">{m.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}{m.length > 12 && <li>…e mais {m.length - 12}</li>}</ul>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

