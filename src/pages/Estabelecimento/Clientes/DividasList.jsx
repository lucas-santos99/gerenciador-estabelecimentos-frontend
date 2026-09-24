// src/pages/Estabelecimento/Clientes/DividasList.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import { useAvisosEstabelecimento } from '../../../utils/realtimeEstab';
import ClienteModal from './ClienteModal';
import ModalRecebimento, { fmtDataHora } from './ModalRecebimento';
import '../Clientes.css';
import * as XLSX from 'xlsx';
import { htmlIdentidade, salvarExcelIdentidade } from '../../../utils/relatorioIdentidade';
import { TIMEZONE_PADRAO, hojeStrTZ, paraDataStrTZ, subtrairDias } from '../../../utils/fusoHorario';


/* ── Helpers ───────────────────────────────────────────────── */
const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Rótulo curto por forma de pagamento — mesmo dicionário usado no PDV
// (ModalPosVenda) e em Relatorios.jsx, pra manter consistência visual
// entre recibo e telas de histórico/relatório.
const meioLabelCurto = {
  Dinheiro: '💵 Dinheiro', Pix: '📱 Pix', Debito: '💳 Débito', Credito: '💳 Crédito', Fiado: '📋 Fiado',
};

// 'Dividido (N formas)' no lugar do texto cru quando a venda tem mais de
// uma fatia (backlog item 19, passo 6).
function labelMeioPagamento(venda) {
  if (venda.meio_pagamento !== 'Dividido') return venda.meio_pagamento;
  const n = venda.pagamentos?.length;
  return n ? `➗ Dividido (${n} formas)` : '➗ Dividido';
}

// Descreve as fatias de uma venda 'Dividido' numa linha só de texto —
// usado nos exports (Excel/PDF), que não têm como abrir um detalhe
// clicável como a tela tem.
function descreverFatias(venda) {
  if (venda.meio_pagamento !== 'Dividido') return '';
  return (venda.pagamentos || [])
    .map((p, i) => `${p.pessoa_label || `Pessoa ${i + 1}`}: ${fmt(p.valor)} ${p.meio_pagamento}${p.cliente_nome ? ` (${p.cliente_nome})` : ''}`)
    .join(' | ');
}

// Nomes dos itens de uma fatia específica — venda dividida por item
// (Fase 2 do backlog item 19). itens_venda.pagamento_venda_id linka cada
// item ao id da fatia (pagamentos_venda.id). Fatia vazia aqui significa
// venda dividida por valor (sem dono por item). Mesmo helper de Relatorios.jsx.
function itensDaFatia(venda, fatiaId) {
  return (venda.itens || []).filter(i => i.pagamento_venda_id === fatiaId).map(i => i.produto_nome);
}

// CPF tem 11 dígitos, CNPJ tem 14 — rotula certinho na exibição sem
// precisar de um campo separado marcando o tipo.
function labelDocumento(valor) {
  return (valor || '').replace(/\D/g, '').length > 11 ? 'CNPJ' : 'CPF';
}

// Últimos 30 dias até hoje, no calendário do FUSO DO ESTABELECIMENTO (não
// no fuso do navegador de quem está olhando a tela) — usa hojeStrTZ/
// subtrairDias (utils/fusoHorario.js) em vez de getFullYear/getMonth/
// getDate num Date local, que dependeria do fuso do dispositivo.
function periodoPadrao30Dias(timezone = TIMEZONE_PADRAO) {
  const hojeStr = hojeStrTZ(timezone);
  return { de: subtrairDias(hojeStr, 30), ate: hojeStr };
}

