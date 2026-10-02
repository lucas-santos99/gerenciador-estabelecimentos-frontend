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
  FORMAS_PAGAMENTO, FORMAS_SEM_RECEITA, taxaRecebimento,
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

/* ── Franquia grátis da Meta (01/10/2026) ─────────────────────
   Só do SuperAdmin. O comerciante nunca vê isso: ele paga a mensalidade
   fixa do plano (créditos). Aqui é o custo real do número central. */
const MESES_NOME = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function FranquiaMeta({ f, compacto }) {
  if (!f) return null;
  const pct = Math.min(100, f.pct ?? 0);
  const acabou = f.usadas >= f.gratis;
  const nivel = acabou ? "perigo" : pct >= 80 ? "atencao" : "ok";
  const nomeMes = MESES_NOME[Number(f.mes.slice(5, 7)) - 1] || f.mes;
  return (
    <section className={`wa-franquia ${nivel}${compacto ? " compacto" : ""}`}>
      <div className="wa-franquia-topo">
        <div>
          <span className="wa-franquia-rot">💰 Respostas grátis da Meta — {nomeMes}
            <Dica lado="baixo" texto="Desde 01/10/2026 a Meta cobra cada resposta do sistema, mas cada número tem 1.000 grátis por mês. Mensagens recebidas nunca são cobradas. Isso é custo seu, do número central: o comerciante não vê, ele paga a mensalidade fixa do plano." /></span>
          <strong>{nf(f.usadas)} <small>de {nf(f.gratis)} usadas</small></strong>
        </div>
        <div className="wa-franquia-preco">
          <span>Depois da franquia</span>
          <strong>{brl(f.preco_resposta, 3)} <small>por resposta</small></strong>
        </div>
      </div>
      <div className="wa-franquia-barra"><div style={{ width: `${pct}%` }} /></div>
      <p className="wa-franquia-txt">
        {acabou ? (<>
          <strong>A franquia deste mês acabou.</strong> Até o fim do mês, cada resposta custa {brl(f.preco_resposta, 3)}
          {f.excedentes > 0 ? <> — já são {nf(f.excedentes)} além dela (≈ <strong>{brl(f.custo_excedente)}</strong>)</> : null}.
          {" "}Sem cartão cadastrado na Meta, as respostas a mais <strong>não são enviadas</strong> (e não são cobradas).
        </>) : (<>
          Restam <strong>{nf(f.restantes)}</strong> respostas grátis este mês.
          {f.mes_atual && f.dia_fim_franquia
            ? <> No ritmo atual (~{nf(f.projecao)} no mês), a franquia acaba por volta do dia <strong>{f.dia_fim_franquia}</strong> e o mês fecha em ≈ <strong>{brl(f.custo_projetado)}</strong> de custo.</>
            : f.mes_atual ? <> No ritmo atual (~{nf(f.projecao)} no mês), fica dentro da franquia: custo da Meta <strong>R$ 0</strong>.</> : null}
        </>)}
      </p>
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
          <TabelaCreditos pesos={params.pesos} conversaGratis={params.travas?.conversa_gratis_dia}
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
              {C("meta.respostas_gratis_mes", "Respostas grátis por mês", { tipo: "inteiro", dica: "Franquia da Meta: 1.000 respostas grátis por mês por número (desde 01/10/2026). Só entra como desconto no uso real — NUNCA no preço mínimo dos planos. O comerciante não vê." })}
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
            <div className="wa-linha">
              {C("pesos.conversa", "Conversa sem consulta", { dica: "Resposta do assistente a mensagens que não pedem dado (\"oi\", \"ok\", \"obrigado\", pedir o menu de novo, texto que ele não entende), depois das grátis do dia. Cada uma é 1 mensagem paga na Meta. Aparece na tabela de créditos e nos termos." })}
              {C("travas.conversa_gratis_dia", "Grátis por dia (por loja)", { tipo: "inteiro", dica: "Quantas dessas respostas não gastam crédito por dia, por LOJA (somando todos os números dela). A partir da seguinte, gastam o peso ao lado. 0 = todas gastam." })}
            </div>
          </Secao>

          <Secao icone="📱" titulo="Números extras"
            sub="Cada plano já inclui uma quantidade de números (campo Números do plano). Aqui fica o valor de cada número a mais, que a loja pode pedir e você aprova na aba Lojas.">
            <div className="wa-linha">
              {C("numeros.preco_extra", "Valor por número extra/mês", { prefixo: "R$", dica: "Somado à mensalidade do WhatsApp da loja. Vale para pedidos novos; quem já tem extras mantém o valor travado (dá pra ajustar loja a loja em Lojas → Números). 0 = a loja não pode pedir extras." })}
              {C("numeros.max_extras", "Máximo de extras por loja", { tipo: "inteiro", dica: "Quantos números além do plano uma loja pode ter." })}
            </div>
          </Secao>

          <Secao icone="💳" titulo="Taxas de recebimento"
            sub="Usadas no valor líquido dos pagamentos que você registra na mão na aba Lojas e no Pix pago pela tela da loja. No cartão pago pela tela (crédito ou débito), o sistema grava a taxa real que o Asaas descontou. Dinheiro, transferência direta, cortesia e teste não têm taxa. Confira os valores na sua conta de cada provedor.">
            <div className="wa-linha">
              {C("recebimento.pix_efi_pct", "Pix (Efí)", { sufixo: "%", dica: "Tarifa da Efí por Pix recebido por cobrança (QR dinâmico / copia e cola). Página de tarifas da Efí: 1,19%." })}
              {C("recebimento.pix_efi_fixo", "Pix (Efí) — fixo", { prefixo: "R$", dica: "Valor fixo por Pix, se o seu contrato tiver (normalmente 0)." })}
            </div>
            <div className="wa-linha">
              {C("recebimento.cartao_asaas_pct", "Cartão de crédito (Asaas)", { sufixo: "%", dica: "Percentual da Asaas no cartão de crédito à vista. Tabela padrão do site: 2,99% (confira o seu contrato)." })}
              {C("recebimento.cartao_asaas_fixo", "Cartão de crédito (Asaas) — fixo", { prefixo: "R$", dica: "Valor fixo por cobrança no cartão de crédito. Tabela padrão: R$ 0,49." })}
            </div>
            <div className="wa-linha">
              {C("recebimento.debito_asaas_pct", "Cartão de débito (Asaas)", { sufixo: "%", dica: "Percentual da Asaas no cartão de débito (a página de pagamento do cartão também aceita débito, Visa e Mastercard). Tabela padrão do site: 1,89%." })}
              {C("recebimento.debito_asaas_fixo", "Cartão de débito (Asaas) — fixo", { prefixo: "R$", dica: "Valor fixo por cobrança no débito. Tabela padrão: R$ 0,35." })}
            </div>
          </Secao>

          <Secao icone="⚡" titulo="Pagamento pela tela da loja"
            sub="A loja paga o plano, a mensalidade de cada ciclo, o pacote extra e o número extra por Pix (Efí) ou cartão (Asaas) na própria tela do WhatsApp. O pagamento confirmado ativa o plano, libera os créditos e já entra aqui com a taxa — sem você fazer nada. Você continua podendo ativar e registrar pagamento na mão (dinheiro, cortesia, teste).">
            <label className={`wa-toggle${d ? " desab" : ""}`}>
              <input type="checkbox" checked={pegar(rasc, "pagamento_online.ativo") !== false} disabled={d} onChange={e => setP("pagamento_online.ativo", e.target.checked)} />
              <span className="wa-toggle-trilho"><span /></span>
              <span>Pagamento automático por Pix e cartão</span>
              <Dica texto="Ligado: aparece o botão “Pagar agora” pra loja e tudo libera sozinho quando o pagamento cai. Desligado: volta o fluxo antigo — a loja pede, você combina o pagamento e ativa na mão." />
            </label>
            <div className="wa-linha">
              {C("pagamento_online.dias_antecipar", "Pagar a renovação antes", { tipo: "inteiro", sufixo: "dias", dica: "Quantos dias antes do fim do ciclo a loja já pode pagar a próxima mensalidade. Pagando antes, os créditos novos entram no dia da renovação, sem pausa. 0 = só depois que o ciclo renovar." })}
            </div>
            <p className="wa-nota">Número extra: a loja compra a qualquer hora e paga só o proporcional aos dias que faltam do ciclo; o valor cheio entra na mensalidade seguinte. O cartão só aparece para valores a partir de R$ 5,00 (mínimo do Asaas). Estorno, devolução ou pagamento em dobro não mexem nos créditos sozinhos: viram um aviso pra você na central de notificações.</p>
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
              {C("precificacao.taxa_gateway_pct", "Taxa do pagamento", { sufixo: "%", dica: "Taxa média do meio de pagamento, usada só pra calcular o preço mínimo dos planos (planejamento). O lucro real de cada loja usa a taxa de cada pagamento registrado (Taxas de recebimento)." })}
            </div>
            <div className="wa-linha">
              {C("precificacao.margem_seguranca", "Margem de segurança", { prefixo: "×", dica: "Multiplicador de folga sobre o pior caso (1,3 = 30% a mais) pra cobrir alta do dólar ou da Meta." })}
              {C("precificacao.margem_minima_pct", "Margem mínima desejada", { sufixo: "%", dica: "Se a sobra do plano ficar abaixo disso, o plano aparece em amarelo." })}
            </div>
          </Secao>

          <Secao icone="🚦" titulo="Tetos de gasto"
            sub="Proteção extra além das travas: gasto real de cada loja e do sistema inteiro no mês.">
            <div className="wa-linha">
              {C("teto_loja.aviso_pct", "Avisar em", { tipo: "inteiro", sufixo: "% do plano", dica: "Quando o custo real de uma loja no ciclo chegar a essa % da mensalidade dela (plano + números extras), você recebe um aviso." })}
              {C("teto_loja.acao_pct", "Agir em", { tipo: "inteiro", sufixo: "% do plano", dica: "Quando chegar a essa % da mensalidade (plano + números extras), o sistema toma a ação abaixo (a loja paga R$ 30 e já gastou R$ 21 → 70%)." })}
            </div>
            <label className="wa-campo">
              <span className="wa-campo-label">Ação ao atingir o limite <Dica texto="O que o sistema faz quando o custo real de uma loja chega ao “Agir em”. É um disjuntor raro: no uso normal o saldo de créditos acaba bem antes." /></span>
              <select className="sa-input" value={pegar(rasc, "teto_loja.acao")} disabled={d} onChange={e => setP("teto_loja.acao", e.target.value)}>
                {Object.entries(ACAO_TETO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div className="wa-linha">
              {C("teto_global.mensal_reais", "Teto global do mês", { prefixo: "R$", dica: "Gasto total do número no mês (Meta + IA de todas as lojas + seu uso + chip). Você recebe uma notificação ao chegar a 80% e outra ao passar do teto. Não pausa nada sozinho. 0 = sem teto." })}
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

      <FranquiaMeta f={c.franquia} />

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
            {" "}Cada teste conta na franquia grátis do mês; depois dela, {brl(c.franquia?.preco_resposta ?? 0.035, 3)} por mensagem.
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

/* ── Pagamento (01/10/2026, SQL 18) ─────────────────────────── */
const ICONE_FORMA = { pix_efi: "⚡", cartao_asaas: "💳", debito_asaas: "🏧", dinheiro: "💵", transferencia: "🏦", cortesia: "🎁", teste: "🧪", nao_informado: "❔" };
const hojeISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const lerNumBR = (v) => {
  const t = String(v ?? "").trim();
  const n = parseFloat(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
};
const novoPg = (valorTabela, base = null) => ({
  forma: base && base.forma !== "nao_informado" ? base.forma : "",
  valor: numStr(Number(base && !FORMAS_SEM_RECEITA.includes(base.forma) ? base.valor_bruto : valorTabela).toFixed(2)),
  taxa: base ? numStr(Number(base.taxa || 0).toFixed(2)) : "",
  taxaManual: !!(base && base.forma !== "nao_informado" && Number(base.taxa) > 0),
  pago_em: (base && base.pago_em) || hojeISO(),
  observacao: (base && base.observacao) || "",
});
function previaPg(pg, recebimento) {
  const sem = FORMAS_SEM_RECEITA.includes(pg.forma);
  const bruto = sem ? 0 : lerNumBR(pg.valor);
  const taxa = sem ? 0 : (pg.taxaManual ? lerNumBR(pg.taxa) : taxaRecebimento({ recebimento }, pg.forma, bruto));
  return { sem, bruto, taxa, liquido: bruto - taxa };
}
const corpoPg = (pg, recebimento) => {
  const pv = previaPg(pg, recebimento);
  return { forma: pg.forma, valor: pv.bruto, ...(pg.taxaManual && !pv.sem ? { taxa: pv.taxa } : {}), pago_em: pg.pago_em, observacao: pg.observacao };
};
function rotuloForma(f) { return `${ICONE_FORMA[f] || ""} ${FORMAS_PAGAMENTO[f] || f}`.trim(); }

function CamposPagamento({ pg, setPg, valorTabela, recebimento, rotuloValor = "Valor recebido" }) {
  const pv = previaPg(pg, recebimento);
  const muda = (campo, v) => setPg(x => ({ ...x, [campo]: v }));
  const opcoes = Object.keys(FORMAS_PAGAMENTO).filter(k => k !== "nao_informado");
  return (
    <div className="wa-pg">
      <span className="wa-campo-label">Como foi pago?</span>
      <div className="wa-pg-formas" role="radiogroup" aria-label="Forma de pagamento">
        {opcoes.map(k => (
          <button key={k} type="button" role="radio" aria-checked={pg.forma === k}
            className={`wa-pg-forma${pg.forma === k ? " ativo" : ""}${FORMAS_SEM_RECEITA.includes(k) ? " sem" : ""}`}
            onClick={() => muda("forma", k)}>{rotuloForma(k)}</button>
        ))}
      </div>
      {pg.forma && (
        <div className="wa-linha wa-pg-linha">
          {!pv.sem && <Campo label={rotuloValor} prefixo="R$" valor={pg.valor} onChange={v => muda("valor", v)} largura={150}
            dica={`Valor de tabela: ${brl(valorTabela)}. Mude se a loja pagou outro valor (desconto, acerto).`} />}
          {!pv.sem && (pg.forma === "pix_efi" || pg.forma === "cartao_asaas" || pg.forma === "debito_asaas" || pg.taxaManual) && (
            <Campo label={pg.taxaManual ? "Taxa (informada)" : "Taxa estimada"} prefixo="R$" largura={150}
              valor={pg.taxaManual ? pg.taxa : numStr(pv.taxa.toFixed(2))} disabled={!pg.taxaManual} onChange={v => muda("taxa", v)}
              dica={pg.taxaManual ? "Taxa que o provedor cobrou de verdade." : "Calculada pelas Taxas de recebimento (Custos e parâmetros). Se o provedor cobrou outro valor, clique em \"informar a taxa\"."} />
          )}
          <label className="wa-campo" style={{ maxWidth: 170 }}>
            <span className="wa-campo-label">Data do pagamento</span>
            <input type="date" className="sa-input" value={pg.pago_em} max={hojeISO()} onChange={e => muda("pago_em", e.target.value)} />
          </label>
        </div>
      )}
      {pg.forma && !pv.sem && (
        <button type="button" className="wa-link wa-pg-taxa-link" onClick={() => setPg(x => ({ ...x, taxaManual: !x.taxaManual, taxa: x.taxaManual ? x.taxa : numStr(pv.taxa.toFixed(2)) }))}>
          {pg.taxaManual ? "Usar a taxa estimada" : "Informar a taxa cobrada"}
        </button>
      )}
      {pg.forma && (
        <label className="wa-campo">
          <span className="wa-campo-label">Observação (opcional)</span>
          <input className="sa-input" maxLength={300} value={pg.observacao} placeholder={pv.sem ? "Ex.: período de teste, parceria" : "Ex.: comprovante 123, pago na loja"}
            onChange={e => muda("observacao", e.target.value)} />
        </label>
      )}
      {pg.forma && (
        <div className={`wa-pg-resumo${pv.sem ? " sem" : ""}`}>
          {pv.sem
            ? <>Libera o ciclo <strong>sem receita</strong>. Fica registrado que você deixou de receber {brl(valorTabela)}.</>
            : <>Vai cair na conta: <strong>{brl(Math.max(0, pv.liquido))}</strong>{pv.taxa > 0 && <> ({brl(pv.bruto)} − taxa {brl(pv.taxa)})</>}</>}
        </div>
      )}
    </div>
  );
}

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
      onPendentes((j.pendentes?.length || 0) + (j.pacotes?.length || 0) + (j.ativas || []).filter(a => a.numeros_extras_pedido > 0).length);
    } catch (e) { setErro(e.message); }
  }, [onPendentes]);
  useEffect(() => { carregar(); }, [carregar]);
  useAvisosGlobais(["whatsapp_admin"], carregar, { atraso: 800 });

  const pode = !!(d?.pode_editar ?? podeEditarPagina);
  const receb = d?.recebimento;
  const setPg = (fn) => setModal(m => ({ ...m, pg: typeof fn === "function" ? fn(m.pg) : fn }));
  // Valor de tabela de uma ativação (troca de plano leva os números extras)
  const tabelaAtivacao = (p) => {
    const atual = (d?.ativas || []).find(a => a.mercearia_id === p.mercearia_id);
    return (Number(p.preco) || 0) + (atual ? (Number(atual.numeros_extras) || 0) * (Number(atual.numero_extra_preco) || 0) : 0);
  };

  async function acao(caminho, corpo, msg, metodo = "POST") {
    setOcupado(true);
    try {
      const r = await apiFetch(`${API}${caminho}`, { method: metodo, body: JSON.stringify(corpo || {}) });
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
      setExtrato({ item, movimentos: j.movimentos || [], pagamentos: j.pagamentos || [] });
    } catch (e) { avisar(e.message, "erro"); }
  }

  if (erro) return <div className="wa-erro-geral"><strong>Não foi possível carregar os planos das lojas.</strong><span>{erro}</span><small>Se acabou de atualizar o sistema, confira se o SQL 12 já foi rodado no Supabase.</small></div>;
  if (!d) return <div className="sa-loading"><div className="sa-spinner" /></div>;

  const nada = !d.pendentes.length && !d.pacotes.length && !d.ativas.length;

  return (
    <div className="wa-aba wa-lojas-aba">
      <div className="wa-aviso-cobranca">
<strong>Nesta fase, o pagamento é registrado por você.</strong> A loja escolhe o plano e aceita os termos; ao ativar, você informa como ela pagou (Pix, cartão, dinheiro, cortesia, teste…) e o ciclo de 1 mês começa com o saldo do plano.
        Todo mês o ciclo renova na mesma data e fica <strong>aguardando pagamento</strong>: os créditos novos entram quando você clica em <strong>Registrar pagamento</strong>. Troca de plano começa um ciclo novo; o saldo do plano antigo expira.
      </div>

      {nada && (
        <div className="wa-vazio">
          <div className="wa-vazio-icone">🏪</div>
          <h3>Nenhuma loja com plano ainda</h3>
          <p>Quando um estabelecimento escolher um plano no menu <strong>WhatsApp</strong> do painel dele, o pedido aparece aqui pra você ativar.</p>
        </div>
      )}

      {d.pendentes.length > 0 && (
        <Secao icone="⏳" titulo={`Pedindo ativação (${d.pendentes.length})`} sub="Ao ativar, você informa como a loja pagou (ou se é cortesia/teste).">
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
                    <button type="button" className="sa-btn sa-btn-success sa-btn-sm" disabled={ocupado} onClick={() => setModal({ tipo: "ativar", item: p, tabela: tabelaAtivacao(p), pg: novoPg(tabelaAtivacao(p)) })}>Ativar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.pacotes.length > 0 && (
        <Secao icone="➕" titulo={`Pacotes extras pedidos (${d.pacotes.length})`} sub="Ao aprovar, você informa como a loja pagou e os créditos entram no ciclo atual dela.">
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
                      onClick={() => setModal({ tipo: "aprovar_pacote", item: p, tabela: Number(p.preco) || 0, pg: novoPg(p.preco) })}>Aprovar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.ativas.some(a => a.numeros_extras_pedido > 0) && (
        <Secao icone="📱" titulo={`Números extras pedidos (${d.ativas.filter(a => a.numeros_extras_pedido > 0).length})`} sub="Ao aprovar, a loja já pode cadastrar os números. O valor por número fica travado pra ela e soma na mensalidade do WhatsApp.">
          <ul className="wa-pedidos">
            {d.ativas.filter(a => a.numeros_extras_pedido > 0).map(a => {
              const preco = a.numero_extra_preco != null && a.numeros_extras > 0 ? Number(a.numero_extra_preco) : Number(d.numero_extra_preco_atual ?? 0);
              return (
                <li key={`ne-${a.id}`}>
                  <div className="wa-pedido-info">
                    <strong>{a.loja_nome}</strong>
                    <span>+{a.numeros_extras_pedido} número{a.numeros_extras_pedido === 1 ? "" : "s"} · {brl(preco)} por número/mês · hoje: {a.numeros} do plano{a.numeros_extras > 0 ? ` + ${a.numeros_extras} extra${a.numeros_extras === 1 ? "" : "s"}` : ""}</span>
                    <small>Pedido por {a.numeros_extras_pedido_por_nome || "—"} em {dataHora(a.numeros_extras_pedido_em)}</small>
                  </div>
                  {pode && (
                    <div className="wa-pedido-acoes">
                      <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado}
                        onClick={() => acao(`/assinaturas/${a.id}/numeros-extras/recusar`, {}, "Pedido recusado.")}>Recusar</button>
                      <button type="button" className="sa-btn sa-btn-success sa-btn-sm" disabled={ocupado}
                        onClick={() => acao(`/assinaturas/${a.id}/numeros-extras/aprovar`, {}, `Aprovado: +${a.numeros_extras_pedido} número(s) para ${a.loja_nome}.`)}>Aprovar</button>
                    </div>
                  )}
                </li>
              );
            })}
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
                <th>Pagamento do ciclo <Dica lado="baixo" texto="Como a loja pagou a mensalidade do ciclo atual e quanto caiu na conta (já sem a taxa). Ciclo renovado sem pagamento fica aguardando: os créditos só entram quando você registrar." /></th>
                <th>Custo real <Dica lado="baixo" texto="Custo das mensagens da loja neste ciclo (Meta + IA, pelo registro de envios), em % da mensalidade (plano + números extras). Passou do % de aviso: você é avisado. Passou do % de ação: o assistente pausa (conforme Custos e parâmetros → teto por loja) até você retomar." /></th>
                <th></th>
              </tr></thead>
              <tbody>
                {d.ativas.map(a => {
                  const pct = a.entradas > 0 ? Math.max(0, Math.min(100, (a.saldo / a.entradas) * 100)) : 0;
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.loja_nome}</strong>{a.cancelar_no_fim && <span className="wa-tag-encerra">encerra no fim do ciclo</span>}</td>
                      <td>{a.plano_nome}<small> · {brl(a.valor_mensal ?? a.preco)}/mês</small>
                        <small className="wa-numeros-loja">
                          📱 {a.numeros_cadastrados ?? "?"} de {a.limite_numeros ?? a.numeros} número{(a.limite_numeros ?? a.numeros) === 1 ? "" : "s"}
                          {a.numeros_extras > 0 ? ` (${a.numeros} do plano + ${a.numeros_extras} extra${a.numeros_extras === 1 ? "" : "s"} × ${brl(a.numero_extra_preco)})` : ""}
                        </small>
                      </td>
                      <td className="wa-nowrap">{dataBRs(a.ciclo_inicio)} a {dataBRs(a.ciclo_fim)}</td>
                      <td className="wa-saldo-cel">
                        <span>{nf(a.saldo, a.saldo % 1 ? 1 : 0)} / {nf(a.entradas)}</span>
                        <div className={`wa-barra${pct <= 20 ? " baixa" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                      </td>
                      <td className="wa-pg-cel">
                        {a.aguardando_pagamento ? (<>
                          <span className="wa-tag-teto aviso">⏳ aguardando pagamento</span>
                          <small>{brl(a.valor_mensal ?? a.preco)} · desde {dataBRs(a.ciclo_inicio)}</small>
                          {pode && <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={ocupado}
                            onClick={() => setModal({ tipo: "pagamento", item: a, tabela: Number(a.valor_mensal ?? a.preco) || 0, pg: novoPg(a.valor_mensal ?? a.preco) })}>Registrar pagamento</button>}
                        </>) : a.pagamento_ciclo ? (<>
                          <span className={`wa-pg-chip${a.pagamento_ciclo.forma === "nao_informado" ? " alerta" : ""}`}>{rotuloForma(a.pagamento_ciclo.forma)}</span>
                          <small>{FORMAS_SEM_RECEITA.includes(a.pagamento_ciclo.forma) ? `sem receita (tabela ${brl(a.pagamento_ciclo.valor_tabela)})` : `líquido ${brl(a.pagamento_ciclo.valor_liquido)}${Number(a.pagamento_ciclo.taxa) > 0 ? ` · taxa ${brl(a.pagamento_ciclo.taxa)}` : ""}`}</small>
                          {pode && <button type="button" className="wa-link wa-link-sm" disabled={ocupado}
                            onClick={() => setModal({ tipo: "corrigir_pag", item: a, pag: a.pagamento_ciclo, tabela: Number(a.pagamento_ciclo.valor_tabela) || Number(a.valor_mensal) || 0, pg: novoPg(a.pagamento_ciclo.valor_tabela || a.valor_mensal, a.pagamento_ciclo) })}>
                            {a.pagamento_ciclo.forma === "nao_informado" ? "informar forma" : "corrigir"}</button>}
                        </>) : <small>—</small>}
                      </td>
                      <td className="wa-teto-cel">
                        {a.teto ? (<>
                          <span>{brl(a.teto.custo)}{a.teto.pct != null && <small> · {a.teto.pct}%</small>}</span>
                          {a.teto.pausado && <span className="wa-tag-teto pausado">⏸ pausado pelo teto</span>}
                          {!a.teto.pausado && a.teto.liberado && <span className="wa-tag-teto liberado" title={a.teto.liberado_por ? `Retomado por ${a.teto.liberado_por}` : ""}>▶ retomado</span>}
                          {!a.teto.pausado && !a.teto.liberado && a.teto.aviso && <span className="wa-tag-teto aviso">⚠ passou do aviso</span>}
                        </>) : "—"}
                      </td>
                      <td className="wa-acoes-cel">
                        {pode && a.teto?.pausado && <button type="button" className="sa-btn sa-btn-primary sa-btn-sm" disabled={ocupado}
                          onClick={() => setModal({ tipo: "retomar", item: a })}>Retomar</button>}
                        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => abrirExtrato(a)}>Extrato</button>
                        {pode && <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" disabled={ocupado}
                          onClick={() => setModal({ tipo: "numeros", item: a, extras: String(a.numeros_extras || 0), preco: numStr(a.numero_extra_preco ?? d.numero_extra_preco_atual ?? 0) })}>Números</button>}
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
              <CamposPagamento pg={modal.pg} setPg={setPg} valorTabela={modal.tabela} recebimento={receb} />
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-success" disabled={ocupado || !modal.pg.forma}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/ativar`, corpoPg(modal.pg, receb), `Plano ${modal.item.plano_nome} ativado para ${modal.item.loja_nome}.`)}>Ativar agora</button>
              </div>
            </>)}
            {modal.tipo === "pagamento" && (<>
              <div className="sa-modal-icon">💰</div>
              <div className="sa-modal-title">Registrar pagamento de {modal.item.loja_nome}</div>
              <div className="sa-modal-subtitle">
                Plano <strong>{modal.item.plano_nome}</strong> · ciclo {dataBRs(modal.item.ciclo_inicio)} a {dataBRs(modal.item.ciclo_fim)} · mensalidade {brl(modal.tabela)}.
                {" "}Ao registrar, os {nf(modal.item.creditos)} créditos do ciclo entram na hora e o assistente volta a responder.
              </div>
              <CamposPagamento pg={modal.pg} setPg={setPg} valorTabela={modal.tabela} recebimento={receb} />
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-success" disabled={ocupado || !modal.pg.forma}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/pagamento`, corpoPg(modal.pg, receb), `Pagamento registrado: créditos liberados para ${modal.item.loja_nome}.`)}>Registrar e liberar créditos</button>
              </div>
            </>)}
            {modal.tipo === "aprovar_pacote" && (<>
              <div className="sa-modal-icon">➕</div>
              <div className="sa-modal-title">Aprovar o pacote de {modal.item.loja_nome}?</div>
              <div className="sa-modal-subtitle"><strong>{modal.item.nome}</strong> · +{nf(modal.item.creditos)} créditos · {brl(modal.item.preco)}. Os créditos entram no ciclo atual da loja.</div>
              <CamposPagamento pg={modal.pg} setPg={setPg} valorTabela={modal.tabela} recebimento={receb} />
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-success" disabled={ocupado || !modal.pg.forma}
                  onClick={() => acao(`/pacotes/${modal.item.id}/aprovar`, corpoPg(modal.pg, receb), `Pacote aprovado: +${nf(modal.item.creditos)} créditos para ${modal.item.loja_nome}.`)}>Aprovar pacote</button>
              </div>
            </>)}
            {modal.tipo === "corrigir_pag" && (<>
              <div className="sa-modal-icon">✏️</div>
              <div className="sa-modal-title">{modal.pag.forma === "nao_informado" ? "Informar como foi pago" : "Corrigir pagamento"} — {modal.item.loja_nome}</div>
              <div className="sa-modal-subtitle">
                {modal.pag.referencia === "pacote" ? "Pacote extra" : modal.pag.referencia === "numero_extra" ? "Número extra (proporcional ao ciclo)" : `Mensalidade do ciclo que começou em ${dataBRs(modal.pag.ciclo_inicio || modal.item.ciclo_inicio)}`} · valor de tabela {brl(modal.tabela)}.
                {" "}Muda só o registro do pagamento (forma, valor, taxa, data); os créditos não mudam. Fica na auditoria.
              </div>
              <CamposPagamento pg={modal.pg} setPg={setPg} valorTabela={modal.tabela} recebimento={receb} />
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Cancelar</button>
                <button type="button" className="sa-btn sa-btn-primary" disabled={ocupado || !modal.pg.forma}
                  onClick={() => acao(`/pagamentos/${modal.pag.id}`, corpoPg(modal.pg, receb), "Pagamento atualizado.", "PATCH")}>Salvar</button>
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
            {modal.tipo === "numeros" && (<>
              <div className="sa-modal-icon">📱</div>
              <div className="sa-modal-title">Números de WhatsApp de {modal.item.loja_nome}</div>
              <div className="sa-modal-subtitle">
                O plano {modal.item.plano_nome} inclui {modal.item.numeros} número{modal.item.numeros === 1 ? "" : "s"}. Os extras somam na mensalidade do WhatsApp da loja
                (cadastrados hoje: {modal.item.numeros_cadastrados ?? "?"}). O valor por número fica travado só pra esta loja; o padrão de pedidos novos está em Custos e parâmetros.
              </div>
              <div className="wa-linha">
                <Campo label="Números extras" tipo="inteiro" valor={modal.extras} onChange={v => setModal(m => ({ ...m, extras: v.replace(/\D/g, "") }))} largura={150} />
                <Campo label="Valor por número/mês" prefixo="R$" valor={modal.preco} onChange={v => setModal(m => ({ ...m, preco: v }))} largura={180} />
              </div>
              <p className="wa-nota" style={{ marginBottom: 14 }}>
                Mensalidade do WhatsApp: {brl(modal.item.preco)} (plano) + {parseInt(modal.extras, 10) || 0} × {brl(lerNum(modal.preco) || 0)} ={" "}
                <strong>{brl((Number(modal.item.preco) || 0) + (parseInt(modal.extras, 10) || 0) * (lerNum(modal.preco) || 0))}/mês</strong>
              </p>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Voltar</button>
                <button type="button" className="sa-btn sa-btn-primary" disabled={ocupado}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/numeros-extras/definir`, { extras: parseInt(modal.extras, 10) || 0, preco: lerNum(modal.preco) || 0 }, "Números atualizados.")}>Salvar</button>
              </div>
            </>)}
            {modal.tipo === "retomar" && (<>
              <div className="sa-modal-icon">▶️</div>
              <div className="sa-modal-title">Retomar o assistente de {modal.item.loja_nome}?</div>
              <div className="sa-modal-subtitle">
                Foi pausado porque o custo real deste ciclo chegou a {brl(modal.item.teto?.custo)}
                {modal.item.teto?.pct != null ? ` (${modal.item.teto.pct}% do plano de ${brl(modal.item.preco)}/mês)` : ""}.
                {" "}Confira antes o uso em Conexão → Últimas mensagens. Retomando, as consultas voltam na hora e não pausam de novo até o fim deste ciclo ({dataBRs(modal.item.ciclo_fim)}).
              </div>
              <div className="sa-modal-actions">
                <button type="button" className="sa-btn sa-btn-ghost" onClick={() => setModal(null)} disabled={ocupado}>Voltar</button>
                <button type="button" className="sa-btn sa-btn-primary" disabled={ocupado}
                  onClick={() => acao(`/assinaturas/${modal.item.id}/retomar`, {}, "Assistente retomado.")}>Retomar assistente</button>
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
            {extrato.pagamentos?.length > 0 && (<>
              <h4 className="wa-extrato-sub">💰 Pagamentos</h4>
              <div className="wa-tabela-rolagem">
                <table className="wa-tabela">
                  <thead><tr><th>Data</th><th>Referente a</th><th>Forma</th><th>Recebido</th><th>Taxa</th><th>Líquido</th>{pode && <th></th>}</tr></thead>
                  <tbody>
                    {extrato.pagamentos.map(pg => (
                      <tr key={pg.id}>
                        <td className="wa-nowrap">{dataBRs(pg.pago_em)}</td>
                        <td>{pg.referencia === "pacote" ? "Pacote extra" : pg.referencia === "numero_extra" ? "Número extra" : `Ciclo de ${dataBRs(pg.ciclo_inicio)}`}{pg.observacao ? <small> — {pg.observacao}</small> : null}</td>
                        <td className="wa-nowrap"><span className={`wa-pg-chip${pg.forma === "nao_informado" ? " alerta" : ""}`}>{rotuloForma(pg.forma)}</span></td>
                        <td>{FORMAS_SEM_RECEITA.includes(pg.forma) ? <small>tabela {brl(pg.valor_tabela)}</small> : brl(pg.valor_bruto)}</td>
                        <td>{Number(pg.taxa) > 0 ? brl(pg.taxa) : "—"}</td>
                        <td><strong>{brl(pg.valor_liquido)}</strong></td>
                        {pode && <td><button type="button" className="wa-link wa-link-sm" onClick={() => { const it = extrato.item; setExtrato(null); setModal({ tipo: "corrigir_pag", item: it, pag: pg, tabela: Number(pg.valor_tabela) || Number(pg.valor_bruto) || 0, pg: novoPg(pg.valor_tabela || pg.valor_bruto, pg) }); }}>{pg.forma === "nao_informado" ? "informar" : "corrigir"}</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="wa-extrato-sub">🧾 Créditos do ciclo atual</h4>
            </>)}
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
  // (01/10) Duas visões: resumo do número × por loja (créditos e lucro)
  const [vista, setVista] = useState(() => {
    try { return localStorage.getItem("wa-uso-vista") === "lojas" ? "lojas" : "resumo"; } catch { return "resumo"; }
  });
  const trocarVista = (v) => { setVista(v); try { localStorage.setItem("wa-uso-vista", v); } catch { /* sem armazenamento */ } };
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
        <div className="wa-subabas" role="tablist" aria-label="Visão do uso do mês">
          <button type="button" role="tab" aria-selected={vista === "resumo"} className={vista === "resumo" ? "ativo" : ""} onClick={() => trocarVista("resumo")}>📊 Resumo do número</button>
          <button type="button" role="tab" aria-selected={vista === "lojas"} className={vista === "lojas" ? "ativo" : ""} onClick={() => trocarVista("lojas")}>🏪 Por loja: créditos e lucro</button>
        </div>
      </div>

      {vista === "lojas" ? <AbaUsoLojas mes={mes} /> : carregando ? <div className="sa-loading"><div className="sa-spinner" /></div> : erro ? <div className="wa-erro">{erro}</div> : u && (
        <>
          <FranquiaMeta f={u.franquia} compacto />

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
              <div className="wa-card ok"><span>Franquia grátis <Dica lado="baixo" texto="Desconto das respostas grátis da Meta no mês (1.000 por número). Respostas são sempre das lojas." /></span><strong>− {brl(u.lojas?.desconto_respostas_gratis ?? 0)}</strong></div>
              <div className="wa-card destaque"><span>Custo das lojas <Dica lado="baixo" texto="Meta + IA − franquia grátis, só do uso das lojas." /></span><strong>{brl(u.lojas?.custo_total ?? 0)}</strong></div>
            </div>
            {u.receita_planos && (
              <div className="wa-cards wa-cards-receita">
                <div className="wa-card ok"><span>Receita dos planos <Dica lado="baixo" texto="Pagamentos registrados com data no mês (mensalidades + pacotes extras), pelo valor que a loja pagou. Cortesia e teste entram como R$ 0." /></span><strong>{brl(u.receita_planos.total)}</strong>
                  <small>{nf(u.receita_planos.ciclos)} mensalidade{u.receita_planos.ciclos === 1 ? "" : "s"} · pacotes {brl(u.receita_planos.pacotes)}{u.receita_planos.taxas > 0 ? ` · taxas −${brl(u.receita_planos.taxas)}` : ""}{u.receita_planos.cortesias ? ` · ${u.receita_planos.cortesias} cortesia/teste (${brl(u.receita_planos.cortesia_valor)})` : ""}</small></div>
                {u.lojas?.sobra != null && (
                  <div className={`wa-card ${u.lojas.sobra >= 0 ? "ok" : "perigo"}`}><span>Sobra do serviço <Dica lado="baixo" texto="Receita dos planos − taxas de recebimento (Pix Efí, cartão Asaas) − custo das lojas − chip do número. Não inclui o seu uso (cobrança da mensalidade). Ainda sem descontar os impostos." /></span><strong>{brl(u.lojas.sobra)}</strong><small>já sem as taxas · antes dos impostos</small></div>
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

/* ── Uso do mês → Por loja: créditos do ciclo + lucro do mês (01/10/2026) ── */
const ORDENS_LOJAS = [
  { id: "vence_asc",  label: "Vencem antes" },
  { id: "vence_desc", label: "Vencem depois" },
  { id: "uso_desc",   label: "Mais usados (%)" },
  { id: "uso_asc",    label: "Menos usados (%)" },
  { id: "saldo_asc",  label: "Menor saldo" },
  { id: "lucro_desc", label: "Maior lucro" },
  { id: "lucro_asc",  label: "Menor lucro" },
  { id: "custo_desc", label: "Maior custo" },
  { id: "nome",       label: "Nome (A–Z)" },
];
const SITUACOES_LOJA = [
  { id: "todas",     label: "Todas" },
  { id: "ativo",     label: "Com plano ativo" },
  { id: "acaba",     label: "Vai acabar antes de renovar" },
  { id: "vence7",    label: "Créditos vencem em até 7 dias" },
  { id: "aguardando", label: "Aguardando pagamento" },
  { id: "cortesia",  label: "Cortesia ou teste" },
  { id: "pausado",   label: "Pausadas pelo teto" },
  { id: "prejuizo",  label: "Com prejuízo no mês" },
  { id: "sem_plano", label: "Sem plano ativo" },
];
const fmtDataBR = (s) => { const [a, m, d] = String(s || "").split("-"); return a && m && d ? `${d}/${m}/${a}` : "—"; };
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function AbaUsoLojas({ mes }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [plano, setPlano] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const [ordem, setOrdem] = useState("vence_asc");
  // (01/10) Período do resultado: o ciclo atual de cada loja (padrão: o que
  // cada uma paga agora × o que custou desde o início do ciclo) ou o mês.
  const [periodo, setPeriodo] = useState(() => {
    try { return localStorage.getItem("wa-uso-lojas-periodo") === "mes" ? "mes" : "ciclo"; } catch { return "ciclo"; }
  });
  const trocarPeriodo = (v) => { setPeriodo(v); try { localStorage.setItem("wa-uso-lojas-periodo", v); } catch { /* sem armazenamento */ } };
  const res = useCallback((l) => (periodo === "ciclo" ? l.ciclo : l.mes), [periodo]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true); setErro("");
    apiFetch(`${API}/uso/lojas?mes=${mes}`)
      .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.error || "Erro."); if (vivo) setDados(j); }))
      .catch(e => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => { vivo = false; };
  }, [mes]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const q = semAcento(busca.trim());
    const filtradas = dados.lojas.filter(l => {
      if (q && !semAcento(l.nome).includes(q)) return false;
      if (tipo && l.tipo_estabelecimento !== tipo) return false;
      if (plano && l.creditos?.plano !== plano) return false;
      const c = l.creditos;
      switch (situacao) {
        case "ativo": return !!c;
        case "acaba": return !!c?.acaba_antes;
        case "vence7": return !!c && c.vencem_em_dias <= 7;
        case "pausado": return l.situacao === "pausado";
        case "aguardando": return l.situacao === "aguardando";
        case "cortesia": return !!res(l) && (res(l).formas || []).some(f => FORMAS_SEM_RECEITA.includes(f));
        case "prejuizo": return !!res(l) && res(l).lucro < 0;
        case "sem_plano": return !c;
        default: return true;
      }
    });
    const nulo = (v, alto) => (v === null || v === undefined ? (alto ? Infinity : -Infinity) : v);
    const cmp = {
      vence_asc: (a, b) => nulo(a.creditos?.vencem_em_dias, true) - nulo(b.creditos?.vencem_em_dias, true),
      vence_desc: (a, b) => nulo(b.creditos?.vencem_em_dias, false) - nulo(a.creditos?.vencem_em_dias, false),
      uso_desc: (a, b) => nulo(b.creditos?.pct_usado, false) - nulo(a.creditos?.pct_usado, false),
      uso_asc: (a, b) => nulo(a.creditos?.pct_usado, true) - nulo(b.creditos?.pct_usado, true),
      saldo_asc: (a, b) => nulo(a.creditos?.saldo, true) - nulo(b.creditos?.saldo, true),
      lucro_desc: (a, b) => nulo(res(b)?.lucro, false) - nulo(res(a)?.lucro, false),
      lucro_asc: (a, b) => nulo(res(a)?.lucro, true) - nulo(res(b)?.lucro, true),
      custo_desc: (a, b) => nulo(res(b)?.custo, false) - nulo(res(a)?.custo, false),
      nome: () => 0,
    }[ordem] || (() => 0);
    return [...filtradas].sort((a, b) => cmp(a, b) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [dados, busca, tipo, plano, situacao, ordem, res]);

  const tot = useMemo(() => lista.reduce((t, l) => {
    const r = res(l);
    return r ? {
      receita: t.receita + r.receita, custo: t.custo + r.custo,
      impostos: t.impostos + r.impostos_taxas, lucro: t.lucro + r.lucro,
    } : t;
  }, { receita: 0, custo: 0, impostos: 0, lucro: 0 }), [lista, res]);
  const ehCiclo = periodo === "ciclo";
  const nomeMes = (() => { const [a, m] = String(dados?.mes || "").split("-"); return a && m ? `${MESES_NOME[Number(m) - 1]}/${a}` : "mês"; })();

  const filtrando = busca || tipo || plano || situacao !== "todas";
  const limpar = () => { setBusca(""); setTipo(""); setPlano(""); setSituacao("todas"); };

  if (carregando) return <div className="sa-loading"><div className="sa-spinner" /></div>;
  if (erro) return <div className="wa-erro">{erro}</div>;
  if (!dados) return null;

  return (
    <div className="wa-ul">
      <div className="wa-ul-periodo">
        <span className="wa-campo-label">Resultado de</span>
        <div className="wa-subabas" role="tablist" aria-label="Período do resultado">
          <button type="button" role="tab" aria-selected={ehCiclo} className={ehCiclo ? "ativo" : ""} onClick={() => trocarPeriodo("ciclo")}>🔄 Ciclo atual de cada loja</button>
          <button type="button" role="tab" aria-selected={!ehCiclo} className={!ehCiclo ? "ativo" : ""} onClick={() => trocarPeriodo("mes")}>📅 Mês de {nomeMes}</button>
        </div>
      </div>
      <p className="wa-nota">
        {ehCiclo ? (
          <><strong>Ciclo atual:</strong> receita = o que cada loja pagou pelo ciclo que está correndo (mensalidade + pacotes, como você registrou);
          custo = as mensagens dela desde o início do ciclo. É o quanto você está ganhando com cada loja <strong>agora</strong>, e o lucro diminui conforme ela usa.
          Ciclo renovado sem pagamento aparece como <strong>aguardando</strong>.</>
        ) : (
          <><strong>Mês de {nomeMes}:</strong> receita = pagamentos registrados com data no mês (mensalidades + pacotes);
          custo = as mensagens dela no mês.</>
        )}{" "}
        Desconto = <strong>taxa real de cada pagamento</strong> (Pix Efí, cartão Asaas; dinheiro e transferência sem taxa) + impostos de {nf(dados.impostos_pct, 1)}% da receita.
        Custo = Meta + IA, <strong>sem</strong> descontar a franquia grátis (conta conservadora).
        O chip e a franquia grátis são do número inteiro e ficam no Resumo. <strong>Créditos</strong> são sempre do ciclo atual.
      </p>

      <div className="wa-cards">
        <div className="wa-card"><span>Lojas {filtrando ? "(filtradas)" : ""}</span><strong>{nf(lista.length)}</strong><small>de {nf(dados.lojas.length)}</small></div>
        <div className="wa-card ok"><span>Receita <Dica lado="baixo" texto={ehCiclo ? "O que as lojas da lista pagam no ciclo atual: mensalidade com números extras + pacotes aprovados no ciclo." : "Mensalidades dos ciclos iniciados no mês + pacotes aprovados no mês, das lojas da lista."} /></span><strong>{brl(tot.receita)}</strong></div>
        <div className="wa-card"><span>Custo <Dica lado="baixo" texto={ehCiclo ? "Meta + IA das mensagens dessas lojas desde o início do ciclo de cada uma (sem a franquia grátis)." : "Meta + IA das mensagens dessas lojas no mês (sem a franquia grátis)."} /></span><strong>{brl(tot.custo)}</strong></div>
        <div className="wa-card"><span>Taxas + impostos <Dica lado="baixo" texto="Taxa real de cada pagamento (Pix Efí, cartão Asaas) + impostos." /></span><strong>{brl(tot.impostos)}</strong></div>
        <div className={`wa-card destaque${tot.lucro < 0 ? " perigo" : ""}`}><span>{ehCiclo ? "Lucro no ciclo" : "Lucro no mês"} <Dica lado="esq" texto="Receita − impostos e taxa − custo. Antes do chip (que é do número inteiro)." /></span><strong>{brl(tot.lucro)}</strong>
          {tot.receita > 0 && <small>{nf((tot.lucro / tot.receita) * 100, 0)}% da receita</small>}</div>
      </div>

      <div className="wa-ul-filtros">
        <label className="wa-campo wa-ul-busca">
          <span className="wa-campo-label">Buscar</span>
          <input className="sa-input" type="search" placeholder="Nome do estabelecimento" maxLength={100} value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
        <label className="wa-campo">
          <span className="wa-campo-label">Tipo</span>
          <select className="sa-input" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {dados.tipos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="wa-campo">
          <span className="wa-campo-label">Plano</span>
          <select className="sa-input" value={plano} onChange={e => setPlano(e.target.value)}>
            <option value="">Todos os planos</option>
            {dados.planos.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="wa-campo">
          <span className="wa-campo-label">Situação</span>
          <select className="sa-input" value={situacao} onChange={e => setSituacao(e.target.value)}>
            {SITUACOES_LOJA.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="wa-campo">
          <span className="wa-campo-label">Ordenar por</span>
          <select className="sa-input" value={ordem} onChange={e => setOrdem(e.target.value)}>
            {ORDENS_LOJAS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        {filtrando && <button type="button" className="sa-btn sa-btn-ghost wa-ul-limpar" onClick={limpar}>✕ Limpar filtros</button>}
      </div>

      {dados.lojas.length === 0 ? (
        <div className="wa-vazio">
          <div className="wa-vazio-icone">🏪</div>
          <h3>Nenhuma loja com plano ou uso neste mês</h3>
          <p>Quando um estabelecimento contratar um plano de WhatsApp, ele aparece aqui com os créditos e o resultado do mês.</p>
        </div>
      ) : lista.length === 0 ? (
        <div className="wa-vazio-mini">Nenhuma loja com esses filtros. <button type="button" className="wa-link" onClick={limpar}>Limpar filtros</button></div>
      ) : (
        <div className="wa-tabela-rolagem">
          <table className="wa-tabela wa-ul-tabela">
            <thead>
              <tr>
                <th>Estabelecimento</th>
                <th>Créditos do ciclo <Dica lado="baixo" texto="Usados de quantos entraram no ciclo (plano + pacotes + ajustes) e o saldo que sobra." /></th>
                <th>Vencem <Dica lado="baixo" texto="Último dia do ciclo: depois disso o saldo que sobrou expira e entram os créditos do próximo ciclo." /></th>
                <th>Ritmo <Dica lado="baixo" texto="Média de créditos por dia no ciclo e se, nesse ritmo, o saldo acaba antes de renovar." /></th>
                <th className="num">Receita</th>
                <th className="num">Custo</th>
                <th className="num">Taxa + impostos <Dica lado="baixo" texto="Taxa real do pagamento (Pix Efí, cartão Asaas…) + impostos sobre o que a loja pagou." /></th>
                <th className="num">Lucro <Dica lado="esq" texto="Receita − impostos e taxa − custo, no mês escolhido." /></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(l => {
                const c = l.creditos;
                const pct = c ? Math.min(100, c.pct_usado) : 0;
                return (
                  <tr key={l.mercearia_id}>
                    <td className="wa-ul-td-loja">
                      <div className="wa-ul-nome">{l.nome}</div>
                      <div className="wa-ul-sub">
                        {l.tipo_estabelecimento && <span className="wa-chip">{l.tipo_estabelecimento}</span>}
                        {c ? <span>{c.plano} · {brl(c.valor_mensal)}/mês{c.numeros_extras ? ` (+${c.numeros_extras} nº)` : ""}</span> : <span className="wa-ul-sem">sem plano ativo</span>}
                        {l.situacao === "pausado" && <span className="wa-selo perigo">pausado pelo teto</span>}
                        {l.situacao === "aguardando" && <span className="wa-selo alerta">aguardando pagamento</span>}
                        {c?.cancelar_no_fim && <span className="wa-selo alerta">cancela no fim do ciclo</span>}
                      </div>
                    </td>
                    <td data-label="Créditos do ciclo">
                      {c ? (
                        <div className="wa-ul-cred">
                          <div className={`wa-barra${pct >= 90 ? " baixa" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                          <small><strong>{nf(c.usados, 1)}</strong> de {nf(c.entradas, 0)} ({nf(c.pct_usado)}%) · saldo <strong>{nf(c.saldo, 1)}</strong></small>
                        </div>
                      ) : <small>—</small>}
                    </td>
                    <td data-label="Vencem">
                      {c ? (
                        <>
                          <div>{fmtDataBR(c.ciclo_fim)}</div>
                          <small className={c.vencem_em_dias <= 3 ? "wa-ul-alerta" : ""}>
                            {c.vencem_em_dias <= 0 ? "vence hoje" : `em ${c.vencem_em_dias} dia${c.vencem_em_dias === 1 ? "" : "s"}`}
                          </small>
                        </>
                      ) : <small>—</small>}
                    </td>
                    <td data-label="Ritmo">
                      {c ? (
                        <>
                          <div>{nf(c.ritmo_dia, 1)}/dia</div>
                          {c.acaba_antes
                            ? <small className="wa-ul-alerta">acaba em ~{c.acaba_em_dias} dia{c.acaba_em_dias === 1 ? "" : "s"}, antes de renovar</small>
                            : <small>{c.usados > 0 ? "dura até renovar" : "sem uso ainda"}</small>}
                        </>
                      ) : <small>—</small>}
                    </td>
                    {(() => {
                      const r = res(l);
                      if (!r) return (<>
                        <td className="num" data-label="Receita"><span className="wa-ul-val"><small>—</small></span></td>
                        <td className="num" data-label="Custo"><span className="wa-ul-val"><small>—</small></span></td>
                        <td className="num" data-label="Taxa + impostos"><span className="wa-ul-val"><small>—</small></span></td>
                        <td className="num" data-label="Lucro"><span className="wa-ul-val"><small>sem ciclo</small></span></td>
                      </>);
                      return (<>
                        <td className="num" data-label="Receita"><span className="wa-ul-val">
                          {r.aguardando_pagamento && r.receita === 0
                            ? <><span className="wa-pg-chip alerta">⏳ aguardando</span><small><br />previsto {brl(r.previsto)}</small></>
                            : <>{brl(r.receita)}{r.receita_pacotes > 0 && <small><br />pacotes {brl(r.receita_pacotes)}</small>}</>}
                          {(r.formas || []).length > 0 && <small className="wa-ul-formas"><br />{r.formas.map(f => rotuloForma(f)).join(" · ")}</small>}
                          {r.cortesia > 0 && <small><br />sem receita (tabela {brl(r.cortesia)})</small>}
                        </span></td>
                        <td className="num" data-label="Custo"><span className="wa-ul-val">{brl(r.custo)}<small><br />{nf(r.enviadas)} env.</small></span></td>
                        <td className="num" data-label="Taxa + impostos"><span className="wa-ul-val">{brl(r.impostos_taxas)}{r.impostos_taxas > 0 && <small><br />taxa {brl(r.taxa)} · imp. {brl(r.impostos)}</small>}</span></td>
                        <td className={`num${r.lucro < 0 ? " neg" : ""}`} data-label="Lucro"><span className="wa-ul-val"><strong>{brl(r.lucro)}</strong>{r.margem_pct !== null && <small><br />{nf(r.margem_pct)}%</small>}</span></td>
                      </>);
                    })()}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="wa-ul-td-loja"><strong>Total {filtrando ? "(filtradas)" : ""}</strong> · {nf(lista.length)} loja{lista.length === 1 ? "" : "s"}</td>
                <td className="num" data-label="Receita"><strong>{brl(tot.receita)}</strong></td>
                <td className="num" data-label="Custo"><strong>{brl(tot.custo)}</strong></td>
                <td className="num" data-label="Taxa + impostos"><strong>{brl(tot.impostos)}</strong></td>
                <td className={`num${tot.lucro < 0 ? " neg" : ""}`} data-label="Lucro"><strong>{brl(tot.lucro)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {!ehCiclo && dados.mes_atual && <p className="wa-nota wa-ul-rodape">Mês em andamento: a receita só entra quando o ciclo da loja começa, então uma loja pode aparecer com custo e sem receita até a renovação dela. Para ver o quanto cada loja está rendendo agora, use <button type="button" className="wa-link" onClick={() => trocarPeriodo("ciclo")}>Ciclo atual de cada loja</button>.</p>}
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
  "meta.respostas_gratis_mes": "Respostas grátis", "pesos.conversa": "Peso conversa sem consulta", "travas.conversa_gratis_dia": "Conversas grátis por dia (loja)",
  "recebimento.pix_efi_pct": "Taxa Pix Efí %", "recebimento.pix_efi_fixo": "Taxa Pix Efí fixa", "recebimento.debito_asaas_pct": "Taxa débito Asaas %", "recebimento.debito_asaas_fixo": "Taxa débito Asaas fixa", "recebimento.cartao_asaas_pct": "Taxa cartão Asaas %", "recebimento.cartao_asaas_fixo": "Taxa cartão Asaas fixa",
  "numeros.preco_extra": "Valor por número extra", "numeros.max_extras": "Máximo de números extras", "ia.modelo": "Modelo de IA", "ia.usd_por_interpretacao": "IA por interpretação (US$)",
  "ia.usd_por_imagem": "IA por foto (US$)", "ia.dolar": "Dólar", "ia.dolar_auto": "Dólar automático",
  "ia.dolar_folga_pct": "Folga sobre o dólar %", "ia.modelos": "Modelos de IA cadastrados", "ia.iof_pct": "IOF %", "precificacao.impostos_pct": "Impostos %",
  "precificacao.taxa_gateway_pct": "Taxa pagamento %", "precificacao.margem_seguranca": "Margem de segurança",
  "precificacao.margem_minima_pct": "Margem mínima %", "teto_loja.aviso_pct": "Teto loja: aviso %", "teto_loja.acao_pct": "Teto loja: ação %",
  "teto_loja.acao": "Teto loja: ação", "teto_global.mensal_reais": "Teto global", "custos_fixos.chip_mensal": "Chip/mês",
  "cobranca_auto.ativo": "Cobrança automática", "cobranca_auto.dias_antes": "Cobrança: dias antes",
  "cobranca_auto.dias_depois": "Cobrança: dias depois", "cobranca_auto.lojas_desligadas": "Cobrança: lojas fora",
  "integracao.ativo": "Integração ativa",
  "pagamento_online.ativo": "Pagamento pela tela (Pix/cartão)", "pagamento_online.dias_antecipar": "Pagar renovação antes (dias)",
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

