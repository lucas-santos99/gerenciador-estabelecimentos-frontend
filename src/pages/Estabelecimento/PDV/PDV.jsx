// src/pages/Estabelecimento/PDV/PDV.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ModalCamera from './ModalCamera';
import { apiFetch } from '../../../utils/api';
import './PDV.css';

const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Mesmo formato de fmt(), mas sem o "R$" embutido — usado onde o cifrão
// já é um elemento visual separado (ex: prefixo fixo ao lado do campo),
// pra não duplicar "R$ R$" nem descasar o alinhamento entre o campo
// digitável (Fase 1) e o campo calculado (Fase 2) do pagamento dividido.
const fmtNum = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ícone de "sem imagem" — SVG em vez de emoji, pra nunca depender da
// fonte de emoji do sistema
function IconePacote({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

// Imagem de produto com fallback — se não tiver URL, ou se a URL falhar
// ao carregar (link quebrado), cai pro ícone genérico em vez do ícone
// feio de "imagem quebrada" do navegador
function ImagemProduto({ url, className, iconeClassName, onExpandir }) {
  const [erro, setErro] = useState(false);
  if (!url || erro) return <IconePacote className={iconeClassName} />;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setErro(true)}
      onClick={onExpandir ? e => { e.stopPropagation(); onExpandir(url); } : undefined}
      className={className}
    />
  );
}