// Ícone de "sem imagem" — SVG em vez de emoji, mesmo padrão já usado no
// Estoque (ProdutoList.jsx), pra não depender da fonte de emoji do sistema
function IconePacoteMini({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

/* ── Painel de detalhes do fiado ───────────────────────────── */
// 23/09/2026 — data E hora da compra/pagamento (no fuso do estabelecimento),
// e o pagamento de cada compra passou a abrir o mesmo modal completo do PDV
// (ModalRecebimento, modo "venda") em vez do select simples de antes.
// `versao` muda sempre que um pagamento é registrado → recarrega a lista.
function DetalhesFiado({ cliente, onFechar, onPagarVenda, podeReceber = true, semPermMsg = '', timezone = TIMEZONE_PADRAO, versao = 0 }) {
  const [vendas,        setVendas]        = useState([]);
  const [pagamentos,    setPagamentos]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [erro,          setErro]          = useState('');
  const [abaDetalhe,    setAbaDetalhe]    = useState('compras'); // 'compras' | 'pagamentos'
  const [imagemExpandida, setImagemExpandida] = useState(null); // url da imagem em tela cheia, ou null

  /* ── Fechar lightbox de imagem com Esc ───────────────────── */
  useEffect(() => {
    if (!imagemExpandida) return;
    function handleEsc(e) { if (e.key === 'Escape') setImagemExpandida(null); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [imagemExpandida]);

  async function carregar({ silencioso = false } = {}) {
      if (!silencioso) setLoading(true);
      setErro('');
      try {
        const [rVendas, rPagamentos] = await Promise.all([
          apiFetch(`/api/clientes/${cliente.id}/itens-fiado`),
          apiFetch(`/api/clientes/${cliente.id}/pagamentos`),
        ]);
        if (!rVendas.ok) throw new Error('Erro ao buscar histórico');
        setVendas(await rVendas.json());
        if (rPagamentos.ok) setPagamentos(await rPagamentos.json());
      } catch (err) { setErro(err.message); }
      finally { setLoading(false); }
    }

  useEffect(() => { carregar(); }, [cliente.id]);
  useEffect(() => { if (versao > 0) carregar({ silencioso: true }); }, [versao]);

  return (
    <div className="cli-detalhes">
      <div className="cli-detalhes-header">
        <span className="cli-detalhes-titulo">📋 Fiado — {cliente.nome}</span>
        <button className="cli-detalhes-fechar" onClick={onFechar}>✕</button>
      </div>

      {/* Abas internas */}
      <div className="cli-detalhes-tabs">
        <button
          className={`cli-detalhes-tab${abaDetalhe === 'compras' ? ' ativo' : ''}`}
          onClick={() => setAbaDetalhe('compras')}
        >
          🛒 Compras
        </button>
        <button
          className={`cli-detalhes-tab${abaDetalhe === 'pagamentos' ? ' ativo' : ''}`}
          onClick={() => setAbaDetalhe('pagamentos')}
        >
          💰 Pagamentos
        </button>
      </div>

      <div className="cli-detalhes-body">
        {loading && (
          <div className="cli-detalhes-loading">
            <div className="est-spinner" />
            Carregando histórico…
          </div>
        )}
        {erro && <div className="cli-erro">⚠️ {erro}</div>}

        {/* Aba compras */}
        {!loading && abaDetalhe === 'compras' && (
          <>
            {vendas.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">📋</span>
                <p>Sem vendas fiadas pendentes</p>
              </div>
            ) : (
              vendas.map(venda => (
                <div key={venda.venda_id} className="cli-venda-card">
                  <div className="cli-venda-info">
                    <span className="cli-venda-info-data">📅 {fmtDataHora(venda.data_venda, timezone)}</span>
                    <span className="cli-venda-info-valor">{fmt(venda.valor_total)}</span>
                  </div>
                  <ul className="cli-venda-itens">
                    {venda.itens.map((item, i) => {
                      const unidade = item.unidade_medida || 'un';
                      const qtdLabel = unidade === 'kg'
                        ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                        : `${parseFloat(item.quantidade).toFixed(0)}×`;
                      return (
                        <li key={i} className="cli-venda-item">
                          <div
                            className="cli-item-thumb"
                            onClick={() => item.produto_imagem_url && setImagemExpandida(item.produto_imagem_url)}
                            style={{ cursor: item.produto_imagem_url ? 'pointer' : 'default' }}
                          >
                            {item.produto_imagem_url ? (
                              <img
                                src={item.produto_imagem_url}
                                alt=""
                                loading="lazy"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <IconePacoteMini className="cli-item-thumb-placeholder" />
                            )}
                          </div>
                          <span className="cli-item-qtd">{qtdLabel}</span>
                          <span className="cli-item-nome">{item.produto_nome}</span>
                          <span className="cli-item-subtotal">
                            {fmt(item.quantidade * item.preco_unitario)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Botão pagar esta compra — abre o modal completo (igual PDV) */}
                  <button
                    className="cli-pagar-venda-trigger"
                    onClick={podeReceber ? () => onPagarVenda?.(venda) : undefined}
                    disabled={!podeReceber}
                    title={!podeReceber ? semPermMsg : undefined}
                  >
                    💰 Pagar esta compra
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {/* Aba pagamentos */}
        {!loading && abaDetalhe === 'pagamentos' && (
          <>
            {pagamentos.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">💰</span>
                <p>Nenhum pagamento registrado</p>
              </div>
            ) : (
              pagamentos.map((p, i) => (
                <div key={i} className="cli-pagamento-card">
                  <div className="cli-pagamento-info">
                    <span className="cli-pagamento-data">📅 {fmtDataHora(p.data_transacao, timezone)}</span>
                    <span className={`cli-pagamento-meio ${p.meio_pagamento?.toLowerCase()}`}>{p.meio_pagamento}</span>
                  </div>
                  <span className="cli-pagamento-valor">- {fmt(p.valor)}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {imagemExpandida && (
        <div className="cli-lightbox-overlay" onClick={() => setImagemExpandida(null)}>
          <button className="cli-lightbox-fechar" onClick={() => setImagemExpandida(null)}>✕</button>
          <img src={imagemExpandida} alt="" className="cli-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function DividasList({ estabelecimentoId, nomeEstabelecimento, permissoes = null, isMerchant = true }) {
  const pode = (p) => isMerchant || !permissoes || permissoes.includes(p);
  const SEM_PERM = 'Sem permissão — contate o administrador';

  const [viewMode,          setViewMode]          = useState(() => localStorage.getItem('cli-ultima-aba') || 'todos');
  function mudarAba(modo) {
    setViewMode(modo);
    localStorage.setItem('cli-ultima-aba', modo);
  }
  const [dividas,           setDividas]           = useState([]);
  const [todosClientes,     setTodosClientes]     = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [erro,              setErro]              = useState('');
  const [termoBusca,        setTermoBusca]        = useState('');
  const [ordenacao,         setOrdenacao]         = useState('vencimento'); // 'vencimento' | 'valor' | 'nome'
  const [clienteDetalhes,   setClienteDetalhes]   = useState(null);
  const [clienteHistorico,  setClienteHistorico]  = useState(null);
  const [clienteModal,      setClienteModal]      = useState(null);
  const [modalAberto,       setModalAberto]       = useState(false);
  const [clienteReceber,    setClienteReceber]    = useState(null);
  const [modalRecebimento,  setModalRecebimento]  = useState(false);
  const [vendaReceber,      setVendaReceber]      = useState(null); // compra específica (modo "venda") ou null (modo "divida")
  const [versaoFiado,       setVersaoFiado]       = useState(0);    // muda a cada pagamento → detalhe do fiado recarrega
  const [pixConfig,         setPixConfig]         = useState({ modo: 'maquininha', disponivel: false });
  const [estabTimezone,     setEstabTimezone]     = useState(TIMEZONE_PADRAO); // fuso oficial do estabelecimento (mercearias.timezone) — usado pra bucketar datas de venda no dia certo, independente de onde quem está olhando a tela está
  const [fiadoAtivo,        setFiadoAtivo]        = useState(true); // null enquanto carrega = assume true, ajusta depois
  const [fontScale,         setFontScale]         = useState(() => {
    const saved = localStorage.getItem('cli-font-scale');
    return saved ? parseFloat(saved) : 1;
  });

  // Navegação por teclado na lista (item 22) — mesmo padrão do PDV e do
  // Estoque: campo de busca sempre com foco, setas navegam entre os
  // clientes filtrados, Delete abre a exclusão do selecionado.
  const buscaRef = useRef(null);
  const [clienteNavId, setClienteNavId] = useState(null);

  useEffect(() => {
    if (!loading) setTimeout(() => buscaRef.current?.focus(), 100);
  }, [loading]);

  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.6, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem('cli-font-scale', next);
      return next;
    });
  }

  /* ── Carregar dados ─────────────────────────────────────── */
  // `silencioso` (22/09/2026, tempo real): recarrega sem o "carregando"
  // da tela inteira e sem apagar a lista se der erro.
  async function carregarDados(fiadoAtivoParam = fiadoAtivo, { silencioso = false } = {}) {
    if (!estabelecimentoId) return;
    if (!silencioso) {
      setLoading(true);
      setErro('');
    }
    try {
      const rTodos = await apiFetch(`/api/clientes`);
      if (!rTodos.ok) throw new Error('Erro ao buscar clientes');
      setTodosClientes(await rTodos.json());

      // Só pede a lista de dívidas se o Fiado estiver ativo — se não,
      // nem tenta (evita o 403 aparecer numa tela que nem é de fiado)
      if (fiadoAtivoParam) {
        const rDiv = await apiFetch(`/api/clientes/dividas`);
        if (!rDiv.ok) throw new Error('Erro ao buscar dívidas');
        setDividas(await rDiv.json());
      } else {
        setDividas([]);
      }
    } catch (err) {
      if (!silencioso) setErro(err.message);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }

  // Tempo real: cliente cadastrado/editado/excluído, venda fiado feita no
  // PDV, pagamento recebido ou venda cancelada em qualquer tela/aparelho
  // → lista de clientes e saldos devedores atualizam sozinhos.
  useAvisosEstabelecimento(estabelecimentoId, ['clientes', 'vendas'], () => {
    carregarDados(fiadoAtivo, { silencioso: true });
    setVersaoFiado(v => v + 1); // detalhe do fiado aberto também se atualiza
  });

  /* ── Config de Pix (maquininha vs. sistema) + Fiado ativo? ──
     Roda primeiro pra descobrir se o Fiado está ligado, e SÓ DEPOIS
     busca os clientes — assim carregarDados já sabe se deve pedir
     dívidas ou não, sem depender de timing entre dois efeitos soltos. */
  useEffect(() => {
    if (!estabelecimentoId) return;
    (async () => {
      let ativo = true;
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`);
        if (resp.ok) {
          const d = await resp.json();
          setPixConfig({
            modo: d.pix_modo || 'maquininha',
            disponivel: !!(d.pix_chave && d.pix_cidade),
          });
          setEstabTimezone(d.timezone || TIMEZONE_PADRAO);
          ativo = d.fiado_ativo !== false;
          setFiadoAtivo(ativo);
          if (!ativo) mudarAba('todos'); // sem Fiado, a aba "devedores" nem existe
        }
      } catch { /* Pix pela maquininha continua funcionando mesmo se isso falhar */ }
      carregarDados(ativo);
    })();
  }, [estabelecimentoId]);

  /* ── Handlers recebimento ───────────────────────────────── */
  // Usa sempre a versão mais nova do cliente (dívida atualizada) que já
  // está na lista — o objeto guardado no detalhe pode estar desatualizado.
  function clienteAtualizado(cliente) {
    return dividas.find(c => c.id === cliente.id) || todosClientes.find(c => c.id === cliente.id) || cliente;
  }

  // 💰 Receber do card → valor livre (até a dívida toda)
  function abrirRecebimento(cliente) {
    setVendaReceber(null);
    setClienteReceber(clienteAtualizado(cliente));
    setModalRecebimento(true);
  }

  // 💰 Pagar esta compra (detalhe do fiado) → valor fixo daquela compra
  function abrirPagamentoVenda(cliente, venda) {
    setVendaReceber(venda);
    setClienteReceber(clienteAtualizado(cliente));
    setModalRecebimento(true);
  }

  function fecharRecebimento() {
    setModalRecebimento(false);
    setClienteReceber(null);
    setVendaReceber(null);
  }

  // O próprio modal grava no backend; aqui só atualiza as telas.
  function aposRecebimento() {
    carregarDados(fiadoAtivo, { silencioso: true });
    setVersaoFiado(v => v + 1);
  }

  /* ── Excluir cliente ─────────────────────────────────────── */
  async function excluirCliente(cliente) {
    if (parseFloat(cliente.saldo_devedor) > 0.01) {
      alert('Não é possível excluir cliente com dívida pendente.');
      return;
    }
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"? Esta ação é irreversível.`)) return;
    try {
      const resp = await apiFetch(`/api/clientes/deletar/${cliente.id}`,
        { method: 'DELETE' }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao excluir');
      setTodosClientes(prev => prev.filter(c => c.id !== cliente.id));
      setDividas(prev => prev.filter(c => c.id !== cliente.id));
    } catch (err) {
      setErro(err.message);
    }
  }

  /* ── Navegação por teclado na lista (item 22) ────────────────
     Setas navegam entre os clientes filtrados; Delete abre a exclusão do
     cliente selecionado — window.confirm() já responde nativamente a
     Enter (OK) / Esc (cancelar), sem precisar de mais nada aqui. */
  function handleBuscaKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (listaFiltrada.length === 0) return;
      e.preventDefault();
      const idxAtual = clienteNavId ? listaFiltrada.findIndex(c => c.id === clienteNavId) : -1;
      const novoIdx = e.key === 'ArrowDown'
        ? (idxAtual === -1 ? 0 : Math.min(idxAtual + 1, listaFiltrada.length - 1))
        : (idxAtual === -1 ? listaFiltrada.length - 1 : Math.max(idxAtual - 1, 0));
      const alvo = listaFiltrada[novoIdx];
      setClienteNavId(alvo.id);
      setTimeout(() => document.getElementById(`cli-card-${alvo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && clienteNavId) {
      e.preventDefault();
      const alvo = listaFiltrada.find(c => c.id === clienteNavId);
      if (alvo && pode('clientes_excluir')) excluirCliente(alvo);
      return;
    }
    if (e.key === 'Escape' && clienteNavId) { setClienteNavId(null); return; }
    if (e.key.length === 1 && clienteNavId) setClienteNavId(null);
  }

  /* ── WhatsApp cobrança ──────────────────────────────────── */
  function enviarWhatsApp(cliente) {
    const tel = (cliente.telefone || '').replace(/\D/g, '');
    if (!tel) {
      alert('Este cliente não tem telefone cadastrado.');
      return;
    }
    const valor = parseFloat(cliente.saldo_devedor || 0)
      .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const estabelecimento = nomeEstabelecimento || 'nosso estabelecimento';
    const msg = `Olá, ${cliente.nome}! Passando para informar que você possui um saldo devedor de *${valor}* em *${estabelecimento}*. Por favor, entre em contato para regularizar. Obrigado! 😊`;
    const url = `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  /* ── Filtro + Ordenação ──────────────────────────────────── */
  const lista = viewMode === 'devedores' ? dividas : todosClientes;

  const listaFiltrada = lista
    .filter(c => {
      if (!termoBusca.trim()) return true;
      const t = termoBusca.toLowerCase();
      return (
        (c.nome || '').toLowerCase().includes(t) ||
        (c.telefone || '').toString().toLowerCase().includes(t)
      );
    })
    .sort((a, b) => {
      if (ordenacao === 'vencimento') {
        // Sem vencimento vai pro final
        if (!a.data_vencimento && !b.data_vencimento) return 0;
        if (!a.data_vencimento) return 1;
        if (!b.data_vencimento) return -1;
        return new Date(a.data_vencimento) - new Date(b.data_vencimento);
      }
      if (ordenacao === 'valor') {
        return parseFloat(b.saldo_devedor || 0) - parseFloat(a.saldo_devedor || 0);
      }
      if (ordenacao === 'nome') {
        return (a.nome || '').localeCompare(b.nome || '');
      }
      return 0;
    });

  /* ── Alertas de fiado vencido ──────────────────────────── */
  const hoje = new Date();
  const fiadosVencidos  = dividas.filter(c => {
    if (!c.data_vencimento) return false;
    return new Date(c.data_vencimento) < hoje;
  });
  const fiadosProximos  = dividas.filter(c => {
    if (!c.data_vencimento) return false;
    const diff = Math.ceil((new Date(c.data_vencimento) - hoje) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 3;
  });
  const totalVencido = fiadosVencidos.reduce((s, c) => s + parseFloat(c.saldo_devedor || 0), 0);

  /* ── Exportar Excel ─────────────────────────────────────── */
  function exportarExcel() {
    const lista = viewMode === 'devedores' ? dividas : todosClientes;
    if (!lista.length) return;
    const dados = lista.map(c => ({
      'Nome':          c.nome || '',
      'Telefone':      c.telefone || '',
      'Dívida (R$)':   parseFloat(c.saldo_devedor || 0),
      'Limite (R$)':   parseFloat(c.limite_credito || 0) || 'Sem limite',
      'Vencimento':    c.data_vencimento
                         ? new Date(c.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
                         : '—',
      'Status':        (() => {
                         if (!c.data_vencimento) return '—';
                         const diff = Math.ceil((new Date(c.data_vencimento) - hoje) / (1000 * 60 * 60 * 24));
                         if (diff < 0) return 'Vencido';
                         if (diff <= 3) return 'Vence em breve';
                         return 'Em dia';
                       })(),
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, viewMode === 'devedores' ? 'Devedores' : 'Clientes');
    const data = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    salvarExcelIdentidade(wb, `Clientes_${data}.xlsx`, {
      tipo: 'clientes',
      titulo: viewMode === 'devedores' ? 'Clientes com Dívida (Fiado)' : 'Lista de Clientes',
      subtitulo: `${lista.length} cliente(s)`,
    });
  }

  /* ════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando clientes…
      </div>
    );
  }

  return (
    <div className="cli-container" style={{ '--cli-font-scale': fontScale }}>

      {/* Modal cliente */}
      {modalAberto && (
        <ClienteModal
          estabelecimentoId={estabelecimentoId}
          cliente={clienteModal}
          onClose={() => { setModalAberto(false); setClienteModal(null); }}
          onSalvo={carregarDados}
          onExcluido={carregarDados}
          fiadoAtivo={fiadoAtivo}
        />
      )}

      {/* Modal recebimento */}
      {modalRecebimento && clienteReceber && (
        <ModalRecebimento
          key={`${clienteReceber.id}-${vendaReceber?.venda_id || 'divida'}`}
          modo={vendaReceber ? 'venda' : 'divida'}
          cliente={clienteReceber}
          venda={vendaReceber}
          onClose={fecharRecebimento}
          onConcluido={aposRecebimento}
          estabelecimentoId={estabelecimentoId}
          nomeEstabelecimento={nomeEstabelecimento}
          timezone={estabTimezone}
          pixConfig={pixConfig}
        />
      )}

      {/* ── HEADER ──────────────────────────────────────── */}
      <div className="cli-header">
        <input maxLength={100}
          ref={buscaRef}
          className="cli-header-busca"
          type="text"
          placeholder="🔍  Buscar por nome ou telefone…"
          value={termoBusca}
          onChange={e => setTermoBusca(e.target.value)}
          onKeyDown={handleBuscaKeyDown}
        />
        <div className="cli-toggle">
          <button
            className={`cli-toggle-btn${viewMode === 'todos' ? ' ativo' : ''}`}
            onClick={() => { mudarAba('todos'); setTermoBusca(''); }}
          >
            👥 Clientes ({todosClientes.length})
          </button>
          {(fiadoAtivo || dividas.length > 0) && (
            <button
              className={`cli-toggle-btn${viewMode === 'devedores' ? ' ativo' : ''}`}
              onClick={() => { mudarAba('devedores'); setTermoBusca(''); }}
              title={!fiadoAtivo ? 'Fiado desligado — só aparece porque existe dívida antiga a cobrar' : undefined}
            >
              💰 Fiado ({dividas.length})
            </button>
          )}
        </div>
        <div className="cli-header-btns">
          <button
            className="cli-zoom-btn"
            onClick={() => changeFontScale(-0.1)}
            disabled={fontScale <= 0.8}
            title="Diminuir fonte"
          >A−</button>
          <button
            className="cli-zoom-btn"
            onClick={() => changeFontScale(0.1)}
            disabled={fontScale >= 1.6}
            title="Aumentar fonte"
          >A+</button>
          
          <button className="cli-btn verde" onClick={exportarExcel} title="Exportar Excel">📥 Excel</button>
          <button
            className="cli-btn primary"
            onClick={() => { setClienteModal(null); setModalAberto(true); }}
            disabled={!pode('clientes_adicionar')}
            title={!pode('clientes_adicionar') ? SEM_PERM : undefined}
          >
            + Cliente
          </button>
        </div>
      </div>

      {/* ── BANNER PERMISSÃO LIMITADA ────────────────────── */}
      {!isMerchant && permissoes && (
        !pode('clientes_adicionar') || !pode('clientes_editar') ||
        !pode('clientes_excluir')   || !pode('clientes_receber')
      ) && (
        <div className="mod-aviso-permissao">
          🔒 Visualização limitada — algumas ações não estão disponíveis para o seu perfil.
        </div>
      )}

      {/* ── ALERTA FIADO VENCIDO ────────────────────────── */}
      {(fiadosVencidos.length > 0 || fiadosProximos.length > 0) && (
        <div className="cli-alerta-fiado">
          {fiadosVencidos.length > 0 && (
            <div className="cli-alerta-item vencido">
              <span className="cli-alerta-icone">🔴</span>
              <div className="cli-alerta-texto">
                <strong>{fiadosVencidos.length} {fiadosVencidos.length === 1 ? 'fiado vencido' : 'fiados vencidos'}</strong>
                <span> — total de {fmt(totalVencido)} em atraso</span>
              </div>
              <button
                className="cli-alerta-btn"
                onClick={() => { mudarAba('devedores'); setOrdenacao('vencimento'); }}
              >Ver devedores</button>
            </div>
          )}
          {fiadosProximos.length > 0 && (
            <div className="cli-alerta-item proximo">
              <span className="cli-alerta-icone">⚠️</span>
              <div className="cli-alerta-texto">
                <strong>{fiadosProximos.length} {fiadosProximos.length === 1 ? 'fiado vence' : 'fiados vencem'} nos próximos 3 dias</strong>
              </div>
              <button
                className="cli-alerta-btn"
                onClick={() => { mudarAba('devedores'); setOrdenacao('vencimento'); }}
              >Ver devedores</button>
            </div>
          )}
        </div>
      )}

      {/* ── ORDENAÇÃO ───────────────────────────────────── */}
      {viewMode === 'devedores' && dividas.length > 0 && (
        <div className="cli-ordenacao">
          <span className="cli-ordenacao-label">Ordenar:</span>
          {[
            { key: 'vencimento', label: '📅 Vencimento' },
            { key: 'valor',      label: '💰 Maior dívida' },
            { key: 'nome',       label: '🔤 Nome' },
          ].map(o => (
            <button
              key={o.key}
              className={`cli-ordenacao-btn${ordenacao === o.key ? ' ativo' : ''}`}
              onClick={() => setOrdenacao(o.key)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {erro && <div className="cli-erro">⚠️ {erro}</div>}

      {viewMode === 'devedores' && !fiadoAtivo && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '0 20px 12px', padding: '12px 16px', background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.25)', borderRadius: 12, fontSize: '0.82rem', color: 'var(--est-text-soft, #475569)', lineHeight: 1.5 }}>
          <span>💡</span>
          <span>
            O módulo de Fiado está <strong>desligado</strong> pra esse estabelecimento — essa aba só está visível porque ainda
            existe dívida antiga a cobrar. Depois de quitar tudo, ela some sozinha. Pra vender fiado de novo, reative em
            Configurações → Pagamentos.
          </span>
        </div>
      )}

      {/* ── CORPO ───────────────────────────────────────── */}
      <div className="cli-body">

        {/* Grid */}
        <div className="cli-grid-wrapper">
          <div className="cli-grid">
            {listaFiltrada.length === 0 ? (
              <div className="cli-vazio">
                <span className="cli-vazio-icon">👥</span>
                <p>
                  {viewMode === 'devedores'
                    ? 'Nenhum devedor encontrado'
                    : 'Nenhum cliente encontrado'}
                </p>
                <small>
                  {termoBusca
                    ? `Sem resultados para "${termoBusca}"`
                    : viewMode === 'devedores'
                      ? 'Sem contas a receber pendentes'
                      : 'Cadastre seu primeiro cliente'}
                </small>
              </div>
            ) : (
              listaFiltrada.map(cliente => (
                <ClienteCard
                  key={cliente.id}
                  cliente={cliente}
                  emFoco={cliente.id === clienteNavId}
                  modo={viewMode === 'devedores' ? 'fiado' : 'clientes'}
                  onEditar={() => { setClienteModal(cliente); setModalAberto(true); }}
                  onDetalhesFiado={() => setClienteDetalhes(
                    clienteDetalhes?.id === cliente.id ? null : cliente
                  )}
                  onHistorico={() => setClienteHistorico(
                    clienteHistorico?.id === cliente.id ? null : cliente
                  )}
                  onReceber={() => abrirRecebimento(cliente)}
                  onExcluir={() => excluirCliente(cliente)}
                  onWhatsApp={() => enviarWhatsApp(cliente)}
                  podeEditar={pode('clientes_editar')}
                  podeExcluir={pode('clientes_excluir')}
                  podeReceber={pode('clientes_receber')}
                  semPermMsg={SEM_PERM}
                />
              ))
            )}
          </div>
        </div>

        {/* Painel detalhes de fiado (aba Fiado) */}
        {clienteDetalhes && (
          <DetalhesFiado
            cliente={clienteDetalhes}
            onFechar={() => setClienteDetalhes(null)}
            onPagarVenda={venda => abrirPagamentoVenda(clienteDetalhes, venda)}
            podeReceber={pode('clientes_receber')}
            semPermMsg={SEM_PERM}
            timezone={estabTimezone}
            versao={versaoFiado}
          />
        )}

        {/* Painel histórico geral de compras (aba Clientes) */}
        {clienteHistorico && (
          <HistoricoComprasCliente
            cliente={clienteHistorico}
            onFechar={() => setClienteHistorico(null)}
            onAtualizar={carregarDados}
            nomeEstabelecimento={nomeEstabelecimento}
            timezone={estabTimezone}
          />
        )}

      </div>
    </div>
  );
}

/* ── Card de cliente ─────────────────────────────────────────*/
function ClienteCard({ cliente, modo = 'clientes', emFoco = false, onEditar, onHistorico, onDetalhesFiado, onReceber, onExcluir, onWhatsApp, podeEditar = true, podeExcluir = true, podeReceber = true, semPermMsg = '' }) {
  const ehFiado         = modo === 'fiado';
  const temDivida       = ehFiado && parseFloat(cliente.saldo_devedor) > 0.01;
  const limiteExcedido  = temDivida
    && parseFloat(cliente.limite_credito || 0) > 0
    && parseFloat(cliente.saldo_devedor) > parseFloat(cliente.limite_credito);

  const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  function formatarData(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return '—'; }
  }

  // Verifica se vencimento está próximo ou vencido
  function statusVencimento(data) {
    if (!data) return null;
    const hoje = new Date();
    const venc = new Date(data);
    const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'vencido';
    if (diff <= 3) return 'proximo';
    return 'ok';
  }

  // Texto "vence em X dias" / "venceu há X dias" pra acompanhar a data
  function textoDiasVencimento(data) {
    if (!data) return '';
    const hoje = new Date();
    const venc = new Date(data);
    const diff = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
    if (diff < 0)  return ` (venceu há ${Math.abs(diff)} dia${Math.abs(diff) === 1 ? '' : 's'})`;
    if (diff === 0) return ' (vence hoje)';
    return ` (vence em ${diff} dia${diff === 1 ? '' : 's'})`;
  }

  const svStatus = statusVencimento(cliente.data_vencimento);
  const abrirDetalhe = ehFiado ? onDetalhesFiado : onHistorico;

  return (
    <div id={`cli-card-${cliente.id}`} className={`cli-card${temDivida ? ' devedor' : ''}${limiteExcedido ? ' limite-excedido' : ''}${emFoco ? ' foco-teclado' : ''}`}>

      <div className="cli-card-header" onClick={abrirDetalhe} style={{ cursor: "pointer" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="cli-card-nome">{cliente.nome}</span>
          {cliente.codigo_cliente && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--est-text-muted, #94a3b8)', background: 'var(--est-input, rgba(0,0,0,0.04))', padding: '2px 7px', borderRadius: 10 }}>
              #{cliente.codigo_cliente}
            </span>
          )}
        </div>
        <span className="cli-card-tel">📞 {cliente.telefone || 'Sem telefone'}</span>
        {cliente.cpf && <span className="cli-card-tel">🪪 {labelDocumento(cliente.cpf)}: {cliente.cpf}</span>}
      </div>

      {/* Corpo com dívida/limite/vencimento — só na aba Fiado */}
      {ehFiado && (
        <div className="cli-card-corpo" onClick={abrirDetalhe} style={{ cursor: "pointer" }}>
          {limiteExcedido && (
            <span className="cli-badge-limite">⚠️ Limite excedido</span>
          )}
          <span className="cli-divida-label">Dívida atual</span>
          <span className="cli-divida-valor">{fmt(cliente.saldo_devedor)}</span>

          <div className="cli-card-info-row">
            <div className="cli-info-item">
              <span className="cli-info-label">Vencimento</span>
              <span className={`cli-info-valor${svStatus === 'vencido' ? ' vencido' : svStatus === 'proximo' ? ' proximo' : ''}`}>
                {formatarData(cliente.data_vencimento)}
                {cliente.data_vencimento && (
                  <small style={{ fontWeight: 500, opacity: 0.8 }}>{textoDiasVencimento(cliente.data_vencimento)}</small>
                )}
                {svStatus === 'vencido' && ' 🔴'}
                {svStatus === 'proximo' && ' ⚠️'}
              </span>
            </div>
            <div className="cli-info-item">
              <span className="cli-info-label">Limite</span>
              <span className="cli-info-valor">
                {parseFloat(cliente.limite_credito || 0) === 0 ? '∞ Sem limite' : fmt(cliente.limite_credito)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="cli-card-acoes">
        <button className="cli-btn-acao config" onClick={podeEditar ? onEditar : undefined} disabled={!podeEditar} title={!podeEditar ? semPermMsg : 'Editar'}>⚙️</button>

        {ehFiado && temDivida && cliente.telefone && (
          <button className="cli-btn-acao whatsapp" onClick={onWhatsApp} title="Enviar cobrança via WhatsApp">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{flexShrink:0}}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.855L.057 23.428a.75.75 0 0 0 .916.916l5.573-1.471A11.943 11.943 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.956 0-3.792-.5-5.388-1.373l-.386-.215-3.996 1.055 1.056-3.996-.215-.386A9.955 9.955 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            Cobrar
          </button>
        )}

        <button className="cli-btn-acao detalhes" onClick={abrirDetalhe} title={ehFiado ? 'Ver histórico de fiado' : 'Ver histórico de compras'}>
          {ehFiado ? '📋 Detalhes' : '🧾 Histórico'}
        </button>

        {(!ehFiado || !temDivida) && (
          <button className="cli-btn-acao excluir" onClick={podeExcluir ? onExcluir : undefined} disabled={!podeExcluir} title={!podeExcluir ? semPermMsg : 'Excluir'}>🗑 Excluir</button>
        )}

        {ehFiado && (
          <button
            className="cli-btn-acao receber"
            onClick={podeReceber ? onReceber : undefined}
            disabled={!podeReceber || !temDivida}
            title={!podeReceber ? semPermMsg : undefined}
          >
            💰 Receber
          </button>
        )}
      </div>

    </div>
  );
}

/* ── Painel de histórico geral de compras (qualquer forma de
   pagamento) — usado na aba Clientes, diferente do painel de Fiado ── */
function HistoricoComprasCliente({ cliente, onFechar, onAtualizar, nomeEstabelecimento, timezone = TIMEZONE_PADRAO }) {
  const [vendas,  setVendas]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro,    setErro]    = useState('');
  const [cancelandoId, setCancelandoId] = useState(null);
  const [filtroDe,  setFiltroDe]  = useState(() => periodoPadrao30Dias(timezone).de);
  const [filtroAte, setFiltroAte] = useState(() => periodoPadrao30Dias(timezone).ate);
  const [imagemExpandida, setImagemExpandida] = useState(null); // url da imagem em tela cheia, ou null

  /* ── Fechar lightbox de imagem com Esc ───────────────────── */
  useEffect(() => {
    if (!imagemExpandida) return;
    function handleEsc(e) { if (e.key === 'Escape') setImagemExpandida(null); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [imagemExpandida]);

  // 23/09/2026 — o período vai pro servidor (antes o filtro era só aqui na
  // tela, em cima das 200 compras mais recentes: um período mais antigo
  // aparecia vazio mesmo tendo compras, e "Limpar" nunca mostrava tudo).
  const periodoInvertido = !!(filtroDe && filtroAte && filtroDe > filtroAte);
  const padrao30 = periodoPadrao30Dias(timezone);
  const ehPadrao30 = filtroDe === padrao30.de && filtroAte === padrao30.ate;
  const LIMITE_HISTORICO = 200; // mesmo limite do backend

  async function carregar() {
    if (periodoInvertido) return;
    setLoading(true);
    setErro('');
    try {
      const qs = new URLSearchParams();
      if (filtroDe)  qs.set('de', filtroDe);
      if (filtroAte) qs.set('ate', filtroAte);
      const sufixo = qs.toString() ? `?${qs}` : '';
      const resp = await apiFetch(`/api/clientes/${cliente.id}/historico-compras${sufixo}`);
      if (!resp.ok) throw new Error('Erro ao buscar histórico');
      setVendas(await resp.json());
    } catch (err) { setErro(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, [cliente.id, filtroDe, filtroAte]);

  // Bucketa cada venda no fuso OFICIAL do estabelecimento (mercearias.timezone),
  // não no fuso do navegador de quem está olhando a tela — evita reintroduzir
  // o bug de 11/08 (venda à noite sumindo do filtro) quando o dono/operador
  // abre essa tela de um fuso diferente do da loja.
  const vendasFiltradas = vendas.filter(v => {
    const dataV = paraDataStrTZ(new Date(v.data_venda), timezone);
    if (filtroDe && dataV < filtroDe) return false;
    if (filtroAte && dataV > filtroAte) return false;
    return true;
  });

  function exportarExcel() {
    if (!vendasFiltradas.length) return;
    const linhas = [];
    vendasFiltradas.forEach(v => {
      const itensDaVenda = (v.itens && v.itens.length > 0) ? v.itens : [null];
      itensDaVenda.forEach(item => {
        linhas.push({
          'Data':      new Date(v.data_venda).toLocaleString('pt-BR'),
          'Vendedor':  v.operador_nome,
          'Pagamento': labelMeioPagamento(v),
          'Detalhe do pagamento dividido': descreverFatias(v),
          'Status':    v.status === 'cancelada' ? 'Cancelada' : 'Ativa',
          'Produto':   item ? item.produto_nome + (item.produto_marca ? ` · ${item.produto_marca}` : '') : '—',
          'Quantidade': item ? parseFloat(item.quantidade) || 0 : '',
          'Custo Unit. (R$)': item ? parseFloat(item.preco_unitario) || 0 : '',
          'Subtotal (R$)':    item ? (parseFloat(item.quantidade) * parseFloat(item.preco_unitario)) || 0 : '',
          'Total da Venda (R$)': parseFloat(v.valor_total),
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histórico de Compras');
    const periodoExcel = (filtroDe || filtroAte)
      ? `Período: ${filtroDe ? new Date(filtroDe + 'T12:00:00').toLocaleDateString('pt-BR') : 'início'} a ${filtroAte ? new Date(filtroAte + 'T12:00:00').toLocaleDateString('pt-BR') : 'hoje'}`
      : 'Todo o período';
    salvarExcelIdentidade(wb, `Compras_${cliente.nome.replace(/\s+/g, '_')}.xlsx`, {
      tipo: 'clientes_compras', titulo: `Histórico de Compras — ${cliente.nome}`, subtitulo: periodoExcel,
    });
  }

  function baixarPDF() {
    if (!vendasFiltradas.length) return;

    const periodo = (filtroDe || filtroAte)
      ? `Período: ${filtroDe ? new Date(filtroDe + 'T12:00:00').toLocaleDateString('pt-BR') : 'início'} a ${filtroAte ? new Date(filtroAte + 'T12:00:00').toLocaleDateString('pt-BR') : 'hoje'}`
      : 'Todo o período';

    const totalGeral = vendasFiltradas.filter(v => v.status !== 'cancelada').reduce((s, v) => s + (parseFloat(v.valor_total) || 0), 0);

    const linhasHtml = vendasFiltradas.map(v => {
      const itensHtml = (v.itens && v.itens.length > 0)
        ? v.itens.map(item => {
            const unidade = item.unidade_medida || 'un';
            const qtdLabel = unidade === 'kg'
              ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
              : `${parseFloat(item.quantidade).toFixed(0)}×`;
            return `<div class="hp-item"><span>${qtdLabel} ${item.produto_nome}${item.produto_marca ? ` · ${item.produto_marca}` : ''}</span><span>${fmt(item.quantidade * item.preco_unitario)}</span></div>`;
          }).join('')
        : '<div class="hp-item"><span>—</span><span></span></div>';

      const fatiasHtml = v.meio_pagamento === 'Dividido' && (v.pagamentos || []).length > 0
        ? `<div class="hp-item" style="font-style:italic;color:#0f766e;">Dividido: ${descreverFatias(v)}</div>`
        : '';

      return `
        <tr class="hp-venda-row">
          <td>${new Date(v.data_venda).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td>${v.operador_nome || ''}</td>
          <td>${labelMeioPagamento(v)}</td>
          <td>${v.status === 'cancelada' ? 'Cancelada' : 'Ativa'}</td>
          <td class="hp-valor">${fmt(v.valor_total)}</td>
        </tr>
        <tr class="hp-itens-row"><td colspan="5">${itensHtml}${fatiasHtml}</td></tr>
      `;
    }).join('');

    // Cabeçalho/rodapé da Identidade dos Relatórios (SuperAdmin). O nome
    // do cliente vai no título (antes ficava no lugar do subtítulo).
    const idr = htmlIdentidade({
      tipo: 'clientes_compras',
      titulo: `Histórico de Compras — ${cliente.nome}`,
      subtitulo: periodo,
    });

    const alturaJanela = Math.round((window.screen?.availHeight || 900) * 0.92);
    const janela = window.open('', '_blank', `width=820,height=${alturaJanela},top=20,left=100`);
    janela.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Histórico de Compras — ${cliente.nome}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; padding: 12px; }
            ${idr.css}
            table { width: 100%; border-collapse: collapse; margin-top: 14px; }
            thead th { background: ${idr.identidade.cor_destaque}; color: #fff; text-align: left; padding: 8px 10px; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .hp-venda-row td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
            .hp-valor { font-weight: 700; text-align: right; }
            .hp-itens-row td { padding: 4px 10px 10px 24px; border-bottom: 2px solid #e2e8f0; }
            .hp-item { display: flex; justify-content: space-between; font-size: 11px; color: #475569; padding: 2px 0; }
            .hp-total { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; font-size: 14px; font-weight: 800; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${idr.cabecalho}
          <table>
            <thead><tr><th>Data</th><th>Vendedor</th><th>Pagamento</th><th>Status</th><th>Valor</th></tr></thead>
            <tbody>${linhasHtml}</tbody>
          </table>
          <div class="hp-total"><span>TOTAL (ativas)</span><span>${fmt(totalGeral)}</span></div>
          ${idr.rodape}
        </body>
      </html>
    `);
    janela.document.close();
    setTimeout(() => { janela.print(); }, 300);
  }

  async function cancelarVenda(venda) {
    const motivo = window.prompt(
      `Cancelar a compra de ${fmt(venda.valor_total)} (${labelMeioPagamento(venda)})?\n\nIsso devolve os itens pro estoque e estorna o pagamento (caixa ou dívida de fiado — em venda dividida, de cada fatia).\n\nMotivo (opcional):`
    );
    if (motivo === null) return; // desistiu no prompt
    setCancelandoId(venda.id);
    try {
      const resp = await apiFetch(`/api/vendas/${venda.id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo || null }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao cancelar venda.');
      carregar();
      onAtualizar?.();
    } catch (err) {
      alert(err.message);
    } finally {
      setCancelandoId(null);
    }
  }

  return (
    <div className="cli-detalhes">
      <div className="cli-detalhes-header">
        <span className="cli-detalhes-titulo">🧾 Histórico de Compras — {cliente.nome}</span>
        <button className="cli-detalhes-fechar" onClick={onFechar}>✕</button>
      </div>

      <div className="cli-hist-filtro-barra">
        <div className="cli-hist-filtro-datas">
          <span className="cli-form-label">De</span>
          <input className="cli-form-input" type="date" value={filtroDe} onChange={e => setFiltroDe(e.target.value)} />
          <span className="cli-form-label">Até</span>
          <input className="cli-form-input" type="date" value={filtroAte} onChange={e => setFiltroAte(e.target.value)} />
          {(filtroDe || filtroAte) && (
            <button className="cli-btn" onClick={() => { setFiltroDe(''); setFiltroAte(''); }} title="Tirar as datas e mostrar todo o histórico do cliente">✕ Limpar</button>
          )}
          {!ehPadrao30 && (
            <button className="cli-btn" onClick={() => { setFiltroDe(padrao30.de); setFiltroAte(padrao30.ate); }} title="Voltar pro período padrão">↺ Últimos 30 dias</button>
          )}
        </div>
        <div className="cli-hist-filtro-export">
          <button className="cli-btn verde" onClick={exportarExcel} disabled={!vendasFiltradas.length || periodoInvertido}>📥 Excel</button>
          <button className="cli-btn" onClick={baixarPDF} disabled={!vendasFiltradas.length || periodoInvertido}>🖨️ PDF</button>
        </div>
      </div>

      <div className="cli-detalhes-body">
        {loading && (
          <div className="cli-detalhes-loading">
            <div className="est-spinner" />
            Carregando histórico…
          </div>
        )}
        {erro && <div className="cli-erro">⚠️ {erro}</div>}
        {periodoInvertido && (
          <div className="cli-erro">⚠️ A data "De" está depois da data "Até". Ajuste o período.</div>
        )}
        {!loading && !periodoInvertido && vendas.length >= LIMITE_HISTORICO && (
          <div className="cli-hist-aviso-limite">
            Mostrando as {LIMITE_HISTORICO} compras mais recentes {filtroDe || filtroAte ? 'deste período' : 'do cliente'}. Pra ver as mais antigas, escolha as datas acima.
          </div>
        )}

        {!loading && !periodoInvertido && (
          vendasFiltradas.length === 0 ? (
            <div className="cli-vazio">
              <span className="cli-vazio-icon">🧾</span>
              <p>{vendas.length === 0 ? 'Nenhuma compra registrada ainda' : 'Nenhuma compra nesse período'}</p>
              <small>{vendas.length === 0 ? 'Aparece aqui assim que esse cliente for identificado numa venda (por nome, CPF ou código)' : 'Tenta ajustar o filtro de data'}</small>
            </div>
          ) : (
            vendasFiltradas.map(venda => (
              <div key={venda.id} className={`cli-venda-card${venda.status === 'cancelada' ? ' cancelada' : ''}`}>
                <div className="cli-venda-info">
                  <span className="cli-venda-info-data">
                    📅 {fmtDataHora(venda.data_venda, timezone)}
                    {' · '}{labelMeioPagamento(venda)}
                    {venda.operador_nome && <>{' · '}🧑‍💼 {venda.operador_nome}</>}
                    {venda.status === 'cancelada' && <span className="cli-venda-cancelada-badge">✕ Cancelada</span>}
                  </span>
                  <span className="cli-venda-info-valor">{fmt(venda.valor_total)}</span>
                </div>
                {venda.status === 'cancelada' && venda.motivo_cancelamento && (
                  <div className="cli-venda-motivo">Motivo: {venda.motivo_cancelamento}</div>
                )}
                {venda.meio_pagamento === 'Dividido' && (venda.pagamentos || []).length > 0 && (
                  <div className="cli-venda-dividido">
                    <span className="cli-venda-dividido-titulo">➗ Dividido em {venda.pagamentos.length} partes</span>
                    {venda.pagamentos.map((p, i) => {
                      const nomesItens = itensDaFatia(venda, p.id);
                      return (
                        <div className="cli-venda-dividido-fatia-bloco" key={i}>
                          <div className="cli-venda-dividido-fatia">
                            <span className="cli-venda-dividido-fatia-nome">{p.pessoa_label || `Pessoa ${i + 1}`}</span>
                            <span className="cli-venda-dividido-fatia-meio">
                              {meioLabelCurto[p.meio_pagamento] || p.meio_pagamento}
                              {p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                            </span>
                            <span className="cli-venda-dividido-fatia-valor">{fmt(p.valor)}</span>
                          </div>
                          {nomesItens.length > 0 && (
                            <div className="cli-venda-dividido-fatia-itens">{nomesItens.join(', ')}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {venda.itens.length > 0 && (
                  <ul className="cli-venda-itens">
                    {venda.itens.map((item, i) => {
                      const unidade = item.unidade_medida || 'un';
                      const qtdLabel = unidade === 'kg'
                        ? `${parseFloat(item.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`
                        : `${parseFloat(item.quantidade).toFixed(0)}×`;
                      return (
                        <li key={i} className="cli-venda-item">
                          <div
                            className="cli-item-thumb"
                            onClick={() => item.produto_imagem_url && setImagemExpandida(item.produto_imagem_url)}
                            style={{ cursor: item.produto_imagem_url ? 'pointer' : 'default' }}
                          >
                            {item.produto_imagem_url ? (
                              <img
                                src={item.produto_imagem_url}
                                alt=""
                                loading="lazy"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                              />
                            ) : (
                              <IconePacoteMini className="cli-item-thumb-placeholder" />
                            )}
                          </div>
                          <span className="cli-item-qtd">{qtdLabel}</span>
                          <span className="cli-item-nome">{item.produto_nome}{item.produto_marca && ` · ${item.produto_marca}`}</span>
                          <span className="cli-item-subtotal">
                            {fmt(item.quantidade * item.preco_unitario)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {venda.status !== 'cancelada' && (
                  <div className="cli-venda-acoes">
                    <button
                      className="cli-venda-btn-cancelar"
                      disabled={cancelandoId === venda.id}
                      onClick={() => cancelarVenda(venda)}
                    >
                      {cancelandoId === venda.id ? '⏳ Cancelando…' : '🗑 Cancelar essa compra'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )
        )}
      </div>

      {imagemExpandida && (
        <div className="cli-lightbox-overlay" onClick={() => setImagemExpandida(null)}>
          <button className="cli-lightbox-fechar" onClick={() => setImagemExpandida(null)}>✕</button>
          <img src={imagemExpandida} alt="" className="cli-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}