// src/pages/Estabelecimento/Estoque/ProdutoModal.jsx
import { apiFetch } from '../../../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import ModalCamera from '../PDV/ModalCamera';
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

  const [form, setForm] = useState({
    nome:            '',
    marca:           '',
    codigo_barras:   '',
    categoria_id:    '',
    unidade_medida:  'un',
    estoque_atual:   '0',
    estoque_minimo:  '10',
    preco_custo:     '0,00',
    preco_venda:     '0,00',
    // ── Campos balança ──
    vendido_por_peso: false,
    plu_balanca:      '',
  });

  const [categorias,        setCategorias]        = useState(categoriasProp || []);
  const [novaCatAberta,     setNovaCatAberta]     = useState(false);
  const [novaCatNome,       setNovaCatNome]       = useState('');
  const [salvandoCat,       setSalvandoCat]       = useState(false);
  const [salvando,          setSalvando]          = useState(false);
  const [erro,              setErro]              = useState('');
  const [showCamera,        setShowCamera]        = useState(false);
  const [scanFlash,         setScanFlash]         = useState(false);
  const [buscandoCodigo,    setBuscandoCodigo]    = useState(false);
  const [autoPreenchido,    setAutoPreenchido]    = useState(null); // 'catalogo' | 'openfoodfacts' | null
  const [marcasExistentes,  setMarcasExistentes]  = useState([]);
  const [sugestaoMarca,     setSugestaoMarca]     = useState(null); // { marca, exata } | null

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
      });
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

  /* ── ESC fecha ──────────────────────────────────────────── */
  useEffect(() => {
    return () => clearTimeout(debounceMarcaRef.current);
  }, []);

  useEffect(() => {
    function handleEsc(e) {
      if (e.key === 'Escape') {
        if (showCamera) return;
        if (novaCatAberta) setNovaCatAberta(false);
        else onClose();
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [novaCatAberta, onClose, showCamera]);

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
        novo.estoque_atual  = formatarValorBR(prev.estoque_atual, 3);
        novo.estoque_minimo = formatarValorBR(prev.estoque_minimo, 3);
      }
      return novo;
    });
  }

  /* ── Auto-preenche nome/marca a partir do código de barras ──
     Só entra em ação se os campos ainda estiverem vazios — nunca
     sobrescreve o que o comerciante já digitou/editou. */
  async function buscarPorCodigoBarras(codigo) {
    if (isEdit || !codigo || codigo.trim().length < 6) return;
    setAutoPreenchido(null);
    setBuscandoCodigo(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/${estabelecimentoId}/produtos/lookup-codigo?codigo=${encodeURIComponent(codigo.trim())}`);
      const json = await resp.json();
      if (resp.ok && json.encontrado) {
        setForm(prev => ({
          ...prev,
          nome:  prev.nome.trim()  ? prev.nome  : json.nome,
          marca: prev.marca.trim() ? prev.marca : (json.marca || prev.marca),
        }));
        setAutoPreenchido(json.fonte);
      }
    } catch {
      // Falha silenciosa — comerciante preenche na mão normalmente
    }
    setBuscandoCodigo(false);
  }

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
        body:    JSON.stringify({ nome: novaCatNome.trim() }),
      });
      const nova = await resp.json();
      if (!resp.ok) throw new Error(nova.error || 'Erro ao criar categoria');
      setCategorias(prev => [...prev, nova]);
      setForm(prev => ({ ...prev, categoria_id: nova.id }));
      setNovaCatNome('');
      setNovaCatAberta(false);
      onCategoriaCriada?.();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvandoCat(false);
    }
  }

  /* ── Salvar produto ─────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setErro('');
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
      };
      const resp = await apiFetch(url, {
        method:  isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar produto');
      onSalvo(data);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ── Labels dinâmicos por unidade ───────────────────────── */
  const isKg        = form.unidade_medida === 'kg';
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

          {erro && <div className="prod-modal-erro">⚠️ {erro}</div>}

          <form onSubmit={salvar}>

            {/* ── Identificação ─────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">📋 Identificação</div>
              <div className="prod-form-grid">

                <div className="prod-form-group prod-form-full">
                  <label className="prod-label">Código de barras</label>
                  <div className="prod-codigo-row">
                    <input
                      ref={codigoBarrasRef}
                      className={`prod-input${scanFlash ? ' prod-input-scan-flash' : ''}`}
                      name="codigo_barras"
                      readOnly={somenteLeitura}
                      placeholder="Digite ou escaneie…"
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
                  </div>
                  {buscandoCodigo && (
                    <small style={{ display: 'block', marginTop: 6, fontSize: '0.78rem', color: 'var(--est-text-muted, #94a3b8)' }}>
                      🔎 Buscando nome e marca…
                    </small>
                  )}
                  {!buscandoCodigo && autoPreenchido && (
                    <small style={{ display: 'block', marginTop: 6, fontSize: '0.78rem', color: 'var(--est-success, #16a34a)' }}>
                      ✓ Preenchido automaticamente {autoPreenchido === 'catalogo' ? '(catálogo interno)' : '(Open Food Facts)'} — confira antes de salvar
                    </small>
                  )}
                </div>

                {form.vendido_por_peso && (
                  <div className="prod-form-group prod-form-full">
                    <label className="prod-label">
                      ⚖️ PLU na balança
                      <span className="prod-label-unit"> (referência)</span>
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
                  <label className="prod-label">Nome do produto *</label>
                  <input
                    ref={nomeRef}
                    className="prod-input"
                    name="nome"
                    readOnly={somenteLeitura}
                    placeholder="Ex: Arroz Tipo 1 5kg"
                    value={form.nome}
                    onChange={atualizar}
                    required
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">Marca</label>
                  <input
                    className="prod-input"
                    name="marca"
                    list="marcas-existentes-datalist"
                    readOnly={somenteLeitura}
                    placeholder="Ex: Tio João, Camil…"
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
                  <label className="prod-label">Categoria</label>
                  <div className="prod-cat-row">
                    <select
                      className="prod-select"
                      name="categoria_id"
                      value={form.categoria_id}
                      onChange={atualizar}
                    >
                      <option value="">Sem categoria</option>
                      {categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="prod-btn-nova-cat"
                      onClick={() => setNovaCatAberta(p => !p)}
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
                        placeholder="Nome da categoria…"
                        value={novaCatNome}
                        onChange={e => setNovaCatNome(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); } }}
                      />
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
                        onClick={() => { setNovaCatAberta(false); setNovaCatNome(''); }}
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
                  <label className="prod-label">Vendido por *</label>
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
                          estoque_atual:  formatarValorBR(prev.estoque_atual,  op.value === 'kg' ? 3 : 0),
                          estoque_minimo: formatarValorBR(prev.estoque_minimo, op.value === 'kg' ? 3 : 0),
                        }))}
                      >
                        <span className="prod-unidade-icon">{op.icon}</span>
                        <span className="prod-unidade-label">{op.label}</span>
                        <span className="prod-unidade-sub">{op.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    Estoque atual * <span className="prod-label-unit">({form.unidade_medida})</span>
                  </label>
                  <input
                    className="prod-input"
                    type="text"
                    inputMode="decimal"
                    name="estoque_atual"
                    readOnly={somenteLeitura}
                    value={form.estoque_atual}
                    onChange={atualizar}
                    required
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    Estoque mínimo <span className="prod-label-unit">({form.unidade_medida})</span>
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

              </div>
            </div>

            {/* ── Balança ───────────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">⚖️ Balança</div>
              <div className="prod-form-grid">

                <div className="prod-form-group prod-form-full">
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
                      <strong>Produto pesável com etiqueta de balança</strong>
                      <span className="prod-label-hint" style={{ display: 'block', marginTop: 2 }}>
                        A balança imprime etiqueta com código EAN-13. O caixa bipa e o preço é calculado pelo peso automaticamente.
                      </span>
                    </span>
                  </label>
                </div>

                {form.vendido_por_peso && (
                  <div className="prod-form-group prod-form-full">
                    <div className="prod-balanca-info">
                      <span>💡</span>
                      <div>
                        <strong>Como configurar:</strong> No campo "Código de barras" acima, informe o{' '}
                        <strong>código interno</strong> do produto (dígitos 2–6 do EAN-13 da etiqueta).
                        Exemplo: se a balança gera <code>2 00123 01350 X</code>, o código interno é{' '}
                        <code>00123</code>. O campo PLU (logo abaixo do código de barras, no topo) é
                        apenas referência para o atendente saber qual número digitar na balança.
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* ── Preços ────────────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">💰 Preços</div>

              {paraFloatBR(form.preco_venda) > 0 && paraFloatBR(form.preco_custo) > 0 && (
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
                  <label className="prod-label">{labelCusto}</label>
                  <input
                    className="prod-input"
                    type="text"
                    inputMode="decimal"
                    name="preco_custo"
                    readOnly={somenteLeitura}
                    value={form.preco_custo}
                    onChange={atualizar}
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">{labelVenda}</label>
                  <input
                    className="prod-input"
                    type="text"
                    inputMode="decimal"
                    name="preco_venda"
                    readOnly={somenteLeitura}
                    value={form.preco_venda}
                    onChange={atualizar}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="prod-modal-acoes">
              <button type="button" className="prod-modal-btn-cancelar" onClick={onClose}>
                {somenteLeitura ? 'Fechar' : 'Cancelar (Esc)'}
              </button>
              {!somenteLeitura && (
                <button type="submit" className="prod-modal-btn-salvar" disabled={salvando}>
                  {salvando ? '⏳ Salvando…' : isEdit ? '✓ Atualizar produto' : '✓ Criar produto'}
                </button>
              )}
            </div>

          </form>
        </div>
      </div>
    </>
  );
}