// CPF tem 11 dígitos, CNPJ tem 14 — usado só pra rotular certinho nos
// resumos ("CPF:" ou "CNPJ:"), sem precisar de um campo separado pra
// marcar o tipo. Compartilhado entre o PagamentoModal (onde a pessoa
// digita) e o ModalPosVenda (recibo), que são componentes diferentes.
function labelDocumento(valor) {
  return (valor || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF';
}

/* ════════════════════════════════════════════════════════════
   BALANÇA — decodificador EAN-13 pesável
   Prefixo "2" = produto com peso embutido
   Formato: 2 CCCCC PPPPP D
     C = código interno do produto (5 dígitos)
     P = peso em gramas (5 dígitos, ex: 01750 = 1,750 kg)
     D = dígito verificador
   ════════════════════════════════════════════════════════════ */
function decodificarEAN13Pesavel(codigo) {
  if (!codigo || codigo.length !== 13) return null;
  if (!codigo.startsWith('2')) return null;
  const codigoInterno = codigo.substring(1, 6);
  const pesoGramas    = parseInt(codigo.substring(6, 11), 10);
  if (isNaN(pesoGramas)) return null;
  return { codigoInterno, pesoKg: pesoGramas / 1000 };
}

function fmtPeso(kg) {
  return kg >= 1
    ? `${kg.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
    : `${Math.round(kg * 1000)} g`;
}

// Máscara "tipo calculadora" pro peso: os dígitos entram da direita pra
// esquerda e a vírgula fica sempre fixa em 3 casas decimais — digita
// "1350" e já vira "1,350" sozinho, sem precisar digitar a vírgula.
// Se o usuário digitar a vírgula na mão, ela é só ignorada (não quebra).
function digitarPesoMascarado(valorBruto) {
  const digitos = valorBruto.replace(/\D/g, '').slice(-6); // até 999,999 kg
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 1000;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

// Converte um número no formato brasileiro (com ponto de milhar e vírgula
// decimal) pra float de verdade — usar sempre no lugar de um simples
// .replace(',', '.'), que quebra se tiver ponto de milhar no meio.
function paraFloatBR(valor) {
  return parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
}

const MEIOS = [
  { key: 'Dinheiro', label: 'Dinheiro',          icone: '💵' },
  { key: 'Pix',      label: 'Pix',               icone: '📱' },
  { key: 'Debito',   label: 'Cartão de Débito',  icone: '💳' },
  { key: 'Credito',  label: 'Cartão de Crédito', icone: '💳' },
  { key: 'Fiado',    label: 'Fiado (Na conta)',   icone: '📋' },
  { key: 'Dividido', label: 'Dividir entre várias pessoas', icone: '➗' },
];

// Rótulo curto pros botões de forma de pagamento de cada fatia, dentro do
// pagamento dividido (16/09) — o label completo de MEIOS ("Cartão de
// Débito") não cabe num botão pequeno lado a lado com os outros 4.
const MEIO_LABEL_CURTO = {
  Dinheiro: 'Dinheiro', Pix: 'Pix', Debito: 'Débito', Credito: 'Crédito', Fiado: 'Fiado',
};

// Uma cor por pessoa no pagamento dividido (17/09) — o mesmo par
// (fundo suave + cor sólida) identifica o numerozinho da pessoa (①②③…),
// a borda superior do cartão dela e, no modo "por item", o chip já
// atribuído a ela na lista de itens. É só decoração/organização visual
// (não guarda nada no backend) — gira em ciclo de 6 cores, então com
// mais de 6 pessoas a cor se repete, mas o número continua único.
const PESSOA_CORES = [
  { bg: 'rgba(20,184,166,0.16)', cor: '#0d9488' },
  { bg: 'rgba(99,102,241,0.16)', cor: '#6366f1' },
  { bg: 'rgba(217,119,6,0.16)',  cor: '#d97706' },
  { bg: 'rgba(219,39,119,0.16)', cor: '#db2777' },
  { bg: 'rgba(2,132,199,0.16)',  cor: '#0284c7' },
  { bg: 'rgba(5,150,105,0.16)',  cor: '#059669' },
];
const corPessoa = (i) => PESSOA_CORES[i % PESSOA_CORES.length];

/* ════════════════════════════════════════════════════════════
   MODAL DE PAGAMENTO
   ════════════════════════════════════════════════════════════ */
function PagamentoModal({ total, onFinalizar, onCancelar, loading, podeUsarFiado = true, estabelecimentoId, pixConfig = { modo: 'maquininha', disponivel: false }, carrinho = [] }) {

  const [selectedIndex,      setSelectedIndex]      = useState(0);
  const [meioPagamento,      setMeioPagamento]      = useState('Dinheiro');
  const [metodoConfirmado,   setMetodoConfirmado]   = useState(false);
  const [valorRecebido,      setValorRecebido]      = useState('');
  const [troco,              setTroco]              = useState(0);
  const [termoBuscaCliente,  setTermoBuscaCliente]  = useState('');
  const [resultadosCliente,  setResultadosCliente]  = useState([]);
  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [loadingCliente,     setLoadingCliente]     = useState(false);
  const [clienteIndex,       setClienteIndex]       = useState(-1);

  // Cadastro rápido dentro do próprio fluxo de Fiado — pro cliente que
  // ainda não existe, sem precisar cancelar a venda e recomeçar
  const [mostrarCadFiado, setMostrarCadFiado] = useState(false);
  const [cadFiadoNome,     setCadFiadoNome]     = useState('');
  const [cadFiadoTelefone, setCadFiadoTelefone] = useState('');
  const [cadFiadoCpf,      setCadFiadoCpf]      = useState('');
  const [cadFiadoSalvando, setCadFiadoSalvando] = useState(false);
  const [cadFiadoErro,     setCadFiadoErro]     = useState('');
  const [cadFiadoSemLimite, setCadFiadoSemLimite] = useState(true);
  const [cadFiadoLimite,    setCadFiadoLimite]    = useState('');
  const [erro,               setErro]               = useState('');

  // Pagamento dividido entre várias pessoas (backlog item 19, Fase 1 —
  // divisão por VALOR: cada pessoa digita o quanto está pagando e escolhe
  // sua própria forma; item por item fica pra Fase 2). Fluxo propositalmente
  // mais simples/mouse-first que o resto do modal (sem o wizard de
  // identificação nem atalhos de teclado profundos) — busca/cadastro de
  // cliente pro fiado de cada fatia é uma versão compacta da de cima.
  const fatiaIdRef = useRef(0);
  const [fatias,             setFatias]             = useState([]);
  const [fatiaBuscaAberta,   setFatiaBuscaAberta]   = useState(null); // id da fatia com a busca aberta
  const [fatiaBuscaTermo,    setFatiaBuscaTermo]    = useState('');
  const [fatiaBuscaResultados, setFatiaBuscaResultados] = useState([]);
  const [fatiaBuscaIndex,    setFatiaBuscaIndex]    = useState(-1); // índice ativo na lista (navegação por seta)
  const [fatiaBuscaLoading,  setFatiaBuscaLoading]  = useState(false);
  const [fatiaCadNovo,       setFatiaCadNovo]       = useState(false);
  const [fatiaCadNome,       setFatiaCadNome]       = useState('');
  const [fatiaCadTelefone,   setFatiaCadTelefone]   = useState('');
  const [fatiaCadSalvando,   setFatiaCadSalvando]   = useState(false);
  const [fatiaCadErro,       setFatiaCadErro]       = useState('');

  // Pagamento dividido — Fase 2 (backlog item 19): divisão por ITEM, em
  // cima da mesma base da Fase 1. `modoDivisao` alterna entre digitar o
  // valor de cada pessoa na mão (Fase 1, comportamento padrão) e
  // atribuir cada item do carrinho a uma pessoa (o valor de cada fatia
  // passa a ser calculado, não digitado). `itensFatia` mapeia índice do
  // item no carrinho → id da fatia dona dele (ou undefined/null se não
  // atribuído). Itens não atribuídos formam o "resto", que precisa de
  // uma escolha explícita do operador: dividir igualmente ou digitar o
  // valor de cada um (nunca um comportamento padrão silencioso).
  const [modoDivisao, setModoDivisao] = useState('valor'); // 'valor' | 'item'
  const [itensFatia,  setItensFatia]  = useState({});
  const [restoModo,   setRestoModo]   = useState(null); // null | 'igual' | 'manual'
  const [restoManual, setRestoManual] = useState({});

  // Fluxo por Enter dentro do pagamento dividido (16/09) — nome da pessoa
  // → valor (só no modo "por valor") → primeiro botão de forma de
  // pagamento daquela fatia → (Fiado sem cliente ainda: botão de buscar
  // cliente; Dinheiro: campo de valor recebido) → nome da PRÓXIMA fatia,
  // ou o botão Confirmar geral do modal se for a última. Um objeto por
  // campo, chaveado pelo id da fatia — nunca por índice, que muda quando
  // alguém remove uma pessoa do meio.
  const fatiaNomeRefs           = useRef({});
  const fatiaValorRefs          = useRef({});
  const fatiaMeioPrimeiroBtnRefs = useRef({});
  const fatiaBuscarBtnRefs      = useRef({});
  const fatiaRecebidoRefs       = useRef({});
  // 17/09 — botão "Confirmar Pessoa N" de cada fatia (organização da tela,
  // ver `confirmarFatia`/`editarFatia` mais abaixo).
  const fatiaConfirmarBtnRefs   = useRef({});
  // 17/09 — checkbox "Confirmo que o Pix caiu na conta" de cada fatia,
  // quando o Pix é gerado pelo sistema (ver `gerarPixFatia` mais abaixo).
  const fatiaPixCheckboxRefs    = useRef({});
  // 17/09 — botões "💰 Dividir por valor" / "📦 Dividir por item", pra
  // navegação por seta entre os dois (ver `handleModoDivisaoKey`).
  const modoValorBtnRef = useRef(null);
  const modoItemBtnRef  = useRef(null);

  // Confirmação antes de fechar o modal de vez — só aparece quando o
  // Esc é apertado já na primeira tela (escolha de forma de pagamento),
  // pra não fechar sem querer num Esc a mais durante a navegação.
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const confirmFecharSimRef = useRef(null);
  const confirmFecharNaoRef = useRef(null);

  // Identificação opcional na venda (qualquer forma de pagamento,
  // diferente do fluxo de Fiado que já obriga cliente) — sequência de
  // perguntas por Enter: "quer identificar cliente?" → "já cadastrado?"
  // → busca OU cadastro rápido → "quer CPF na nota?" → CPF (com
  // sugestão de reaproveitar o que já foi digitado/cadastrado). Fiado
  // não passa por isso, já tem fluxo próprio.
  const [identEtapa,           setIdentEtapa]           = useState(null); // null | 'perguntaCliente' | 'perguntaClienteCadastrado' | 'buscaCliente' | 'cadastroRapido' | 'perguntaCpf' | 'inputCpf' | 'concluido'
  const [identHistorico,       setIdentHistorico]       = useState([]); // pilha de telas visitadas, Esc volta uma de cada vez
  const [clienteVinculado,     setClienteVinculado]     = useState(null);
  const [termoBuscaIdent,      setTermoBuscaIdent]      = useState('');
  const [termoBuscaIdentUltimo, setTermoBuscaIdentUltimo] = useState('');
  const [resultadosIdent,      setResultadosIdent]      = useState([]);
  const [identClienteIndex,    setIdentClienteIndex]    = useState(-1);
  const [loadingIdent,         setLoadingIdent]         = useState(false);
  const [cpfNota,              setCpfNota]              = useState('');

  // Cadastro rápido (quando o cliente identificado ainda não existe)
  const [cadNome,      setCadNome]      = useState('');
  const [cadTelefone,  setCadTelefone]  = useState('');
  const [cadCpf,       setCadCpf]       = useState('');
  const [cadSalvando,  setCadSalvando]  = useState(false);
  const [cadErro,      setCadErro]      = useState('');

  const identSimClienteRef     = useRef(null);
  const identNaoClienteRef     = useRef(null);
  const identSimCadastradoRef  = useRef(null);
  const identNaoCadastradoRef  = useRef(null);
  const identBuscaInputRef     = useRef(null);
  const cadNomeRef              = useRef(null);
  const cadTelefoneRef          = useRef(null);
  const cadCpfRef                = useRef(null);
  const identSimCpfRef         = useRef(null);
  const identNaoCpfRef         = useRef(null);
  const identCpfInputRef       = useRef(null);

  // CPF sugerido pra reaproveitar: prioriza o CPF já salvo no cadastro
  // do cliente escolhido; senão, se o texto digitado na busca parecia
  // um CPF (bastante dígito), oferece reaproveitar isso
  const digitosUltimoTermo = termoBuscaIdentUltimo.replace(/\D/g, '');
  const sugestaoCpf = clienteVinculado?.cpf
    ? formatarCpfCnpjInput(clienteVinculado.cpf)
    : (digitosUltimoTermo.length >= 8 ? formatarCpfCnpjInput(digitosUltimoTermo) : '');

  // Pix pela tela do sistema (BR Code direto da chave do estabelecimento)
  const [pixModo,      setPixModo]      = useState(pixConfig.modo === 'sistema' && pixConfig.disponivel ? 'sistema' : 'maquininha');
  const [pixDados,      setPixDados]      = useState(null); // { payload, qrcode_base64 }
  const [gerandoPix,    setGerandoPix]    = useState(false);
  const [pixErro,       setPixErro]       = useState('');
  const [pixRecebido,   setPixRecebido]   = useState(false);
  const [pixCopiado,    setPixCopiado]    = useState(false);
  const [pagZoom,       setPagZoom]       = useState(1);

  function mudarZoom(delta) {
    setPagZoom(z => Math.min(1.6, Math.max(0.75, Math.round((z + delta) * 20) / 20)));
  }

  const overlayRef       = useRef(null);
  const inputDinheiroRef = useRef(null);
  const inputClienteRef  = useRef(null);
  const cadFiadoNomeRef     = useRef(null);
  const cadFiadoTelefoneRef = useRef(null);
  const cadFiadoCpfRef      = useRef(null);
  const cadFiadoSemLimiteRef = useRef(null);
  const cadFiadoComLimiteRef = useRef(null);
  const cadFiadoLimiteInputRef = useRef(null);
  const btnConfirmarRef  = useRef(null);
  const pixCheckboxRef   = useRef(null);
  const listaClienteRef  = useRef(null);
  const listaMeiosRef    = useRef(null);

  useEffect(() => {
    if (!metodoConfirmado) overlayRef.current?.focus();
  }, [metodoConfirmado]);

  useEffect(() => {
    if (!metodoConfirmado) return;
    if (meioPagamento === 'Dividido') return; // fluxo próprio, sem foco automático de campo único
    if (meioPagamento === 'Dinheiro') {
      const val = total.toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 });
      setValorRecebido(val);
    }
    if (meioPagamento === 'Fiado') {
      if (!clienteSelecionado) setTimeout(() => inputClienteRef.current?.focus(), 0);
      else setTimeout(() => btnConfirmarRef.current?.focus(), 0);
      return;
    }
    // Formas que não são Fiado passam pelo assistente de identificação
    // primeiro — só focamos o campo de pagamento em si depois dele concluir.
    if (identEtapa !== 'concluido') return;
    if (meioPagamento === 'Dinheiro') {
      setTimeout(() => { inputDinheiroRef.current?.focus(); inputDinheiroRef.current?.select(); }, 0);
    } else {
      setTimeout(() => btnConfirmarRef.current?.focus(), 0);
    }
  }, [metodoConfirmado, meioPagamento, identEtapa]);

  // Inicia o assistente de identificação assim que confirma a forma de
  // pagamento (exceto Fiado, que já tem fluxo próprio de cliente)
  useEffect(() => {
    if (metodoConfirmado && meioPagamento !== 'Fiado' && meioPagamento !== 'Dividido') { setIdentHistorico([]); setIdentEtapa('perguntaCliente'); }
  }, [metodoConfirmado, meioPagamento]);

  // Pagamento dividido: foca o nome da 1ª pessoa assim que entra nesse
  // sub-fluxo — a partir daí o Enter assume a navegação (ver refs acima).
  useEffect(() => {
    if (metodoConfirmado && meioPagamento === 'Dividido') {
      setTimeout(() => {
        const primeiraId = fatias[0]?.id;
        fatiaNomeRefs.current[primeiraId]?.focus();
        fatiaNomeRefs.current[primeiraId]?.select?.();
      }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodoConfirmado, meioPagamento]);

  // Foca o elemento certo em cada passo do assistente — sempre parte
  // com foco no "Não", pra quem quiser pular tudo bater Enter 2x rápido
  useEffect(() => {
    if (identEtapa === 'perguntaCliente') setTimeout(() => identSimClienteRef.current?.focus(), 0);
    else if (identEtapa === 'perguntaClienteCadastrado') setTimeout(() => identSimCadastradoRef.current?.focus(), 0);
    else if (identEtapa === 'buscaCliente') setTimeout(() => identBuscaInputRef.current?.focus(), 0);
    else if (identEtapa === 'cadastroRapido') setTimeout(() => cadNomeRef.current?.focus(), 0);
    else if (identEtapa === 'perguntaCpf') setTimeout(() => identSimCpfRef.current?.focus(), 0);
    else if (identEtapa === 'inputCpf') setTimeout(() => { identCpfInputRef.current?.focus(); identCpfInputRef.current?.select(); }, 0);
  }, [identEtapa]);

  useEffect(() => {
    if (meioPagamento !== 'Dinheiro') return;
    const recebido = paraFloatBR(valorRecebido) || 0;
    setTroco(recebido >= total ? recebido - total : 0);
  }, [valorRecebido, total, meioPagamento]);

  useEffect(() => {
    if (clienteIndex < 0 || !listaClienteRef.current) return;
    listaClienteRef.current.children[clienteIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [clienteIndex]);

  useEffect(() => {
    if (!listaMeiosRef.current) return;
    listaMeiosRef.current.children[selectedIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!metodoConfirmado || meioPagamento !== 'Pix' || pixModo !== 'sistema') return;
    gerarPixSistema();
  }, [metodoConfirmado, meioPagamento, pixModo]);

  // Assim que o QR fica pronto, foca no checkbox — Enter já confirma na hora
  useEffect(() => {
    if (pixDados && !gerandoPix) {
      setTimeout(() => pixCheckboxRef.current?.focus(), 0);
    }
  }, [pixDados, gerandoPix]);

  async function gerarPixSistema() {
    setGerandoPix(true);
    setPixErro('');
    setPixDados(null);
    setPixRecebido(false);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/pix/gerar`, {
        method: 'POST',
        body:   JSON.stringify({ valor: total, descricao: 'Venda PDV' }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao gerar Pix.');
      setPixDados(json);
    } catch (e) {
      setPixErro(e.message);
    }
    setGerandoPix(false);
  }

  function copiarPixCopiaECola() {
    if (!pixDados?.payload) return;
    navigator.clipboard?.writeText(pixDados.payload);
    setPixCopiado(true);
    setTimeout(() => setPixCopiado(false), 2000);
  }


  async function buscarCliente(termo) {
    setTermoBuscaCliente(termo);
    setClienteIndex(-1);
    setErro('');
    if (termo.length < 2) { setResultadosCliente([]); return; }
    setLoadingCliente(true);
    try {
      const resp = await apiFetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const todos = await resp.json();
      // Só mostra quem pode comprar fiado — quem está marcado como "sem
      // fiado" fica de fora dessa busca específica (mas continua
      // aparecendo normal na identificação opcional de outras formas
      // de pagamento, que não tem nada a ver com crédito)
      const filtrados = todos.filter(c => c.permite_fiado !== false);
      setResultadosCliente(filtrados);
      setResultadosCliente(filtrados);
      // Primeiro resultado já vem selecionado — Enter direto confirma,
      // sem precisar apertar seta pra baixo antes.
      setClienteIndex(filtrados.length > 0 ? 0 : -1);
    } catch { setErro('Erro ao buscar clientes.'); }
    finally { setLoadingCliente(false); }
  }

  // Mesma busca do fiado, só que pra identificação opcional (qualquer
  // forma de pagamento) — nome, telefone, CPF ou código do cliente
  async function buscarClienteIdent(termo) {
    setTermoBuscaIdent(termo);
    setIdentClienteIndex(-1);
    if (termo.length < 2) { setResultadosIdent([]); return; }
    setLoadingIdent(true);
    try {
      const resp = await apiFetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const todos = await resp.json();
      setResultadosIdent(todos);
      // Primeiro resultado já vem selecionado — Enter direto confirma,
      // sem precisar apertar seta pra baixo antes.
      setIdentClienteIndex(todos.length > 0 ? 0 : -1);
    } catch { /* silencioso — identificação é opcional, não trava a venda */ }
    finally { setLoadingIdent(false); }
  }

  function selecionarClienteIdent(cli) {
    setClienteVinculado(cli);
    setTermoBuscaIdentUltimo(termoBuscaIdent); // guarda o que foi digitado, pra sugerir como CPF depois
    setResultadosIdent([]);
    setTermoBuscaIdent('');
    irParaEtapa('perguntaCpf');
  }

  function pularBuscaCliente() {
    setTermoBuscaIdentUltimo(termoBuscaIdent);
    setResultadosIdent([]);
    setTermoBuscaIdent('');
    irParaEtapa('perguntaCpf');
  }

  // ── Navegação do assistente: empilha a tela atual ao avançar, Esc
  // desempilha (volta uma tela). Chegando ao início do assistente,
  // Esc volta pra escolha da forma de pagamento.
  function irParaEtapa(nova) {
    setIdentHistorico(h => [...h, identEtapa]);
    setIdentEtapa(nova);
  }

  function voltarEtapa() {
    setIdentHistorico(h => {
      if (h.length === 0) {
        setMetodoConfirmado(false);
        setIdentEtapa(null);
        return h;
      }
      const novoHist = [...h];
      const anterior = novoHist.pop();
      setIdentEtapa(anterior);
      return novoHist;
    });
  }

  function responderPerguntaCliente(sim) {
    irParaEtapa(sim ? 'perguntaClienteCadastrado' : 'perguntaCpf');
  }

  function responderClienteCadastrado(sim) {
    irParaEtapa(sim ? 'buscaCliente' : 'cadastroRapido');
  }

  function responderPerguntaCpf(sim) {
    if (sim) { setCpfNota(sugestaoCpf || ''); irParaEtapa('inputCpf'); }
    else { irParaEtapa('concluido'); }
  }

  // Cadastro rápido — pro cliente que ainda não existe, sem sair do PDV
  async function salvarCadastroRapido(e) {
    e?.preventDefault();
    if (!cadNome.trim()) { setCadErro('Nome é obrigatório.'); return; }
    setCadSalvando(true); setCadErro('');
    try {
      const resp = await apiFetch('/api/clientes/criar', {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId,
          nome:         cadNome.trim(),
          telefone:     cadTelefone.trim() || null,
          cpf:          cadCpf.replace(/\D/g, '') || null,
          permiteFiado: false, // cadastro rápido é só identificação — fiado
                               // precisa ser habilitado de propósito depois
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao cadastrar cliente.');
      setClienteVinculado(data);
      if (cadCpf) setTermoBuscaIdentUltimo(cadCpf); // já digitou CPF aqui, reaproveita na pergunta seguinte
      irParaEtapa('perguntaCpf');
    } catch (err) { setCadErro(err.message); }
    finally { setCadSalvando(false); }
  }

  function handleIdentBuscaKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdentClienteIndex(p => Math.min(p + 1, resultadosIdent.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdentClienteIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (identClienteIndex > -1 && resultadosIdent[identClienteIndex]) selecionarClienteIdent(resultadosIdent[identClienteIndex]);
      else if (resultadosIdent.length === 0) pularBuscaCliente(); // não achou ninguém, Enter já pula
    }
  }

  function handleIdentCpfInputKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); irParaEtapa('concluido'); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); }
  }

  // Navega entre os botões "Não"/"Sim" pela seta (esquerda/direita ou
  // cima/baixo) — botão nativo só responde a Tab por padrão, então sem
  // isso o fluxo ficaria preso no mouse. Também aceita digitar 1 (Sim)
  // ou 2 (Não) direto, sem precisar navegar até o botão certo primeiro.
  function handleSimNaoKey(e, outroRef, onSim, onNao) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      outroRef.current?.focus();
    } else if (e.key === '1') {
      e.preventDefault();
      onSim?.();
    } else if (e.key === '2') {
      e.preventDefault();
      onNao?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      voltarEtapa();
    }
  }

  function handleCadNomeKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); cadTelefoneRef.current?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); }
  }
  function handleCadTelefoneKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); cadCpfRef.current?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); }
  }
  function handleCadCpfKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); salvarCadastroRapido(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); }
  }

  // Máscara "tipo calculadora" pro valor do limite — digita "5000" e
  // já vira "50,00" sozinho, mesmo padrão do cadastro completo em Clientes
  function digitarValorMascarado(valorBruto) {
    const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
    if (!digitos) return '';
    const numero = parseInt(digitos, 10) / 100;
    return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Detecta CPF (até 11 dígitos) ou CNPJ (12-14 dígitos) pela quantidade
  // digitada — mesmo padrão de detecção automática já usado em
  // Fornecedores/Estabelecimentos, só que aqui sem aba, o campo já troca
  // de máscara sozinho conforme a pessoa digita, pra não travar o fluxo
  // rápido do PDV com mais uma etapa.
  function formatarCpfCnpjInput(valor) {
    const d = valor.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) {
      if (d.length <= 3) return d;
      if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
      if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
      return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
    }
    // CNPJ
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
    if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
    if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  }

  function selecionarCliente(cli) {
    setClienteSelecionado(cli);
    setResultadosCliente([]);
    setTermoBuscaCliente('');
    setTimeout(() => btnConfirmarRef.current?.focus(), 0);
  }

  function abrirCadFiado() {
    setCadFiadoNome(termoBuscaCliente); // já aproveita o que foi digitado na busca
    setCadFiadoTelefone('');
    setCadFiadoCpf('');
    setCadFiadoErro('');
    setCadFiadoSemLimite(true);
    setCadFiadoLimite('');
    setResultadosCliente([]);
    setMostrarCadFiado(true);
  }

  function voltarCadFiado() {
    setMostrarCadFiado(false);
    setTimeout(() => inputClienteRef.current?.focus(), 0);
  }

  async function salvarCadFiado(e) {
    e?.preventDefault();
    if (!cadFiadoNome.trim()) { setCadFiadoErro('Nome é obrigatório.'); return; }
    setCadFiadoSalvando(true); setCadFiadoErro('');
    try {
      const resp = await apiFetch('/api/clientes/criar', {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId,
          nome:          cadFiadoNome.trim(),
          telefone:      cadFiadoTelefone.trim() || null,
          cpf:           cadFiadoCpf.replace(/\D/g, '') || null,
          permiteFiado:  true, // aqui SIM é de propósito — cadastro veio de dentro do fluxo de fiado
          limiteCredito: cadFiadoSemLimite ? '0' : cadFiadoLimite.replace(/\./g, '').replace(',', '.'),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao cadastrar cliente.');
      setMostrarCadFiado(false);
      selecionarCliente(data);
    } catch (err) { setCadFiadoErro(err.message); }
    finally { setCadFiadoSalvando(false); }
  }

  function handleCadFiadoNomeKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); cadFiadoTelefoneRef.current?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarCadFiado(); }
  }
  function handleCadFiadoTelefoneKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); cadFiadoCpfRef.current?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarCadFiado(); }
  }
  function handleCadFiadoCpfKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); cadFiadoSemLimiteRef.current?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarCadFiado(); }
  }
  // Sem limite / Com limite — seta alterna, Enter em "Sem limite" já
  // cadastra direto; Enter em "Com limite" abre o campo de valor
  function handleCadFiadoLimiteChoiceKey(e, outroRef) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      outroRef.current?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); voltarCadFiado();
    }
  }
  function handleCadFiadoLimiteValorKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); salvarCadFiado(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarCadFiado(); }
  }

  useEffect(() => {
    if (mostrarCadFiado) setTimeout(() => cadFiadoNomeRef.current?.focus(), 0);
  }, [mostrarCadFiado]);

  // ── Pagamento dividido — funções da lista de fatias ──
  function adicionarPessoa() {
    fatiaIdRef.current += 1;
    setFatias(fs => [...fs, { id: fatiaIdRef.current, pessoaLabel: `Pessoa ${fs.length + 1}`, valor: '', meioPagamento: 'Dinheiro', clienteId: null, clienteNome: null, valorRecebido: '', confirmada: false, pixDados: null, pixGerando: false, pixErro: '', pixRecebido: false, pixCopiado: false, pixValorGerado: null, pixSubModo: (pixConfig.modo === 'sistema' && pixConfig.disponivel) ? 'sistema' : 'maquininha' }]);
  }

  function removerPessoa(id) {
    setFatias(fs => (fs.length <= 2 ? fs : fs.filter(f => f.id !== id)));
    if (fatiaBuscaAberta === id) setFatiaBuscaAberta(null);
    // Fase 2 — libera os itens que estavam com essa pessoa (voltam pro
    // "resto") e descarta o valor manual do resto que ela tinha digitado.
    setItensFatia(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[k] === id) delete next[k]; });
      return next;
    });
    setRestoManual(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // ── Pagamento dividido, Fase 2 — divisão por item ──
  function mudarModoDivisao(novo) {
    if (novo === modoDivisao) return;
    // Dividir por item só faz sentido com 2+ itens no carrinho pra
    // distribuir entre pessoas (17/09) — com 1 item só, o dono seria
    // sempre a mesma pessoa e a tela não ajudaria em nada.
    if (novo === 'item' && carrinho.length < 2) return;
    setModoDivisao(novo);
    setItensFatia({});
    setRestoModo(null);
    setRestoManual({});
    // Troca de modo muda como o valor de cada fatia é calculado — qualquer
    // pessoa já "confirmada" (cartão colapsado, ver `confirmarFatia`) volta
    // a ficar editável, pra não mostrar um resumo com valor desatualizado.
    setFatias(fs => fs.map(f => (novo === 'valor' ? { ...f, valor: '', confirmada: false } : { ...f, confirmada: false })));
  }

  // 17/09 — a pedido do usuário: navegação 100% por teclado no toggle de
  // modo (antes só dava pra trocar com o mouse). Seta esquerda/direita
  // move o foco entre os dois botões (e já troca de modo, igual o padrão
  // dos botões de forma de pagamento da fatia); as teclas 1/2 trocam de
  // modo direto, de qualquer um dos dois botões, sem precisar navegar até
  // o outro primeiro.
  function handleModoDivisaoKey(e) {
    if (e.key === '1') {
      e.preventDefault();
      mudarModoDivisao('valor');
      modoValorBtnRef.current?.focus();
      return;
    }
    if (e.key === '2') {
      if (carrinho.length < 2) return;
      e.preventDefault();
      mudarModoDivisao('item');
      modoItemBtnRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const alvoRef = e.key === 'ArrowRight' ? modoItemBtnRef : modoValorBtnRef;
    const alvoModo = e.key === 'ArrowRight' ? 'item' : 'valor';
    if (alvoModo === 'item' && carrinho.length < 2) return;
    mudarModoDivisao(alvoModo);
    alvoRef.current?.focus();
  }

  function atribuirItemFatia(idx, fatiaId) {
    setItensFatia(prev => ({ ...prev, [idx]: fatiaId }));
  }

  function valorItemCarrinho(item) {
    return parseFloat(item.preco_venda || 0) * parseFloat(item.quantidade || 0);
  }

  // Divide um valor (em reais) em N partes de centavos inteiros, sem
  // perder nem sobrar centavo — a sobra da divisão vai pras primeiras
  // pessoas da lista, uma a uma.
  function dividirValorIgual(valor, n) {
    if (n <= 0) return [];
    const centavos = Math.round(valor * 100);
    const base = Math.floor(centavos / n);
    const sobra = centavos - base * n;
    return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
  }

  function atualizarValorFatia(id, bruto) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, valor: digitarValorMascarado(bruto) } : f)));
  }

  // 17/09 — troco por fatia em Dinheiro, mesma lógica do fluxo principal
  // (useEffect de `troco`/`valorRecebido` lá em cima), só que calculado
  // sob demanda por fatia em vez de um `useEffect` próprio — mais simples
  // já que cada fatia já recalcula o próprio valor via `valorFatiaAtual`.
  function atualizarValorRecebidoFatia(id, bruto) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, valorRecebido: digitarValorMascarado(bruto) } : f)));
  }

  function atualizarLabelFatia(id, label) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, pessoaLabel: label } : f)));
  }

  // 17/09: antes, trocar pra qualquer forma diferente de Fiado limpava o
  // cliente vinculado da fatia — fazia sentido quando só o Fiado podia ter
  // cliente (o vínculo "pertencia" à forma de pagamento). Agora que o
  // vínculo é opcional pra qualquer forma, ele passou a ser uma
  // característica da PESSOA/fatia, não da forma escolhida — então não se
  // limpa mais sozinho ao trocar de botão (ex: linkar um cliente com
  // Dinheiro selecionado e depois mudar pra Pix não deveria perder o
  // vínculo que acabou de ser feito).
  function atualizarMeioFatia(id, key) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, meioPagamento: key } : f)));
  }

  // Move o foco pra próxima etapa do fluxo por Enter — nome da PRÓXIMA
  // fatia ainda não confirmada (pula fatias já confirmadas/colapsadas, ver
  // `confirmarFatia`, já que o cartão delas não tem mais campo de nome pra
  // focar), ou o botão Confirmar geral do modal se não sobrar nenhuma.
  function avancarAposFatia(i) {
    let idx = i + 1;
    while (idx < fatias.length && fatias[idx].confirmada) idx++;
    const proxima = fatias[idx];
    if (proxima) {
      setTimeout(() => {
        fatiaNomeRefs.current[proxima.id]?.focus();
        fatiaNomeRefs.current[proxima.id]?.select?.();
      }, 0);
    } else {
      setTimeout(() => btnConfirmarRef.current?.focus(), 0);
    }
  }

  // 17/09 — "finalizar a parte da Pessoa N": cada fatia tem um botão
  // próprio (`fatiaConfirmarBtnRefs`) que colapsa o cartão dela num resumo
  // compacto e avança o foco pra próxima pessoa — só organização da tela,
  // a venda continua sendo UMA só, fechada de vez pelo botão "Confirmar"
  // geral do modal (`fatiasValidas`/`confirmarFinalDividido`, inalterados).
  // Esta função checa se aquela fatia já tem tudo que precisa pra ser
  // confirmada — mesmas regras que `confirmarFinalDividido` já valida no
  // fechamento geral, só que por pessoa.
  function fatiaIndividualValida(f, i) {
    const valor = valorFatiaAtual(f, i);
    if (!(valor > 0)) return false;
    if (f.meioPagamento === 'Fiado' && !f.clienteId) return false;
    if (f.meioPagamento === 'Dinheiro') {
      const recebido = paraFloatBR(f.valorRecebido) || 0;
      if (recebido < valor - 0.001) return false;
    }
    // 17/09 — Pix pelo sistema (mesma integração do fluxo principal, ver
    // `gerarPixFatia` abaixo): só considera a fatia pronta depois que o
    // operador marcar "Confirmo que o Pix caiu na conta" pra ESSE QR, e só
    // se o valor não tiver mudado desde que ele foi gerado (senão o QR
    // ficou desatualizado — `pixDesatualizadoFatia`). `f.pixSubModo` é a
    // escolha sistema/maquininha DESSA fatia — cada pessoa pode escolher a
    // própria (ver `alternarPixSubModoFatia`), não é o `pixModo` global do
    // resto do modal.
    if (f.meioPagamento === 'Pix' && f.pixSubModo === 'sistema' && pixConfig.disponivel) {
      if (!f.pixRecebido) return false;
      if (pixDesatualizadoFatia(f, i)) return false;
    }
    return true;
  }

  // O QR de uma fatia em Pix fica "desatualizado" se o valor dela mudou
  // depois que o QR foi gerado (ex.: reatribuiu itens no modo "por item",
  // ou editou o valor digitado e voltou). Comparado a cada render — mais
  // simples e mais confiável do que tentar interceptar toda fonte possível
  // de mudança de valor (digitação, atribuição de item, resto dividido).
  function pixDesatualizadoFatia(f, i) {
    return f.meioPagamento === 'Pix' && !!f.pixDados && Math.abs(valorFatiaAtual(f, i) - (f.pixValorGerado ?? 0)) > 0.001;
  }

  // 17/09 — "abrir a tela de Pix igual abre no PDV normal" pra cada fatia:
  // gera um QR Code (mesma rota `/pix/gerar` do fluxo principal, só que
  // com o valor DESSA fatia) e mostra dentro do próprio cartão da pessoa.
  // Não manda nada novo pro backend/RPC — o fluxo principal também não
  // amarra o `pixDados` gerado à venda finalizada (é só uma conferência
  // visual do operador, "confirmo que caiu"), então cada fatia funciona
  // exatamente do mesmo jeito, só que N vezes (uma por pessoa em Pix).
  async function gerarPixFatia(id) {
    const i = fatias.findIndex(f => f.id === id);
    if (i < 0) return;
    const fatiaAtual = fatias[i];
    const valor = valorFatiaAtual(fatiaAtual, i);
    setFatias(fs => fs.map(f => (f.id === id
      ? { ...f, pixGerando: true, pixErro: '', pixDados: null, pixRecebido: false, pixValorGerado: null }
      : f)));
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/pix/gerar`, {
        method: 'POST',
        body: JSON.stringify({ valor, descricao: `Venda PDV (Dividido)${fatiaAtual.pessoaLabel ? ' - ' + fatiaAtual.pessoaLabel : ''}` }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao gerar Pix.');
      setFatias(fs => fs.map(f => (f.id === id ? { ...f, pixDados: json, pixValorGerado: valor } : f)));
      setTimeout(() => fatiaPixCheckboxRefs.current[id]?.focus(), 0);
    } catch (e) {
      setFatias(fs => fs.map(f => (f.id === id ? { ...f, pixErro: e.message } : f)));
    } finally {
      setFatias(fs => fs.map(f => (f.id === id ? { ...f, pixGerando: false } : f)));
    }
  }

  function copiarPixCopiaEColaFatia(id) {
    const f = fatias.find(x => x.id === id);
    if (!f?.pixDados?.payload) return;
    navigator.clipboard?.writeText(f.pixDados.payload);
    setFatias(fs => fs.map(x => (x.id === id ? { ...x, pixCopiado: true } : x)));
    setTimeout(() => setFatias(fs => fs.map(x => (x.id === id ? { ...x, pixCopiado: false } : x))), 2000);
  }

  // 17/09 — a pedido do usuário: "faltou a opção de gerar Pix pelo QR
  // Code igual no PDV normal" — o fluxo principal deixa trocar entre
  // "Pix pelo sistema" e "Pix na maquininha" por transação (link "Gerar QR
  // Code pelo sistema em vez disso"/"Usar a maquininha em vez disso"); no
  // Dividido esse link não existia, então uma fatia ficava travada no modo
  // padrão do estabelecimento pra sempre. Cada fatia guarda a própria
  // escolha (`pixSubModo`) — diferente do `pixModo` do fluxo principal,
  // que é uma única variável pro modal inteiro — porque aqui pode fazer
  // sentido uma pessoa pagar por QR e outra na maquininha na MESMA venda.
  function alternarPixSubModoFatia(id) {
    const i = fatias.findIndex(f => f.id === id);
    if (i < 0) return;
    const atual = fatias[i];
    const novo = atual.pixSubModo === 'sistema' ? 'maquininha' : 'sistema';
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, pixSubModo: novo } : f)));
    if (novo === 'sistema') {
      if (!atual.pixDados) gerarPixFatia(id);
      else setTimeout(() => fatiaPixCheckboxRefs.current[id]?.focus(), 0);
    }
  }

  // Foca o botão "Confirmar Pessoa N" da própria fatia (chamado ao terminar
  // de escolher a forma de pagamento/recebido/cliente) — se o botão não
  // estiver disponível pra focar (fatia ainda incompleta por algum outro
  // motivo), o foco simplesmente fica onde está; o operador completa o que
  // falta e clica/tecla Enter no botão manualmente.
  function focarConfirmarFatia(i) {
    const f = fatias[i];
    if (!f) return;
    setTimeout(() => { fatiaConfirmarBtnRefs.current[f.id]?.focus(); }, 0);
  }

  // Confirma a fatia (colapsa o cartão) e avança pra próxima pessoa ainda
  // não confirmada, ou pro botão "Confirmar" geral se essa era a última.
  function confirmarFatia(id) {
    const i = fatias.findIndex(f => f.id === id);
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, confirmada: true } : f)));
    if (i > -1) avancarAposFatia(i);
  }

  // Reabre o cartão de uma pessoa já confirmada pra editar.
  function editarFatia(id) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, confirmada: false } : f)));
    setTimeout(() => {
      fatiaNomeRefs.current[id]?.focus();
      fatiaNomeRefs.current[id]?.select?.();
    }, 0);
  }

  // Botão de forma de pagamento de uma fatia — seleciona e já avança o
  // foco: pra dentro da busca de cliente se virou Fiado e ainda não tem
  // cliente vinculado (o `f` aqui é o valor de ANTES do clique, então
  // `f.clienteId` reflete corretamente se já tinha alguém selecionado de
  // uma escolha anterior), pro campo de valor recebido se virou Dinheiro
  // (17/09 — mesmo espírito do troco do fluxo principal, só que por
  // fatia), senão pro próximo campo do fluxo normal.
  function escolherMeioFatia(f, i, key) {
    atualizarMeioFatia(f.id, key);
    if (key === 'Fiado' && !f.clienteId) {
      setTimeout(() => fatiaBuscarBtnRefs.current[f.id]?.focus(), 0);
      return;
    }
    if (key === 'Dinheiro') {
      setTimeout(() => { fatiaRecebidoRefs.current[f.id]?.focus(); fatiaRecebidoRefs.current[f.id]?.select?.(); }, 0);
      return;
    }
    // 17/09 — Pix pelo sistema: abre a mesma "tela de Pix" do fluxo
    // principal (QR Code + copia-e-cola + confirmação), só que dentro do
    // cartão dessa fatia, com o valor dela. Só gera um QR novo se ainda
    // não tinha um pra essa fatia (reescolher "Pix" de novo sem ter mudado
    // nada só refoca o checkbox, não desperdiça uma cobrança nova). Se o
    // estabelecimento usa Pix por maquininha (sem integração), cai no
    // mesmo fluxo de sempre — nem tem "tela" nenhuma a mostrar aqui,
    // igual já acontece no PDV normal.
    if (key === 'Pix' && f.pixSubModo === 'sistema' && pixConfig.disponivel) {
      if (!f.pixDados) gerarPixFatia(f.id);
      else setTimeout(() => fatiaPixCheckboxRefs.current[f.id]?.focus(), 0);
      return;
    }
    // Em vez de já pular pra próxima pessoa, o Enter/clique aqui (fim do
    // preenchimento pra Débito/Crédito/Pix-maquininha) leva o foco pro
    // botão "Confirmar Pessoa N" desta mesma fatia — é ele quem de fato
    // avança (ver `confirmarFatia`), deixando explícita a etapa de
    // "fechar a parte dessa pessoa" pedida pelo usuário.
    focarConfirmarFatia(i);
  }

  // Enter no campo de valor recebido (Dinheiro) — igual ao resto do fluxo
  // da fatia, leva pro botão "Confirmar Pessoa N" em vez de já avançar.
  function handleFatiaRecebidoKey(e, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    focarConfirmarFatia(i);
  }

  // Enter no nome da pessoa: no modo "por valor" vai pro campo de valor
  // dela; no modo "por item" não existe campo de valor (é calculado), vai
  // direto pro primeiro botão de forma de pagamento.
  function handleFatiaNomeKey(e, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const f = fatias[i];
    if (modoDivisao === 'valor') {
      fatiaValorRefs.current[f.id]?.focus();
      fatiaValorRefs.current[f.id]?.select?.();
    } else {
      fatiaMeioPrimeiroBtnRefs.current[f.id]?.focus();
    }
  }

  // Enter no valor: vai pro primeiro botão de forma de pagamento da fatia.
  function handleFatiaValorKey(e, i) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    fatiaMeioPrimeiroBtnRefs.current[fatias[i]?.id]?.focus();
  }

  // Seta esquerda/direita alterna entre os botões de forma de pagamento da
  // mesma fatia — Enter/clique já dispara o onClick nativamente do
  // <button>, não precisa de tratamento especial aqui. 17/09: a seta só
  // movia o foco do DOM (nextElementSibling/previousElementSibling), sem
  // atualizar `f.meioPagamento` — como o estado "ativo" (visual) depende
  // desse state, navegar só pelo teclado nunca mostrava nada selecionado,
  // só o clique. Agora a seta também já seleciona visualmente o botão pra
  // onde o foco foi (via `atualizarMeioFatia`, sem os efeitos colaterais de
  // avançar o fluxo/abrir busca de fiado — isso fica só pra Enter/clique,
  // que passam por `escolherMeioFatia`), lendo o meio do `data-meio` do
  // botão vizinho.
  // 17/09 — a pedido do usuário: teclas 1..N (uma pra cada forma de
  // pagamento disponível, na mesma ordem em que aparecem os botões) além
  // da seta — digitar o número já ESCOLHE aquela forma (passa por
  // `escolherMeioFatia`, com os mesmos efeitos colaterais de clicar: abrir
  // busca de fiado, focar valor recebido, etc.), diferente da seta, que só
  // move o destaque visual sem confirmar nada.
  function handleFatiaMeioBtnKey(e, f, i, meiosDisponiveis) {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= meiosDisponiveis.length) {
      e.preventDefault();
      escolherMeioFatia(f, i, meiosDisponiveis[n - 1].key);
      return;
    }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const alvo = e.key === 'ArrowRight' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
    if (!alvo) return;
    const meioKey = alvo.dataset.meio;
    if (meioKey) atualizarMeioFatia(f.id, meioKey);
    alvo.focus();
  }

  function desvincularClienteFatia(id) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, clienteId: null, clienteNome: null } : f)));
  }

  function abrirBuscaFatia(id) {
    setFatiaBuscaAberta(id);
    setFatiaBuscaTermo('');
    setFatiaBuscaResultados([]);
    setFatiaBuscaIndex(-1);
    setFatiaCadNovo(false);
    setFatiaCadNome('');
    setFatiaCadTelefone('');
    setFatiaCadErro('');
  }

  // 17/09: até então essa busca era exclusiva do Fiado, então sempre
  // filtrava só quem `permite_fiado`. Agora ela também atende o vínculo
  // OPCIONAL de cliente nas fatias de qualquer forma de pagamento — nesse
  // caso não faz sentido esconder cliente nenhum (não é sobre crédito,
  // é só rastrear quem comprou), então o filtro de fiado só entra quando
  // a fatia em questão for realmente Fiado.
  async function buscarClienteFatia(termo) {
    setFatiaBuscaTermo(termo);
    if (termo.length < 2) { setFatiaBuscaResultados([]); setFatiaBuscaIndex(-1); return; }
    setFatiaBuscaLoading(true);
    try {
      const resp = await apiFetch(`/api/clientes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const todos = await resp.json();
      const fatiaAtual = fatias.find(f => f.id === fatiaBuscaAberta);
      const filtrados = fatiaAtual?.meioPagamento === 'Fiado' ? todos.filter(c => c.permite_fiado !== false) : todos;
      setFatiaBuscaResultados(filtrados);
      setFatiaBuscaIndex(filtrados.length > 0 ? 0 : -1);
    } catch { /* silencioso — mesma lógica de busca das outras telas */ }
    finally { setFatiaBuscaLoading(false); }
  }

  function selecionarClienteFatia(id, cli) {
    setFatias(fs => fs.map(f => (f.id === id ? { ...f, clienteId: cli.id, clienteNome: cli.nome } : f)));
    setFatiaBuscaAberta(null);
    // 17/09 — Fiado: selecionar o cliente é o último passo obrigatório da
    // fatia, então já leva o foco pro botão "Confirmar Pessoa N" dela.
    const i = fatias.findIndex(f => f.id === id);
    if (i > -1) focarConfirmarFatia(i);
  }

  // Navegação por seta/Enter na lista de resultados da busca de cliente
  // dentro da fatia — mesmo padrão do `handleIdentBuscaKey` da
  // identificação opcional do fluxo principal (não-dividido).
  function handleFatiaBuscaKey(e, id) {
    if (e.key === 'Escape') { e.preventDefault(); setFatiaBuscaAberta(null); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setFatiaBuscaIndex(p => Math.min(p + 1, fatiaBuscaResultados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFatiaBuscaIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (fatiaBuscaIndex > -1 && fatiaBuscaResultados[fatiaBuscaIndex]) selecionarClienteFatia(id, fatiaBuscaResultados[fatiaBuscaIndex]);
    }
  }

  // Cadastro rápido de dentro da fatia — versão compacta (só nome e
  // telefone) do cadastro rápido de fiado de cima; sempre sem limite.
  async function salvarClienteRapidoFatia(id) {
    if (!fatiaCadNome.trim()) { setFatiaCadErro('Nome é obrigatório.'); return; }
    setFatiaCadSalvando(true); setFatiaCadErro('');
    try {
      const resp = await apiFetch('/api/clientes/criar', {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId,
          nome:          fatiaCadNome.trim(),
          telefone:      fatiaCadTelefone.trim() || null,
          permiteFiado:  true,
          limiteCredito: '0',
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao cadastrar cliente.');
      selecionarClienteFatia(id, data);
    } catch (err) { setFatiaCadErro(err.message); }
    finally { setFatiaCadSalvando(false); }
  }

  // Fase 2 — quanto de itens já ficou com cada fatia, e o que sobrou
  // sem dono ("resto"). Só tem efeito quando modoDivisao === 'item';
  // em modo 'valor' ninguém usa essas variáveis pra calcular o valor.
  const itensAtribuidosPorFatia = {};
  fatias.forEach(f => { itensAtribuidosPorFatia[f.id] = 0; });
  let valorResto = 0;
  carrinho.forEach((item, idx) => {
    const fatiaId = itensFatia[idx];
    if (fatiaId != null && itensAtribuidosPorFatia[fatiaId] !== undefined) {
      itensAtribuidosPorFatia[fatiaId] += valorItemCarrinho(item);
    } else {
      valorResto += valorItemCarrinho(item);
    }
  });
  const partesRestoIgual = dividirValorIgual(valorResto, fatias.length);

  // Valor de cada fatia: digitado à mão (Fase 1) ou calculado a partir
  // dos itens atribuídos + a parte do resto que coube a ela (Fase 2).
  function valorFatiaAtual(f, i) {
    if (modoDivisao !== 'item') return paraFloatBR(f.valor) || 0;
    const base = itensAtribuidosPorFatia[f.id] || 0;
    if (valorResto <= 0.001) return base;
    if (restoModo === 'igual') return base + (partesRestoIgual[i] || 0);
    if (restoModo === 'manual') return base + (paraFloatBR(restoManual[f.id]) || 0);
    return base; // resto ainda não resolvido — fatia fica incompleta de propósito
  }

  // Troco de uma fatia em Dinheiro — mesma regra do fluxo principal
  // (recebido - valor da fatia, nunca negativo enquanto o recebido não
  // cobre o valor ainda).
  function trocoFatia(f, i) {
    const recebido = paraFloatBR(f.valorRecebido) || 0;
    const valorF = valorFatiaAtual(f, i);
    return recebido >= valorF ? recebido - valorF : 0;
  }

  // No modo por item, enquanto sobrar item sem dono e o operador não
  // tiver escolhido como tratar o resto, a divisão fica bloqueada —
  // nunca assume um comportamento padrão silenciosamente.
  const restoPendente = modoDivisao === 'item' && valorResto > 0.001 && !restoModo;

  const somaFatias = fatias.reduce((s, f, i) => s + valorFatiaAtual(f, i), 0);
  const restanteDividir = Math.round((total - somaFatias) * 100) / 100;
  const fatiasValidas = fatias.length >= 2
    && !restoPendente
    && fatias.every((f, i) => valorFatiaAtual(f, i) > 0)
    && fatias.every(f => f.meioPagamento !== 'Fiado' || f.clienteId)
    && Math.abs(restanteDividir) <= 0.001;

  function confirmarFinalDividido() {
    setErro('');
    if (fatias.length < 2) { setErro('Adicione pelo menos duas pessoas para dividir a venda.'); return; }
    if (restoPendente) { setErro('Escolha como tratar os itens que ainda não têm dono antes de continuar.'); return; }
    const valoresFinais = fatias.map((f, i) => valorFatiaAtual(f, i));
    for (let i = 0; i < fatias.length; i++) {
      const f = fatias[i];
      if (!(valoresFinais[i] > 0)) { setErro(`Informe um valor válido para ${f.pessoaLabel || 'a pessoa'}.`); return; }
      if (f.meioPagamento === 'Fiado' && !f.clienteId) { setErro(`Selecione um cliente para ${f.pessoaLabel || 'a pessoa'} (Fiado).`); return; }
      // 17/09 — mesma exigência que já existe no Dinheiro do fluxo
      // principal (valor recebido não pode ser menor que o total): aqui,
      // por fatia.
      if (f.meioPagamento === 'Dinheiro') {
        const recebido = paraFloatBR(f.valorRecebido) || 0;
        if (recebido < valoresFinais[i] - 0.001) {
          setErro(`Informe o valor recebido em dinheiro de ${f.pessoaLabel || 'a pessoa'} (mínimo ${fmt(valoresFinais[i])}).`);
          return;
        }
      }
      // 17/09 — mesma exigência que já existe pro Pix do fluxo principal
      // (checkbox "Confirmo que o Pix caiu na conta"), aqui por fatia.
      if (f.meioPagamento === 'Pix' && f.pixSubModo === 'sistema' && pixConfig.disponivel) {
        if (pixDesatualizadoFatia(f, i)) {
          setErro(`O QR Code de ${f.pessoaLabel || 'a pessoa'} ficou desatualizado (o valor mudou) — gere um novo antes de continuar.`);
          return;
        }
        if (!f.pixRecebido) {
          setErro(`Confirme que o Pix de ${f.pessoaLabel || 'a pessoa'} caiu na conta antes de finalizar.`);
          return;
        }
      }
    }
    const somaFinal = valoresFinais.reduce((s, v) => s + v, 0);
    if (Math.abs(total - somaFinal) > 0.001) { setErro('A soma dos valores das pessoas precisa bater com o total da venda.'); return; }
    const pagamentos = fatias.map((f, i) => ({
      meioPagamento: f.meioPagamento,
      valor:         Math.round(valoresFinais[i] * 100) / 100,
      clienteId:     f.clienteId || null,
      clienteNome:   f.clienteNome || null, // só pro recibo/tela — o backend ignora e busca o nome de novo pra auditoria
      pessoaLabel:   f.pessoaLabel || null,
      valorRecebido: f.meioPagamento === 'Dinheiro' ? Math.round((paraFloatBR(f.valorRecebido) || 0) * 100) / 100 : null,
      troco:         f.meioPagamento === 'Dinheiro' ? Math.round(trocoFatia(f, i) * 100) / 100 : null,
    }));
    // Fase 2 — pra cada item do carrinho, qual fatia (índice 0-based)
    // ficou com ele. Item não atribuído (ou que caiu no resto dividido
    // igualmente/rateado à mão) fica sem índice — não tem um dono único
    // pra gravar em itens_venda.pagamento_venda_id, e a RPC já trata
    // pagamento_index ausente como "sem fatia própria" nesse caso.
    const itensPagamentoIndex = modoDivisao === 'item'
      ? carrinho.map((_, idx) => {
          const fatiaId = itensFatia[idx];
          if (fatiaId == null) return null;
          const i = fatias.findIndex(f => f.id === fatiaId);
          return i >= 0 ? i : null;
        })
      : null;
    onFinalizar('Dividido', null, { pagamentos, itensPagamentoIndex });
  }

  function confirmarMetodo(key, idx) {
    setMeioPagamento(key);
    setSelectedIndex(idx);
    setMetodoConfirmado(true);
    setErro('');
    if (key !== 'Fiado') setClienteSelecionado(null);
    if (key === 'Dividido') {
      fatiaIdRef.current = 2;
      setFatias([
        { id: 1, pessoaLabel: 'Pessoa 1', valor: '', meioPagamento: 'Dinheiro', clienteId: null, clienteNome: null, valorRecebido: '', confirmada: false, pixDados: null, pixGerando: false, pixErro: '', pixRecebido: false, pixCopiado: false, pixValorGerado: null, pixSubModo: (pixConfig.modo === 'sistema' && pixConfig.disponivel) ? 'sistema' : 'maquininha' },
        { id: 2, pessoaLabel: 'Pessoa 2', valor: '', meioPagamento: 'Dinheiro', clienteId: null, clienteNome: null, valorRecebido: '', confirmada: false, pixDados: null, pixGerando: false, pixErro: '', pixRecebido: false, pixCopiado: false, pixValorGerado: null, pixSubModo: (pixConfig.modo === 'sistema' && pixConfig.disponivel) ? 'sistema' : 'maquininha' },
      ]);
      setFatiaBuscaAberta(null);
      setModoDivisao('valor');
      setItensFatia({});
      setRestoModo(null);
      setRestoManual({});
    }
  }

  function confirmarFinal() {
    setErro('');
    if (meioPagamento === 'Dividido') { confirmarFinalDividido(); return; }
    if (meioPagamento === 'Fiado') {
      if (!clienteSelecionado?.id) { setErro('Selecione um cliente para o fiado.'); return; }

      const limite = parseFloat(clienteSelecionado.limite_credito || 0);
      const saldoAtual = parseFloat(clienteSelecionado.saldo_devedor || 0);
      const novoSaldo = saldoAtual + total;

      if (limite > 0 && novoSaldo > limite) {
        const limiteStr = fmt(limite);
        const novoStr = fmt(novoSaldo);
        const ok = window.confirm(
          `⚠️ Limite de crédito excedido!\n\nLimite: ${limiteStr}\nNovo saldo após venda: ${novoStr}\n\nDeseja continuar mesmo assim?`
        );
        if (!ok) return;
      }

      onFinalizar('Fiado', clienteSelecionado.id, { clienteNome: clienteSelecionado.nome });
    } else if (meioPagamento === 'Dinheiro') {
      const recebido = paraFloatBR(valorRecebido) || 0;
      if (recebido < parseFloat(total.toFixed(2))) { setErro('Valor recebido insuficiente.'); return; }
      onFinalizar('Dinheiro', clienteVinculado?.id || null, { valorRecebido: recebido, troco, clienteNome: clienteVinculado?.nome || null, cpfNota: cpfNota.replace(/\D/g, '') || null });
    } else if (meioPagamento === 'Pix' && pixModo === 'sistema') {
      if (!pixRecebido) { setErro('Confirme que o Pix foi recebido antes de finalizar.'); return; }
      onFinalizar('Pix', clienteVinculado?.id || null, { clienteNome: clienteVinculado?.nome || null, cpfNota: cpfNota.replace(/\D/g, '') || null });
    } else {
      onFinalizar(meioPagamento, clienteVinculado?.id || null, { clienteNome: clienteVinculado?.nome || null, cpfNota: cpfNota.replace(/\D/g, '') || null });
    }
  }

  function handleOverlayKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (confirmarFechar) return; // os próprios botões da confirmação cuidam do Escape
      if (metodoConfirmado) { setMetodoConfirmado(false); return; }
      setConfirmarFechar(true);
      return;
    }
    if (e.target.tagName === 'INPUT') return;
    if (confirmarFechar) return; // não deixa seta/Enter da lista de pagamento vazar por baixo da confirmação
    if (!metodoConfirmado) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p + 1) % MEIOS.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p - 1 + MEIOS.length) % MEIOS.length); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmarMetodo(MEIOS[selectedIndex].key, selectedIndex); }
    }
  }

  // Teclado da confirmação de fechar — 1/2 direto, seta alterna, Esc
  // desiste de fechar (não fecha o modal, só cancela a confirmação).
  function handleConfirmFecharKey(e, outroRef) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      outroRef.current?.focus();
    } else if (e.key === '1') {
      e.preventDefault();
      onCancelar();
    } else if (e.key === '2') {
      e.preventDefault();
      setConfirmarFechar(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setConfirmarFechar(false);
    }
  }

  useEffect(() => {
    if (confirmarFechar) setTimeout(() => confirmFecharNaoRef.current?.focus(), 0);
  }, [confirmarFechar]);

  function handleDinheiroKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmarFinal(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); voltarEtapa(); }
  }

  function handleClienteKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMetodoConfirmado(false); return; }
    const totalOpcoes = resultadosCliente.length + (termoBuscaCliente.length >= 2 ? 1 : 0); // +1 = "cadastrar novo"
    if (e.key === 'ArrowDown') { e.preventDefault(); setClienteIndex(p => Math.min(p + 1, totalOpcoes - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setClienteIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (clienteIndex > -1 && clienteIndex < resultadosCliente.length) selecionarCliente(resultadosCliente[clienteIndex]);
      else if (termoBuscaCliente.length >= 2) abrirCadFiado(); // último item da lista, ou Enter direto se não achou nada
    }
  }

  return (
    <div className="pdv-modal-overlay" ref={overlayRef} tabIndex={-1} onKeyDown={handleOverlayKey}>
      {/* 17/09 — a pedido do usuário: modal mais largo especificamente no
          Dividido, que tem bem mais conteúdo por pessoa (forma de
          pagamento, troco/Pix, legenda de atalhos) do que os outros meios
          de pagamento — os demais continuam com a largura de sempre. */}
      <div className={`pdv-modal pdv-modal-pagamento${meioPagamento === 'Dividido' ? ' pdv-modal-pagamento-dividido' : ''}`} style={{ '--pdv-pag-zoom': pagZoom }} onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-pagamento-header">
          <div className="pdv-modal-titulo" style={{ marginBottom: 0 }}>💳 Finalizar Venda</div>
          <div className="pdv-modal-pagamento-zoom">
            <button type="button" onClick={() => mudarZoom(-0.05)} title="Diminuir">A−</button>
            <button type="button" onClick={() => mudarZoom(0.05)} title="Aumentar">A+</button>
          </div>
        </div>
        <div className="pdv-pagamento-total">
          <span className="pdv-pagamento-total-label">Total a pagar</span>
          <span className="pdv-pagamento-total-valor">{fmt(total)}</span>
        </div>
        {!metodoConfirmado && (
          confirmarFechar ? (
            <div className="pdv-ident-pergunta">
              <span className="pdv-ident-pergunta-texto">⚠️ Cancelar o pagamento e fechar?</span>
              <div className="pdv-ident-pergunta-botoes">
                <button type="button" ref={confirmFecharSimRef} className="pdv-ident-btn-sim" onClick={onCancelar} onKeyDown={e => handleConfirmFecharKey(e, confirmFecharNaoRef)}>
                  Sim
                </button>
                <button type="button" ref={confirmFecharNaoRef} className="pdv-ident-btn-nao" onClick={() => setConfirmarFechar(false)} onKeyDown={e => handleConfirmFecharKey(e, confirmFecharSimRef)}>
                  Não, continuar
                </button>
              </div>
              <span className="pdv-ident-hint">1 = Sim · 2 = Não · Esc pra continuar</span>
            </div>
          ) : (
          <>
            <span className="pdv-pagamento-label">Forma de pagamento  ↑ ↓ Enter</span>
            <ul className="pdv-meios-lista" ref={listaMeiosRef}>
              {MEIOS.map((m, i) => (
                <li key={m.key} className={`pdv-meio-item${selectedIndex === i ? ' ativo' : ''}${m.key === 'Fiado' && !podeUsarFiado ? ' bloqueado' : ''}`} onClick={() => m.key === 'Fiado' && !podeUsarFiado ? null : confirmarMetodo(m.key, i)} title={m.key === 'Fiado' && !podeUsarFiado ? 'Sem permissão para vender no fiado' : undefined}>
                  <span className="pdv-meio-icone">{m.icone}</span>
                  <span style={{ flex: 1 }}>{m.label}</span>
                  {selectedIndex === i && <span className="pdv-meio-enter">↩ Enter</span>}
                </li>
              ))}
            </ul>
          </>
          )
        )}
        {metodoConfirmado && (
          <div className="pdv-pagamento-conteudo">
            {meioPagamento !== 'Fiado' && identEtapa && identEtapa !== 'concluido' ? (
              <div className="pdv-ident-wizard">
                {identEtapa === 'perguntaCliente' && (
                  <div className="pdv-ident-pergunta">
                    <span className="pdv-ident-pergunta-texto">🪪 Quer identificar o cliente nessa venda?</span>
                    <div className="pdv-ident-pergunta-botoes">
                      <button type="button" ref={identSimClienteRef} className="pdv-ident-btn-sim" onClick={() => responderPerguntaCliente(true)} onKeyDown={e => handleSimNaoKey(e, identNaoClienteRef, () => responderPerguntaCliente(true), () => responderPerguntaCliente(false))}>Sim</button>
                      <button type="button" ref={identNaoClienteRef} className="pdv-ident-btn-nao" onClick={() => responderPerguntaCliente(false)} onKeyDown={e => handleSimNaoKey(e, identSimClienteRef, () => responderPerguntaCliente(true), () => responderPerguntaCliente(false))}>Não</button>
                    </div>
                    <span className="pdv-ident-hint">Opcional — não muda o pagamento. (1 = Sim · 2 = Não)</span>
                  </div>
                )}

                {identEtapa === 'perguntaClienteCadastrado' && (
                  <div className="pdv-ident-pergunta">
                    <span className="pdv-ident-pergunta-texto">O cliente já está cadastrado?</span>
                    <div className="pdv-ident-pergunta-botoes">
                      <button type="button" ref={identSimCadastradoRef} className="pdv-ident-btn-sim" onClick={() => responderClienteCadastrado(true)} onKeyDown={e => handleSimNaoKey(e, identNaoCadastradoRef, () => responderClienteCadastrado(true), () => responderClienteCadastrado(false))}>Sim</button>
                      <button type="button" ref={identNaoCadastradoRef} className="pdv-ident-btn-nao" onClick={() => responderClienteCadastrado(false)} onKeyDown={e => handleSimNaoKey(e, identSimCadastradoRef, () => responderClienteCadastrado(true), () => responderClienteCadastrado(false))}>Não</button>
                    </div>
                    <span className="pdv-ident-hint">1 = Sim · 2 = Não</span>
                  </div>
                )}

                {identEtapa === 'buscaCliente' && (
                  <div className="pdv-ident-pergunta">
                    <span className="pdv-ident-pergunta-texto">Buscar cliente cadastrado</span>
                    <input maxLength={60}
                      ref={identBuscaInputRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      placeholder="Nome, CPF ou código…"
                      value={termoBuscaIdent}
                      onChange={e => buscarClienteIdent(e.target.value)}
                      onKeyDown={handleIdentBuscaKey}
                    />
                    {loadingIdent && <div style={{ fontSize: '0.78rem', color: 'var(--est-text-muted)', marginTop: 6 }}>Buscando…</div>}
                    {resultadosIdent.length > 0 && (
                      <ul className="pdv-cliente-lista">
                        {resultadosIdent.map((cli, i) => (
                          <li key={cli.id} className={`pdv-cliente-item${identClienteIndex === i ? ' ativo' : ''}`} onClick={() => selecionarClienteIdent(cli)} onMouseEnter={() => setIdentClienteIndex(i)}>
                            {cli.nome}{cli.codigo_cliente ? ` #${cli.codigo_cliente}` : ''}
                            <span className="pdv-cliente-item-tel">{cli.telefone || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button type="button" className="pdv-ident-pular" onClick={pularBuscaCliente}>
                      → Pular {resultadosIdent.length === 0 && termoBuscaIdent ? '(Enter)' : ''}
                    </button>
                  </div>
                )}

                {identEtapa === 'cadastroRapido' && (
                  <form className="pdv-ident-pergunta" onSubmit={salvarCadastroRapido}>
                    <span className="pdv-ident-pergunta-texto">Cadastro rápido</span>
                    <input maxLength={100}
                      ref={cadNomeRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      placeholder="Nome do cliente *"
                      value={cadNome}
                      onChange={e => setCadNome(e.target.value)}
                      onKeyDown={handleCadNomeKey}
                    />
                    <input maxLength={20}
                      ref={cadTelefoneRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      placeholder="Telefone (opcional)"
                      value={cadTelefone}
                      onChange={e => setCadTelefone(e.target.value)}
                      onKeyDown={handleCadTelefoneKey}
                    />
                    <input maxLength={18}
                      ref={cadCpfRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="CPF ou CNPJ (opcional)"
                      value={cadCpf}
                      onChange={e => setCadCpf(formatarCpfCnpjInput(e.target.value))}
                      onKeyDown={handleCadCpfKey}
                    />
                    {cadErro && <div className="pdv-pagamento-erro" style={{ marginTop: 0 }}>⚠️ {cadErro}</div>}
                    <button type="submit" className="pdv-ident-btn-sim" style={{ maxWidth: 'none', width: '100%' }} disabled={cadSalvando}>
                      {cadSalvando ? '⏳ Cadastrando…' : '✓ Cadastrar e continuar (Enter)'}
                    </button>
                  </form>
                )}

                {identEtapa === 'perguntaCpf' && (
                  <div className="pdv-ident-pergunta">
                    {clienteVinculado && (
                      <div className="pdv-cliente-selecionado" style={{ marginBottom: 12 }}>
                        <span className="pdv-cliente-selecionado-nome">👤 {clienteVinculado.nome}</span>
                      </div>
                    )}
                    <span className="pdv-ident-pergunta-texto">
                      🪪 Quer informar CPF/CNPJ na nota?
                    </span>
                    <div className="pdv-ident-pergunta-botoes">
                      <button type="button" ref={identSimCpfRef} className="pdv-ident-btn-sim" onClick={() => responderPerguntaCpf(true)} onKeyDown={e => handleSimNaoKey(e, identNaoCpfRef, () => responderPerguntaCpf(true), () => responderPerguntaCpf(false))}>
                        Sim
                      </button>
                      <button type="button" ref={identNaoCpfRef} className="pdv-ident-btn-nao" onClick={() => responderPerguntaCpf(false)} onKeyDown={e => handleSimNaoKey(e, identSimCpfRef, () => responderPerguntaCpf(true), () => responderPerguntaCpf(false))}>Não</button>
                    </div>
                    <span className="pdv-ident-hint">1 = Sim · 2 = Não</span>
                  </div>
                )}

                {identEtapa === 'inputCpf' && (
                  <div className="pdv-ident-pergunta">
                    <span className="pdv-ident-pergunta-texto">CPF/CNPJ na nota</span>
                    <input maxLength={18}
                      ref={identCpfInputRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="CPF ou CNPJ"
                      value={cpfNota}
                      onChange={e => setCpfNota(formatarCpfCnpjInput(e.target.value))}
                      onKeyDown={handleIdentCpfInputKey}
                    />
                    <span className="pdv-ident-hint">Enter pra confirmar e continuar.</span>
                  </div>
                )}
              </div>
            ) : (
            <>
            {meioPagamento === 'Dinheiro' && (
              <>
                <span className="pdv-troco-input-label">Valor recebido (R$)</span>
                <input maxLength={15} ref={inputDinheiroRef} className="pdv-troco-input" type="text" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} onKeyDown={handleDinheiroKey} />
                <div className="pdv-troco-display">
                  <span>Troco</span>
                  <strong>{fmt(troco)}</strong>
                </div>
              </>
            )}
            {meioPagamento === 'Pix' && (
              <div className="pdv-pagamento-digital">
                {pixModo === 'maquininha' && (
                  <>
                    <span className="pdv-pagamento-digital-icone">📱</span>
                    <span className="pdv-pagamento-digital-nome">Pix (maquininha)</span>
                    {/* 17/09 — aviso mais destacado, a pedido do usuário: antes era só
                        um texto pequeno e discreto ("Pressione Enter para confirmar"),
                        fácil de passar batido. Agora fica claro o passo a passo. */}
                    <div className="pdv-pagamento-digital-aviso">
                      <span className="pdv-pagamento-digital-aviso-icone">⚠️</span>
                      Insira o valor na maquininha e finalize o pagamento por lá.<br />
                      Depois, clique em <strong>Confirmar</strong> aqui (ou pressione Enter).
                    </div>
                  </>
                )}
                {pixModo === 'sistema' && (
                  <div style={{ width: '100%', textAlign: 'center' }}>
                    {gerandoPix && <div style={{ padding: 'calc(28px * var(--pdv-pag-zoom, 1))', fontSize: 'calc(1.05rem * var(--pdv-pag-zoom, 1))' }}>⏳ Gerando QR Code…</div>}
                    {pixErro && (
                      <div style={{ color: '#dc2626', fontSize: 'calc(1rem * var(--pdv-pag-zoom, 1))', padding: '12px 0' }}>
                        ⚠️ {pixErro}
                        <div style={{ marginTop: 10 }}>
                          <button type="button" onClick={gerarPixSistema} style={{ fontSize: 'calc(0.95rem * var(--pdv-pag-zoom, 1))', padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>Tentar de novo</button>
                        </div>
                      </div>
                    )}
                    {pixDados && !gerandoPix && (
                      <>
                        <img src={pixDados.qrcode_base64} alt="QR Code Pix" style={{ width: 'calc(260px * var(--pdv-pag-zoom, 1))', height: 'calc(260px * var(--pdv-pag-zoom, 1))', margin: '0 auto', display: 'block', borderRadius: 10 }} />
                        <button type="button" onClick={copiarPixCopiaECola}
                          style={{ marginTop: 14, fontSize: 'calc(0.95rem * var(--pdv-pag-zoom, 1))', padding: '9px 20px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>
                          {pixCopiado ? '✓ Copiado!' : '📋 Copiar Pix Copia e Cola'}
                        </button>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 22, fontSize: 'calc(1.05rem * var(--pdv-pag-zoom, 1))', cursor: 'pointer' }}>
                          <input
                            ref={pixCheckboxRef}
                            type="checkbox"
                            checked={pixRecebido}
                            onChange={e => setPixRecebido(e.target.checked)}
                            style={{ width: 'calc(20px * var(--pdv-pag-zoom, 1))', height: 'calc(20px * var(--pdv-pag-zoom, 1))', cursor: 'pointer' }}
                            onKeyDown={e => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              if (!pixRecebido) {
                                setPixRecebido(true);
                                // Enter de novo já finaliza a venda
                                setTimeout(() => btnConfirmarRef.current?.focus(), 0);
                              } else {
                                confirmarFinal();
                              }
                            }}
                          />
                          Confirmo que o Pix caiu na conta
                        </label>
                      </>
                    )}
                  </div>
                )}
                {pixConfig.disponivel && (
                  <button
                    type="button"
                    onClick={() => { setPixModo(m => m === 'sistema' ? 'maquininha' : 'sistema'); setTimeout(() => btnConfirmarRef.current?.focus(), 0); }}
                    onKeyDown={e => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      setPixModo(m => m === 'sistema' ? 'maquininha' : 'sistema');
                      setTimeout(() => btnConfirmarRef.current?.focus(), 0);
                    }}
                    style={{ marginTop: 18, fontSize: 'calc(0.9rem * var(--pdv-pag-zoom, 1))', color: '#0f766e', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {pixModo === 'sistema' ? 'Usar a maquininha em vez disso' : 'Gerar QR Code pelo sistema em vez disso'}
                  </button>
                )}
              </div>
            )}
            {['Debito', 'Credito'].includes(meioPagamento) && (
              <div className="pdv-pagamento-digital">
                <span className="pdv-pagamento-digital-icone">{MEIOS.find(m => m.key === meioPagamento)?.icone}</span>
                <span className="pdv-pagamento-digital-nome">{MEIOS.find(m => m.key === meioPagamento)?.label}</span>
                <div className="pdv-pagamento-digital-aviso">
                  <span className="pdv-pagamento-digital-aviso-icone">⚠️</span>
                  Insira o valor na maquininha e finalize o pagamento por lá.<br />
                  Depois, clique em <strong>Confirmar</strong> aqui (ou pressione Enter).
                </div>
              </div>
            )}

            {meioPagamento === 'Dividido' && (
              <div className="pdv-dividido-wrap">
                <div className="pdv-dividido-modo-toggle">
                  <button type="button"
                    ref={modoValorBtnRef}
                    className={modoDivisao === 'valor' ? 'ativo' : ''}
                    onClick={() => mudarModoDivisao('valor')}
                    onKeyDown={handleModoDivisaoKey}
                    title="Dividir por valor (tecla 1)"
                  >
                    💰 Dividir por valor
                  </button>
                  <button type="button"
                    ref={modoItemBtnRef}
                    className={modoDivisao === 'item' ? 'ativo' : ''}
                    onClick={() => mudarModoDivisao('item')}
                    onKeyDown={handleModoDivisaoKey}
                    disabled={carrinho.length < 2}
                    title={carrinho.length < 2 ? 'Precisa de 2 ou mais itens no carrinho' : 'Dividir por item (tecla 2)'}
                  >
                    📦 Dividir por item
                  </button>
                </div>
                <div className={`pdv-dividido-restante${Math.abs(restanteDividir) <= 0.001 && !restoPendente ? ' ok' : ''}`}>
                  <span>Restante a dividir</span>
                  <strong>{fmt(restoPendente ? valorResto : restanteDividir)}</strong>
                </div>

                {modoDivisao === 'item' && (
                  <div className="pdv-dividido-itens">
                    <span className="pdv-dividido-itens-titulo">📦 Itens do carrinho — toque no número da pessoa dona de cada item</span>
                    <ul className="pdv-dividido-itens-lista">
                      {carrinho.map((item, idx) => {
                        const donoId = itensFatia[idx] ?? null;
                        return (
                          <li className="pdv-dividido-item-card" key={idx}>
                            <div className="pdv-dividido-item-info">
                              <span className="pdv-dividido-item-nome">{item.nome}</span>
                              <span className="pdv-dividido-item-valor">{fmt(valorItemCarrinho(item))}</span>
                            </div>
                            <div className="pdv-dividido-item-chips">
                              {fatias.map((f, i) => {
                                const ativo = donoId === f.id;
                                const cp = corPessoa(i);
                                return (
                                  <button type="button"
                                    key={f.id}
                                    className={`pdv-dividido-item-chip${ativo ? ' ativo' : ''}`}
                                    style={ativo ? { background: cp.bg, borderColor: cp.cor, color: cp.cor } : undefined}
                                    onClick={() => atribuirItemFatia(idx, ativo ? null : f.id)}
                                    title={f.pessoaLabel || `Pessoa ${i + 1}`}
                                  >
                                    <span className="pdv-dividido-fatia-num" style={{ background: ativo ? cp.cor : cp.bg, color: ativo ? '#fff' : cp.cor }}>{i + 1}</span>
                                    <span className="pdv-dividido-item-chip-label">{f.pessoaLabel || `Pessoa ${i + 1}`}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {valorResto > 0.001 && (
                      <div className="pdv-dividido-resto">
                        <span className="pdv-dividido-resto-texto">
                          ⚠️ {fmt(valorResto)} em itens ainda sem dono.
                        </span>
                        {!restoModo ? (
                          <div className="pdv-ident-pergunta-botoes">
                            <button type="button" className="pdv-ident-btn-sim" onClick={() => setRestoModo('igual')}>÷ Dividir igual</button>
                            <button type="button" className="pdv-ident-btn-nao" onClick={() => setRestoModo('manual')}>✏️ Digitar de cada um</button>
                          </div>
                        ) : restoModo === 'igual' ? (
                          <div className="pdv-dividido-resto-info">
                            <span>Dividido igualmente entre as {fatias.length} pessoas.</span>
                            <button type="button" className="pdv-ident-recap-editar" onClick={() => setRestoModo(null)}>✏️ Mudar</button>
                          </div>
                        ) : (
                          <div className="pdv-dividido-resto-manual">
                            {fatias.map((f, i) => (
                              <div className="pdv-dividido-resto-manual-linha" key={f.id}>
                                <span>{f.pessoaLabel || `Pessoa ${i + 1}`}</span>
                                <input maxLength={15}
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0,00"
                                  value={restoManual[f.id] || ''}
                                  onChange={e => setRestoManual(rm => ({ ...rm, [f.id]: digitarValorMascarado(e.target.value) }))}
                                />
                              </div>
                            ))}
                            <button type="button" className="pdv-ident-recap-editar" onClick={() => setRestoModo(null)}>✏️ Mudar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="pdv-dividido-lista">
                  {fatias.map((f, i) => {
                    const cp = corPessoa(i);
                    // 17/09 — pessoa já confirmada (ver `confirmarFatia`):
                    // cartão colapsado num resumo compacto, só com um botão
                    // "Editar" pra reabrir. A venda em si (payload, RPC,
                    // recibo) não muda nada por causa disso — é só
                    // organização da tela enquanto o operador preenche as
                    // pessoas uma a uma.
                    if (f.confirmada) {
                      const meioInfo = MEIOS.find(m => m.key === f.meioPagamento);
                      const nomeExibido = f.clienteId ? f.clienteNome : (f.pessoaLabel || `Pessoa ${i + 1}`);
                      return (
                        <div className="pdv-dividido-fatia pdv-dividido-fatia-confirmada" key={f.id} style={{ borderTopColor: cp.cor }}>
                          <div className="pdv-dividido-fatia-topo">
                            <span className="pdv-dividido-fatia-num" style={{ background: cp.bg, color: cp.cor }}>{i + 1}</span>
                            <span className="pdv-dividido-fatia-confirmada-nome">
                              {f.clienteId && '📋 '}{nomeExibido}
                            </span>
                            <span className="pdv-dividido-fatia-confirmada-check" title="Pessoa confirmada">✓</span>
                          </div>
                          <div className="pdv-dividido-fatia-confirmada-resumo">
                            <span>{meioInfo?.icone} {MEIO_LABEL_CURTO[f.meioPagamento]}</span>
                            <strong>{fmt(valorFatiaAtual(f, i))}</strong>
                            {f.meioPagamento === 'Dinheiro' && (
                              <span className="pdv-dividido-fatia-confirmada-troco">Troco {fmt(trocoFatia(f, i))}</span>
                            )}
                            {f.meioPagamento === 'Pix' && f.pixSubModo === 'sistema' && pixConfig.disponivel && f.pixRecebido && (
                              <span className="pdv-dividido-fatia-confirmada-troco">✓ Pix confirmado</span>
                            )}
                          </div>
                          <button type="button" className="pdv-dividido-fatia-editar" onClick={() => editarFatia(f.id)}>✏️ Editar</button>
                        </div>
                      );
                    }
                    return (
                    <div className="pdv-dividido-fatia" key={f.id} style={{ borderTopColor: cp.cor }}>
                      <div className="pdv-dividido-fatia-topo">
                        <span className="pdv-dividido-fatia-num" style={{ background: cp.bg, color: cp.cor }}>{i + 1}</span>
                        {f.clienteId ? (
                          <div className="pdv-dividido-fatia-cliente-chip">
                            <span className="pdv-dividido-fatia-cliente-chip-nome">📋 {f.clienteNome}</span>
                            <button type="button" className="pdv-btn-trocar-cliente" onClick={() => desvincularClienteFatia(f.id)}>↩ Trocar</button>
                            {f.meioPagamento !== 'Fiado' && (
                              <button type="button" className="pdv-btn-trocar-cliente" onClick={() => desvincularClienteFatia(f.id)}>✕ Remover</button>
                            )}
                          </div>
                        ) : (
                          <input maxLength={30}
                            ref={el => { fatiaNomeRefs.current[f.id] = el; }}
                            className="pdv-dividido-fatia-label"
                            type="text"
                            value={f.pessoaLabel}
                            onChange={e => atualizarLabelFatia(f.id, e.target.value)}
                            onKeyDown={e => handleFatiaNomeKey(e, i)}
                            placeholder={`Pessoa ${i + 1}`}
                          />
                        )}
                        {fatias.length > 2 && (
                          <button type="button" className="pdv-dividido-remover" onClick={() => removerPessoa(f.id)} title="Remover pessoa">✕</button>
                        )}
                      </div>
                      {!f.clienteId && (() => {
                        const fiado = f.meioPagamento === 'Fiado';
                        return (
                        <div className="pdv-dividido-fiado">
                          {fatiaBuscaAberta === f.id ? (
                            <div className="pdv-dividido-fiado-busca">
                              {!fatiaCadNovo ? (
                                <>
                                  <input maxLength={100}
                                    autoFocus
                                    className="pdv-cliente-busca-input"
                                    type="text"
                                    placeholder="Buscar cliente…"
                                    value={fatiaBuscaTermo}
                                    onChange={e => buscarClienteFatia(e.target.value)}
                                    onKeyDown={e => handleFatiaBuscaKey(e, f.id)}
                                  />
                                  {fatiaBuscaLoading && <div className="pdv-dividido-fiado-loading">Buscando…</div>}
                                  {fatiaBuscaResultados.length > 0 && (
                                    <ul className="pdv-cliente-lista">
                                      {fatiaBuscaResultados.map((cli, ci) => (
                                        <li key={cli.id}
                                          className={`pdv-cliente-item${fatiaBuscaIndex === ci ? ' ativo' : ''}`}
                                          onClick={() => selecionarClienteFatia(f.id, cli)}
                                          onMouseEnter={() => setFatiaBuscaIndex(ci)}
                                        >
                                          {cli.nome}
                                          <span className="pdv-cliente-item-tel">{cli.telefone || '—'}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className="pdv-dividido-fiado-acoes">
                                    <button type="button" className="pdv-ident-pular" onClick={() => setFatiaCadNovo(true)}>➕ Cadastrar novo cliente</button>
                                    <button type="button" className="pdv-ident-pular" onClick={() => setFatiaBuscaAberta(null)}>Cancelar</button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input maxLength={100}
                                    autoFocus
                                    className="pdv-cliente-busca-input"
                                    type="text"
                                    placeholder="Nome do cliente *"
                                    value={fatiaCadNome}
                                    onChange={e => setFatiaCadNome(e.target.value)}
                                  />
                                  <input maxLength={20}
                                    className="pdv-cliente-busca-input"
                                    type="text"
                                    placeholder="Telefone (opcional)"
                                    value={fatiaCadTelefone}
                                    onChange={e => setFatiaCadTelefone(e.target.value)}
                                  />
                                  {fatiaCadErro && <div className="pdv-pagamento-erro" style={{ marginTop: 0 }}>⚠️ {fatiaCadErro}</div>}
                                  <div className="pdv-dividido-fiado-acoes">
                                    <button type="button" className="pdv-ident-pular" disabled={fatiaCadSalvando} onClick={() => salvarClienteRapidoFatia(f.id)}>
                                      {fatiaCadSalvando ? '⏳ Cadastrando…' : '✓ Cadastrar e usar'}
                                    </button>
                                    <button type="button" className="pdv-ident-pular" onClick={() => setFatiaCadNovo(false)}>← Voltar</button>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : (
                            <button type="button"
                              ref={el => { fatiaBuscarBtnRefs.current[f.id] = el; }}
                              className={`pdv-dividido-fiado-buscar-btn${fiado ? '' : ' opcional'}`}
                              onClick={() => abrirBuscaFatia(f.id)}
                            >
                              {fiado ? '🔍 Selecionar cliente (obrigatório pro fiado)' : '🔗 Vincular a cliente cadastrado (opcional)'}
                            </button>
                          )}
                        </div>
                        );
                      })()}
                      <div className="pdv-dividido-fatia-linha">
                        {modoDivisao === 'item' ? (
                          <div className="pdv-dividido-fatia-valor-wrap computado" title="Calculado a partir dos itens atribuídos">
                            <span className="pdv-dividido-fatia-valor-prefixo">R$</span>
                            <span className="pdv-dividido-fatia-valor-computado">{fmtNum(valorFatiaAtual(f, i))}</span>
                          </div>
                        ) : (
                          <div className="pdv-dividido-fatia-valor-wrap">
                            <span className="pdv-dividido-fatia-valor-prefixo">R$</span>
                            <input maxLength={15}
                              ref={el => { fatiaValorRefs.current[f.id] = el; }}
                              className="pdv-dividido-fatia-valor"
                              type="text"
                              inputMode="numeric"
                              placeholder="0,00"
                              value={f.valor}
                              onChange={e => atualizarValorFatia(f.id, e.target.value)}
                              onKeyDown={e => handleFatiaValorKey(e, i)}
                            />
                          </div>
                        )}
                      </div>
                      {(() => {
                        const meiosDisponiveis = MEIOS.filter(m => m.key !== 'Dividido' && (m.key !== 'Fiado' || podeUsarFiado));
                        return (
                        <div className="pdv-dividido-fatia-meio-btns" role="group" aria-label="Forma de pagamento">
                          {meiosDisponiveis.map((m, mi) => (
                            <button type="button"
                              key={m.key}
                              data-meio={m.key}
                              ref={mi === 0 ? el => { fatiaMeioPrimeiroBtnRefs.current[f.id] = el; } : undefined}
                              className={`pdv-dividido-fatia-meio-btn${f.meioPagamento === m.key ? ' ativo' : ''}`}
                              onClick={() => escolherMeioFatia(f, i, m.key)}
                              onKeyDown={e => handleFatiaMeioBtnKey(e, f, i, meiosDisponiveis)}
                              title={`${m.label} (tecla ${mi + 1})`}
                            >
                              <span className="pdv-dividido-fatia-meio-btn-icone">{m.icone}</span>
                              <span className="pdv-dividido-fatia-meio-btn-label">{MEIO_LABEL_CURTO[m.key]}</span>
                            </button>
                          ))}
                        </div>
                        );
                      })()}
                      {f.meioPagamento === 'Dinheiro' && (
                        <div className="pdv-dividido-fatia-troco">
                          <div className="pdv-dividido-fatia-troco-campo">
                            <span className="pdv-dividido-fatia-troco-label">Recebeu (R$)</span>
                            <input maxLength={15}
                              ref={el => { fatiaRecebidoRefs.current[f.id] = el; }}
                              className="pdv-dividido-fatia-troco-input"
                              type="text"
                              inputMode="numeric"
                              placeholder="0,00"
                              value={f.valorRecebido}
                              onChange={e => atualizarValorRecebidoFatia(f.id, e.target.value)}
                              onKeyDown={e => handleFatiaRecebidoKey(e, i)}
                            />
                          </div>
                          <div className="pdv-dividido-fatia-troco-display">
                            <span>Troco</span>
                            <strong>{fmt(trocoFatia(f, i))}</strong>
                          </div>
                        </div>
                      )}
                      {/* 17/09 — aviso "insira na maquininha", mesmo texto destacado do
                          fluxo principal (`.pdv-pagamento-digital-aviso`) — Débito/Crédito
                          sempre, e Pix quando o estabelecimento NÃO usa Pix pelo sistema
                          (senão cai no bloco de QR Code logo abaixo). Mostra o valor
                          específico DESSA fatia, já que cada pessoa pode dever um valor
                          diferente — não dá pra só olhar o total do carrinho aqui. */}
                      {(['Debito', 'Credito'].includes(f.meioPagamento) || (f.meioPagamento === 'Pix' && !(f.pixSubModo === 'sistema' && pixConfig.disponivel))) && (
                        <div className="pdv-dividido-fatia-maquininha-aviso">
                          ⚠️ Insira <strong>{fmt(valorFatiaAtual(f, i))}</strong> na maquininha e finalize o pagamento por lá. Depois, confirme aqui embaixo.
                          {/* 17/09 — link pra trocar pro Pix pelo sistema, igual o fluxo
                              principal já tem ("Gerar QR Code pelo sistema em vez disso") —
                              faltava aqui; cada fatia guarda a própria escolha
                              (`f.pixSubModo`), independente das outras pessoas. */}
                          {f.meioPagamento === 'Pix' && pixConfig.disponivel && (
                            <button type="button" className="pdv-dividido-fatia-pix-trocar-modo" onClick={() => alternarPixSubModoFatia(f.id)}>
                              Gerar QR Code pelo sistema em vez disso
                            </button>
                          )}
                        </div>
                      )}
                      {/* "Abrir a tela de Pix igual abre no PDV normal", dentro do cartão
                          dessa fatia: QR Code + copia-e-cola + checkbox de confirmação,
                          com o valor DESSA pessoa. Só aparece quando essa fatia está
                          usando Pix pelo sistema (`f.pixSubModo`, alternável por
                          `alternarPixSubModoFatia`) e o estabelecimento tem essa
                          integração disponível. */}
                      {f.meioPagamento === 'Pix' && f.pixSubModo === 'sistema' && pixConfig.disponivel && (
                        <div className="pdv-dividido-fatia-pix">
                          {f.pixGerando && <div className="pdv-dividido-fatia-pix-status">⏳ Gerando QR Code…</div>}
                          {f.pixErro && !f.pixGerando && (
                            <div className="pdv-dividido-fatia-pix-erro">
                              ⚠️ {f.pixErro}
                              <button type="button" onClick={() => gerarPixFatia(f.id)}>Tentar de novo</button>
                            </div>
                          )}
                          {f.pixDados && !f.pixGerando && !f.pixErro && (
                            pixDesatualizadoFatia(f, i) ? (
                              <div className="pdv-dividido-fatia-pix-aviso">
                                ⚠️ O valor mudou desde que esse QR foi gerado.
                                <button type="button" onClick={() => gerarPixFatia(f.id)}>🔄 Gerar novo QR Code</button>
                              </div>
                            ) : (
                              <>
                                <img src={f.pixDados.qrcode_base64} alt="QR Code Pix" className="pdv-dividido-fatia-pix-qr" />
                                <button type="button" className="pdv-dividido-fatia-pix-copiar" onClick={() => copiarPixCopiaEColaFatia(f.id)}>
                                  {f.pixCopiado ? '✓ Copiado!' : '📋 Copiar Pix Copia e Cola'}
                                </button>
                                <label className="pdv-dividido-fatia-pix-check">
                                  <input
                                    ref={el => { fatiaPixCheckboxRefs.current[f.id] = el; }}
                                    type="checkbox"
                                    checked={f.pixRecebido}
                                    onChange={e => setFatias(fs => fs.map(x => (x.id === f.id ? { ...x, pixRecebido: e.target.checked } : x)))}
                                    onKeyDown={e => {
                                      if (e.key !== 'Enter') return;
                                      e.preventDefault();
                                      if (!f.pixRecebido) {
                                        setFatias(fs => fs.map(x => (x.id === f.id ? { ...x, pixRecebido: true } : x)));
                                        setTimeout(() => fatiaConfirmarBtnRefs.current[f.id]?.focus(), 0);
                                      } else {
                                        confirmarFatia(f.id);
                                      }
                                    }}
                                  />
                                  Confirmo que o Pix caiu na conta
                                </label>
                              </>
                            )
                          )}
                        </div>
                      )}
                      <button type="button"
                        ref={el => { fatiaConfirmarBtnRefs.current[f.id] = el; }}
                        className="pdv-dividido-fatia-confirmar"
                        disabled={!fatiaIndividualValida(f, i)}
                        onClick={() => confirmarFatia(f.id)}
                        title={fatiaIndividualValida(f, i) ? undefined : 'Preencha valor, forma de pagamento (e cliente/recebido/Pix confirmado, se for o caso) antes de confirmar'}
                      >
                        ✓ Confirmar {f.clienteId ? f.clienteNome : (f.pessoaLabel || `Pessoa ${i + 1}`)}
                      </button>
                    </div>
                    );
                  })}
                </div>
                <button type="button" className="pdv-dividido-add" onClick={adicionarPessoa}>➕ Adicionar pessoa</button>
              </div>
            )}

            {/* Resumo da identificação (se teve alguma) — com opção de
                reabrir o assistente pra trocar, sem precisar cancelar
                a venda inteira */}
            {meioPagamento !== 'Fiado' && meioPagamento !== 'Dividido' && (clienteVinculado || cpfNota) && (
              <div className="pdv-ident-recap">
                <span>
                  🪪
                  {clienteVinculado && <> Cliente: <strong>{clienteVinculado.nome}</strong></>}
                  {clienteVinculado && cpfNota && ' · '}
                  {cpfNota && <> {labelDocumento(cpfNota)}: <strong>{cpfNota}</strong></>}
                </span>
                <button type="button" className="pdv-ident-recap-editar" onClick={() => setIdentEtapa('perguntaCliente')}>
                  ✏️ Editar
                </button>
              </div>
            )}

            {meioPagamento === 'Fiado' && (
              <>
                {mostrarCadFiado ? (
                  <form className="pdv-ident-pergunta" onSubmit={salvarCadFiado}>
                    <span className="pdv-ident-pergunta-texto">Cadastrar cliente pro fiado</span>
                    <input maxLength={100}
                      ref={cadFiadoNomeRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      placeholder="Nome do cliente *"
                      value={cadFiadoNome}
                      onChange={e => setCadFiadoNome(e.target.value)}
                      onKeyDown={handleCadFiadoNomeKey}
                    />
                    <input maxLength={20}
                      ref={cadFiadoTelefoneRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      placeholder="Telefone (opcional)"
                      value={cadFiadoTelefone}
                      onChange={e => setCadFiadoTelefone(e.target.value)}
                      onKeyDown={handleCadFiadoTelefoneKey}
                    />
                    <input maxLength={18}
                      ref={cadFiadoCpfRef}
                      className="pdv-cliente-busca-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="CPF ou CNPJ (opcional)"
                      value={cadFiadoCpf}
                      onChange={e => setCadFiadoCpf(formatarCpfCnpjInput(e.target.value))}
                      onKeyDown={handleCadFiadoCpfKey}
                    />
                    <label className="pdv-ident-cpf-label" style={{ marginTop: 4 }}>Limite de crédito</label>
                    <div className="pdv-ident-pergunta-botoes">
                      <button
                        type="button"
                        ref={cadFiadoSemLimiteRef}
                        className="pdv-ident-btn-sim"
                        onClick={() => { setCadFiadoSemLimite(true); salvarCadFiado(); }}
                        onKeyDown={e => handleCadFiadoLimiteChoiceKey(e, cadFiadoComLimiteRef)}
                      >
                        ∞ Sem limite
                      </button>
                      <button
                        type="button"
                        ref={cadFiadoComLimiteRef}
                        className="pdv-ident-btn-nao"
                        onClick={() => { setCadFiadoSemLimite(false); setTimeout(() => cadFiadoLimiteInputRef.current?.focus(), 0); }}
                        onKeyDown={e => handleCadFiadoLimiteChoiceKey(e, cadFiadoSemLimiteRef)}
                      >
                        R$ Definir limite
                      </button>
                    </div>
                    {!cadFiadoSemLimite && (
                      <input maxLength={15}
                        ref={cadFiadoLimiteInputRef}
                        className="pdv-cliente-busca-input"
                        type="text"
                        placeholder="0,00"
                        value={cadFiadoLimite}
                        onChange={e => setCadFiadoLimite(digitarValorMascarado(e.target.value))}
                        onKeyDown={handleCadFiadoLimiteValorKey}
                      />
                    )}
                    {cadFiadoErro && <div className="pdv-pagamento-erro" style={{ marginTop: 0 }}>⚠️ {cadFiadoErro}</div>}
                    <span className="pdv-ident-hint">{cadFiadoSalvando ? '⏳ Cadastrando…' : 'Enter em "Sem limite" já cadastra e usa no fiado.'}</span>
                    <button type="button" className="pdv-ident-pular" onClick={voltarCadFiado}>← Voltar pra busca (Esc)</button>
                  </form>
                ) : clienteSelecionado ? (
                  <div className="pdv-cliente-selecionado">
                    <span className="pdv-cliente-selecionado-nome">📋 {clienteSelecionado.nome}</span>
                    <div className="pdv-cliente-selecionado-info">
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Saldo atual</span>
                        <span className="pdv-cliente-info-valor">{fmt(clienteSelecionado.saldo_devedor)}</span>
                      </div>
                      <div className="pdv-cliente-info-item">
                        <span className="pdv-cliente-info-label">Novo saldo</span>
                        <span className="pdv-cliente-info-valor novo-saldo">{fmt((parseFloat(clienteSelecionado.saldo_devedor) || 0) + total)}</span>
                      </div>
                      {parseFloat(clienteSelecionado.limite_credito || 0) > 0 && (
                        <div className="pdv-cliente-info-item">
                          <span className="pdv-cliente-info-label">Limite</span>
                          <span className={`pdv-cliente-info-valor${(parseFloat(clienteSelecionado.saldo_devedor || 0) + total) > parseFloat(clienteSelecionado.limite_credito) ? ' limite-excedido' : ''}`}>
                            {fmt(clienteSelecionado.limite_credito)}
                            {(parseFloat(clienteSelecionado.saldo_devedor || 0) + total) > parseFloat(clienteSelecionado.limite_credito) && ' ⚠️'}
                          </span>
                        </div>
                      )}
                    </div>
                    <button className="pdv-btn-trocar-cliente" onClick={() => setClienteSelecionado(null)}>↩ Trocar cliente</button>
                  </div>
                ) : (
                  <>
                    <input maxLength={100} ref={inputClienteRef} className="pdv-cliente-busca-input" type="text" placeholder="Buscar cliente por nome ou telefone…" value={termoBuscaCliente} onChange={e => buscarCliente(e.target.value)} onKeyDown={handleClienteKey} />
                    {loadingCliente && <div style={{ fontSize: '0.78rem', color: 'var(--est-text-muted)', marginBottom: 6 }}>Buscando…</div>}
                    {(resultadosCliente.length > 0 || termoBuscaCliente.length >= 2) && (
                      <ul className="pdv-cliente-lista" ref={listaClienteRef}>
                        {resultadosCliente.map((cli, i) => (
                          <li key={cli.id} className={`pdv-cliente-item${clienteIndex === i ? ' ativo' : ''}`} onClick={() => selecionarCliente(cli)} onMouseEnter={() => setClienteIndex(i)}>
                            {cli.nome}
                            <span className="pdv-cliente-item-tel">{cli.telefone || '—'}</span>
                          </li>
                        ))}
                        {termoBuscaCliente.length >= 2 && (
                          <li
                            className={`pdv-cliente-item${clienteIndex === resultadosCliente.length ? ' ativo' : ''}`}
                            onClick={abrirCadFiado}
                            onMouseEnter={() => setClienteIndex(resultadosCliente.length)}
                          >
                            ➕ Cadastrar novo cliente
                          </li>
                        )}
                      </ul>
                    )}
                  </>
                )}
              </>
            )}
            </>
            )}
          </div>
        )}
        {erro && <div className="pdv-pagamento-erro">⚠️ {erro}</div>}
        <div className="pdv-pagamento-acoes">
          <button className="pdv-btn-cancelar" onClick={onCancelar} disabled={loading}>Cancelar (Esc)</button>
          <button ref={btnConfirmarRef} className="pdv-btn-confirmar" onClick={confirmarFinal} disabled={loading || !metodoConfirmado || (meioPagamento === 'Dividido' && !fatiasValidas)}>
            {loading ? '⏳ Processando…' : '✓ Confirmar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL PÓS-VENDA — pergunta se quer imprimir
   ════════════════════════════════════════════════════════════ */
function ModalPosVenda({ venda, nomeEstabelecimento, onFechar }) {
  const reciboRef    = useRef(null);
  const btnImpRef    = useRef(null);
  const btnFecharRef = useRef(null);
  const overlayRef   = useRef(null);

  useEffect(() => {
    setTimeout(() => btnImpRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onFechar]);

  // Seta alterna entre Imprimir/Fechar — Enter já confirma o que
  // estiver com foco no momento (comportamento nativo do botão)
  function handlePosVendaKey(e, outroRef) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      outroRef.current?.focus();
    }
  }

  const meioLabel = {
    Dinheiro: '💵 Dinheiro',
    Pix:      '📱 Pix',
    Debito:   '💳 Débito',
    Credito:  '💳 Crédito',
    Fiado:    '📋 Fiado',
    Dividido: '➗ Dividido',
  }[venda.meioPagamento] || venda.meioPagamento;

  const meioLabelCurto = {
    Dinheiro: '💵 Dinheiro', Pix: '📱 Pix', Debito: '💳 Débito', Credito: '💳 Crédito', Fiado: '📋 Fiado',
  };

  function imprimir() {
    const conteudo = reciboRef.current?.innerHTML;
    if (!conteudo) return;
    const alturaJanela = Math.round((window.screen?.availHeight || 900) * 0.92);
    const janela = window.open('', '_blank', `width=480,height=${alturaJanela},top=20,left=100`);
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Recibo</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              width: 80mm;
              padding: 4mm;
              color: #000;
              background: #fff;
            }
            .rec-header { text-align: center; margin-bottom: 8px; }
            .rec-nome { font-size: 15px; font-weight: bold; }
            .rec-data { font-size: 10px; color: #555; margin-top: 2px; }
            .rec-divider { border: none; border-top: 1px dashed #000; margin: 6px 0; }
            .rec-item { display: flex; justify-content: space-between; margin: 3px 0; font-size: 11px; }
            .rec-item-nome { flex: 1; }
            .rec-item-qtd { color: #555; margin: 0 6px; white-space: nowrap; }
            .rec-item-val { font-weight: bold; white-space: nowrap; }
            .rec-total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin-top: 4px; }
            .rec-pagamento { display: flex; justify-content: space-between; font-size: 11px; margin: 2px 0; }
            .rec-pagamento-itens { font-size: 9px; color: #555; margin: -2px 0 3px; padding-left: 4px; }
            .rec-footer { text-align: center; font-size: 10px; color: #555; margin-top: 8px; }
            .rec-obrigado { font-size: 13px; font-weight: bold; text-align: center; margin: 6px 0 4px; }
          </style>
        </head>
        <body>${conteudo}</body>
      </html>
    `);
    janela.document.close();
    janela.focus();
    setTimeout(() => { janela.print(); janela.close(); }, 300);
  }

  const horarioStr = venda.horario.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="pdv-modal-overlay">
      <div className="pdv-posv-modal" onClick={e => e.stopPropagation()}>

        <div className="pdv-posv-sucesso">
          <span className="pdv-posv-check">✓</span>
          <div>
            <div className="pdv-posv-titulo">Venda registrada!</div>
            <div className="pdv-posv-subtitulo">{fmt(venda.total)} · {meioLabel}</div>
          </div>
        </div>

        {venda.meioPagamento === 'Dinheiro' && venda.troco > 0 && (
          <div className="pdv-posv-troco">
            <span className="pdv-posv-troco-label">Troco</span>
            <span className="pdv-posv-troco-valor">{fmt(venda.troco)}</span>
          </div>
        )}

        {venda.meioPagamento === 'Fiado' && venda.clienteNome && (
          <div className="pdv-posv-fiado">
            📋 Lançado no fiado de <strong>{venda.clienteNome}</strong>
          </div>
        )}

        {venda.meioPagamento === 'Dividido' && venda.pagamentos?.length > 0 && (
          <div className="pdv-posv-dividido">
            <span className="pdv-posv-dividido-titulo">➗ Dividido em {venda.pagamentos.length} partes</span>
            {venda.pagamentos.map((p, i) => {
              // Fase 2 — se a divisão foi por item, mostra quais itens
              // ficaram com essa pessoa. Itens sem dono único (não
              // atribuídos, ou resto dividido/rateado) não entram em
              // nenhuma lista — não tem uma pessoa só responsável por eles.
              const itensDaFatia = venda.itensPagamentoIndex
                ? venda.itens.filter((_, idx) => venda.itensPagamentoIndex[idx] === i)
                : [];
              return (
                <div className="pdv-posv-dividido-fatia" key={i}>
                  <span className="pdv-posv-dividido-fatia-nome">{p.pessoaLabel || `Pessoa ${i + 1}`}</span>
                  <span className="pdv-posv-dividido-fatia-meio">{meioLabelCurto[p.meioPagamento] || p.meioPagamento}{p.clienteNome ? ` · ${p.clienteNome}` : ''}</span>
                  <span className="pdv-posv-dividido-fatia-valor">{fmt(p.valor)}</span>
                  {p.meioPagamento === 'Dinheiro' && p.valorRecebido != null && (
                    <span className="pdv-posv-dividido-fatia-troco">Recebeu {fmt(p.valorRecebido)} · Troco {fmt(p.troco)}</span>
                  )}
                  {itensDaFatia.length > 0 && (
                    <span className="pdv-posv-dividido-fatia-itens">{itensDaFatia.map(it => it.nome).join(', ')}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {venda.meioPagamento !== 'Fiado' && venda.meioPagamento !== 'Dividido' && (venda.clienteNome || venda.cpfNota) && (
          <div className="pdv-posv-fiado">
            🪪 {venda.clienteNome && <>Cliente: <strong>{venda.clienteNome}</strong></>}
            {venda.clienteNome && venda.cpfNota && ' · '}
            {venda.cpfNota && <>{labelDocumento(venda.cpfNota)} na nota: <strong>{venda.cpfNota}</strong></>}
          </div>
        )}

        <div className="pdv-posv-pergunta">
          🖨️ Deseja imprimir o recibo?
        </div>

        <div className="pdv-ident-pergunta-botoes">
          <button ref={btnImpRef} className="pdv-ident-btn-sim" onClick={imprimir} onKeyDown={e => handlePosVendaKey(e, btnFecharRef)}>
            🖨️ Sim, imprimir
          </button>
          <button ref={btnFecharRef} className="pdv-ident-btn-nao" onClick={onFechar} onKeyDown={e => handlePosVendaKey(e, btnImpRef)}>
            Não, fechar
          </button>
        </div>

        <div style={{ display: 'none' }}>
          <div ref={reciboRef}>
            <div className="rec-header">
              <div className="rec-nome">{nomeEstabelecimento || 'Estabelecimento'}</div>
              <div className="rec-data">{horarioStr}</div>
            </div>
            <hr className="rec-divider" />
            {venda.itens.map((item, i) => (
              <div key={i} className="rec-item">
                <span className="rec-item-nome">{item.nome}</span>
                <span className="rec-item-qtd">
                  {item.unidade_medida === 'kg'
                    ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                    : `${parseFloat(item.quantidade).toFixed(0)}x`
                  }
                </span>
                <span className="rec-item-val">{fmt(item.preco_venda * item.quantidade)}</span>
              </div>
            ))}
            <hr className="rec-divider" />
            <div className="rec-total-row">
              <span>TOTAL</span>
              <span>{fmt(venda.total)}</span>
            </div>
            {venda.meioPagamento === 'Dividido' && venda.pagamentos?.length > 0 ? (
              <>
                <div className="rec-pagamento">
                  <span>Pagamento</span>
                  <span>Dividido em {venda.pagamentos.length}</span>
                </div>
                {venda.pagamentos.map((p, i) => {
                  const itensDaFatia = venda.itensPagamentoIndex
                    ? venda.itens.filter((_, idx) => venda.itensPagamentoIndex[idx] === i)
                    : [];
                  return (
                    <React.Fragment key={i}>
                      <div className="rec-pagamento">
                        <span>{p.pessoaLabel || `Pessoa ${i + 1}`} ({meioLabelCurto[p.meioPagamento]?.replace(/^\S+\s/, '') || p.meioPagamento}{p.clienteNome ? ` · ${p.clienteNome}` : ''})</span>
                        <span>{fmt(p.valor)}</span>
                      </div>
                      {p.meioPagamento === 'Dinheiro' && p.valorRecebido != null && (
                        <div className="rec-pagamento-itens">Recebeu {fmt(p.valorRecebido)} · Troco {fmt(p.troco)}</div>
                      )}
                      {itensDaFatia.length > 0 && (
                        <div className="rec-pagamento-itens">{itensDaFatia.map(it => it.nome).join(', ')}</div>
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              <>
                <div className="rec-pagamento">
                  <span>Pagamento</span>
                  <span>{venda.meioPagamento}</span>
                </div>
                {venda.meioPagamento === 'Dinheiro' && venda.valorRecebido && (
                  <>
                    <div className="rec-pagamento">
                      <span>Recebido</span>
                      <span>{fmt(venda.valorRecebido)}</span>
                    </div>
                    <div className="rec-pagamento">
                      <span>Troco</span>
                      <span>{fmt(venda.troco)}</span>
                    </div>
                  </>
                )}
                {venda.clienteNome && (
                  <div className="rec-pagamento">
                    <span>Cliente</span>
                    <span>{venda.clienteNome}</span>
                  </div>
                )}
              </>
            )}
            {venda.cpfNota && (
              <div className="rec-pagamento">
                <span>{labelDocumento(venda.cpfNota)}</span>
                <span>{venda.cpfNota}</span>
              </div>
            )}
            <hr className="rec-divider" />
            <div className="rec-obrigado">Obrigado!</div>
            <div className="rec-footer">Lucas J. Systems</div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL — PDV
   ════════════════════════════════════════════════════════════ */
export default function PDV({ estabelecimentoId, nomeEstabelecimento, onNavegar, permissoes = null, isMerchant = true }) {
  const pode = (p) => isMerchant || !permissoes || permissoes.includes(p);
  const SEM_PERM = 'Sem permissão — contate o administrador';
  const [termoBusca,      setTermoBusca]      = useState('');
  const [imagemExpandida, setImagemExpandida] = useState(null);

  useEffect(() => {
    if (!imagemExpandida) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') setImagemExpandida(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imagemExpandida]);

  const [resultados,      setResultados]      = useState([]);
  const [carrinho,        setCarrinho]        = useState([]);
  const [total,           setTotal]           = useState(0);
  const [loadingBusca,    setLoadingBusca]    = useState(false);
  const [loadingVenda,    setLoadingVenda]    = useState(false);
  const [vendaStatus,     setVendaStatus]     = useState(null);
  const [telaCheia,       setTelaCheia]       = useState(false);
  const [fontScale,       setFontScale]       = useState(() => {
    const saved = localStorage.getItem('pdv-font-scale');
    return saved ? parseFloat(saved) : 1;
  });
  const [buscaIndex,      setBuscaIndex]      = useState(-1);
  const [itemQuantificar, setItemQuantificar] = useState(null);
  // Produto com tem_variacoes=true selecionado — precisa escolher qual
  // variação (tamanho/cor) antes de ir pro modal de quantidade de sempre.
  const [itemEscolherVariacao, setItemEscolherVariacao] = useState(null);
  const [variacaoIndex,        setVariacaoIndex]        = useState(0);
  const variacaoModalRef = useRef(null);
  const [inputQtd,        setInputQtd]        = useState('1');
  const [editIndex,       setEditIndex]       = useState(null);
  const [showPagamento,   setShowPagamento]   = useState(false);
  const [vendaFinalizada, setVendaFinalizada] = useState(null);
  const [showCamera,      setShowCamera]      = useState(false);
  const [confirmSaida,    setConfirmSaida]    = useState(false);  // confirmação de saída com carrinho cheio
  const [confirmRemover,  setConfirmRemover]  = useState(null);   // idx do item a remover
  const [modalPeso,       setModalPeso]       = useState(null);   // { produto } — peso manual de pesável
  const [pixConfig,       setPixConfig]       = useState({ modo: 'maquininha', disponivel: false });

  useEffect(() => {
    if (!estabelecimentoId) return;
    (async () => {
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`);
        if (resp.ok) {
          const d = await resp.json();
          setPixConfig({
            modo: d.pix_modo || 'maquininha',
            disponivel: !!(d.pix_chave && d.pix_cidade),
          });
        }
      } catch { /* Pix pela maquininha continua funcionando mesmo se isso falhar */ }
    })();
  }, [estabelecimentoId]);

  const inputBuscaRef   = useRef(null);
  const inputQtdRef     = useRef(null);
  const btnFinalizarRef = useRef(null);
  const resultadosRef   = useRef(null);

  // ── Bipador USB: detecção por timing ─────────────────────
  // O bipador digita tudo muito rápido (< 50ms por tecla).
  // Acumulamos as teclas; se o intervalo médio for de bipador
  // e o comprimento mínimo for atingido, disparamos a busca.
  const barcodeBufferRef    = useRef('');
  const barcodeLastTimeRef  = useRef(0);
  const barcodeTimerRef     = useRef(null);

  const BARCODE_MAX_INTERVAL = 50;   // ms máximo entre teclas de bipador
  const BARCODE_MIN_LENGTH   = 6;    // mínimo de chars para considerar código
  const BARCODE_FLUSH_DELAY  = 100;  // ms de silêncio antes de disparar

  const dispararBuscaBipador = useCallback((codigo) => {
    if (!codigo || codigo.length < BARCODE_MIN_LENGTH) return;
    // Segunda camada de proteção: se já tem modal de quantidade/peso ou
    // tela de pagamento aberta, ignora qualquer disparo de busca —
    // evita reabrir o modal por causa de um timer/leitura fantasma
    if (itemQuantificar || modalPeso || showPagamento) return;
    buscarProdutosPorCodigo(codigo.trim());
  }, [estabelecimentoId, itemQuantificar, modalPeso, showPagamento]);

  function handleBuscaKeyDown(e) {
    const agora = Date.now();
    const intervalo = agora - barcodeLastTimeRef.current;
    barcodeLastTimeRef.current = agora;

    // Teclas de navegação da lista — passa direto para o handler normal
    if (e.key === 'ArrowDown') { e.preventDefault(); setBuscaIndex(p => Math.min(p + 1, resultados.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setBuscaIndex(p => Math.max(p - 1, 0)); return; }
    if (e.key === 'Escape')    { setTermoBusca(''); setResultados([]); setBuscaIndex(-1); barcodeBufferRef.current = ''; return; }

    // Enter: pode vir do bipador (finaliza sequência) ou do usuário
    if (e.key === 'Enter') {
      e.preventDefault();
      const buffer = barcodeBufferRef.current;
      // Sempre cancela o timer de flush pendente — evita que ele dispare
      // "fantasma" mais tarde (ex: reabrindo o modal de quantidade sozinho)
      clearTimeout(barcodeTimerRef.current);
      if (buffer.length >= BARCODE_MIN_LENGTH && intervalo < BARCODE_MAX_INTERVAL * 3) {
        // Enter vindo do bipador logo após uma sequência rápida
        barcodeBufferRef.current = '';
        dispararBuscaBipador(buffer);
      } else {
        // Enter normal do usuário
        barcodeBufferRef.current = '';
        if (buscaIndex > -1 && resultados[buscaIndex]) selecionarProduto(resultados[buscaIndex]);
        else if (!termoBusca.trim() && carrinho.length > 0) btnFinalizarRef.current?.focus();
      }
      return;
    }

    // Caracteres imprimíveis — verificar se é sequência de bipador
    if (e.key.length === 1) {
      if (intervalo < BARCODE_MAX_INTERVAL) {
        // Rápido demais para digitação humana → acumular no buffer do bipador
        barcodeBufferRef.current += e.key;

        // Cancelar timer anterior e reagendar
        clearTimeout(barcodeTimerRef.current);
        barcodeTimerRef.current = setTimeout(() => {
          const codigo = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          dispararBuscaBipador(codigo);
        }, BARCODE_FLUSH_DELAY);
      } else {
        // Intervalo longo = digitação humana normal; limpar buffer de bipador
        barcodeBufferRef.current = e.key;
      }
    }
  }

  // ── Busca por código de barras exato ─────────────────────
  async function buscarProdutosPorCodigo(codigo) {
    if (!estabelecimentoId) return;
    // Mesma proteção aqui — essa função também é chamada direto pela câmera
    if (itemQuantificar || modalPeso || showPagamento) return;

    // ── Interceptar EAN-13 pesável (prefixo "2") ──────────
    const pesavel = decodificarEAN13Pesavel(codigo);
    if (pesavel) {
      setLoadingBusca(true);
      try {
        const resp = await apiFetch(
          `/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(pesavel.codigoInterno)}`
        );
        if (!resp.ok) throw new Error();
        const data = await resp.json();
        const produto = data[0];
        if (!produto) {
          mostrarStatus('erro', `Código pesável "${pesavel.codigoInterno}" não encontrado.`);
          limparBusca(); return;
        }
        // Adiciona direto ao carrinho com o peso da etiqueta
        adicionarProdutoPesavel(produto, pesavel.pesoKg, 'etiqueta');
      } catch {
        mostrarStatus('erro', 'Erro ao buscar produto pesável.');
      } finally {
        setLoadingBusca(false);
        limparBusca();
      }
      return;
    }
    // ─────────────────────────────────────────────────────
    setTermoBusca(codigo);
    setLoadingBusca(true);
    setBuscaIndex(-1);
    try {
      const resp = await apiFetch(
        `/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(codigo)}`
      );
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setResultados(data);

      // Se retornar exatamente 1 produto, selecionar automaticamente
      if (data.length === 1) {
        setTimeout(() => {
          selecionarProduto(data[0]);
        }, 120);
      } else if (data.length > 1) {
        setBuscaIndex(0);
      } else {
        mostrarStatus('erro', `Código "${codigo}" não encontrado.`);
        limparBusca();
      }
    } catch {
      setResultados([]);
      mostrarStatus('erro', 'Erro ao buscar produto por código.');
    } finally {
      setLoadingBusca(false);
    }
  }

  // ── Callback do modal de câmera ───────────────────────────
  function handleCodigoDetectado(codigo) {
    setShowCamera(false);
    buscarProdutosPorCodigo(codigo);
  }

  useEffect(() => {
    if (!showPagamento && !itemQuantificar && !itemEscolherVariacao && editIndex === null && !showCamera && !modalPeso) {
      inputBuscaRef.current?.focus();
    }
  }, [showPagamento, itemQuantificar, itemEscolherVariacao, editIndex, showCamera, modalPeso]);

  // Atalhos globais do PDV
  useEffect(() => {
    function handleGlobalKey(e) {
      if (e.key === 'Escape') {
        if (confirmRemover !== null) { setConfirmRemover(null); return; }
        if (confirmSaida)            { setConfirmSaida(false);  return; }
        if (modalPeso)               { setModalPeso(null);      return; }
      }
      if ((e.key === 'F10' || e.key === 'F2') && !showPagamento && !itemQuantificar && !itemEscolherVariacao && !showCamera && !modalPeso && carrinho.length > 0) {
        e.preventDefault();
        setShowPagamento(true);
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        setTelaCheia(p => !p);
        return;
      }
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [showPagamento, itemQuantificar, showCamera, carrinho]);

  // Confirmação ao fechar aba/navegar com carrinho cheio
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (carrinho.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [carrinho]);

  // Expõe interceptor de navegação para o painel pai
  // O pai registra uma função; o PDV a preenche com o interceptor atual
  const navegacaoPendenteRef = React.useRef(null);

  useEffect(() => {
    if (!onNavegar) return;
    onNavegar((abaDestino) => {
      if (carrinho.length === 0) return true;  // carrinho vazio — pode navegar
      navegacaoPendenteRef.current = abaDestino;
      setConfirmSaida(true);
      return false; // bloquear — modal decide
    });
  }, [onNavegar, carrinho]);

  useEffect(() => {
    if (itemQuantificar) {
      setTimeout(() => {
        inputQtdRef.current?.focus();
        inputQtdRef.current?.select();
      }, 50);
    }
  }, [itemQuantificar]);

  useEffect(() => {
    setTotal(carrinho.reduce((acc, item) => acc + parseFloat(item.preco_venda) * item.quantidade, 0));
  }, [carrinho]);

  useEffect(() => {
    if (buscaIndex < 0 || !resultadosRef.current) return;
    resultadosRef.current.children[buscaIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [buscaIndex]);

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('pdv-font-scale', next);
      return next;
    });
  }

  async function buscarProdutos(termo) {
    setTermoBusca(termo);
    setBuscaIndex(-1);
    if (!estabelecimentoId || termo.length < 2) { setResultados([]); return; }
    setLoadingBusca(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`);
      if (!resp.ok) throw new Error();
      const data = await resp.json();
      setResultados(data);
      if (data.length > 0) setBuscaIndex(0);
    } catch { setResultados([]); }
    finally { setLoadingBusca(false); }
  }

  function selecionarProduto(produto) {
    const estoque = parseFloat(produto.estoque_atual);
    if (estoque <= 0) { mostrarStatus('erro', `"${produto.nome}" sem estoque!`); limparBusca(); return; }

    // ── Produto com variações (tamanho/cor) → escolhe a variação antes
    // de tudo. O estoque "geral" do produto é só a soma — a checagem de
    // verdade acontece por variação, lá na hora de definir a quantidade.
    if (produto.tem_variacoes) {
      const comEstoque = (produto.variacoes || []).filter(v => parseFloat(v.estoque_atual) > 0);
      if (comEstoque.length === 0) {
        mostrarStatus('erro', `"${produto.nome}" sem estoque em nenhuma variação!`);
        limparBusca(); return;
      }

      // Bipou o código de barras de UMA variação específica (etiqueta
      // própria colada na peça) → já sabe qual é tamanho/cor, não
      // precisa perguntar de novo, vai direto pra quantidade
      if (produto.variacao_bipada_id) {
        const variacaoBipada = comEstoque.find(v => v.id === produto.variacao_bipada_id);
        if (variacaoBipada) {
          limparBusca();
          escolherVariacao(variacaoBipada, produto);
          return;
        }
        // Achou o id mas ela tá sem estoque agora — cai pro seletor normal abaixo
      }

      limparBusca();
      setItemEscolherVariacao({ ...produto, variacoes: comEstoque });
      setVariacaoIndex(0);
      return;
    }
    // ─────────────────────────────────────────────────────────

    // ── Produto pesável selecionado manualmente → pedir peso ──
    if (produto.vendido_por_peso || produto.unidade_medida === 'kg') {
      limparBusca();
      if (produto.vendido_por_peso) {
        // Abre modal de peso manual (sem etiqueta de balança)
        setModalPeso({ produto });
        return;
      }
      // kg normal (granel sem balança). 17/09: vinha pré-preenchido com
      // "1.000" (1kg de verdade, não só um placeholder) — mesmo com o
      // texto selecionado ao abrir o modal (então digitar por cima
      // funciona), bastava um Enter/clique apressado no "Adicionar" pra
      // vender 1kg de queijo/frios em vez do peso real da peça. Mesma
      // regra já usada nos formulários de cadastro: nunca pré-preencher
      // campo numérico com valor real, só com placeholder.
      setInputQtd('');
      setItemQuantificar(produto);
      setEditIndex(null);
      return;
    }
    // ─────────────────────────────────────────────────────────

    const qtdNoCarrinho = carrinho.filter(i => i.id === produto.id && i.produto_variacao_id === produto.produto_variacao_id).reduce((acc, i) => acc + i.quantidade, 0);
    if (produto.unidade_medida !== 'kg' && qtdNoCarrinho + 1 > estoque) {
      mostrarStatus('erro', `Estoque máximo de "${produto.nome}" (${estoque} un.) atingido.`);
      limparBusca(); return;
    }
    setInputQtd(produto.unidade_medida === 'kg' ? '' : '1');
    setItemQuantificar(produto);
    setEditIndex(null);
    limparBusca();
  }

  function limparBusca() {
    setTermoBusca(''); setResultados([]); setBuscaIndex(-1);
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  // Variação escolhida → segue pro modal de quantidade de sempre, só que
  // com um "produto" sintético carregando os dados DA VARIAÇÃO (estoque,
  // preço se tiver um específico, e o id da variação pra ir junto na venda).
  function escolherVariacao(variacao, baseOverride = null) {
    const base = baseOverride || itemEscolherVariacao;
    const nomeComVariacao = base.nome + (variacao.tamanho || variacao.cor || variacao.genero
      ? ` (${[variacao.tamanho, variacao.cor, variacao.genero].filter(Boolean).join(' ')})`
      : '');
    const produtoComVariacao = {
      ...base,
      produto_variacao_id: variacao.id,
      estoque_atual: variacao.estoque_atual,
      preco_venda:   variacao.preco_venda != null ? variacao.preco_venda : base.preco_venda,
      nome: nomeComVariacao,
    };
    setItemEscolherVariacao(null);
    setInputQtd(produtoComVariacao.unidade_medida === 'kg' ? '' : '1');
    setItemQuantificar(produtoComVariacao);
    setEditIndex(null);
  }

  function fecharSeletorVariacao() {
    setItemEscolherVariacao(null);
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  function handleVariacaoKey(e) {
    const n = itemEscolherVariacao?.variacoes.length || 0;
    if (e.key === 'ArrowDown') { e.preventDefault(); setVariacaoIndex(p => (p + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setVariacaoIndex(p => (p - 1 + n) % n); }
    else if (e.key === 'Enter') { e.preventDefault(); escolherVariacao(itemEscolherVariacao.variacoes[variacaoIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharSeletorVariacao(); }
  }

  useEffect(() => {
    if (itemEscolherVariacao) setTimeout(() => variacaoModalRef.current?.focus(), 0);
  }, [itemEscolherVariacao]);

  function confirmarQuantidade(e) {
    e?.preventDefault();
    const produto = itemQuantificar;
    const qtd     = paraFloatBR(inputQtd) || 0;
    // 17/09: fechava o modal em silêncio quando o campo estava vazio/zerado
    // (sem feedback nenhum) — inofensivo enquanto o campo vinha pré-preenchido
    // com "1", mas depois do fix acima (peso em kg some sem pré-preencher, de
    // propósito) um Enter sem digitar nada precisa avisar, não só desistir
    // calado — senão parece que o item "sumiu" sem explicação nenhuma.
    if (qtd <= 0) {
      mostrarStatus('erro', itemQuantificar.unidade_medida === 'kg' ? 'Informe o peso antes de adicionar.' : 'Informe a quantidade antes de adicionar.');
      return;
    }
    const estoque = parseFloat(produto.estoque_atual);
    if (editIndex !== null) {
      const outrasQtds = carrinho.filter((item, idx) => item.id === produto.id && item.produto_variacao_id === produto.produto_variacao_id && idx !== editIndex).reduce((acc, i) => acc + i.quantidade, 0);
      if (outrasQtds + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${produto.unidade_medida}`); return; }
      const novo = [...carrinho]; novo[editIndex] = { ...produto, quantidade: qtd }; setCarrinho(novo);
    } else {
      const qtdJa = carrinho.filter(i => i.id === produto.id && i.produto_variacao_id === produto.produto_variacao_id).reduce((acc, i) => acc + i.quantidade, 0);
      if (qtdJa + qtd > estoque) { mostrarStatus('erro', `Estoque máximo: ${estoque.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${produto.unidade_medida}`); return; }
      setCarrinho(prev => [...prev, { ...produto, quantidade: qtd }]);
    }
    fecharModalQtd();
  }

  function fecharModalQtd() {
    setItemQuantificar(null); setEditIndex(null); setInputQtd('1');
    setTimeout(() => inputBuscaRef.current?.focus(), 0);
  }

  // ── Adicionar produto pesável ao carrinho ─────────────────
  // pesoKg: peso em kg | origem: 'etiqueta' | 'manual'
  function adicionarProdutoPesavel(produto, pesoKg, origem = 'etiqueta') {
    setCarrinho(prev => [
      ...prev,
      {
        ...produto,
        quantidade:    pesoKg,
        pesavel:       true,
        origem_peso:   origem,
      },
    ]);
    mostrarStatus('sucesso', `✓ ${produto.nome} — ${fmtPeso(pesoKg)} adicionado`);
  }

  function editarItem(item, idx) {
    setInputQtd(item.unidade_medida === 'kg' ? parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : String(parseFloat(item.quantidade)));
    setItemQuantificar(item); setEditIndex(idx);
  }

  function removerItem(idx) { setConfirmRemover(idx); }

  async function finalizarVenda(meioPagamento, clienteId, dadosPagamento) {
    setLoadingVenda(true); setVendaStatus(null);
    try {
      const resp = await apiFetch(`/api/vendas/finalizar`, {
        method: 'POST',
        body: JSON.stringify({
          estabelecimentoId, valor_total: total, meio_pagamento: meioPagamento,
          carrinho: carrinho.map((i, idx) => ({
            produto_id: i.id,
            produto_variacao_id: i.produto_variacao_id || null,
            quantidade: parseFloat(i.quantidade),
            valor_unitario: parseFloat(i.preco_venda),
            // Pagamento dividido, Fase 2 (backlog item 19) — índice
            // (0-based) da fatia de `pagamentos` que ficou com esse item,
            // só quando a divisão foi feita por item. Item sem dono único
            // (não atribuído, ou que caiu no resto dividido/rateado) não
            // manda essa chave — a RPC trata como "sem fatia própria".
            ...(dadosPagamento?.itensPagamentoIndex?.[idx] != null
                  ? { pagamento_index: dadosPagamento.itensPagamentoIndex[idx] }
                  : {}),
          })),
          clienteId,
          cpfNota: dadosPagamento?.cpfNota || null,
          // Pagamento dividido entre várias pessoas (backlog item 19) — só
          // vai quando meioPagamento === 'Dividido'; em qualquer outra forma
          // fica undefined e o corpo da requisição nem inclui a chave.
          pagamentos: dadosPagamento?.pagamentos || undefined,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error?.includes('check constraint') ? 'Falha de estoque. Verifique as quantidades.' : result.error || 'Erro no servidor.');

      setVendaFinalizada({
        itens:         carrinho,
        total,
        meioPagamento,
        clienteId,
        clienteNome:   dadosPagamento?.clienteNome || null,
        cpfNota:       dadosPagamento?.cpfNota || null,
        valorRecebido: dadosPagamento?.valorRecebido || null,
        troco:         dadosPagamento?.troco || 0,
        pagamentos:    dadosPagamento?.pagamentos || null,
        // Fase 2 — mesmo array de índices usado no payload, guardado
        // aqui pro ModalPosVenda mostrar quais itens foram de cada
        // pessoa sem precisar de nenhuma requisição extra.
        itensPagamentoIndex: dadosPagamento?.itensPagamentoIndex || null,
        horario:       new Date(),
      });

      setCarrinho([]);
      setShowPagamento(false);
    } catch (err) {
      mostrarStatus('erro', `Falha: ${err.message}`); setShowPagamento(false);
    } finally { setLoadingVenda(false); }
  }

  function mostrarStatus(tipo, msg) { setVendaStatus({ tipo, msg }); setTimeout(() => setVendaStatus(null), 4000); }

  function estoqueClass(p) {
    const e = parseFloat(p.estoque_atual), m = parseFloat(p.estoque_minimo);
    if (e <= 0) return 'critico'; if (e <= m) return 'baixo'; return '';
  }

  function estoqueLabel(p) {
    const e = parseFloat(p.estoque_atual);
    return p.unidade_medida === 'kg' ? `${e.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg` : `${Math.trunc(e)} un`;
  }

  return (
    <div className={`pdv-container${telaCheia ? ' pdv-tela-cheia' : ''}`}>
      {/* Modal de câmera */}
      {showCamera && (
        <ModalCamera
          onCodigoDetectado={handleCodigoDetectado}
          onFechar={() => setShowCamera(false)}
        />
      )}

      {/* Modal confirmação — sair com carrinho cheio */}
      {confirmSaida && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal pdv-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="pdv-confirm-icone">🛒</div>
            <div className="pdv-confirm-titulo">Carrinho não finalizado</div>
            <div className="pdv-confirm-desc">
              Você tem <strong>{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</strong> no carrinho ({fmt(total)}).
              <br />Se sair agora, o carrinho será perdido.
            </div>
            <div className="pdv-modal-acoes">
              <button
                className="pdv-modal-btn-cancelar"
                onClick={() => setConfirmSaida(false)}
              >
                Voltar ao PDV
              </button>
              <button
                className="pdv-modal-btn-confirmar pdv-modal-btn-danger"
                onClick={() => {
                  setConfirmSaida(false);
                  setCarrinho([]);
                  // Retomar a navegação bloqueada
                  if (navegacaoPendenteRef.current && onNavegar) {
                    const aba = navegacaoPendenteRef.current;
                    navegacaoPendenteRef.current = null;
                    // Re-registrar interceptor com carrinho vazio antes de navegar
                    onNavegar(() => true);
                    // Disparar a troca de aba via evento customizado
                    window.dispatchEvent(new CustomEvent('pdv-navegar', { detail: aba }));
                  }
                }}
              >
                Sair e descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmação — remover item do carrinho */}
      {confirmRemover !== null && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal pdv-modal-confirm" onClick={e => e.stopPropagation()}>
            <div className="pdv-confirm-icone">🗑️</div>
            <div className="pdv-confirm-titulo">Remover item?</div>
            <div className="pdv-confirm-desc">
              <strong>{carrinho[confirmRemover]?.nome}</strong>
              {carrinho[confirmRemover]?.marca && <span> · {carrinho[confirmRemover].marca}</span>}
              <br />será removido do carrinho.
            </div>
            <div className="pdv-modal-acoes">
              <button
                className="pdv-modal-btn-cancelar"
                onClick={() => setConfirmRemover(null)}
              >
                Cancelar (Esc)
              </button>
              <button
                className="pdv-modal-btn-confirmar pdv-modal-btn-danger"
                onClick={() => {
                  setCarrinho(prev => prev.filter((_, i) => i !== confirmRemover));
                  setConfirmRemover(null);
                }}
              >
                ✕ Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de escolher variação (tamanho/cor) */}
      {itemEscolherVariacao && (
        <div className="pdv-modal-overlay" onClick={fecharSeletorVariacao}>
          <div
            className="pdv-modal"
            ref={variacaoModalRef}
            tabIndex={-1}
            onClick={e => e.stopPropagation()}
            onKeyDown={handleVariacaoKey}
          >
            <div className="pdv-modal-qtd-titulo">🎨 Escolha a variação</div>
            <div className="pdv-modal-qtd-produto">
              {itemEscolherVariacao.nome}
              {itemEscolherVariacao.marca && <span className="pdv-modal-qtd-marca"> · {itemEscolherVariacao.marca}</span>}
            </div>
            <span className="pdv-pagamento-label">Tamanho / Cor  ↑ ↓ Enter</span>
            <ul className="pdv-meios-lista">
              {itemEscolherVariacao.variacoes.map((v, i) => {
                const precoVar = v.preco_venda != null ? v.preco_venda : itemEscolherVariacao.preco_venda;
                const estoqueVar = parseFloat(v.estoque_atual);
                return (
                  <li
                    key={v.id}
                    className={`pdv-meio-item${variacaoIndex === i ? ' ativo' : ''}`}
                    onClick={() => escolherVariacao(v)}
                  >
                    <span style={{ flex: 1 }}>
                      {[v.tamanho, v.cor, v.genero].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className="pdv-label-hint" style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                      {fmt(precoVar)} · {estoqueVar.toLocaleString('pt-BR', itemEscolherVariacao.unidade_medida === 'kg' ? { minimumFractionDigits: 3 } : {})} {itemEscolherVariacao.unidade_medida}
                    </span>
                    {variacaoIndex === i && <span className="pdv-meio-enter">↩ Enter</span>}
                  </li>
                );
              })}
            </ul>
            <div className="pdv-modal-acoes">
              <button type="button" className="pdv-modal-btn-cancelar" onClick={fecharSeletorVariacao}>Cancelar (Esc)</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de quantidade */}
      {itemQuantificar && (
        <div className="pdv-modal-overlay">
          <div className="pdv-modal" onClick={e => e.stopPropagation()}>
            <div className="pdv-modal-qtd-titulo">{editIndex !== null ? '✏️ Editar item' : '➕ Adicionar item'}</div>
            <div className="pdv-modal-qtd-produto">{itemQuantificar.nome}{itemQuantificar.marca && <span className="pdv-modal-qtd-marca"> · {itemQuantificar.marca}</span>}{' — '}<strong>{fmt(itemQuantificar.preco_venda)}</strong>{' / '}{itemQuantificar.unidade_medida}</div>
            <form onSubmit={confirmarQuantidade}>
              <label className="pdv-modal-qtd-label">{itemQuantificar.unidade_medida === 'kg' ? 'Peso (kg)' : 'Quantidade (un)'}</label>
              <input maxLength={15}
                ref={inputQtdRef}
                className="pdv-modal-qtd-input"
                type={itemQuantificar.unidade_medida === 'kg' ? 'text' : 'number'}
                inputMode={itemQuantificar.unidade_medida === 'kg' ? 'decimal' : undefined}
                step={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'}
                min={itemQuantificar.unidade_medida === 'kg' ? '0.001' : '1'}
                placeholder={itemQuantificar.unidade_medida === 'kg' ? '0,000' : undefined}
                value={inputQtd}
                onChange={e => setInputQtd(itemQuantificar.unidade_medida === 'kg' ? digitarPesoMascarado(e.target.value) : e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fecharModalQtd(); } }}
              />
              <div className="pdv-modal-acoes">
                <button type="button" className="pdv-modal-btn-cancelar" onClick={fecharModalQtd}>Cancelar (Esc)</button>
                <button type="submit" className="pdv-modal-btn-confirmar">{editIndex !== null ? '✓ Atualizar (Enter)' : '✓ Adicionar (Enter)'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPagamento && <PagamentoModal total={total} onCancelar={() => setShowPagamento(false)} onFinalizar={finalizarVenda} loading={loadingVenda} podeUsarFiado={pode('pdv_fiado')} estabelecimentoId={estabelecimentoId} pixConfig={pixConfig} carrinho={carrinho} />}

      {vendaFinalizada && (
        <ModalPosVenda
          venda={vendaFinalizada}
          nomeEstabelecimento={nomeEstabelecimento}
          onFechar={() => {
            setVendaFinalizada(null);
            mostrarStatus('sucesso', `✓ Venda de ${fmt(vendaFinalizada.total)} registrada!`);
          }}
        />
      )}

      {/* ── Modal de peso manual (produto pesável sem etiqueta) ── */}
      {modalPeso && (
        <ModalPesoManual
          produto={modalPeso.produto}
          onConfirmar={(pesoKg) => {
            adicionarProdutoPesavel(modalPeso.produto, pesoKg, 'manual');
            setModalPeso(null);
            setTimeout(() => inputBuscaRef.current?.focus(), 0);
          }}
          onCancelar={() => {
            setModalPeso(null);
            setTimeout(() => inputBuscaRef.current?.focus(), 0);
          }}
        />
      )}

      {/* Banner permissão limitada */}
      {!isMerchant && permissoes && !pode('pdv_realizar_venda') && (
        <div className="mod-aviso-permissao mod-aviso-pdv">
          🔒 Visualização limitada — finalização de vendas não está disponível para o seu perfil.
        </div>
      )}

      <div className="pdv-busca">
        <div className="pdv-busca-row">
          <input maxLength={100}
            ref={inputBuscaRef}
            className="pdv-busca-input"
            type="text"
            placeholder="🔍  Nome ou código de barras… (↑ ↓ Enter)"
            value={termoBusca}
            onChange={e => buscarProdutos(e.target.value)}
            onKeyDown={handleBuscaKeyDown}
            disabled={loadingVenda}
            autoComplete="off"
          />
          <button
            className="pdv-btn-camera pdv-btn-camera--desktop-only"
            onClick={() => setShowCamera(true)}
            disabled={loadingVenda}
            title="Ler código de barras pela câmera"
            type="button"
          >
            📷
          </button>
        </div>
        <ul className="pdv-resultados" ref={resultadosRef}>
          {loadingBusca && <li className="pdv-resultados-status"><span>⏳</span>Buscando…</li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length > 1 && <li className="pdv-resultados-status"><span>🔍</span>Nenhum produto encontrado para<br /><strong>"{termoBusca}"</strong></li>}
          {!loadingBusca && resultados.length === 0 && termoBusca.length <= 1 && <li className="pdv-resultados-status"><span>🛒</span>Digite o nome ou código do produto</li>}
          {resultados.map((p, i) => (
            <li key={p.id} className={`pdv-produto-card${buscaIndex === i ? ' selecionado' : ''}`} onClick={() => selecionarProduto(p)} onMouseEnter={() => setBuscaIndex(i)}>
              <div className="pdv-card-imagem">
                <ImagemProduto url={p.imagem_url} iconeClassName="pdv-card-imagem-placeholder" onExpandir={setImagemExpandida} />
              </div>
              <span className="pdv-card-nome">{p.nome}{p.marca ? <span className="pdv-card-marca"> — {p.marca}</span> : ''}</span>
              <span className="pdv-card-preco">{fmt(p.preco_venda)}</span>
              <span className={`pdv-card-estoque ${estoqueClass(p)}`}>{estoqueLabel(p)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pdv-carrinho" style={{ '--pdv-font-scale': fontScale }}>
        <div className="pdv-carrinho-header">
          <span className="pdv-carrinho-titulo">Resumo da Venda</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {carrinho.length > 0 && <span className="pdv-carrinho-count">{carrinho.length} {carrinho.length === 1 ? 'item' : 'itens'}</span>}
            <button
              className="pdv-zoom-btn"
              onClick={() => changeFontScale(-0.1)}
              disabled={fontScale <= 0.8}
              title="Diminuir fonte"
            >A−</button>
            <button
              className="pdv-zoom-btn"
              onClick={() => changeFontScale(0.1)}
              disabled={fontScale >= 1.6}
              title="Aumentar fonte"
            >A+</button>
            <button
              className="pdv-zoom-btn pdv-btn-tela-cheia"
              onClick={() => setTelaCheia(p => !p)}
              title={telaCheia ? 'Sair da tela cheia (F11)' : 'Tela cheia (F11)'}
            >{telaCheia ? '⊠ Sair' : '⊞ Tela Cheia'}</button>
          </div>
        </div>
        {vendaStatus && <div className={`pdv-status ${vendaStatus.tipo}`}>{vendaStatus.msg}</div>}
        <ul className="pdv-carrinho-lista">
          {carrinho.length === 0 ? (
            <li className="pdv-carrinho-vazio"><span className="pdv-carrinho-vazio-icon">🛒</span><p>Carrinho vazio</p><small>Busque e selecione produtos ao lado</small></li>
          ) : (
            carrinho.map((item, idx) => (
              <li key={`${item.id}-${idx}`} className={`pdv-item${item.pesavel ? ' pdv-item-pesavel' : ''}`}>
                <div className="pdv-item-imagem">
                  <ImagemProduto url={item.imagem_url} iconeClassName="pdv-item-imagem-placeholder" onExpandir={setImagemExpandida} />
                </div>
                <div className="pdv-item-info" onClick={() => !item.pesavel && editarItem(item, idx)}>
                  <span className="pdv-item-nome">
                    {item.nome}{item.marca ? <span className="pdv-item-marca"> · {item.marca}</span> : ''}
                    {item.pesavel && (
                      <span className="pdv-item-badge-pesavel">
                        {item.origem_peso === 'etiqueta' ? '⚖️ etiqueta' : '⚖️ manual'}
                      </span>
                    )}
                  </span>
                  <span className="pdv-item-qtde">
                    {item.pesavel
                      ? `${fmtPeso(item.quantidade)} @ ${fmt(item.preco_venda)}/kg`
                      : item.unidade_medida === 'kg'
                        ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg @ ${fmt(item.preco_venda)}`
                        : `${parseFloat(item.quantidade).toFixed(0)} un @ ${fmt(item.preco_venda)}`
                    }
                  </span>
                </div>
                <span className="pdv-item-total">{fmt(item.preco_venda * item.quantidade)}</span>
                <button className="pdv-item-remover" onClick={() => removerItem(idx)}>×</button>
              </li>
            ))
          )}
        </ul>
        <div className="pdv-footer">
          <div className="pdv-total">
            <span className="pdv-total-label">Total</span>
            <span className="pdv-total-valor">{fmt(total)}</span>
          </div>
          <button
            ref={btnFinalizarRef}
            type="button"
            className="pdv-btn-finalizar"
            onClick={() => setShowPagamento(true)}
            disabled={carrinho.length === 0 || loadingVenda || !pode('pdv_realizar_venda')}
            title={!pode('pdv_realizar_venda') ? SEM_PERM : 'F10 ou F2'}
          >
            {loadingVenda ? '⏳ Processando…' : `✓ Finalizar Venda${carrinho.length > 0 ? ' (F10)' : ''}`}
          </button>
        </div>
      </div>

      {imagemExpandida && (
        <div className="pdv-lightbox-overlay" onClick={() => setImagemExpandida(null)}>
          <button className="pdv-lightbox-fechar" onClick={() => setImagemExpandida(null)}>✕</button>
          <img src={imagemExpandida} alt="" className="pdv-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL DE PESO MANUAL
   Abre quando produto pesável é selecionado sem etiqueta de balança
   ════════════════════════════════════════════════════════════ */
function ModalPesoManual({ produto, onConfirmar, onCancelar }) {
  const [unidade,    setUnidade]    = useState('kg');
  const [valorPeso,  setValorPeso]  = useState('');
  const [erro,       setErro]       = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancelar(); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancelar]);

  const pesoKg = (() => {
    const v = paraFloatBR(valorPeso);
    if (isNaN(v) || v <= 0) return 0;
    return unidade === 'g' ? v / 1000 : v;
  })();

  const totalPreview = pesoKg > 0 ? produto.preco_venda * pesoKg : 0;

  function confirmar(e) {
    e?.preventDefault();
    if (pesoKg <= 0) { setErro('Informe um peso válido maior que zero.'); return; }
    onConfirmar(pesoKg);
  }

  return (
    <div className="pdv-modal-overlay">
      <div className="pdv-modal pdv-modal-peso" onClick={e => e.stopPropagation()}>
        <div className="pdv-modal-titulo">⚖️ Informar Peso</div>

        <div className="pdv-peso-produto">
          <strong>{produto.nome}</strong>
          {produto.marca && <span className="pdv-item-marca"> · {produto.marca}</span>}
        </div>
        <div className="pdv-peso-preco-ref">
          {fmt(produto.preco_venda)} / kg
        </div>

        {/* Toggle kg / g */}
        <div className="pdv-peso-unidade-toggle">
          {['kg', 'g'].map(u => (
            <button
              key={u}
              type="button"
              className={`pdv-peso-unidade-btn${unidade === u ? ' ativo' : ''}`}
              onClick={() => { setUnidade(u); setValorPeso(''); setErro(''); setTimeout(() => inputRef.current?.focus(), 0); }}
            >
              {u}
            </button>
          ))}
        </div>

        <form onSubmit={confirmar}>
          <label className="pdv-modal-qtd-label">Peso ({unidade})</label>
          <input maxLength={15}
            ref={inputRef}
            className="pdv-modal-qtd-input pdv-peso-input-grande"
            type="text"
            inputMode="decimal"
            value={valorPeso}
            onChange={e => {
              const novo = unidade === 'kg'
                ? digitarPesoMascarado(e.target.value)
                : e.target.value.replace(/\D/g, ''); // gramas: só dígitos, sem casa decimal
              setValorPeso(novo);
              setErro("");
            }}
            placeholder={unidade === "kg" ? "Ex: 1,350" : "Ex: 1350"}
          />
          {erro && <div className="pdv-peso-erro">⚠️ {erro}</div>}

          {/* Preview do total */}
          {pesoKg > 0 && (
            <div className="pdv-peso-preview">
              <span>{fmtPeso(pesoKg)}</span>
              <span>×</span>
              <span>{fmt(produto.preco_venda)}/kg</span>
              <span>=</span>
              <strong>{fmt(totalPreview)}</strong>
            </div>
          )}

          <div className="pdv-modal-acoes">
            <button type="button" className="pdv-modal-btn-cancelar" onClick={onCancelar}>
              Cancelar (Esc)
            </button>
            <button type="submit" className="pdv-modal-btn-confirmar" disabled={pesoKg <= 0}>
              ✓ Adicionar (Enter)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}