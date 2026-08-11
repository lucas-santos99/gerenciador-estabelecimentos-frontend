// src/pages/Estabelecimento/Estoque/ProdutoModal.jsx
import { apiFetch } from '../../../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import ModalCamera from '../PDV/ModalCamera';
import GerenciarOpcoesVariacao from './GerenciarOpcoesVariacao';
import '../Estoque.css';

/* ── Comparação "inteligente" de marcas ──────────────────────
   Normaliza (remove acento, caixa, espaços/hífen/pontuação) e mede
   a distância de edição (Levenshtein) contra as marcas já cadastradas,
   pra sugerir a grafia certa em vez de deixar duplicar por engano. */
function normalizarMarca(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // remove espaço, hífen, pontuação etc.
}

function distanciaLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Retorna { marca, exata: true }  se for a mesma marca escrita diferente
// Retorna { marca, exata: false } se for só "parecida" (possível typo)
// Retorna null se não achou nada relevante
function encontrarMarcaParecida(valorDigitado, marcasExistentes) {
  const norm = normalizarMarca(valorDigitado);
  if (norm.length < 3) return null;

  let melhor = null;
  let melhorDist = Infinity;

  for (const marca of marcasExistentes) {
    const normMarca = normalizarMarca(marca);
    if (normMarca === norm) {
      if (marca === valorDigitado.trim()) return null; // já é exatamente igual, nada a sugerir
      return { marca, exata: true };
    }
    const dist = distanciaLevenshtein(norm, normMarca);
    const limite = Math.max(1, Math.floor(Math.max(norm.length, normMarca.length) * 0.25));
    if (dist <= limite && dist < melhorDist) {
      melhor = marca;
      melhorDist = dist;
    }
  }
  return melhor ? { marca: melhor, exata: false } : null;
}



// Máscara "tipo calculadora": os dígitos entram da direita pra esquerda
// e a vírgula fica fixa nas casas decimais informadas — digita "1100" com
// 2 casas e já vira "11,00" sozinho. Vírgula digitada na mão é ignorada.
function fmtQ(v, u) {
  return u === 'kg'
    ? parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' kg'
    : Math.trunc(parseFloat(v || 0)) + ' un';
}

const MOTIVOS_SUGERIDOS_PRODUTO = {
  entrada:   ['Compra de fornecedor', 'Reposição de estoque', 'Transferência entre lojas'],
  saida:     ['Uso interno', 'Amostras/degustação', 'Transferência entre lojas'],
  perda:     ['Produto vencido', 'Produto danificado', 'Produto extraviado', 'Furto/roubo'],
  devolucao: ['Devolução de cliente insatisfeito', 'Devolução ao fornecedor'],
  correcao:  ['Acerto de contagem manual', 'Corrigir erro de cadastro'],
};

const TIPOS_AJUSTE = [
  { key: 'entrada',   label: '📦 Entrada',   cor: 'verde',    desc: 'Reposição de mercadoria, compra de fornecedor.' },
  { key: 'saida',     label: '📤 Saída',      cor: 'azul',     desc: 'Saída não registrada como venda.' },
  { key: 'perda',     label: '🗑️ Perda',      cor: 'vermelho', desc: 'Produto vencido, danificado ou extraviado.' },
  { key: 'devolucao', label: '↩️ Devolução',  cor: 'roxo',     desc: 'Devolução de cliente ou ao fornecedor.' },
  { key: 'correcao',  label: '✏️ Correção',   cor: 'amarelo',  desc: 'Define o estoque exatamente no valor informado.' },
];

function digitarValorMascarado(valorBruto, casasDecimais) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / Math.pow(10, casasDecimais);
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais });
}

// Converte um número no formato brasileiro (com ponto de milhar e vírgula
// decimal) pra float de verdade — usar sempre no lugar de um simples
// .replace(',', '.'), que quebra se tiver ponto de milhar no meio.
function paraFloatBR(valor) {
  return parseFloat(String(valor).replace(/\./g, '').replace(',', '.'));
}

// Formata um número (vindo do banco) pro mesmo padrão de vírgula, usado
// só na hora de popular o formulário ao editar um produto existente.
function formatarValorBR(valor, casasDecimais) {
  const numero = typeof valor === 'string' ? paraFloatBR(valor) : parseFloat(valor);
  return (numero || 0).toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais });
}

// Mesma coisa que formatarValorBR, mas preserva "em branco" — usada ao
// re-formatar um campo (ex: trocando Unidade↔Quilo) sem forçar um "0"
// a aparecer num campo que a pessoa deixou vazio de propósito.
function formatarValorBRSeTiver(valor, casasDecimais) {
  if (valor === '' || valor === null || valor === undefined) return '';
  return formatarValorBR(valor, casasDecimais);
}

/* ── Comprime a foto no navegador antes de enviar — nunca sobe a
   imagem em tamanho original. Redimensiona pro maior lado ficar em
   720px e converte pra JPEG 82%, deixando cada foto na faixa de
   60-180KB — ainda leve, mas com definição boa o suficiente pra
   expandir em tela cheia sem ficar borrada. Fica em escopo de módulo
   (não dentro do ProdutoModal) pra VariacoesTabela também poder usar,
   na foto por variação. ── */
function comprimirImagem(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 720;
        let { width, height } = img;
        if (width > height && width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
        else if (height >= width && height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Não foi possível ler essa imagem.'));
      img.src = e.target.result;
    };
    leitor.onerror = () => reject(new Error('Não foi possível ler esse arquivo.'));
    leitor.readAsDataURL(file);
  });
}

