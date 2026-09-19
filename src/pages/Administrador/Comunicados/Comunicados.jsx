// src/pages/Administrador/Comunicados/Comunicados.jsx
//
// Central de Comunicados do SuperAdmin (backlog item 20). Cadastra avisos
// (mudança de valores, instabilidade, manutenção programada, etc.) que
// aparecem pro comerciante/operador ao acessar o sistema. Cada comunicado
// escolhe seus próprios formatos de exibição — hoje "Modal bloqueante" e
// "Fixo no canto", com espaço pra crescer sem mudar a modelagem (ver
// FORMATOS_DISPONIVEIS abaixo e a coluna `formatos`, jsonb, no backend).
//
// Segmentação: cada comunicado também escolhe um alvo — todos os
// estabelecimentos, um ou mais tipos de estabelecimento (mercearias.
// tipo_estabelecimento), ou um ou mais estabelecimentos específicos. Ver
// ALVO_OPCOES abaixo e a validação equivalente em comunicadosRoutes.js.
//
// Agendamento, autoria, imagem e texto rico (adicionados em 18/09):
// - data_inicio/data_fim (opcionais): janela em que o comunicado aparece
//   pro comerciante — fora dela, o registro existe e pode estar "ativo",
//   mas o backend (GET /ativos) não devolve. Ver `agendaChip`/`estaVigente`.
// - criado_por_nome/criado_em: gravados só na criação (o PUT não altera o
//   autor original), exibidos na listagem e num aviso no topo do modal.
// - imagem_url: upload dedicado (multipart) pro bucket "logos", mesmo
//   padrão do logo de estabelecimento — precisa do id, então numa criação
//   nova o arquivo fica pendente até o Salvar devolver o id (ver
//   `imagemArquivoPendente` e `enviarImagem`).
// - mensagem_html: editor de texto rico simples (negrito/itálico/cor/
//   fonte) via contentEditable + document.execCommand — `mensagem` (texto
//   puro, sem tags) continua sendo salva em paralelo como fallback e pra
//   validação de tamanho. Colar sempre entra como texto puro (sem manter
//   formatação de origem), pra não abrir brecha de HTML arbitrário vindo
//   da área de transferência.
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { supabase } from "../../../utils/supabaseClient";
import "../SuperAdmins/SuperAdmins.css";
import "./Comunicados.css";

// Formatos suportados hoje. Adicionar um formato novo no futuro (faixa no
// topo, toast periódico) é só acrescentar um item aqui — o backend já
// aceita qualquer `tipo` dentro do array `formatos` (coluna jsonb).
const FORMATOS_DISPONIVEIS = [
  { tipo: "modal", icone: "🪟", label: "Modal bloqueante", desc: "Aparece antes da tela principal — o comerciante precisa fechar/confirmar pra continuar." },
  { tipo: "fixo",  icone: "📌", label: "Fixo no canto",     desc: "Card fixado num canto da tela, com botão de fechar, sem travar o uso do sistema." },
];

// Alvos de segmentação suportados hoje. "especificos" cobre tanto "um"
// quanto "vários" estabelecimentos — é a mesma lista, só muda a
// quantidade marcada.
const ALVO_OPCOES = [
  { tipo: "todos",               icone: "🌐", label: "Todos os estabelecimentos", desc: "Aparece pra rede inteira." },
  { tipo: "tipo_estabelecimento", icone: "🏷️", label: "Por tipo de estabelecimento", desc: "Só pra estabelecimentos de um ou mais tipos (ex: Mercearia, Restaurante)." },
  { tipo: "especificos",         icone: "🎯", label: "Estabelecimentos específicos", desc: "Escolha um ou vários estabelecimentos, individualmente." },
];

// Fontes disponíveis no editor de texto rico. "inherit" volta pra fonte
// padrão do sistema (não fixa nenhuma família específica no HTML salvo).
const FONTES_DISPONIVEIS = [
  { valor: "inherit",              label: "Padrão" },
  { valor: "Arial, sans-serif",    label: "Arial" },
  { valor: "Georgia, serif",       label: "Georgia (serifa)" },
  { valor: "'Courier New', monospace", label: "Monoespaçada" },
  { valor: "Verdana, sans-serif",  label: "Verdana" },
];

// Tamanhos de fonte oferecidos pro título e pra mensagem — aplicados via
// execCommand('fontSize') truncado em <font size="7"> e depois convertido
// pra <span style="font-size:Npx"> (ver `aplicarTamanhoFonte`), porque o
// execCommand só aceita os 7 tamanhos relativos do HTML antigo, não px.
const TAMANHOS_FONTE = [12, 14, 16, 18, 20, 24, 28, 32, 40];

// Faixa de zoom do modal (não altera o que é salvo — só a exibição
// enquanto o SuperAdmin está digitando/revisando).
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.6;
const ZOOM_PASSO = 0.1;

// Frequência de exibição pro comerciante/operador — controla quantas
// vezes o mesmo aviso reaparece antes de parar (ou se nunca para).
const FREQUENCIA_OPCOES = [
  { tipo: "uma_vez",    icone: "1️⃣", label: "Mostrar 1 vez", desc: "Depois que o comerciante/operador fechar (ou confirmar o modal), não aparece de novo." },
  { tipo: "quantidade", icone: "🔁", label: "Mostrar algumas vezes", desc: "Aparece de novo a cada login até bater a quantidade escolhida — aí some sozinho." },
  { tipo: "sempre",     icone: "♾️", label: "Mostrar sempre que logar", desc: "Aparece em todo login, mesmo depois de fechado — só some desativando ou pela data de término." },
];

