// src/pages/Estabelecimento/Estoque/ProdutoModal.jsx
import { apiFetch } from '../../../utils/api';
import React, { useState, useEffect, useRef } from 'react';
import ModalCamera from '../PDV/ModalCamera';
import '../Estoque.css';



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
    estoque_atual:   0,
    estoque_minimo:  10,
    preco_custo:     0,
    preco_venda:     0,
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

  const nomeRef        = useRef(null);
  const novaCatRef     = useRef(null);
  const codigoBarrasRef = useRef(null);

  /* ── Preencher form no modo editar ──────────────────────── */
  useEffect(() => {
    if (isEdit) {
      setForm({
        nome:             produtoEditar.nome             || '',
        marca:            produtoEditar.marca            || '',
        codigo_barras:    produtoEditar.codigo_barras    || '',
        categoria_id:     produtoEditar.categoria_id     || '',
        unidade_medida:   produtoEditar.unidade_medida   || 'un',
        estoque_atual:    parseFloat(produtoEditar.estoque_atual)  || 0,
        estoque_minimo:   parseFloat(produtoEditar.estoque_minimo) || 10,
        preco_custo:      parseFloat(produtoEditar.preco_custo)    || 0,
        preco_venda:      parseFloat(produtoEditar.preco_venda)    || 0,
        vendido_por_peso: produtoEditar.vendido_por_peso || false,
        plu_balanca:      produtoEditar.plu_balanca      || '',
      });
    }
    setTimeout(() => nomeRef.current?.focus(), 0);
  }, []);

  /* ── Foco na nova categoria ─────────────────────────────── */
  useEffect(() => {
    if (novaCatAberta) setTimeout(() => novaCatRef.current?.focus(), 0);
  }, [novaCatAberta]);

  /* ── ESC fecha ──────────────────────────────────────────── */
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
    const numericos = ['estoque_atual', 'estoque_minimo', 'preco_custo', 'preco_venda'];
    setForm(prev => {
      const novo = {
        ...prev,
        [name]: type === 'checkbox'
          ? checked
          : numericos.includes(name)
            ? value.replace(',', '.')
            : value,
      };
      // Ao desmarcar vendido_por_peso, limpa PLU
      if (name === 'vendido_por_peso' && !checked) {
        novo.plu_balanca = '';
      }
      // Se marcar vendido_por_peso, força unidade_medida para 'kg'
      if (name === 'vendido_por_peso' && checked) {
        novo.unidade_medida = 'kg';
      }
      return novo;
    });
  }

  /* ── Callback da câmera: preenche campo codigo_barras ────── */
  function handleCodigoDetectado(codigo) {
    setShowCamera(false);
    setForm(prev => ({ ...prev, codigo_barras: codigo }));
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 1000);
    setTimeout(() => codigoBarrasRef.current?.focus(), 100);
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
      const resp = await apiFetch(url, {
        method:  isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
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
  const stepEstoque = isKg ? '0.001' : '1';
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
                    readOnly={somenteLeitura}
                    placeholder="Ex: Tio João, Camil…"
                    value={form.marca}
                    onChange={atualizar}
                  />
                </div>

                <div className="prod-form-group">
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
                      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
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
                        onClick={() => !somenteLeitura && setForm(prev => ({ ...prev, unidade_medida: op.value }))}
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
                    type="number"
                    name="estoque_atual"
                    readOnly={somenteLeitura}
                    value={form.estoque_atual}
                    onChange={atualizar}
                    min="0"
                    step={stepEstoque}
                    required
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">
                    Estoque mínimo <span className="prod-label-unit">({form.unidade_medida})</span>
                  </label>
                  <input
                    className="prod-input"
                    type="number"
                    name="estoque_minimo"
                    readOnly={somenteLeitura}
                    value={form.estoque_minimo}
                    onChange={atualizar}
                    min="0"
                    step={stepEstoque}
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
                  <>
                    <div className="prod-form-group prod-form-full">
                      <div className="prod-balanca-info">
                        <span>💡</span>
                        <div>
                          <strong>Como configurar:</strong> No campo "Código de barras" acima, informe o{' '}
                          <strong>código interno</strong> do produto (dígitos 2–6 do EAN-13 da etiqueta).
                          Exemplo: se a balança gera <code>2 00123 01350 X</code>, o código interno é{' '}
                          <code>00123</code>. O campo PLU abaixo é apenas referência para o atendente saber
                          qual número digitar na balança.
                        </div>
                      </div>
                    </div>

                    <div className="prod-form-group">
                      <label className="prod-label">
                        PLU na balança
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
                      <span className="prod-label-hint">Código que o atendente digita na balança</span>
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* ── Preços ────────────────────────────────── */}
            <div className="prod-form-section">
              <div className="prod-form-section-titulo">💰 Preços</div>

              {parseFloat(form.preco_venda) > 0 && parseFloat(form.preco_custo) > 0 && (
                <div className="prod-margem-preview">
                  {(() => {
                    const custo = parseFloat(form.preco_custo);
                    const venda = parseFloat(form.preco_venda);
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
                    type="number"
                    name="preco_custo"
                    readOnly={somenteLeitura}
                    value={form.preco_custo}
                    onChange={atualizar}
                    min="0"
                    step="0.01"
                  />
                </div>

                <div className="prod-form-group">
                  <label className="prod-label">{labelVenda}</label>
                  <input
                    className="prod-input"
                    type="number"
                    name="preco_venda"
                    readOnly={somenteLeitura}
                    value={form.preco_venda}
                    onChange={atualizar}
                    min="0"
                    step="0.01"
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