// Ajuda de campo: aparece no hover (desktop) E dá pra clicar (celular,
// onde não tem hover). Um só componente reutilizado em todos os labels
// do formulário.
function CampoAjuda({ texto }) {
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function handleClickFora(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  return (
    <span className="prod-ajuda-wrap" ref={wrapRef}>
      <button
        type="button"
        className="prod-ajuda-btn"
        onClick={e => { e.preventDefault(); setAberto(a => !a); }}
        aria-label="Ajuda sobre este campo"
      >
        ?
      </button>
      <span className={`prod-ajuda-texto${aberto ? ' aberto' : ''}`} role="tooltip">
        {texto}
      </span>
    </span>
  );
}

// Tabela de variações (tamanho/cor) — cada linha tem estoque próprio, e
// preço opcional (em branco = usa o preço de venda padrão do produto).
function VariacoesTabela({ variacoes, setVariacoes, opcoesTamanho, opcoesCor, opcoesGenero, unidadeMedida, somenteLeitura, precoBase, precoCustoBase, onGerenciarOpcoes, estabelecimentoId, produtoId, isEdit }) {
  const [gerandoIdx, setGerandoIdx] = useState(null);
  const [enviandoImagemIdx, setEnviandoImagemIdx] = useState(null);
  const [erroImagem, setErroImagem] = useState('');
  const imagemInputRef = useRef(null);
  const idxImagemAlvo = useRef(null);

  function adicionar() {
    setVariacoes(prev => [...prev, {
      _key: Math.random().toString(36).slice(2),
      tamanho: '', cor: '', genero: '',
      codigo_barras: '',
      estoque_atual: '',
      preco_custo: '',
      preco_venda: '',
      imagem_url: '',
      imagem_origem: '',
    }]);
  }
  function atualizarCampo(idx, campo, valor) {
    setVariacoes(prev => prev.map((v, i) => i === idx ? { ...v, [campo]: valor } : v));
  }
  function remover(idx) {
    setVariacoes(prev => prev.filter((_, i) => i !== idx));
  }

  async function gerarCodigo(idx) {
    setGerandoIdx(idx);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/gerar-codigo-interno`);
      const data = await resp.json();
      if (resp.ok) atualizarCampo(idx, 'codigo_barras', data.codigo);
    } catch { /* falha silenciosa — comerciante pode tentar de novo ou digitar na mão */ }
    finally { setGerandoIdx(null); }
  }

  // Foto por variação — só funciona depois que a variação já foi salva ao
  // menos uma vez (tem um id de verdade no banco). Numa variação recém
  // adicionada nesta mesma sessão (ainda sem id), o botão avisa isso em
  // vez de tentar subir a foto pra um id que ainda não existe.
  function abrirSeletorImagem(idx) {
    const v = variacoes[idx];
    if (!isEdit || !v?.id) return;
    idxImagemAlvo.current = idx;
    imagemInputRef.current?.click();
  }

  async function selecionarImagemVariacao(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const idx = idxImagemAlvo.current;
    if (!file || idx == null) return;
    const v = variacoes[idx];
    if (!v?.id) return;
    if (!file.type.startsWith('image/')) { setErroImagem('Selecione um arquivo de imagem.'); return; }

    setErroImagem('');
    setEnviandoImagemIdx(idx);
    try {
      const base64 = await comprimirImagem(file);
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${produtoId}/variacoes/${v.id}/imagem`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imagem_base64: base64 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao enviar imagem.');
      atualizarCampo(idx, 'imagem_url', data.imagem_url);
      atualizarCampo(idx, 'imagem_origem', 'upload');
    } catch (err) {
      setErroImagem(err.message || 'Erro ao processar a imagem.');
    } finally {
      setEnviandoImagemIdx(null);
    }
  }

  async function removerImagemVariacao(idx) {
    const v = variacoes[idx];
    if (!v?.id) return;
    setEnviandoImagemIdx(idx);
    setErroImagem('');
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${produtoId}/variacoes/${v.id}/imagem`, { method: 'DELETE' });
      if (!resp.ok) { const data = await resp.json().catch(() => ({})); throw new Error(data.error || 'Erro ao remover imagem.'); }
      atualizarCampo(idx, 'imagem_url', '');
      atualizarCampo(idx, 'imagem_origem', '');
    } catch (err) {
      setErroImagem(err.message || 'Erro ao remover a imagem.');
    } finally {
      setEnviandoImagemIdx(null);
    }
  }

  const totalEstoque = variacoes.reduce((acc, v) => acc + (paraFloatBR(v.estoque_atual) || 0), 0);

  return (
    <div className="prod-form-group prod-form-full">
      <div className="prod-variacoes-header">
        <label className="prod-label" style={{ marginBottom: 0 }}>
          Variações
          <CampoAjuda texto="Cada linha é uma combinação de tamanho/cor/gênero, com estoque, foto e preços próprios. Digite um valor novo em tamanho/cor/gênero pra criar uma opção nova — ela fica salva como sugestão pra próxima vez. Preço em branco = usa o preço padrão do produto (lá embaixo, em Preços). Uma camiseta M azul precisa de um código de barras diferente da mesma camiseta G azul — se não tiver etiqueta de fábrica, gere um código próprio (🏷️)." />
        </label>
        {variacoes.length > 0 && (
          <span className="prod-label-unit">Estoque total: {fmtQ(totalEstoque, unidadeMedida)}</span>
        )}
      </div>

      {!somenteLeitura && (
        <button type="button" className="prod-btn-gerenciar-opcoes" onClick={onGerenciarOpcoes}>
          ⚙️ Gerenciar tamanhos, cores e gênero
        </button>
      )}

      {erroImagem && <div className="prod-modal-erro">⚠️ {erroImagem}</div>}

      {variacoes.length === 0 ? (
        <div className="prod-variacoes-vazio">Nenhuma variação ainda — clique em "+ Adicionar variação" abaixo.</div>
      ) : (
        <div className="prod-variacao-linha prod-variacao-cabecalho">
          <span>Tamanho</span><span>Cor</span><span>Gênero</span><span>Estoque ({unidadeMedida})</span><span></span>
        </div>
      )}

      {variacoes.map((v, idx) => (
        <div className="prod-variacao-grupo" key={v.id || v._key || idx}>
          <div className="prod-variacao-linha">
            <input
              className="prod-input"
              list="opcoes-tamanho-datalist"
              placeholder="P, M, G…"
              value={v.tamanho}
              onChange={e => atualizarCampo(idx, 'tamanho', e.target.value)}
              disabled={somenteLeitura}
            />
            <input
              className="prod-input"
              list="opcoes-cor-datalist"
              placeholder="Cor"
              value={v.cor}
              onChange={e => atualizarCampo(idx, 'cor', e.target.value)}
              disabled={somenteLeitura}
            />
            <input
              className="prod-input"
              list="opcoes-genero-datalist"
              placeholder="Masc, Fem, Unissex…"
              value={v.genero || ''}
              onChange={e => atualizarCampo(idx, 'genero', e.target.value)}
              disabled={somenteLeitura}
            />
            <input
              className="prod-input"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={v.estoque_atual}
              onChange={e => atualizarCampo(idx, 'estoque_atual', digitarValorMascarado(e.target.value, unidadeMedida === 'kg' ? 3 : 0))}
              disabled={somenteLeitura}
            />
            {!somenteLeitura && (
              <button type="button" className="prod-variacao-remover" onClick={() => remover(idx)} title="Remover variação">
                ✕
              </button>
            )}
          </div>

          <div className="prod-variacao-preco-linha">
            <div className="prod-variacao-foto-wrap">
              <button
                type="button"
                className="prod-variacao-foto-btn"
                onClick={() => abrirSeletorImagem(idx)}
                disabled={somenteLeitura || !isEdit || !v.id || enviandoImagemIdx === idx}
                title={!isEdit || !v.id ? 'Salve o produto primeiro pra poder adicionar foto desta variação' : 'Foto desta variação'}
              >
                {enviandoImagemIdx === idx ? (
                  <span className="prod-variacao-foto-loading">⏳</span>
                ) : v.imagem_url ? (
                  <img src={v.imagem_url} alt="" />
                ) : (
                  <IconePacote className="prod-variacao-foto-placeholder" />
                )}
              </button>
              {v.imagem_url && !somenteLeitura && (
                <button
                  type="button"
                  className="prod-variacao-foto-remover"
                  onClick={() => removerImagemVariacao(idx)}
                  disabled={enviandoImagemIdx === idx}
                  title="Remover foto desta variação"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="prod-input-moeda-wrap">
              <span className="prod-moeda-prefixo">R$</span>
              <input
                className="prod-input prod-input-moeda"
                type="text"
                inputMode="decimal"
                placeholder={precoCustoBase || '0,00'}
                value={v.preco_custo || ''}
                onChange={e => atualizarCampo(idx, 'preco_custo', digitarValorMascarado(e.target.value, 2))}
                disabled={somenteLeitura}
                title="Custo específico desta variação — em branco usa o preço de custo padrão do produto"
              />
              <span className="prod-input-moeda-legenda">custo</span>
            </div>
            <div className="prod-input-moeda-wrap">
              <span className="prod-moeda-prefixo">R$</span>
              <input
                className="prod-input prod-input-moeda"
                type="text"
                inputMode="decimal"
                placeholder={precoBase || '0,00'}
                value={v.preco_venda}
                onChange={e => atualizarCampo(idx, 'preco_venda', digitarValorMascarado(e.target.value, 2))}
                disabled={somenteLeitura}
                title="Preço de venda desta variação — em branco usa o preço de venda padrão do produto"
              />
              <span className="prod-input-moeda-legenda">venda</span>
            </div>
          </div>

          <div className="prod-variacao-codigo-linha">
            <input
              className="prod-input prod-variacao-codigo-input"
              placeholder="Código de barras da variação (opcional)"
              value={v.codigo_barras || ''}
              onChange={e => atualizarCampo(idx, 'codigo_barras', e.target.value)}
              disabled={somenteLeitura}
            />
            {!somenteLeitura && (
              <button
                type="button"
                className="prod-variacao-codigo-gerar"
                onClick={() => gerarCodigo(idx)}
                disabled={gerandoIdx === idx}
                title="Gerar um código de barras próprio pra essa variação (tamanho/cor sem etiqueta de fábrica)"
              >
                {gerandoIdx === idx ? '…' : '🏷️ Gerar'}
              </button>
            )}
          </div>
        </div>
      ))}

      <input
        ref={imagemInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={selecionarImagemVariacao}
      />

      <datalist id="opcoes-tamanho-datalist">
        {opcoesTamanho.map(o => <option key={o} value={o} />)}
      </datalist>
      <datalist id="opcoes-cor-datalist">
        {opcoesCor.map(o => <option key={o} value={o} />)}
      </datalist>
      <datalist id="opcoes-genero-datalist">
        {opcoesGenero.map(o => <option key={o} value={o} />)}
      </datalist>

      {!somenteLeitura && (
        <button type="button" className="prod-btn-add-variacao" onClick={adicionar}>
          + Adicionar variação
        </button>
      )}
    </div>
  );
}

// Combobox de categoria — busca por nome e mostra o contexto quando é
// uma subcategoria ("Jeans — em Calças"), coisa que um <select> nativo
// não consegue fazer bem.
function CategoriaSelect({ categorias, value, onChange, somenteLeitura }) {
  const [aberto, setAberto] = useState(false);
  const [busca,  setBusca]  = useState('');
  const wrapRef  = useRef(null);
  const buscaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    function handleClickFora(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) { setAberto(false); setBusca(''); }
    }
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  useEffect(() => {
    if (aberto) setTimeout(() => buscaRef.current?.focus(), 0);
  }, [aberto]);

  const raizes = categorias.filter(c => !c.categoria_pai_id);
  const porPai = {};
  categorias.forEach(c => { if (c.categoria_pai_id) (porPai[c.categoria_pai_id] ||= []).push(c); });

  const selecionada     = categorias.find(c => c.id === value);
  const paiDaSelecionada = selecionada?.categoria_pai_id ? categorias.find(c => c.id === selecionada.categoria_pai_id) : null;

  const termo = busca.trim().toLowerCase();
  const bate  = nome => !termo || nome.toLowerCase().includes(termo);

  const grupos = raizes
    .map(raiz => ({ raiz, subs: (porPai[raiz.id] || []).filter(s => bate(s.nome)) }))
    .filter(g => bate(g.raiz.nome) || g.subs.length > 0);

  function selecionar(id) {
    onChange(id);
    setAberto(false);
    setBusca('');
  }

  return (
    <div className="prod-cat-select-wrap" ref={wrapRef}>
      <button
        type="button"
        className="prod-cat-select-trigger"
        onClick={() => !somenteLeitura && setAberto(a => !a)}
        disabled={somenteLeitura}
      >
        <span className="prod-cat-select-trigger-texto">
          {!selecionada ? 'Sem categoria' : selecionada.nome}
          {paiDaSelecionada && <span className="prod-cat-select-trigger-pai"> — em "{paiDaSelecionada.nome}"</span>}
        </span>
        <span className="prod-cat-select-seta">{aberto ? '▲' : '▼'}</span>
      </button>

      {aberto && (
        <div className="prod-cat-select-painel">
          <input
            ref={buscaRef}
            className="prod-cat-select-busca"
            placeholder="Buscar categoria…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); setBusca(''); } }}
          />
          <div className="prod-cat-select-lista">
            <button type="button" className={`prod-cat-select-opcao${!value ? ' ativa' : ''}`} onClick={() => selecionar('')}>
              Sem categoria
            </button>
            {grupos.length === 0 && (
              <div className="prod-cat-select-vazio">Nenhuma categoria encontrada</div>
            )}
            {grupos.map(({ raiz, subs }) => (
              <React.Fragment key={raiz.id}>
                {bate(raiz.nome) && (
                  <button type="button" className={`prod-cat-select-opcao${value === raiz.id ? ' ativa' : ''}`} onClick={() => selecionar(raiz.id)}>
                    {raiz.nome}
                  </button>
                )}
                {subs.map(sub => (
                  <button
                    type="button"
                    key={sub.id}
                    className={`prod-cat-select-opcao prod-cat-select-opcao--sub${value === sub.id ? ' ativa' : ''}`}
                    onClick={() => selecionar(sub.id)}
                  >
                    {sub.nome} <span className="prod-cat-select-opcao-pai">em "{raiz.nome}"</span>
                  </button>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Ícone de "sem imagem" — SVG em vez de emoji, pra não depender da fonte
// de emoji do sistema (renderiza igual em qualquer navegador/SO)
function IconePacote({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function ProdutoModal({
  estabelecimentoId,
  produtoEditar,
  categorias: categoriasProp,
  onClose,
  onSalvo,
  onCategoriaCriada,
  somenteLeitura = false,
}) {
  const isEdit = !!produtoEditar;

  // ── Preferência salva de "Unidade x Quilo" (só produto novo) — se o
  // comerciante marcou "lembrar minha escolha" da última vez, pula a
  // etapa de pergunta e já abre o formulário com essa unidade.
  const CHAVE_PREF_UNIDADE = `produto_pref_unidade_${estabelecimentoId}`;
  const preferenciaUnidade = (!isEdit && !somenteLeitura)
    ? (() => { try { return localStorage.getItem(CHAVE_PREF_UNIDADE) || ''; } catch { return ''; } })()
    : '';

  const [form, setForm] = useState({
    nome:            '',
    marca:           '',
    codigo_barras:   '',
    categoria_id:    '',
    unidade_medida:  preferenciaUnidade || 'un',
    estoque_atual:   '',
    estoque_minimo:  '10',
    preco_custo:     '',
    preco_venda:     '',
    // ── Campos balança ──
    vendido_por_peso: false,
    plu_balanca:      '',
    // ── Variações ──
    tem_variacoes: false,
    // ── Imagem ──
    imagem_url:    '',
    imagem_origem: '',
  });

  const [variacoes,     setVariacoes]     = useState([]);
  const [opcoesTamanho, setOpcoesTamanho] = useState([]);
  const [opcoesCor,     setOpcoesCor]     = useState([]);
  const [opcoesGenero,  setOpcoesGenero]  = useState([]);
  const [gerenciarOpcoesAberto, setGerenciarOpcoesAberto] = useState(false);
  const [comoConfigurarAberto, setComoConfigurarAberto]   = useState(false);

  const [categorias,        setCategorias]        = useState(categoriasProp || []);
  const [novaCatAberta,     setNovaCatAberta]     = useState(false);
  const [novaCatNome,       setNovaCatNome]       = useState('');
  const [novaCatPaiId,      setNovaCatPaiId]      = useState('');
  const [salvandoCat,       setSalvandoCat]       = useState(false);
  const [salvando,          setSalvando]          = useState(false);
  const [erro,              setErro]              = useState('');
  const [showCamera,        setShowCamera]        = useState(false);
  const [scanFlash,         setScanFlash]         = useState(false);
  const [buscandoCodigo,    setBuscandoCodigo]    = useState(false);
  const [autoPreenchido,    setAutoPreenchido]    = useState(null); // 'catalogo' | 'openfoodfacts' | null
  const [nomeTraduzido,     setNomeTraduzido]     = useState(false); // nome veio em outro idioma e foi traduzido automático
  const [ultimoAutoPreenchido, setUltimoAutoPreenchido] = useState(null); // { codigo, nome, marca, imagem_url } — snapshot do que a última busca preencheu
  const [gerandoCodigo,     setGerandoCodigo]     = useState(false);
  const [imagemErro,        setImagemErro]        = useState(false);
  const [imagemExpandidaAberta, setImagemExpandidaAberta] = useState(false);
  const [imagemPendenteBase64, setImagemPendenteBase64] = useState(null); // foto própria staged até o produto (novo) ganhar um id
  const [enviandoImagem,       setEnviandoImagem]       = useState(false);
  const imagemInputRef = useRef(null);
  const imagemCameraRef = useRef(null);
  const [marcasExistentes,  setMarcasExistentes]  = useState([]);
  const [sugestaoMarca,     setSugestaoMarca]     = useState(null); // { marca, exata } | null

  // ── Etapa inicial (só produto novo) — pergunta Unidade x Quilo, e se
  // for pesável, se tem etiqueta de balança, e se tem variações — tudo
  // antes de abrir o formulário completo, navegável por teclado (setas +
  // Enter). 'unidade' = 1ª pergunta, 'etiqueta' = sub-pergunta (só quando
  // escolhe Quilo), 'variacoes' = última pergunta (sempre), null = pula
  // direto pro form (edição, somente leitura, ou preferência salva pula
  // as duas primeiras perguntas e vai direto pra "tem variações?").
  const [etapaAtiva,       setEtapaAtiva]       = useState(
    isEdit || somenteLeitura ? null : (preferenciaUnidade ? 'variacoes' : 'unidade')
  );
  const [etapaUnidadeSel,   setEtapaUnidadeSel]   = useState(preferenciaUnidade || 'un');
  const [etapaEtiquetaSel,  setEtapaEtiquetaSel]  = useState(true); // combina com o padrão já usado no form normal
  const [etapaVariacoesSel, setEtapaVariacoesSel] = useState(false);
  const [etapaLembrar,     setEtapaLembrar]     = useState(false);
  const [prefUnidadeLimpa, setPrefUnidadeLimpa] = useState(false);

  // Refs dos botões da etapa inicial — usados pra mover o foco de verdade
  // junto com a navegação por seta (senão o foco visual do navegador fica
  // "grudado" no botão que tinha autoFocus, mesmo depois de mudar a seleção
  // só por estado, dando a impressão de que a opção errada ainda tá marcada).
  const etapaBtnRefs = useRef({});

  // ── Ajuste de estoque (só no modo edição — substitui a edição livre) ──
  const [ajusteTipo,     setAjusteTipo]     = useState('entrada');
  const [ajusteQtd,      setAjusteQtd]      = useState('');
  const [ajusteMotivo,   setAjusteMotivo]   = useState('');
  const [ajusteUnidade,  setAjusteUnidade]  = useState('kg'); // 'kg' | 'g'
  const [ajustando,      setAjustando]      = useState(false);
  const [ajusteMsg,      setAjusteMsg]      = useState('');

  const nomeRef        = useRef(null);
  const novaCatRef     = useRef(null);
  const codigoBarrasRef = useRef(null);
  const debounceMarcaRef = useRef(null);

  /* ── Preencher form no modo editar ──────────────────────── */
  useEffect(() => {
    if (isEdit) {
      setForm({
        nome:             produtoEditar.nome             || '',
        marca:            produtoEditar.marca            || '',
        codigo_barras:    produtoEditar.codigo_barras    || '',
        categoria_id:     produtoEditar.categoria_id     || '',
        unidade_medida:   produtoEditar.unidade_medida   || 'un',
        estoque_atual:    formatarValorBR(produtoEditar.estoque_atual,  produtoEditar.unidade_medida === 'kg' ? 3 : 0),
        estoque_minimo:   formatarValorBR(produtoEditar.estoque_minimo, produtoEditar.unidade_medida === 'kg' ? 3 : 0),
        preco_custo:      formatarValorBR(produtoEditar.preco_custo, 2),
        preco_venda:      formatarValorBR(produtoEditar.preco_venda, 2),
        vendido_por_peso: produtoEditar.vendido_por_peso || false,
        plu_balanca:      produtoEditar.plu_balanca      || '',
        tem_variacoes:    produtoEditar.tem_variacoes     || false,
        imagem_url:       produtoEditar.imagem_url        || '',
        imagem_origem:    produtoEditar.imagem_origem     || '',
      });
      setVariacoes((produtoEditar.variacoes || []).map(v => ({
        id:             v.id,
        tamanho:        v.tamanho || '',
        cor:            v.cor || '',
        genero:         v.genero || '',
        codigo_barras:  v.codigo_barras || '',
        estoque_atual:  formatarValorBR(v.estoque_atual, produtoEditar.unidade_medida === 'kg' ? 3 : 0),
        preco_custo:    v.preco_custo != null ? formatarValorBR(v.preco_custo, 2) : '',
        preco_venda:    v.preco_venda != null ? formatarValorBR(v.preco_venda, 2) : '',
        imagem_url:     v.imagem_url    || '',
        imagem_origem:  v.imagem_origem || '',
      })));
    }
    // Produto novo: foco direto em código de barras, já que o fluxo normal
    // é bipar/digitar primeiro pra puxar nome/marca automaticamente.
    // Editando um produto existente: foco em nome, como já era.
    setTimeout(() => {
      if (isEdit) nomeRef.current?.focus();
      else codigoBarrasRef.current?.focus();
    }, 0);
  }, []);

  /* ── Foco na nova categoria ─────────────────────────────── */
  useEffect(() => {
    if (novaCatAberta) setTimeout(() => novaCatRef.current?.focus(), 0);
  }, [novaCatAberta]);

  /* ── Carregar marcas já cadastradas (sugestão no campo Marca) ── */
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/marcas`);
        if (resp.ok) setMarcasExistentes(await resp.json());
      } catch { /* sugestão é acessório, falha silenciosa */ }
    })();
  }, [estabelecimentoId]);

  /* ── Carregar presets de tamanho/cor/gênero (sugestão nas variações) ── */
  async function carregarOpcoesVariacao() {
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/opcoes-variacao`);
      if (resp.ok) {
        const d = await resp.json();
        setOpcoesTamanho(d.tamanho || []);
        setOpcoesCor(d.cor || []);
        setOpcoesGenero(d.genero || []);
      }
    } catch { /* sugestão é acessório, falha silenciosa */ }
  }
  useEffect(() => { carregarOpcoesVariacao(); }, [estabelecimentoId]);

  /* ── Etapa inicial: Unidade x Quilo → (Etiqueta) → Variações ── */
  // Só o passo "variações" de fato finaliza — os passos anteriores só
  // guardam a resposta e avançam, pra tudo virar um único "aplicar" no
  // form no final (evita re-render/estado inconsistente no meio do caminho).
  function focarBotaoEtapa(chave) {
    setTimeout(() => etapaBtnRefs.current[chave]?.focus(), 0);
  }
  function finalizarEtapas(temVariacoes) {
    setForm(prev => ({
      ...prev,
      unidade_medida: etapaUnidadeSel,
      vendido_por_peso: etapaUnidadeSel === 'kg' ? etapaEtiquetaSel : false,
      tem_variacoes: temVariacoes,
    }));
    if (etapaLembrar) {
      try { localStorage.setItem(CHAVE_PREF_UNIDADE, etapaUnidadeSel); } catch { /* localStorage indisponível, segue sem lembrar */ }
    }
    setEtapaAtiva(null);
    setTimeout(() => codigoBarrasRef.current?.focus(), 0);
  }
  function confirmarEtapaUnidade(valor) {
    setEtapaUnidadeSel(valor);
    if (valor === 'kg') { setEtapaAtiva('etiqueta'); focarBotaoEtapa('etiqueta:sim'); return; }
    setEtapaAtiva('variacoes');
    focarBotaoEtapa('variacoes:nao');
  }
  function confirmarEtapaEtiqueta(comEtiqueta) {
    setEtapaEtiquetaSel(comEtiqueta);
    setEtapaAtiva('variacoes');
    focarBotaoEtapa('variacoes:nao');
  }
  function confirmarEtapaVariacoes(temVariacoes) {
    setEtapaVariacoesSel(temVariacoes);
    finalizarEtapas(temVariacoes);
  }
  function voltarEtapaUnidade() {
    setEtapaAtiva('unidade');
    focarBotaoEtapa('unidade:un');
  }
  function voltarDeVariacoes() {
    // Se a unidade veio de uma preferência salva, não passou pelas
    // perguntas de unidade/etiqueta nessa sessão — não tem pra onde voltar.
    if (preferenciaUnidade) return false;
    if (etapaUnidadeSel === 'kg') { setEtapaAtiva('etiqueta'); focarBotaoEtapa('etiqueta:sim'); }
    else { setEtapaAtiva('unidade'); focarBotaoEtapa('unidade:un'); }
    return true;
  }
  function limparPreferenciaUnidade() {
    try { localStorage.removeItem(CHAVE_PREF_UNIDADE); } catch { /* nada a limpar */ }
    setPrefUnidadeLimpa(true);
  }

  /* ── Navegação por teclado na etapa inicial (setas + Enter) ── */
  useEffect(() => {
    if (!etapaAtiva) return;
    function handleKeyEtapa(e) {
      if (etapaAtiva === 'unidade') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setEtapaUnidadeSel('un'); etapaBtnRefs.current['unidade:un']?.focus(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setEtapaUnidadeSel('kg'); etapaBtnRefs.current['unidade:kg']?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); confirmarEtapaUnidade(etapaUnidadeSel); }
      } else if (etapaAtiva === 'etiqueta') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setEtapaEtiquetaSel(true); etapaBtnRefs.current['etiqueta:sim']?.focus(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setEtapaEtiquetaSel(false); etapaBtnRefs.current['etiqueta:nao']?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); confirmarEtapaEtiqueta(etapaEtiquetaSel); }
        else if (e.key === 'Backspace') { e.preventDefault(); voltarEtapaUnidade(); }
      } else if (etapaAtiva === 'variacoes') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setEtapaVariacoesSel(true); etapaBtnRefs.current['variacoes:sim']?.focus(); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setEtapaVariacoesSel(false); etapaBtnRefs.current['variacoes:nao']?.focus(); }
        else if (e.key === 'Enter') { e.preventDefault(); confirmarEtapaVariacoes(etapaVariacoesSel); }
        else if (e.key === 'Backspace') { e.preventDefault(); voltarDeVariacoes(); }
      }
    }
    window.addEventListener('keydown', handleKeyEtapa);
    return () => window.removeEventListener('keydown', handleKeyEtapa);
  }, [etapaAtiva, etapaUnidadeSel, etapaEtiquetaSel, etapaVariacoesSel]);

  /* ── Foco inicial da etapa (1ª pergunta, ou "variações" direto se já
     tem preferência de unidade salva) — só roda uma vez, no mount ── */
  useEffect(() => {
    if (etapaAtiva === 'unidade') focarBotaoEtapa('unidade:un');
    else if (etapaAtiva === 'variacoes') focarBotaoEtapa('variacoes:nao');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── ESC fecha ──────────────────────────────────────────── */
  useEffect(() => {
    return () => clearTimeout(debounceMarcaRef.current);
  }, []);

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape') {
        if (showCamera) return;
        if (imagemExpandidaAberta) setImagemExpandidaAberta(false);
        else if (novaCatAberta) setNovaCatAberta(false);
        else if (etapaAtiva === 'etiqueta') setEtapaAtiva('unidade');
        else if (etapaAtiva === 'variacoes') { if (!voltarDeVariacoes()) onClose(); }
        else onClose();
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [imagemExpandidaAberta, novaCatAberta, onClose, showCamera, etapaAtiva, etapaUnidadeSel]);

  /* ── Atualizar campo ─────────────────────────────────────── */
  function atualizar(e) {
    const { name, value, type, checked } = e.target;
    // Preço sempre com 2 casas; estoque com 3 casas se for kg, senão inteiro
    const casasPorCampo = {
      preco_custo:    2,
      preco_venda:    2,
      estoque_atual:  form.unidade_medida === 'kg' ? 3 : 0,
      estoque_minimo: form.unidade_medida === 'kg' ? 3 : 0,
    };
    setForm(prev => {
      const novo = {
        ...prev,
        [name]: type === 'checkbox'
          ? checked
          : casasPorCampo[name] !== undefined
            ? digitarValorMascarado(value, casasPorCampo[name])
            : value,
      };
      // Ao desmarcar vendido_por_peso, limpa PLU
      if (name === 'vendido_por_peso' && !checked) {
        novo.plu_balanca = '';
      }
      // Se marcar vendido_por_peso, força unidade_medida para 'kg'
      if (name === 'vendido_por_peso' && checked) {
        novo.unidade_medida = 'kg';
        novo.estoque_atual  = formatarValorBRSeTiver(prev.estoque_atual, 3);
        novo.estoque_minimo = formatarValorBRSeTiver(prev.estoque_minimo, 3);
      }
      return novo;
    });
  }

  /* ── Gera um código de barras interno (EAN-13, faixa 20-29) pro
     produto principal — usado quando ele não veio com código de
     fábrica (comum em roupa, calçado, artesanal). ── */
  async function gerarCodigoInterno() {
    setGerandoCodigo(true);
    setErro('');
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/gerar-codigo-interno`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar código.');
      setForm(prev => ({ ...prev, codigo_barras: data.codigo }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setGerandoCodigo(false);
    }
  }

  /* ── Auto-preenche nome/marca a partir do código de barras ──
     Só entra em ação se os campos ainda estiverem vazios — nunca
     sobrescreve o que o comerciante já digitou/editou. */
  async function buscarPorCodigoBarras(codigo) {
    if (isEdit || !codigo || codigo.trim().length < 6) return;
    if (buscandoCodigo) return; // já tem uma busca rolando (ex: debounce e onBlur coincidiram)
    setAutoPreenchido(null);
    setNomeTraduzido(false);
    setBuscandoCodigo(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/lookup-codigo?codigo=${encodeURIComponent(codigo.trim())}`);
      const json = await resp.json();
      if (resp.ok && json.encontrado) {
        const nomeNovo   = form.nome.trim()  ? form.nome  : json.nome;
        const marcaNovo  = form.marca.trim() ? form.marca : (json.marca || form.marca);
        const imagemNova = (!form.imagem_url && json.imagem_url) ? json.imagem_url : form.imagem_url;
        setForm(prev => ({
          ...prev,
          nome:  nomeNovo,
          marca: marcaNovo,
          imagem_url:    imagemNova,
          imagem_origem: (!prev.imagem_url && json.imagem_url) ? json.fonte : prev.imagem_origem,
        }));
        setAutoPreenchido(json.fonte);
        setNomeTraduzido(!!json.traduzido);
        // Guarda o que ficou preenchido por causa dessa busca — se o
        // código mudar depois, só limpa os campos que ainda baterem
        // exatamente com isso (ou seja, que o comerciante não editou
        // por cima manualmente)
        setUltimoAutoPreenchido({ codigo: codigo.trim(), nome: nomeNovo, marca: marcaNovo, imagem_url: imagemNova });
      }
    } catch {
      // Falha silenciosa — comerciante preenche na mão normalmente
    }
    setBuscandoCodigo(false);
  }

  /* ── Dispara a busca automaticamente uma pausa depois de parar de
     digitar — funciona igual pro bipador (digita tudo de uma vez, sem
     pausa, e já dispara rapidinho) e pra quem digita na mão devagar
     (não precisa apertar Enter nem sair do campo, só parar de digitar
     por meio segundo). onBlur/Enter continuam funcionando também, como
     atalho pra quem preferir. ── */
  useEffect(() => {
    if (isEdit) return;
    const codigo = form.codigo_barras.trim();

    // O código mudou (ou foi apagado) depois de uma busca anterior já
    // ter preenchido algo — se o comerciante não editou por cima do que
    // veio de lá, limpa, pra não ficar mostrando produto/imagem errados
    // pra esse código novo. Cada campo é checado separado: se só editou
    // o nome na mão, por exemplo, marca e imagem ainda são limpas.
    if (ultimoAutoPreenchido && codigo !== ultimoAutoPreenchido.codigo) {
      setForm(prev => {
        const nomeAindaAuto   = prev.nome === ultimoAutoPreenchido.nome;
        const marcaAindaAuto  = prev.marca === ultimoAutoPreenchido.marca;
        const imagemAindaAuto = prev.imagem_url === ultimoAutoPreenchido.imagem_url;
        if (!nomeAindaAuto && !marcaAindaAuto && !imagemAindaAuto) return prev; // editou tudo na mão, não mexe
        return {
          ...prev,
          nome:  nomeAindaAuto  ? '' : prev.nome,
          marca: marcaAindaAuto ? '' : prev.marca,
          imagem_url:    imagemAindaAuto ? '' : prev.imagem_url,
          imagem_origem: imagemAindaAuto ? '' : prev.imagem_origem,
        };
      });
      setAutoPreenchido(null);
      setNomeTraduzido(false);
      setUltimoAutoPreenchido(null);
    }

    if (!codigo || codigo.length < 6) return;
    const timer = setTimeout(() => buscarPorCodigoBarras(codigo), 500);
    return () => clearTimeout(timer);
  }, [form.codigo_barras, isEdit]);

  async function selecionarImagem(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois, se quiser trocar e voltar
    if (!file) return;
    if (!file.type.startsWith('image/')) { setErro('Selecione um arquivo de imagem.'); return; }

    setErro('');
    try {
      const base64 = await comprimirImagem(file);

      if (isEdit) {
        // Edição: produto já existe, sobe direto e persiste na hora
        setEnviandoImagem(true);
        const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${produtoEditar.id}/imagem`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ imagem_base64: base64 }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Erro ao enviar imagem.');
        setForm(prev => ({ ...prev, imagem_url: data.imagem_url, imagem_origem: 'upload' }));
      } else {
        // Criação: produto ainda não tem id — fica só na prévia local,
        // e sobe de verdade logo depois que o produto for criado
        setImagemPendenteBase64(base64);
        setForm(prev => ({ ...prev, imagem_url: '', imagem_origem: '' }));
      }
    } catch (err) {
      setErro(err.message || 'Erro ao processar a imagem.');
    } finally {
      setEnviandoImagem(false);
    }
  }

  async function removerImagem() {
    setErro('');
    if (isEdit && (form.imagem_url || produtoEditar?.imagem_url)) {
      try {
        setEnviandoImagem(true);
        const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${produtoEditar.id}/imagem`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Erro ao remover imagem.');
        setForm(prev => ({ ...prev, imagem_url: '', imagem_origem: '' }));
      } catch (err) {
        setErro(err.message);
      } finally {
        setEnviandoImagem(false);
      }
    } else {
      setImagemPendenteBase64(null);
      setForm(prev => ({ ...prev, imagem_url: '', imagem_origem: '' }));
    }
  }

  const imagemPreview = imagemPendenteBase64 || form.imagem_url || '';
  useEffect(() => { setImagemErro(false); }, [imagemPreview]);

  /* ── Verifica se a marca digitada é igual/parecida com uma que
     já existe, pra evitar cadastrar "Coca Cola" e "Coca-Cola" como
     coisas diferentes ── */
  function checarMarcaParecida(valor) {
    if (!valor || !valor.trim()) { setSugestaoMarca(null); return; }
    setSugestaoMarca(encontrarMarcaParecida(valor, marcasExistentes));
  }

  function usarMarcaSugerida() {
    if (!sugestaoMarca) return;
    setForm(prev => ({ ...prev, marca: sugestaoMarca.marca }));
    setSugestaoMarca(null);
  }


  function handleCodigoDetectado(codigo) {
    setShowCamera(false);
    setForm(prev => ({ ...prev, codigo_barras: codigo }));
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 1000);
    setTimeout(() => codigoBarrasRef.current?.focus(), 100);
    buscarPorCodigoBarras(codigo);
  }

  /* ── Criar nova categoria ───────────────────────────────── */
  async function criarCategoria() {
    if (!novaCatNome.trim()) return;
    setSalvandoCat(true);
    setErro('');
    try {
      const resp = await apiFetch(`/api/categorias`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nome: novaCatNome.trim(), categoria_pai_id: novaCatPaiId || null }),
      });
      const nova = await resp.json();
      if (!resp.ok) throw new Error(nova.error || 'Erro ao criar categoria');
      setCategorias(prev => [...prev, nova]);
      setForm(prev => ({ ...prev, categoria_id: nova.id }));
      setNovaCatNome('');
      setNovaCatPaiId('');
      setNovaCatAberta(false);
      onCategoriaCriada?.();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvandoCat(false);
    }
  }

  /* ── Ajuste de estoque (edição) — mesma rota do Ajuste Rápido ── */
  function digitarAjusteQtd(valorBruto) {
    const casas = form.unidade_medida === 'kg' ? (ajusteUnidade === 'g' ? 0 : 3) : 0;
    setAjusteQtd(digitarValorMascarado(valorBruto, casas));
  }

  async function enviarAjusteEstoque() {
    const qtdDigitada = paraFloatBR(ajusteQtd);
    const qtdConvertida = (form.unidade_medida === 'kg' && ajusteUnidade === 'g') ? qtdDigitada / 1000 : qtdDigitada;

    const resp = await apiFetch('/api/inventario/ajuste-rapido', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        produto_id: produtoEditar.id,
        tipo:       ajusteTipo,
        quantidade: qtdConvertida,
        motivo:     ajusteMotivo.trim(),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao ajustar estoque');
    return data;
  }

  /* ── Salvar produto ─────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setErro('');

    // Validação do ajuste de estoque, se o comerciante começou a preencher
    const temAjustePreenchido = isEdit && (ajusteQtd.trim() || ajusteMotivo.trim());
    if (temAjustePreenchido) {
      if (!ajusteQtd.trim() || paraFloatBR(ajusteQtd) <= 0) {
        setErro('Informe uma quantidade válida para o ajuste de estoque.');
        return;
      }
      if (!ajusteMotivo.trim()) {
        setErro('Informe o motivo do ajuste de estoque.');
        return;
      }
    }

    // Produto com variações precisa de pelo menos uma
    if (form.tem_variacoes && variacoes.length === 0) {
      setErro('Adicione ao menos uma variação, ou desmarque "Este produto tem variações".');
      return;
    }
    if (form.tem_variacoes && variacoes.some(v => !v.tamanho.trim() && !v.cor.trim() && !(v.genero || '').trim())) {
      setErro('Toda variação precisa de pelo menos um Tamanho, Cor ou Gênero preenchidos.');
      return;
    }

    setSalvando(true);

    const url = isEdit
      ? `/api/estabelecimentos/${estabelecimentoId}/produtos/${produtoEditar.id}`
      : `/api/estabelecimentos/${estabelecimentoId}/produtos`;

    try {
      const payload = {
        ...form,
        estoque_atual:  paraFloatBR(form.estoque_atual)  || 0,
        estoque_minimo: paraFloatBR(form.estoque_minimo) || 0,
        preco_custo:    paraFloatBR(form.preco_custo)    || 0,
        preco_venda:    paraFloatBR(form.preco_venda)    || 0,
        variacoes: form.tem_variacoes
          ? variacoes.map(v => ({
              ...(v.id ? { id: v.id } : {}),
              tamanho:       v.tamanho.trim() || null,
              cor:           v.cor.trim() || null,
              genero:        (v.genero || '').trim() || null,
              codigo_barras: (v.codigo_barras || '').trim() || null,
              estoque_atual: paraFloatBR(v.estoque_atual) || 0,
              preco_custo:   (v.preco_custo || '').trim() ? paraFloatBR(v.preco_custo) : null,
              preco_venda:   v.preco_venda.trim() ? paraFloatBR(v.preco_venda) : null,
              imagem_url:    v.imagem_url || null,
              imagem_origem: v.imagem_url ? (v.imagem_origem || null) : null,
            }))
          : [],
      };
      const resp = await apiFetch(url, {
        method:  isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar produto');

      // Produto novo com foto própria selecionada — não existia id até
      // agora pra poder subir, então sobe só depois de criado
      if (!isEdit && imagemPendenteBase64 && data?.id) {
        try {
          await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/${data.id}/imagem`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ imagem_base64: imagemPendenteBase64 }),
          });
        } catch {
          // Produto já foi criado normalmente — só a foto que não subiu,
          // dá pra adicionar depois editando o produto
        }
      }

      // Produto salvo — se tinha ajuste de estoque preenchido, aplica agora
      if (temAjustePreenchido) {
        try {
          setAjustando(true);
          await enviarAjusteEstoque();
        } catch (ajusteErr) {
          // O produto já foi salvo — avisa que só o ajuste de estoque falhou
          setErro(`Produto salvo, mas o ajuste de estoque falhou: ${ajusteErr.message}`);
          setSalvando(false);
          setAjustando(false);
          return;
        }
        setAjustando(false);
      }

      onSalvo(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ── Labels dinâmicos por unidade ───────────────────────── */
  const isKg        = form.unidade_medida === 'kg';
  // Produto pesado (kg) SEM etiqueta de balança (granel puro, tipo
  // hortifruti) não tem código de barras nenhum pra bipar — no PDV
  // esse produto é sempre achado pela busca por nome, nunca por scan.
  // Só faz sentido ter código de barras aqui se for 'un' (produto de
  // fábrica/etiqueta própria) OU 'kg' COM etiqueta de balança (nesse
  // caso o campo guarda o código interno de 5 dígitos, não um EAN normal).
  const granelSemEtiqueta = isKg && !form.vendido_por_peso;

  /* ── Prévia do ajuste de estoque, ao vivo conforme digita ── */
  const ajusteQtdDigitada  = paraFloatBR(ajusteQtd);
  const ajusteQtdConvertida = (isKg && ajusteUnidade === 'g') ? ajusteQtdDigitada / 1000 : ajusteQtdDigitada;
  const estoqueAtualNum = paraFloatBR(form.estoque_atual);
  const estoqueDepois = ajusteQtd.trim()
    ? (ajusteTipo === 'correcao' ? ajusteQtdConvertida
        : ['entrada', 'devolucao'].includes(ajusteTipo) ? estoqueAtualNum + ajusteQtdConvertida
        : Math.max(0, estoqueAtualNum - ajusteQtdConvertida))
    : null;
  const labelVenda  = isKg ? 'Preço de venda (R$/kg) *' : 'Preço de venda (R$/un) *';
  const labelCusto  = isKg ? 'Preço de custo (R$/kg)' : 'Preço de custo (R$/un)';

  /* ════════════════════════════════════════════════════════ */
  return (
    <>
      {/* Modal da câmera — renderizado fora do prod-modal para z-index correto */}
      {showCamera && (
        <ModalCamera
          onCodigoDetectado={handleCodigoDetectado}
          onFechar={() => setShowCamera(false)}
        />
      )}

      <div className="prod-modal-overlay">
        <div className="prod-modal">

          <div className="prod-modal-titulo">
            {somenteLeitura ? '👁️ Visualizar produto' : isEdit ? '✏️ Editar produto' : '➕ Novo produto'}
          </div>

          {etapaAtiva ? (
            <div className="prod-etapa-unidade">
              {etapaAtiva === 'unidade' ? (
                <>
                  <p className="prod-etapa-pergunta">Como esse produto é vendido?</p>
                  <p className="prod-etapa-sub">Use as setas (←→) e Enter — ou clique numa opção.</p>
                  <div className="prod-unidade-toggle prod-unidade-toggle--compacta" style={{ marginTop: 14 }}>
                    {[
                      { value: 'un', label: 'Unidade', sub: 'peças, caixas, pacotes', icon: '📦' },
                      { value: 'kg', label: 'Quilo',   sub: 'granel, frios, hortifruti', icon: '⚖️' },
                    ].map(op => (
                      <button
                        key={op.value}
                        type="button"
                        ref={el => { etapaBtnRefs.current[`unidade:${op.value}`] = el; }}
                        className={`prod-unidade-btn prod-unidade-btn--compacta${etapaUnidadeSel === op.value ? ' ativo' : ''}`}
                        onClick={() => confirmarEtapaUnidade(op.value)}
                        onFocus={() => setEtapaUnidadeSel(op.value)}
                      >
                        <span className="prod-unidade-icon">{op.icon}</span>
                        <span className="prod-unidade-label">{op.label}</span>
                        <span className="prod-unidade-sub">{op.sub}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : etapaAtiva === 'etiqueta' ? (
                <>
                  <p className="prod-etapa-pergunta">⚖️ Esse produto tem etiqueta de balança com código de barras?</p>
                  <p className="prod-etapa-sub">A balança imprime uma etiqueta EAN-13 e o caixa bipa no PDV — o peso entra sozinho. Use as setas e Enter — ou clique.</p>
                  <div className="prod-unidade-toggle prod-unidade-toggle--compacta" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      ref={el => { etapaBtnRefs.current['etiqueta:sim'] = el; }}
                      className={`prod-unidade-btn prod-unidade-btn--compacta${etapaEtiquetaSel ? ' ativo' : ''}`}
                      onClick={() => confirmarEtapaEtiqueta(true)}
                      onFocus={() => setEtapaEtiquetaSel(true)}
                    >
                      <span className="prod-unidade-icon">🏷️</span>
                      <span className="prod-unidade-label">Sim, tem etiqueta</span>
                      <span className="prod-unidade-sub">bipa no PDV, peso automático</span>
                    </button>
                    <button
                      type="button"
                      ref={el => { etapaBtnRefs.current['etiqueta:nao'] = el; }}
                      className={`prod-unidade-btn prod-unidade-btn--compacta${!etapaEtiquetaSel ? ' ativo' : ''}`}
                      onClick={() => confirmarEtapaEtiqueta(false)}
                      onFocus={() => setEtapaEtiquetaSel(false)}
                    >
                      <span className="prod-unidade-icon">✋</span>
                      <span className="prod-unidade-label">Não, é granel</span>
                      <span className="prod-unidade-sub">atendente digita o peso</span>
                    </button>
                  </div>
                  <button type="button" className="prod-etapa-voltar" onClick={voltarEtapaUnidade}>
                    ‹ Voltar (Backspace)
                  </button>
                </>
              ) : (
                <>
                  <p className="prod-etapa-pergunta">🎨 Esse produto tem variações (tamanho, cor, gênero)?</p>
                  <p className="prod-etapa-sub">Ex: uma camiseta em P/M/G, em cores diferentes, ou nas linhas masculina/feminina/infantil. Use as setas e Enter — ou clique.</p>
                  <div className="prod-unidade-toggle prod-unidade-toggle--compacta" style={{ marginTop: 14 }}>
                    <button
                      type="button"
                      ref={el => { etapaBtnRefs.current['variacoes:sim'] = el; }}
                      className={`prod-unidade-btn prod-unidade-btn--compacta${etapaVariacoesSel ? ' ativo' : ''}`}
                      onClick={() => confirmarEtapaVariacoes(true)}
                      onFocus={() => setEtapaVariacoesSel(true)}
                    >
                      <span className="prod-unidade-icon">🎨</span>
                      <span className="prod-unidade-label">Sim, tem variações</span>
                      <span className="prod-unidade-sub">tamanho, cor e/ou gênero</span>
                    </button>
                    <button
                      type="button"
                      ref={el => { etapaBtnRefs.current['variacoes:nao'] = el; }}
                      className={`prod-unidade-btn prod-unidade-btn--compacta${!etapaVariacoesSel ? ' ativo' : ''}`}
                      onClick={() => confirmarEtapaVariacoes(false)}
                      onFocus={() => setEtapaVariacoesSel(false)}
                    >
                      <span className="prod-unidade-icon">🔹</span>
                      <span className="prod-unidade-label">Não, produto único</span>
                      <span className="prod-unidade-sub">um só estoque e preço</span>
                    </button>
                  </div>
                  {!preferenciaUnidade && (
                    <button type="button" className="prod-etapa-voltar" onClick={voltarDeVariacoes}>
                      ‹ Voltar (Backspace)
                    </button>
                  )}
                </>
              )}

              <label className="prod-etapa-lembrar">
                <input
                  type="checkbox"
                  checked={etapaLembrar}
                  onChange={e => setEtapaLembrar(e.target.checked)}
                />
                Lembrar a unidade escolhida e não perguntar de novo nos próximos produtos
              </label>

              <div className="prod-modal-acoes">
                <button type="button" className="prod-modal-btn-cancelar" onClick={onClose}>
                  Cancelar (Esc)
                </button>
              </div>
            </div>
          ) : (
          <>
          {erro && <div className="prod-modal-erro">⚠️ {erro}</div>}

          <form onSubmit={salvar}>

            {/* ── Identificação ─────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">📋 Identificação</div>
              <div className="prod-form-grid">

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">
                    Imagem do produto
                    <CampoAjuda texto="Quando o código de barras é reconhecido, uma imagem sugerida (Open Food Facts ou catálogo colaborativo) já vem preenchida sozinha. Pode trocar por uma foto sua a qualquer momento — a foto própria fica só nesse estabelecimento, nunca é compartilhada com outras lojas." />
                  </label>
                  <div className="prod-imagem-row">
                    <div className="prod-imagem-preview">
                      {imagemPreview && !imagemErro ? (
                        <img src={imagemPreview} alt="" loading="lazy" onError={() => setImagemErro(true)} onClick={() => setImagemExpandidaAberta(true)} />
                      ) : (
                        <IconePacote className="prod-imagem-placeholder" />
                      )}
                      {enviandoImagem && <div className="prod-imagem-overlay">⏳</div>}
                    </div>
                    <div className="prod-imagem-acoes">
                      {imagemPreview && (
                        <span className={`prod-imagem-origem prod-imagem-origem--${form.imagem_origem || (imagemPendenteBase64 ? 'upload' : '')}`}>
                          {imagemPendenteBase64 || form.imagem_origem === 'upload' ? '📷 Sua foto' :
                           form.imagem_origem === 'openfoodfacts' ? '🌐 Open Food Facts' :
                           form.imagem_origem === 'openproductsfacts' ? '🌐 Open Products Facts' :
                           form.imagem_origem === 'catalogo' ? '🗂️ Catálogo' : ''}
                        </span>
                      )}
                      {!somenteLeitura && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="prod-imagem-btn"
                            onClick={() => imagemCameraRef.current?.click()}
                            disabled={enviandoImagem}
                            title="Abre a câmera do celular direto"
                          >
                            📷 Tirar foto
                          </button>
                          <button
                            type="button"
                            className="prod-imagem-btn"
                            onClick={() => imagemInputRef.current?.click()}
                            disabled={enviandoImagem}
                            title="Escolher uma foto já existente"
                          >
                            🖼️ Galeria
                          </button>
                          {imagemPreview && (
                            <button
                              type="button"
                              className="prod-imagem-btn prod-imagem-btn--remover"
                              onClick={removerImagem}
                              disabled={enviandoImagem}
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      )}
                      {/* Câmera direto — só no celular isso abre a câmera de verdade;
                          no desktop cai no mesmo seletor de arquivo de sempre */}
                      <input
                        ref={imagemCameraRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style={{ display: 'none' }}
                        onChange={selecionarImagem}
                      />
                      <input
                        ref={imagemInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={selecionarImagem}
                      />
                    </div>
                  </div>
                </div>

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">
                    Código de barras
                    {granelSemEtiqueta && <span className="prod-label-unit"> (opcional)</span>}
                    <CampoAjuda texto={granelSemEtiqueta
                      ? "Produto pesado sem etiqueta de balança geralmente não tem código de barras — no PDV ele é encontrado pela busca por nome, não por scan. Só preencha se esse produto tiver mesmo um código de fábrica (ex: saco fechado do fornecedor)."
                      : "Bipa com o leitor ou digita o EAN/UPC aqui. Assim que sair do campo, o sistema já tenta puxar nome e marca automaticamente (catálogo interno ou Open Food Facts)."} />
                  </label>
                  <div className="prod-codigo-row">
                    <input
                      ref={codigoBarrasRef}
                      className={`prod-input${scanFlash ? ' prod-input-scan-flash' : ''}`}
                      name="codigo_barras"
                      readOnly={somenteLeitura}
                      placeholder={granelSemEtiqueta ? 'Normalmente fica em branco…' : 'Digite ou escaneie…'}
                      value={form.codigo_barras}
                      onChange={atualizar}
                      onBlur={e => buscarPorCodigoBarras(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigoBarras(e.target.value); } }}
                    />
                    {!somenteLeitura && (
                      <button
                        type="button"
                        className="prod-btn-scan prod-btn-scan--desktop-only"
                        onClick={() => setShowCamera(true)}
                        title="Escanear código de barras pela câmera"
                      >
                        📷
                      </button>
                    )}
                    {!somenteLeitura && !form.codigo_barras && !granelSemEtiqueta && (
                      <button
                        type="button"
                        className="prod-btn-gerar-codigo"
                        onClick={gerarCodigoInterno}
                        disabled={gerandoCodigo}
                        title="Gera um código de barras próprio pra esse produto, pra imprimir e colar na peça (faixa reservada 20-29, não colide com nenhum código de fabricante)"
                      >
                        {gerandoCodigo ? '…' : '🏷️ Gerar código'}
                      </button>
                    )}
                  </div>
                  {granelSemEtiqueta && !form.codigo_barras && (
                    <span className="prod-label-hint">
                      Produto pesado vendido a granel (sem etiqueta de balança) não precisa de código de barras — pode deixar em branco. No PDV, esse produto é encontrado digitando o nome na busca.
                    </span>
                  )}
                  {!granelSemEtiqueta && !buscandoCodigo && !autoPreenchido && !form.codigo_barras && (
                    <span className="prod-label-hint">
                      Produto sem código de barras de fábrica (comum em roupa/calçado)? Clique em "Gerar código" — a etiqueta pode ser impressa e colada na peça, funciona igual qualquer código de barras no bipe.
                    </span>
                  )}
                  {buscandoCodigo && (
                    <small style={{ display: 'block', marginTop: 6, fontSize: '0.78rem', color: 'var(--est-text-muted, #94a3b8)' }}>
                      🔎 Buscando nome e marca…
                    </small>
                  )}
                  {!buscandoCodigo && autoPreenchido && (
                    <small style={{ display: 'block', marginTop: 6, fontSize: '0.78rem', color: nomeTraduzido ? 'var(--est-text-warning, #b45309)' : 'var(--est-success, #16a34a)' }}>
                      {nomeTraduzido ? '🌐 Nome traduzido automaticamente' : '✓ Preenchido automaticamente'} {
                        autoPreenchido === 'catalogo' ? '(catálogo interno)' :
                        autoPreenchido === 'openproductsfacts' ? '(Open Products Facts)' :
                        '(Open Food Facts)'
                      } — {nomeTraduzido ? 'confira e corrija se necessário' : 'confira'} antes de salvar
                    </small>
                  )}
                </div>

                {form.vendido_por_peso && (
                  <div className="prod-form-group prod-form-full">
                    <label className="prod-label">
                      ⚖️ PLU na balança
                      <span className="prod-label-unit"> (referência)</span>
                      <CampoAjuda texto="Só um lembrete pro atendente — o número que ele digita direto na balança pra selecionar esse produto na hora de pesar. O código de verdade que o sistema usa pra identificar a etiqueta é o código de barras acima." />
                    </label>
                    <input
                      className="prod-input"
                      name="plu_balanca"
                      readOnly={somenteLeitura}
                      placeholder="Ex: 001, 042…"
                      value={form.plu_balanca}
                      onChange={atualizar}
                      maxLength={20}
                    />
                    <span className="prod-label-hint">Código padrão que o atendente digita na balança pra selecionar esse produto</span>
                  </div>
                )}

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">
                    Nome do produto *
                    <CampoAjuda texto="Como o produto aparece na busca do PDV, na lista de Estoque e no recibo impresso pro cliente. Seja específico (ex: inclua tamanho, cor ou modelo) pra facilitar achar depois." />
                  </label>
                  <input
                    ref={nomeRef}
                    className="prod-input"
                    name="nome"
                    readOnly={somenteLeitura}
                    placeholder="Nome do produto"
                    value={form.nome}
                    onChange={atualizar}
                    required
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    Marca
                    <CampoAjuda texto="Ajuda a diferenciar produtos com o mesmo nome de marcas diferentes (ex: dois produtos com nome parecido, mas de fabricantes diferentes). Opcional." />
                  </label>
                  <input
                    className="prod-input"
                    name="marca"
                    list="marcas-existentes-datalist"
                    readOnly={somenteLeitura}
                    placeholder="Marca do produto"
                    value={form.marca}
                    onChange={e => {
                      atualizar(e);
                      const valor = e.target.value;
                      clearTimeout(debounceMarcaRef.current);
                      if (!valor.trim()) { setSugestaoMarca(null); return; }
                      debounceMarcaRef.current = setTimeout(() => checarMarcaParecida(valor), 400);
                    }}
                    onBlur={e => checarMarcaParecida(e.target.value)}
                    autoComplete="off"
                  />
                  <datalist id="marcas-existentes-datalist">
                    {marcasExistentes.map(m => <option key={m} value={m} />)}
                  </datalist>
                  {sugestaoMarca && (
                    <div className="prod-sugestao-marca" style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginTop: 6,
                      padding: '6px 10px', borderRadius: 8,
                      background: 'var(--est-bg-warning, rgba(245,158,11,0.1))',
                      border: '1px solid var(--est-border-warning, rgba(245,158,11,0.3))',
                    }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--est-text-warning, #b45309)' }}>
                        {sugestaoMarca.exata
                          ? <>Essa marca já existe como <strong>"{sugestaoMarca.marca}"</strong> — usar essa grafia?</>
                          : <>Marca parecida encontrada: <strong>"{sugestaoMarca.marca}"</strong>. Era essa?</>
                        }
                      </span>
                      <button type="button" onClick={usarMarcaSugerida}
                        style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#f59e0b', color: '#fff' }}>
                        Usar
                      </button>
                      <button type="button" onClick={() => setSugestaoMarca(null)}
                        style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 6, border: '1px solid var(--est-border, #ddd)', background: 'transparent', cursor: 'pointer' }}>
                        Não, é nova
                      </button>
                    </div>
                  )}
                  {!sugestaoMarca && marcasExistentes.length > 0 && (
                    <span className="prod-label-hint">
                      {marcasExistentes.length} marca(s) já cadastrada(s) — comece a digitar pra ver sugestões
                    </span>
                  )}
                </div>

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">
                    Categoria
                    <CampoAjuda texto="Agrupa o produto na barra lateral do Estoque e nos relatórios de produtos mais vendidos. Clique no + pra criar uma categoria nova sem sair daqui." />
                  </label>
                  <div className="prod-cat-row">
                    <CategoriaSelect
                      categorias={categorias}
                      value={form.categoria_id}
                      onChange={id => setForm(prev => ({ ...prev, categoria_id: id }))}
                      somenteLeitura={somenteLeitura}
                    />
                    <button
                      type="button"
                      className="prod-btn-nova-cat"
                      onClick={() => { setNovaCatAberta(p => !p); setNovaCatPaiId(''); }}
                      disabled={somenteLeitura}
                      title="Nova categoria"
                    >
                      +
                    </button>
                  </div>

                  {novaCatAberta && (
                    <div className="prod-nova-cat-form">
                      <input
                        ref={novaCatRef}
                        className="prod-input"
                        placeholder={novaCatPaiId ? 'Nome da subcategoria…' : 'Nome da categoria…'}
                        value={novaCatNome}
                        onChange={e => setNovaCatNome(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); } }}
                      />
                      <select
                        className="prod-nova-cat-select-pai"
                        value={novaCatPaiId}
                        onChange={e => setNovaCatPaiId(e.target.value)}
                        title="Categoria principal (opcional)"
                      >
                        <option value="">— Categoria principal —</option>
                        {categorias.filter(c => !c.categoria_pai_id).map(c => (
                          <option key={c.id} value={c.id}>↳ dentro de "{c.nome}"</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="prod-nova-cat-btn-salvar"
                        onClick={criarCategoria}
                        disabled={salvandoCat}
                      >
                        {salvandoCat ? '…' : '✓'}
                      </button>
                      <button
                        type="button"
                        className="prod-nova-cat-btn-cancelar"
                        onClick={() => { setNovaCatAberta(false); setNovaCatNome(''); setNovaCatPaiId(''); }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ── Estoque ───────────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">📦 Estoque & Unidade</div>
              <div className="prod-form-grid">

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">
                    Vendido por *
                    <CampoAjuda texto="Unidade: peças, caixas, pacotes — venda por número inteiro. Quilo: produtos a granel, frios, hortifruti — venda por peso, com casas decimais." />
                  </label>
                  <div className="prod-unidade-toggle">
                    {[
                      { value: 'un', label: 'Unidade', sub: 'peças, caixas, pacotes', icon: '📦' },
                      { value: 'kg', label: 'Quilo',   sub: 'granel, frios, hortifruti', icon: '⚖️' },
                    ].map(op => (
                      <button
                        key={op.value}
                        type="button"
                        className={`prod-unidade-btn${form.unidade_medida === op.value ? ' ativo' : ''}`}
                        onClick={() => !somenteLeitura && setForm(prev => ({
                          ...prev,
                          unidade_medida: op.value,
                          estoque_atual:  formatarValorBRSeTiver(prev.estoque_atual,  op.value === 'kg' ? 3 : 0),
                          estoque_minimo: formatarValorBRSeTiver(prev.estoque_minimo, op.value === 'kg' ? 3 : 0),
                          // "Pesável com etiqueta de balança" só faz sentido vendendo por
                          // Quilo. Trocando pra Unidade, desmarca e limpa o PLU, senão
                          // fica um valor escondido (checkbox some da tela, mas o dado
                          // continua marcado por baixo e seria enviado do mesmo jeito).
                          // Trocando DE Unidade PARA Quilo, já vem marcado — é o caso
                          // mais comum. Não força de novo se já estava em Quilo, pra
                          // não desfazer caso a pessoa tenha desmarcado de propósito.
                          ...(op.value === 'un'
                            ? { vendido_por_peso: false, plu_balanca: '' }
                            : prev.unidade_medida !== 'kg' ? { vendido_por_peso: true } : {}),
                        }))}
                      >
                        <span className="prod-unidade-icon">{op.icon}</span>
                        <span className="prod-unidade-label">{op.label}</span>
                        <span className="prod-unidade-sub">{op.sub}</span>
                      </button>
                    ))}
                  </div>
                  {!isEdit && !somenteLeitura && (
                    prefUnidadeLimpa ? (
                      <span className="prod-label-hint">✓ Preferência removida — o próximo produto novo vai perguntar de novo.</span>
                    ) : preferenciaUnidade ? (
                      <span className="prod-label-hint">
                        🔒 Produto novo sempre abre como <strong>{preferenciaUnidade === 'kg' ? 'Quilo' : 'Unidade'}</strong>.{' '}
                        <button
                          type="button"
                          onClick={limparPreferenciaUnidade}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--est-accent)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Mudar preferência
                        </button>
                      </span>
                    ) : null
                  )}
                </div>

                {form.unidade_medida === 'kg' && (
                  <div className="prod-form-group prod-form-full prod-balanca-inline">
                    <label className="prod-balanca-checkbox-label">
                      <input
                        type="checkbox"
                        name="vendido_por_peso"
                        checked={form.vendido_por_peso}
                        onChange={atualizar}
                        disabled={somenteLeitura}
                        className="prod-balanca-checkbox"
                      />
                      <span>
                        <strong>⚖️ Produto pesável com etiqueta de balança <CampoAjuda texto="Marque se a balança da loja imprime uma etiqueta com código de barras próprio pra esse produto. No PDV, basta bipar a etiqueta que o preço já é calculado pelo peso automaticamente — sem digitar nada na mão." /></strong>
                        <span className="prod-label-hint" style={{ display: 'block', marginTop: 2 }}>
                          A balança imprime etiqueta com código EAN-13. O caixa bipa e o preço é calculado pelo peso automaticamente.
                        </span>
                      </span>
                    </label>

                    {form.vendido_por_peso && (
                      <div className="prod-balanca-como-configurar">
                        <button
                          type="button"
                          className="prod-balanca-como-configurar-btn"
                          onClick={() => setComoConfigurarAberto(a => !a)}
                        >
                          💡 Como configurar {comoConfigurarAberto ? '▲' : '▼'}
                        </button>
                        {comoConfigurarAberto && (
                          <div className="prod-balanca-info">
                            <div>
                              No campo "Código de barras" acima, informe o{' '}
                              <strong>código interno</strong> do produto (dígitos 2–6 do EAN-13 da etiqueta).
                              Exemplo: se a balança gera <code>2 00123 01350 X</code>, o código interno é{' '}
                              <code>00123</code>. O campo PLU (logo abaixo do código de barras, no topo) é
                              apenas referência para o atendente saber qual número digitar na balança.
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="prod-form-group prod-form-full">
                  <label className="prod-balanca-checkbox-label">
                    <input
                      type="checkbox"
                      name="tem_variacoes"
                      checked={form.tem_variacoes}
                      onChange={atualizar}
                      disabled={somenteLeitura}
                      className="prod-balanca-checkbox"
                    />
                    <span>
                      <strong>
                        🎨 Este produto tem variações (tamanho/cor/gênero)
                        <CampoAjuda texto="Ative pra produtos que existem em mais de uma opção — ex: uma camiseta em P/M/G, em cores diferentes, ou em linha masculina/feminina/infantil. Cada variação vira sua própria linha de estoque, e pode ter preço diferente das outras." />
                      </strong>
                      <span className="prod-label-hint" style={{ display: 'block', marginTop: 2 }}>
                        O estoque e o preço passam a ser controlados por variação, não no produto como um todo.
                      </span>
                    </span>
                  </label>
                </div>

                {form.tem_variacoes ? (
                  <VariacoesTabela
                    variacoes={variacoes}
                    setVariacoes={setVariacoes}
                    opcoesTamanho={opcoesTamanho}
                    opcoesCor={opcoesCor}
                    opcoesGenero={opcoesGenero}
                    unidadeMedida={form.unidade_medida}
                    somenteLeitura={somenteLeitura}
                    precoBase={form.preco_venda}
                    precoCustoBase={form.preco_custo}
                    onGerenciarOpcoes={() => setGerenciarOpcoesAberto(true)}
                    estabelecimentoId={estabelecimentoId}
                    produtoId={produtoEditar?.id}
                    isEdit={isEdit}
                  />
                ) : (
                <>
                <div className="prod-form-group">
                  <label className="prod-label">
                    Estoque atual * <span className="prod-label-unit">({form.unidade_medida})</span>
                    <CampoAjuda texto="Quantidade disponível agora pra vender. Depois de criado, esse valor só muda pelo Ajuste de Estoque (abaixo) ou por vendas/movimentações — evita editar aqui sem deixar rastro." />
                  </label>
                  {isEdit ? (
                    <div className="prod-estoque-readonly">
                      {fmtQ(paraFloatBR(form.estoque_atual), form.unidade_medida)}
                    </div>
                  ) : (
                    <input
                      className="prod-input"
                      type="text"
                      inputMode="decimal"
                      name="estoque_atual"
                      placeholder="0"
                      readOnly={somenteLeitura}
                      value={form.estoque_atual}
                      onChange={atualizar}
                      required
                    />
                  )}
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    Estoque mínimo <span className="prod-label-unit">({form.unidade_medida})</span>
                    <CampoAjuda texto="Quando o estoque cair abaixo desse valor, o produto passa a aparecer com alerta de estoque baixo na lista. Ajuste conforme a velocidade de venda de cada produto." />
                  </label>
                  <input
                    className="prod-input"
                    type="text"
                    inputMode="decimal"
                    name="estoque_minimo"
                    readOnly={somenteLeitura}
                    value={form.estoque_minimo}
                    onChange={atualizar}
                  />
                  <span className="prod-label-hint">Alerta de estoque baixo</span>
                </div>

                {isEdit && !somenteLeitura && (
                  <div className="prod-form-group prod-form-full">
                    <div className="prod-ajuste-box">
                      <div className="prod-ajuste-titulo">
                        📦 Ajustar estoque <span className="prod-label-unit">(opcional)</span>
                      </div>

                      <div className="prod-tipos-ajuste">
                        {TIPOS_AJUSTE.map(t => (
                          <button key={t.key} type="button"
                            className={`prod-tipo-ajuste-btn prod-cor-${t.cor}${ajusteTipo === t.key ? ' ativo' : ''}`}
                            onClick={() => setAjusteTipo(t.key)}>
                            {t.label}
                          </button>
                        ))}
                      </div>

                      <div className="prod-ajuste-linha">
                        {isKg && (
                          <div className="prod-unidade-toggle">
                            {['kg', 'g'].map(u => (
                              <button key={u} type="button"
                                className={`prod-unidade-toggle-btn${ajusteUnidade === u ? ' ativo' : ''}`}
                                onClick={() => { setAjusteUnidade(u); setAjusteQtd(''); }}>
                                {u === 'kg' ? 'kg' : 'gramas'}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="prod-ajuste-qtd-wrap">
                          <input
                            className="prod-input prod-ajuste-qtd"
                            type="text"
                            inputMode="decimal"
                            placeholder={isKg && ajusteUnidade === 'kg' ? '0,000' : '0'}
                            value={ajusteQtd}
                            onChange={e => digitarAjusteQtd(e.target.value)}
                          />
                          {!isKg && <span className="prod-ajuste-qtd-unidade">un</span>}
                        </div>
                        <input
                          className="prod-input prod-ajuste-motivo"
                          placeholder="Motivo…"
                          value={ajusteMotivo}
                          onChange={e => setAjusteMotivo(e.target.value)}
                          list="motivos-ajuste-produto"
                        />
                        <datalist id="motivos-ajuste-produto">
                          {(MOTIVOS_SUGERIDOS_PRODUTO[ajusteTipo] || []).map(m => <option key={m} value={m} />)}
                        </datalist>
                      </div>

                      {estoqueDepois !== null && (
                        <div className="prod-ajuste-preview">
                          <span>Estoque atual: <strong>{fmtQ(estoqueAtualNum, form.unidade_medida)}</strong></span>
                          <span className="prod-ajuste-preview-seta">→</span>
                          <span>Após ajuste: <strong className={
                            estoqueDepois > estoqueAtualNum ? 'prod-ajuste-preview-mais'
                            : estoqueDepois < estoqueAtualNum ? 'prod-ajuste-preview-menos' : ''
                          }>{fmtQ(estoqueDepois, form.unidade_medida)}</strong></span>
                        </div>
                      )}

                      <span className="prod-ajuste-hint">Preenchendo aqui, é registrado como movimentação — igual ao Ajuste Rápido do Inventário.</span>
                    </div>
                  </div>
                )}
                </>
                )}

              </div>
            </div>


            {/* ── Preços ────────────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">💰 Preços</div>

              {!form.tem_variacoes && paraFloatBR(form.preco_venda) > 0 && paraFloatBR(form.preco_custo) > 0 && (
                <div className="prod-margem-preview">
                  {(() => {
                    const custo = paraFloatBR(form.preco_custo);
                    const venda = paraFloatBR(form.preco_venda);
                    const lucro = venda - custo;
                    const margem = ((lucro / venda) * 100).toFixed(1);
                    return (
                      <>
                        <span>Lucro: <strong>R$ {lucro.toFixed(2).replace('.', ',')}</strong></span>
                        <span className={`prod-margem-badge ${margem < 0 ? 'negativo' : margem < 20 ? 'baixo' : 'bom'}`}>
                          Margem {margem}%
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="prod-form-grid">
                <div className="prod-form-group">
                  <label className="prod-label">
                    {labelCusto}
                    <CampoAjuda texto="Quanto você pagou pelo produto (com frete/impostos incluídos, se quiser ser exato). Usado só pra calcular a margem de lucro mostrada acima — opcional, mas ajuda a saber se está vendendo com prejuízo." />
                  </label>
                  <div className="prod-input-moeda-wrap">
                    <span className="prod-moeda-prefixo">R$</span>
                    <input
                      className="prod-input prod-input-moeda"
                      type="text"
                      inputMode="decimal"
                      name="preco_custo"
                      placeholder="0,00"
                      readOnly={somenteLeitura}
                      value={form.preco_custo}
                      onChange={atualizar}
                    />
                  </div>
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    {labelVenda}
                    <CampoAjuda texto="Preço cobrado do cliente no PDV. Se o produto tiver variações com preço próprio (abaixo), esse aqui vira só o padrão pras variações que não tiverem um preço específico definido." />
                  </label>
                  <div className="prod-input-moeda-wrap">
                    <span className="prod-moeda-prefixo">R$</span>
                    <input
                      className="prod-input prod-input-moeda"
                      type="text"
                      inputMode="decimal"
                      name="preco_venda"
                      placeholder="0,00"
                      readOnly={somenteLeitura}
                      value={form.preco_venda}
                      onChange={atualizar}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="prod-modal-acoes">
              <button type="button" className="prod-modal-btn-cancelar" onClick={onClose}>
                {somenteLeitura ? 'Fechar' : 'Cancelar (Esc)'}
              </button>
              {!somenteLeitura && (
                <button type="submit" className="prod-modal-btn-salvar" disabled={salvando || ajustando}>
                  {ajustando ? '⏳ Ajustando estoque…' : salvando ? '⏳ Salvando…' : isEdit ? '✓ Atualizar produto' : '✓ Criar produto'}
                </button>
              )}
            </div>

          </form>
          </>
          )}
        </div>
      </div>

      {gerenciarOpcoesAberto && (
        <GerenciarOpcoesVariacao
          estabelecimentoId={estabelecimentoId}
          onClose={() => setGerenciarOpcoesAberto(false)}
          onAlterado={carregarOpcoesVariacao}
        />
      )}

      {imagemExpandidaAberta && imagemPreview && (
        <div className="prod-lightbox-overlay" onClick={() => setImagemExpandidaAberta(false)}>
          <button className="prod-lightbox-fechar" onClick={() => setImagemExpandidaAberta(false)}>✕</button>
          <img src={imagemPreview} alt="" className="prod-lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}