const FORM_VAZIO = {
  titulo: "", titulo_html: "", mensagem: "", mensagem_html: "", formatos: [], ativo: true,
  alvo_tipo: "todos", alvo_tipos_estabelecimento: [], estabelecimento_ids: [],
  imagem_url: null, data_inicio: "", data_fim: "",
  frequencia_tipo: "uma_vez", frequencia_quantidade: "",
  criadoPorNome: null, criadoEm: null,
};

// ── Helpers de data ──────────────────────────────────────────────────
// Converte um ISO (do backend) pro formato que <input type="datetime-local">
// entende (YYYY-MM-DDTHH:mm, em horário LOCAL do navegador).
function isoParaInputLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// Converte o valor do <input type="datetime-local"> (horário local) pra
// ISO (UTC) pra mandar pro backend. String vazia vira null (sem limite).
function inputLocalParaIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
// Resumo em texto do agendamento configurado — atualiza ao vivo enquanto
// o SuperAdmin mexe nos campos, servindo de confirmação visual de que a
// data/hora escolhida realmente "pegou" (sem precisar de um botão de
// confirmar separado, que ficaria redundante com o Salvar geral do modal).
function resumoAgendamento(dataInicioLocal, dataFimLocal) {
  const fmt = v => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  };
  const inicio = fmt(dataInicioLocal);
  const fim = fmt(dataFimLocal);
  if (!inicio && !fim) return "Sem agendamento — vale a partir de agora e não desaparece sozinho.";
  if (inicio && fim)   return `Vai aparecer de ${inicio} até ${fim}.`;
  if (inicio)          return `Vai aparecer a partir de ${inicio}, sem data pra sumir sozinho.`;
  return `Vai aparecer desde já, até ${fim}.`;
}

export default function Comunicados() {
  const navigate = useNavigate();

  const [lista,        setLista]        = useState([]);
  const [loadingLista, setLoadingLista]  = useState(true);
  const [abaAtiva,     setAbaAtiva]      = useState("ativos"); // 'ativos' | 'historico'

  const [tiposDisponiveis,          setTiposDisponiveis]          = useState([]);
  const [estabelecimentosDisponiveis, setEstabelecimentosDisponiveis] = useState([]);
  const [buscaEstab,                setBuscaEstab]                = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId,  setEditandoId]  = useState(null); // null = criando
  const [form,        setForm]        = useState(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [erroModal,   setErroModal]   = useState("");
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Feedback visual do botão "Confirmar data e hora" — os campos já são
  // estado vivo (salvos de verdade só quando o modal inteiro é salvo),
  // então esse botão não muda dado nenhum: só tira o foco do campo
  // (fecha o seletor nativo de data/hora do navegador) e pisca um "✓
  // Confirmado" por um instante, dando a confirmação visual pedida.
  const [dataConfirmadaPulse, setDataConfirmadaPulse] = useState(false);

  // Filtro por período na aba Histórico — "de" / "até", comparando com
  // `criado_em` (data de cadastro do comunicado). Vazio = sem filtro
  // (mostra tudo, comportamento de antes).
  const [historicoFiltroDe,  setHistoricoFiltroDe]  = useState("");
  const [historicoFiltroAte, setHistoricoFiltroAte] = useState("");

  // Imagem: enquanto o comunicado ainda não existe (criação), o arquivo
  // fica pendente em memória e só sobe depois que o Salvar devolve o id.
  // Editando um comunicado já existente, o upload acontece na hora.
  const [imagemArquivoPendente, setImagemArquivoPendente] = useState(null);
  const [imagemPreviewLocal,    setImagemPreviewLocal]    = useState(null);
  const [enviandoImagem,        setEnviandoImagem]        = useState(false);
  const inputImagemRef = useRef(null);

  // Editor de texto rico (contentEditable) — guarda a seleção de texto
  // pra sobreviver ao clique nos controles de cor/fonte, que tiram o foco
  // do editor antes do onChange disparar.
  const editorRef   = useRef(null);
  const selecaoRef  = useRef(null);
  // Mesma mecânica, só que pro campo Título (agora um editor rico igual
  // ao da Mensagem, com a mesma barra de formatação).
  const editorTituloRef  = useRef(null);
  const selecaoTituloRef = useRef(null);

  // Navegação por teclado (mesmo padrão do resto do painel SuperAdmin) —
  // setas navegam a lista, Enter abre edição, Delete exclui, Escape limpa.
  const [comNavId, setComNavId] = useState(null);

  async function carregarLista() {
    setLoadingLista(true);
    try {
      const resp = await apiFetch("/api/comunicados/admin");
      setLista(resp.ok ? await resp.json() : []);
    } catch { setLista([]); }
    setLoadingLista(false);
  }

  async function carregarOpcoesAlvo() {
    try {
      const [respTipos, respEstab] = await Promise.all([
        apiFetch("/api/comunicados/admin/tipos-estabelecimento"),
        apiFetch("/api/comunicados/admin/estabelecimentos-lista"),
      ]);
      setTiposDisponiveis(respTipos.ok ? await respTipos.json() : []);
      setEstabelecimentosDisponiveis(respEstab.ok ? await respEstab.json() : []);
    } catch {
      setTiposDisponiveis([]);
      setEstabelecimentosDisponiveis([]);
    }
  }

  useEffect(() => { carregarLista(); carregarOpcoesAlvo(); }, []);

  // Sincroniza o conteúdo dos editores ricos (título e mensagem) e
  // reseta o zoom sempre que o modal abre — só nessa hora, pra não
  // brigar com o próprio usuário digitando (o editor vira a fonte da
  // verdade do próprio conteúdo depois de aberto).
  useEffect(() => {
    if (!modalAberto) return;
    if (editorTituloRef.current) {
      if (form.titulo_html) editorTituloRef.current.innerHTML = form.titulo_html;
      else editorTituloRef.current.textContent = form.titulo || "";
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = form.mensagem_html
        || (form.mensagem ? form.mensagem.replace(/\n/g, "<br>") : "");
    }
    setZoom(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalAberto]);

  // Esc fecha o modal — clicar fora dele (no overlay) NÃO fecha mais,
  // só o botão Cancelar ou o Esc (pedido do usuário, pra não perder o
  // que já foi digitado com um clique acidental fora do card).
  useEffect(() => {
    if (!modalAberto) return;
    function aoTeclarGlobal(e) {
      if (e.key === "Escape") fecharModal();
    }
    window.addEventListener("keydown", aoTeclarGlobal);
    return () => window.removeEventListener("keydown", aoTeclarGlobal);
  }, [modalAberto]);

  function abrirCriar() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setBuscaEstab("");
    setErroModal("");
    setImagemArquivoPendente(null);
    setImagemPreviewLocal(null);
    setMostrarPreview(false);
    setModalAberto(true);
  }

  function abrirEditar(c) {
    setEditandoId(c.id);
    setForm({
      titulo: c.titulo,
      titulo_html: c.titulo_html || "",
      mensagem: c.mensagem,
      mensagem_html: c.mensagem_html || "",
      formatos: (c.formatos || []).map(f => f.tipo),
      ativo: c.ativo,
      alvo_tipo: c.alvo_tipo || "todos",
      alvo_tipos_estabelecimento: c.alvo_tipos_estabelecimento || [],
      estabelecimento_ids: (c.estabelecimentos_alvo || []).map(e => e.id),
      imagem_url: c.imagem_url || null,
      data_inicio: isoParaInputLocal(c.data_inicio),
      data_fim: isoParaInputLocal(c.data_fim),
      frequencia_tipo: c.frequencia_tipo || "uma_vez",
      frequencia_quantidade: c.frequencia_quantidade != null ? String(c.frequencia_quantidade) : "",
      criadoPorNome: c.criado_por_nome || null,
      criadoEm: c.criado_em || null,
    });
    setBuscaEstab("");
    setErroModal("");
    setImagemArquivoPendente(null);
    setImagemPreviewLocal(null);
    setMostrarPreview(false);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setErroModal("");
  }

  function toggleFormato(tipo) {
    setForm(p => ({
      ...p,
      formatos: p.formatos.includes(tipo)
        ? p.formatos.filter(t => t !== tipo)
        : [...p.formatos, tipo],
    }));
  }

  function toggleTipoEstabelecimento(tipo) {
    setForm(p => ({
      ...p,
      alvo_tipos_estabelecimento: p.alvo_tipos_estabelecimento.includes(tipo)
        ? p.alvo_tipos_estabelecimento.filter(t => t !== tipo)
        : [...p.alvo_tipos_estabelecimento, tipo],
    }));
  }

  function toggleEstabelecimento(id) {
    setForm(p => ({
      ...p,
      estabelecimento_ids: p.estabelecimento_ids.includes(id)
        ? p.estabelecimento_ids.filter(x => x !== id)
        : [...p.estabelecimento_ids, id],
    }));
  }

  // ── Editor de texto rico ────────────────────────────────────────────
  function salvarSelecao() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      selecaoRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restaurarSelecao() {
    editorRef.current?.focus();
    const range = selecaoRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function aoDigitarMensagem() {
    if (!editorRef.current) return;
    setForm(p => ({
      ...p,
      mensagem_html: editorRef.current.innerHTML,
      mensagem: editorRef.current.innerText,
    }));
    setErroModal("");
  }

  // Cola sempre como texto puro — evita que HTML/scripts colados da área
  // de transferência entrem no conteúdo salvo.
  function aoColarMensagem(e) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, texto);
    aoDigitarMensagem();
  }

  function aplicarFormato(comando, valor) {
    restaurarSelecao();
    document.execCommand(comando, false, valor);
    aoDigitarMensagem();
  }

  // ── Editor de texto rico do TÍTULO (mesma mecânica, campo separado) ──
  function salvarSelecaoTitulo() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorTituloRef.current?.contains(sel.anchorNode)) {
      selecaoTituloRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restaurarSelecaoTitulo() {
    editorTituloRef.current?.focus();
    const range = selecaoTituloRef.current;
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function aoDigitarTitulo() {
    if (!editorTituloRef.current) return;
    setForm(p => ({
      ...p,
      titulo_html: editorTituloRef.current.innerHTML,
      titulo: editorTituloRef.current.innerText,
    }));
    setErroModal("");
  }

  function aoColarTitulo(e) {
    e.preventDefault();
    const texto = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, texto);
    aoDigitarTitulo();
  }

  // Título é uma linha só — Enter não deve quebrar linha dentro dele.
  function aoTeclarTitulo(e) {
    if (e.key === "Enter") e.preventDefault();
  }

  function aplicarFormatoTitulo(comando, valor) {
    restaurarSelecaoTitulo();
    document.execCommand(comando, false, valor);
    aoDigitarTitulo();
  }

  // Tamanho de fonte (título ou mensagem): execCommand('fontSize') só
  // aceita os 7 tamanhos relativos antigos do HTML — o truque é aplicar
  // o tamanho "7" como marcador e depois trocar cada <font size="7">
  // resultante por um <span style="font-size:Npx">, que é o que
  // realmente fica salvo no HTML.
  function aplicarTamanhoFonte(px, opcoes = {}) {
    const doTitulo = !!opcoes.titulo;
    const ref = doTitulo ? editorTituloRef : editorRef;
    if (doTitulo) restaurarSelecaoTitulo(); else restaurarSelecao();
    document.execCommand("fontSize", false, "7");
    ref.current?.querySelectorAll('font[size="7"]').forEach(f => {
      f.removeAttribute("size");
      f.style.fontSize = `${px}px`;
    });
    if (doTitulo) aoDigitarTitulo(); else aoDigitarMensagem();
  }

  // ── Imagem ───────────────────────────────────────────────────────────
  async function enviarImagem(id, arquivo) {
    setEnviandoImagem(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const fd = new FormData();
      fd.append("imagem", arquivo);
      const API_URL = import.meta.env.VITE_API_URL;
      const resp = await fetch(`${API_URL}/api/comunicados/admin/${id}/upload-imagem`, {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao enviar imagem.");
      setForm(p => ({ ...p, imagem_url: json.imagem_url }));
      setImagemArquivoPendente(null);
      setImagemPreviewLocal(null);
      setEnviandoImagem(false);
      return true;
    } catch (e) {
      setEnviandoImagem(false);
      setErroModal(e.message);
      return false;
    }
  }

  async function aoSelecionarImagem(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;

    setImagemPreviewLocal(URL.createObjectURL(arquivo));

    if (editandoId) {
      await enviarImagem(editandoId, arquivo);
    } else {
      setImagemArquivoPendente(arquivo);
    }
  }

  function removerImagem() {
    setImagemPreviewLocal(null);
    setImagemArquivoPendente(null);
    setForm(p => ({ ...p, imagem_url: null }));
  }

  async function salvar() {
    if (!form.titulo.trim())   { setErroModal("Informe o título."); return; }
    if (!form.mensagem.trim()) { setErroModal("Informe a mensagem."); return; }
    if (form.formatos.length === 0) { setErroModal("Escolha ao menos um formato de exibição."); return; }
    if (form.alvo_tipo === "tipo_estabelecimento" && form.alvo_tipos_estabelecimento.length === 0) {
      setErroModal("Selecione ao menos um tipo de estabelecimento.");
      return;
    }
    if (form.alvo_tipo === "especificos" && form.estabelecimento_ids.length === 0) {
      setErroModal("Selecione ao menos um estabelecimento.");
      return;
    }
    if (form.data_inicio && form.data_fim && new Date(form.data_fim) <= new Date(form.data_inicio)) {
      setErroModal("A data de término deve ser depois da data de início.");
      return;
    }
    if (form.frequencia_tipo === "quantidade") {
      const n = Number(form.frequencia_quantidade);
      if (!Number.isInteger(n) || n < 1) {
        setErroModal("Informe quantas vezes o comunicado deve aparecer (mínimo 1).");
        return;
      }
    }

    setSalvando(true);
    setErroModal("");
    try {
      const payload = {
        titulo: form.titulo,
        titulo_html: form.titulo_html,
        mensagem: form.mensagem,
        mensagem_html: form.mensagem_html,
        formatos: form.formatos.map(tipo => ({ tipo })),
        ativo: form.ativo,
        alvo_tipo: form.alvo_tipo,
        alvo_tipos_estabelecimento: form.alvo_tipos_estabelecimento,
        estabelecimento_ids: form.estabelecimento_ids,
        data_inicio: inputLocalParaIso(form.data_inicio),
        data_fim: inputLocalParaIso(form.data_fim),
        frequencia_tipo: form.frequencia_tipo,
        frequencia_quantidade: form.frequencia_tipo === "quantidade" ? Number(form.frequencia_quantidade) : null,
        ...(editandoId ? { imagem_url: form.imagem_url } : {}),
      };
      const resp = await apiFetch(
        editandoId ? `/api/comunicados/admin/${editandoId}` : "/api/comunicados/admin",
        { method: editandoId ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");

      // Imagem que ficou pendente (criação nova) só sobe agora que já
      // existe um id. Se falhar, o comunicado já foi salvo — mantém o
      // modal aberto (agora em modo edição) mostrando o erro, pra dar
      // pra tentar de novo sem duplicar o cadastro.
      let imagemOk = true;
      const idAlvo = editandoId || json.id;
      if (imagemArquivoPendente) {
        imagemOk = await enviarImagem(idAlvo, imagemArquivoPendente);
      }

      // A resposta do backend não traz `estabelecimentos_alvo` populado —
      // recarrega a lista inteira pra já vir com os vínculos corretos em
      // vez de fazer o merge manual e arriscar ficar com a exibição
      // dessincronizada até a próxima F5.
      await carregarLista();

      if (imagemOk) {
        setModalAberto(false);
      } else {
        setEditandoId(idAlvo);
      }
    } catch (e) {
      setErroModal(e.message);
    }
    setSalvando(false);
  }

  async function alternarAtivo(c) {
    try {
      const resp = await apiFetch(`/api/comunicados/admin/${c.id}/ativo`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !c.ativo }),
      });
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      setLista(prev => prev.map(x => (x.id === c.id ? { ...x, ativo: json.ativo } : x)));
    } catch { alert("Erro ao atualizar o comunicado."); }
  }

  async function excluir(id, titulo) {
    if (!window.confirm(`Excluir o comunicado "${titulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const resp = await apiFetch(`/api/comunicados/admin/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error();
      setLista(prev => prev.filter(c => c.id !== id));
      if (comNavId === id) setComNavId(null);
    } catch { alert("Erro ao excluir o comunicado."); }
  }

  // Vigente = ativo E dentro da janela de agendamento (se houver). É
  // exatamente o mesmo critério que o backend usa em GET /ativos.
  function estaVigente(c) {
    if (!c.ativo) return false;
    const agora = Date.now();
    if (c.data_inicio && new Date(c.data_inicio).getTime() > agora) return false;
    if (c.data_fim && new Date(c.data_fim).getTime() < agora) return false;
    return true;
  }

  function agendaChip(c) {
    const agora = Date.now();
    if (c.data_fim && new Date(c.data_fim).getTime() < agora) {
      return { texto: `⌛ Expirado em ${formatarDataHora(c.data_fim)}`, classe: "expirado" };
    }
    if (c.data_inicio && new Date(c.data_inicio).getTime() > agora) {
      return { texto: `🕒 Agendado para ${formatarDataHora(c.data_inicio)}`, classe: "agendado" };
    }
    if (c.data_fim) {
      return { texto: `⏳ Até ${formatarDataHora(c.data_fim)}`, classe: "" };
    }
    return null;
  }

  // Data de criação em "YYYY-MM-DD" no fuso do próprio dispositivo — é só
  // um filtro de navegação pro SuperAdmin folhear o histórico, não uma
  // decisão de negócio que precise do fuso oficial de um estabelecimento
  // (mesma exceção já registrada na convenção de fuso horário do projeto).
  function paraDataLocal(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const listaExibida = (() => {
    let base = abaAtiva === "ativos" ? lista.filter(estaVigente) : lista;
    if (abaAtiva === "historico" && (historicoFiltroDe || historicoFiltroAte)) {
      base = base.filter(c => {
        const dataCriacao = paraDataLocal(c.criado_em);
        if (historicoFiltroDe && dataCriacao < historicoFiltroDe) return false;
        if (historicoFiltroAte && dataCriacao > historicoFiltroAte) return false;
        return true;
      });
    }
    return base;
  })();

  function handleListaKeyDown(e) {
    if (modalAberto) return;
    if (listaExibida.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const idxAtual = comNavId ? listaExibida.findIndex(c => c.id === comNavId) : -1;
      const novoIdx = e.key === "ArrowDown"
        ? (idxAtual === -1 ? 0 : Math.min(idxAtual + 1, listaExibida.length - 1))
        : (idxAtual === -1 ? listaExibida.length - 1 : Math.max(idxAtual - 1, 0));
      const alvo = listaExibida[novoIdx];
      setComNavId(alvo.id);
      document.getElementById(`com-item-${alvo.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (e.key === "Enter" && comNavId) {
      const alvo = listaExibida.find(c => c.id === comNavId);
      if (alvo) { e.preventDefault(); abrirEditar(alvo); }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && comNavId) {
      const alvo = listaExibida.find(c => c.id === comNavId);
      if (alvo) { e.preventDefault(); excluir(alvo.id, alvo.titulo); }
      return;
    }
    if (e.key === "Escape" && comNavId) { setComNavId(null); return; }
  }

  function formatoLabel(tipo) {
    return FORMATOS_DISPONIVEIS.find(f => f.tipo === tipo)?.label || tipo;
  }
  function formatoIcone(tipo) {
    return FORMATOS_DISPONIVEIS.find(f => f.tipo === tipo)?.icone || "🔔";
  }

  function alvoResumo(c) {
    if (c.alvo_tipo === "tipo_estabelecimento") {
      return `🏷️ ${(c.alvo_tipos_estabelecimento || []).join(", ") || "—"}`;
    }
    if (c.alvo_tipo === "especificos") {
      const nomes = (c.estabelecimentos_alvo || []).map(e => e.nome);
      const qtd = nomes.length;
      return `🎯 ${qtd} estabelecimento${qtd === 1 ? "" : "s"}`;
    }
    return "🌐 Todos os estabelecimentos";
  }

  function alvoTitle(c) {
    if (c.alvo_tipo === "especificos") {
      return (c.estabelecimentos_alvo || []).map(e => e.nome).join(", ");
    }
    return undefined;
  }

  const estabelecimentosFiltrados = buscaEstab
    ? estabelecimentosDisponiveis.filter(e =>
        (e.nome_fantasia || "").toLowerCase().includes(buscaEstab.toLowerCase())
      )
    : estabelecimentosDisponiveis;

  return (
    <LayoutAdmin>
      <div className="sa-wrapper">

        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">📣 Painel Administrativo</span>
            <h1 className="sa-page-title">Central de <span>Comunicados</span></h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>
              ← Voltar ao painel
            </button>
            <button className="sa-btn sa-btn-purple" onClick={abrirCriar}>
              📣 + Novo Comunicado
            </button>
          </div>
        </div>

        <div className="com-tabs">
          <button
            className={`com-tab${abaAtiva === "ativos" ? " ativa" : ""}`}
            onClick={() => setAbaAtiva("ativos")}
          >
            📣 Ativos agora
          </button>
          <button
            className={`com-tab${abaAtiva === "historico" ? " ativa" : ""}`}
            onClick={() => setAbaAtiva("historico")}
          >
            🕒 Histórico completo
          </button>
        </div>

        {abaAtiva === "historico" && (
          <div className="com-historico-filtro">
            <label className="com-historico-filtro-campo">
              <span>De</span>
              <input
                type="date" className="sa-input"
                value={historicoFiltroDe}
                onChange={e => setHistoricoFiltroDe(e.target.value)}
              />
            </label>
            <label className="com-historico-filtro-campo">
              <span>Até</span>
              <input
                type="date" className="sa-input"
                value={historicoFiltroAte}
                onChange={e => setHistoricoFiltroAte(e.target.value)}
              />
            </label>
            {(historicoFiltroDe || historicoFiltroAte) && (
              <button
                type="button" className="com-historico-filtro-limpar"
                onClick={() => { setHistoricoFiltroDe(""); setHistoricoFiltroAte(""); }}
              >
                ✕ Limpar filtro
              </button>
            )}
          </div>
        )}

        <div
          className="sa-list-box"
          tabIndex={0}
          onKeyDown={handleListaKeyDown}
        >
          <div className="sa-list-header">
            <span className="sa-list-title">
              {abaAtiva === "ativos" ? "Comunicados vigentes" : "Todos os comunicados já criados"}
            </span>
            <span className="sa-count-badge">{listaExibida.length}</span>
          </div>

          {loadingLista ? (
            <div className="sa-loading"><div className="sa-spinner" /> Carregando...</div>
          ) : listaExibida.length === 0 ? (
            <div className="sa-empty">
              {abaAtiva === "ativos" ? "Nenhum comunicado vigente agora." : "Nenhum comunicado cadastrado ainda."}
            </div>
          ) : (
            listaExibida.map(c => {
              const agenda = agendaChip(c);
              const expirado = agenda?.classe === "expirado";
              return (
                <div
                  key={c.id}
                  id={`com-item-${c.id}`}
                  className={`sa-user-item${c.id === comNavId ? " foco-teclado" : ""}`}
                  onClick={() => setComNavId(c.id)}
                >
                  <div className="com-item-info">
                    <div className="com-item-topo">
                      {c.imagem_url && (
                        <img className="com-item-thumb" src={c.imagem_url} alt="" />
                      )}
                      <span className={`sa-badge ${c.ativo ? "sa-badge-ativo" : "sa-badge-inativo"}`}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </span>
                      {c.titulo_html ? (
                        <span className="com-item-titulo" dangerouslySetInnerHTML={{ __html: c.titulo_html }} />
                      ) : (
                        <span className="com-item-titulo">{c.titulo}</span>
                      )}
                      <span className="com-alvo-chip" title={alvoTitle(c)}>{alvoResumo(c)}</span>
                      {agenda && <span className={`com-agenda-chip ${agenda.classe}`}>{agenda.texto}</span>}
                      {c.frequencia_tipo === "sempre" && (
                        <span className="com-agenda-chip">♾️ Sempre que logar</span>
                      )}
                      {c.frequencia_tipo === "quantidade" && (
                        <span className="com-agenda-chip">🔁 Até {c.frequencia_quantidade}x</span>
                      )}
                    </div>
                    <div className="com-item-mensagem">{c.mensagem}</div>
                    <div className="com-item-formatos">
                      {(c.formatos || []).map(f => (
                        <span key={f.tipo} className="com-formato-chip">
                          {formatoIcone(f.tipo)} {formatoLabel(f.tipo)}
                        </span>
                      ))}
                    </div>
                    <div className="com-item-meta">
                      Criado por {c.criado_por_nome || "—"} em {formatarDataHora(c.criado_em)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => abrirEditar(c)}>
                      ✏️ Editar
                    </button>
                    <button
                      className="sa-btn sa-btn-ghost sa-btn-sm"
                      onClick={() => alternarAtivo(c)}
                      disabled={expirado}
                      title={expirado ? "Esse comunicado já passou da data de término — ajuste a data em Editar se quiser que ele volte a aparecer." : undefined}
                    >
                      {c.ativo ? "⏸ Desativar" : "▶️ Ativar"}
                    </button>
                    <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => excluir(c.id, c.titulo)}>
                      🗑 Excluir
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* MODAL: CRIAR/EDITAR */}
        {modalAberto && (
          <div className="sa-modal-overlay">
            <div className="sa-modal com-modal-largo">
              <div className="com-zoom-controle">
                <button
                  type="button" className="com-zoom-btn" title="Diminuir zoom"
                  onClick={() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_PASSO).toFixed(1)))}
                >−</button>
                <span className="com-zoom-valor">{Math.round(zoom * 100)}%</span>
                <button
                  type="button" className="com-zoom-btn" title="Aumentar zoom"
                  onClick={() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_PASSO).toFixed(1)))}
                >+</button>
              </div>
              <div className="sa-modal-icon">📣</div>
              <div className="sa-modal-title">{editandoId ? "Editar Comunicado" : "Novo Comunicado"}</div>
              <div className="sa-modal-subtitle">
                Escolha pelo menos um formato de exibição pra este comunicado — pode combinar mais de um.
                Clique fora não fecha mais o modal — use "Cancelar" ou Esc.
              </div>
              {editandoId && (
                <div className="com-meta-modal">
                  Criado por <strong>{form.criadoPorNome || "—"}</strong> em {formatarDataHora(form.criadoEm)}
                </div>
              )}
              {erroModal && (
                <div style={{ background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: "0.85rem", fontWeight: 500, marginBottom: 16 }}>
                  ⚠️ {erroModal}
                </div>
              )}
              <div className="sa-modal-form" style={{ zoom }}>
                <div className="sa-form-group">
                  <label className="sa-label">Título</label>
                  <div className="com-editor-toolbar">
                    <button
                      type="button" className="com-editor-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => aplicarFormatoTitulo("bold")}
                      title="Negrito"
                    ><b>B</b></button>
                    <button
                      type="button" className="com-editor-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => aplicarFormatoTitulo("italic")}
                      title="Itálico"
                    ><i>I</i></button>
                    <span className="com-editor-separador" />
                    <input
                      type="color" className="com-editor-cor" title="Cor do texto"
                      defaultValue="#1a1a1a"
                      onMouseDown={salvarSelecaoTitulo}
                      onChange={e => aplicarFormatoTitulo("foreColor", e.target.value)}
                    />
                    <select
                      className="com-editor-fonte" title="Fonte" defaultValue=""
                      onMouseDown={salvarSelecaoTitulo}
                      onChange={e => {
                        if (e.target.value) aplicarFormatoTitulo("fontName", e.target.value);
                        e.target.value = "";
                      }}
                    >
                      <option value="">Fonte…</option>
                      {FONTES_DISPONIVEIS.map(f => (
                        <option key={f.valor} value={f.valor}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      className="com-editor-fonte" title="Tamanho" defaultValue=""
                      onMouseDown={salvarSelecaoTitulo}
                      onChange={e => {
                        if (e.target.value) aplicarTamanhoFonte(Number(e.target.value), { titulo: true });
                        e.target.value = "";
                      }}
                    >
                      <option value="">Tamanho…</option>
                      {TAMANHOS_FONTE.map(t => (
                        <option key={t} value={t}>{t}px</option>
                      ))}
                    </select>
                  </div>
                  <div
                    ref={editorTituloRef}
                    className="com-editor-conteudo com-editor-conteudo-titulo"
                    contentEditable
                    data-placeholder="Ex: Manutenção programada"
                    onInput={aoDigitarTitulo}
                    onPaste={aoColarTitulo}
                    onKeyDown={aoTeclarTitulo}
                    onMouseUp={salvarSelecaoTitulo}
                    onKeyUp={salvarSelecaoTitulo}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Mensagem</label>
                  <div className="com-editor-toolbar">
                    <button
                      type="button" className="com-editor-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => aplicarFormato("bold")}
                      title="Negrito"
                    ><b>B</b></button>
                    <button
                      type="button" className="com-editor-btn"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => aplicarFormato("italic")}
                      title="Itálico"
                    ><i>I</i></button>
                    <span className="com-editor-separador" />
                    <input
                      type="color" className="com-editor-cor" title="Cor do texto"
                      defaultValue="#1a1a1a"
                      onMouseDown={salvarSelecao}
                      onChange={e => aplicarFormato("foreColor", e.target.value)}
                    />
                    <select
                      className="com-editor-fonte" title="Fonte" defaultValue=""
                      onMouseDown={salvarSelecao}
                      onChange={e => {
                        if (e.target.value) aplicarFormato("fontName", e.target.value);
                        e.target.value = "";
                      }}
                    >
                      <option value="">Fonte…</option>
                      {FONTES_DISPONIVEIS.map(f => (
                        <option key={f.valor} value={f.valor}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      className="com-editor-fonte" title="Tamanho" defaultValue=""
                      onMouseDown={salvarSelecao}
                      onChange={e => {
                        if (e.target.value) aplicarTamanhoFonte(Number(e.target.value));
                        e.target.value = "";
                      }}
                    >
                      <option value="">Tamanho…</option>
                      {TAMANHOS_FONTE.map(t => (
                        <option key={t} value={t}>{t}px</option>
                      ))}
                    </select>
                  </div>
                  <div
                    ref={editorRef}
                    className="com-editor-conteudo"
                    contentEditable
                    data-placeholder="Ex: No dia 20/09, das 2h às 4h, o sistema ficará indisponível para manutenção."
                    onInput={aoDigitarMensagem}
                    onPaste={aoColarMensagem}
                    onMouseUp={salvarSelecao}
                    onKeyUp={salvarSelecao}
                  />
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Imagem (opcional)</label>
                  <div className="com-imagem-area">
                    {(imagemPreviewLocal || form.imagem_url) ? (
                      <img className="com-imagem-preview" src={imagemPreviewLocal || form.imagem_url} alt="Prévia" />
                    ) : (
                      <div className="com-imagem-vazio">🖼️</div>
                    )}
                    <div className="com-imagem-botoes">
                      <button
                        type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                        onClick={() => inputImagemRef.current?.click()}
                        disabled={enviandoImagem}
                      >
                        {enviandoImagem ? "⏳ Enviando…" : (form.imagem_url || imagemPreviewLocal ? "🔁 Trocar imagem" : "📎 Escolher imagem")}
                      </button>
                      {(form.imagem_url || imagemPreviewLocal) && (
                        <button
                          type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                          onClick={removerImagem}
                          disabled={enviandoImagem}
                        >
                          🗑 Remover imagem
                        </button>
                      )}
                      <input
                        ref={inputImagemRef} type="file" accept="image/*"
                        style={{ display: "none" }}
                        onChange={aoSelecionarImagem}
                      />
                    </div>
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Formatos de exibição</label>
                  <div className="com-formatos-opcoes">
                    {FORMATOS_DISPONIVEIS.map(f => (
                      <label key={f.tipo} className={`com-formato-opcao${form.formatos.includes(f.tipo) ? " selecionado" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.formatos.includes(f.tipo)}
                          onChange={() => toggleFormato(f.tipo)}
                        />
                        <span className="com-formato-opcao-texto">
                          <span className="com-formato-opcao-label">{f.icone} {f.label}</span>
                          <span className="com-formato-opcao-desc">{f.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Agendamento automático (opcional)</label>
                  <div className="com-datas-linha">
                    <div className="sa-form-group">
                      <label className="sa-label" style={{ fontWeight: 400, fontSize: "0.78rem" }}>Aparece a partir de</label>
                      <div className="com-data-com-limpar">
                        <input
                          type="datetime-local" className="sa-input"
                          value={form.data_inicio}
                          onChange={e => setForm(p => ({ ...p, data_inicio: e.target.value }))}
                        />
                        {form.data_inicio && (
                          <button
                            type="button" className="com-data-limpar" title="Limpar esta data"
                            onClick={() => setForm(p => ({ ...p, data_inicio: "" }))}
                          >✕</button>
                        )}
                      </div>
                    </div>
                    <div className="sa-form-group">
                      <label className="sa-label" style={{ fontWeight: 400, fontSize: "0.78rem" }}>Some automaticamente em</label>
                      <div className="com-data-com-limpar">
                        <input
                          type="datetime-local" className="sa-input"
                          value={form.data_fim}
                          onChange={e => setForm(p => ({ ...p, data_fim: e.target.value }))}
                        />
                        {form.data_fim && (
                          <button
                            type="button" className="com-data-limpar" title="Limpar esta data"
                            onClick={() => setForm(p => ({ ...p, data_fim: "" }))}
                          >✕</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={`com-datas-resumo${dataConfirmadaPulse ? " com-datas-resumo-pulse" : ""}`}>
                    ✓ {resumoAgendamento(form.data_inicio, form.data_fim)}
                  </div>
                  <button
                    type="button"
                    className="com-data-confirmar"
                    title="A data já fica salva no formulário assim que você digita — este botão só fecha o seletor e confirma visualmente"
                    onClick={() => {
                      document.activeElement?.blur();
                      setDataConfirmadaPulse(true);
                      setTimeout(() => setDataConfirmadaPulse(false), 1200);
                    }}
                  >
                    ✓ Confirmar data e hora
                  </button>
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Com que frequência aparece pro mesmo comerciante/operador</label>
                  <div className="com-formatos-opcoes">
                    {FREQUENCIA_OPCOES.map(f => (
                      <label key={f.tipo} className={`com-formato-opcao${form.frequencia_tipo === f.tipo ? " selecionado" : ""}`}>
                        <input
                          type="radio"
                          name="frequencia_tipo"
                          checked={form.frequencia_tipo === f.tipo}
                          onChange={() => setForm(p => ({ ...p, frequencia_tipo: f.tipo }))}
                        />
                        <span className="com-formato-opcao-texto">
                          <span className="com-formato-opcao-label">{f.icone} {f.label}</span>
                          <span className="com-formato-opcao-desc">{f.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {form.frequencia_tipo === "quantidade" && (
                    <div className="com-alvo-subselecao">
                      <label className="sa-label" style={{ fontWeight: 400, fontSize: "0.78rem" }}>Quantas vezes</label>
                      <input
                        type="number" min={1} max={99} className="sa-input" style={{ maxWidth: 120 }}
                        value={form.frequencia_quantidade}
                        onChange={e => setForm(p => ({ ...p, frequencia_quantidade: e.target.value }))}
                      />
                    </div>
                  )}
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Para quem esse comunicado vai aparecer</label>
                  <div className="com-formatos-opcoes">
                    {ALVO_OPCOES.map(a => (
                      <label key={a.tipo} className={`com-formato-opcao${form.alvo_tipo === a.tipo ? " selecionado" : ""}`}>
                        <input
                          type="radio"
                          name="alvo_tipo"
                          checked={form.alvo_tipo === a.tipo}
                          onChange={() => setForm(p => ({ ...p, alvo_tipo: a.tipo }))}
                        />
                        <span className="com-formato-opcao-texto">
                          <span className="com-formato-opcao-label">{a.icone} {a.label}</span>
                          <span className="com-formato-opcao-desc">{a.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {form.alvo_tipo === "tipo_estabelecimento" && (
                    <div className="com-alvo-subselecao">
                      {tiposDisponiveis.length === 0 ? (
                        <div className="com-alvo-vazio">Nenhum tipo de estabelecimento cadastrado ainda.</div>
                      ) : (
                        <div className="com-chip-selecao">
                          {tiposDisponiveis.map(tipo => (
                            <button
                              type="button"
                              key={tipo}
                              className={`com-chip-opcao${form.alvo_tipos_estabelecimento.includes(tipo) ? " selecionado" : ""}`}
                              onClick={() => toggleTipoEstabelecimento(tipo)}
                            >
                              {form.alvo_tipos_estabelecimento.includes(tipo) ? "✓ " : ""}{tipo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {form.alvo_tipo === "especificos" && (
                    <div className="com-alvo-subselecao">
                      <input
                        className="sa-input com-busca-estab"
                        placeholder="Buscar estabelecimento..."
                        value={buscaEstab}
                        onChange={e => setBuscaEstab(e.target.value)}
                      />
                      {estabelecimentosDisponiveis.length === 0 ? (
                        <div className="com-alvo-vazio">Nenhum estabelecimento cadastrado ainda.</div>
                      ) : (
                        <div className="com-lista-estab">
                          {estabelecimentosFiltrados.map(e => (
                            <label key={e.id} className="com-estab-item">
                              <input
                                type="checkbox"
                                checked={form.estabelecimento_ids.includes(e.id)}
                                onChange={() => toggleEstabelecimento(e.id)}
                              />
                              <span className="com-estab-nome">{e.nome_fantasia}</span>
                              {e.tipo_estabelecimento && (
                                <span className="com-estab-tipo">{e.tipo_estabelecimento}</span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                      {form.estabelecimento_ids.length > 0 && (
                        <div className="com-alvo-contagem">
                          {form.estabelecimento_ids.length} selecionado{form.estabelecimento_ids.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="sa-form-group">
                  <button
                    type="button" className="sa-btn sa-btn-ghost sa-btn-sm"
                    onClick={() => setMostrarPreview(v => !v)}
                  >
                    {mostrarPreview ? "🙈 Esconder prévia" : "👁️ Ver como vai aparecer pro comerciante"}
                  </button>
                  {mostrarPreview && (
                    <div className="com-preview-caixa" style={{ marginTop: 10 }}>
                      <div className="com-preview-legenda">Prévia</div>
                      <div className="com-preview-card">
                        {(imagemPreviewLocal || form.imagem_url) && (
                          <img src={imagemPreviewLocal || form.imagem_url} alt="" />
                        )}
                        {form.titulo_html ? (
                          <div className="com-preview-titulo" dangerouslySetInnerHTML={{ __html: form.titulo_html }} />
                        ) : (
                          <div className="com-preview-titulo">{form.titulo || "Título do comunicado"}</div>
                        )}
                        <div
                          className="com-preview-mensagem"
                          dangerouslySetInnerHTML={{
                            __html: form.mensagem_html || (form.mensagem || "Mensagem do comunicado...").replace(/\n/g, "<br>"),
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="sa-form-group">
                  <label className="sa-config-switch">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                    />
                    <span className="sa-config-switch-texto">{form.ativo ? "Ativo" : "Inativo"}</span>
                  </label>
                </div>
              </div>
              <div className="sa-modal-actions">
                <button className="sa-btn sa-btn-ghost" onClick={fecharModal}>Cancelar</button>
                <button className="sa-btn sa-btn-purple" onClick={salvar} disabled={salvando}>
                  {salvando ? "⏳ Salvando…" : (editandoId ? "✓ Salvar" : "✓ Criar Comunicado")}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutAdmin>
  );
}
