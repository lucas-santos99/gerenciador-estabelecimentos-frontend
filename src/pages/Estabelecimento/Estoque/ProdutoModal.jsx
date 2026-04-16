// src/pages/Estabelecimento/Estoque/ProdutoModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import '../Estoque.css';

const API_URL = import.meta.env.VITE_API_URL;

/* ════════════════════════════════════════════════════════════ */
export default function ProdutoModal({
  estabelecimentoId,
  produtoEditar,
  categorias: categoriasProp,
  onClose,
  onSalvo,
  onCategoriaCriada,
}) {
  const isEdit = !!produtoEditar;

  const [form, setForm] = useState({
    nome:            '',
    codigo_barras:   '',
    categoria_id:    '',
    unidade_medida:  'un',
    estoque_atual:   0,
    estoque_minimo:  10,
    preco_custo:     0,
    preco_venda:     0,
  });

  const [categorias,        setCategorias]        = useState(categoriasProp || []);
  const [novaCatAberta,     setNovaCatAberta]     = useState(false);
  const [novaCatNome,       setNovaCatNome]       = useState('');
  const [salvandoCat,       setSalvandoCat]       = useState(false);
  const [salvando,          setSalvando]          = useState(false);
  const [erro,              setErro]              = useState('');

  const nomeRef    = useRef(null);
  const novaCatRef = useRef(null);

  /* ── Preencher form no modo editar ──────────────────────── */
  useEffect(() => {
    if (isEdit) {
      setForm({
        nome:           produtoEditar.nome           || '',
        codigo_barras:  produtoEditar.codigo_barras  || '',
        categoria_id:   produtoEditar.categoria_id   || '',
        unidade_medida: produtoEditar.unidade_medida || 'un',
        estoque_atual:  parseFloat(produtoEditar.estoque_atual)  || 0,
        estoque_minimo: parseFloat(produtoEditar.estoque_minimo) || 10,
        preco_custo:    parseFloat(produtoEditar.preco_custo)    || 0,
        preco_venda:    parseFloat(produtoEditar.preco_venda)    || 0,
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
        if (novaCatAberta) setNovaCatAberta(false);
        else onClose();
      }
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [novaCatAberta, onClose]);

  /* ── Atualizar campo ─────────────────────────────────────── */
  function atualizar(e) {
    const { name, value } = e.target;
    const numericos = ['estoque_atual', 'estoque_minimo', 'preco_custo', 'preco_venda'];
    setForm(prev => ({
      ...prev,
      [name]: numericos.includes(name)
        ? value.replace(',', '.')
        : value,
    }));
  }

  /* ── Criar nova categoria ───────────────────────────────── */
  async function criarCategoria() {
    if (!novaCatNome.trim()) return;
    setSalvandoCat(true);
    setErro('');
    try {
      const resp = await fetch(`${API_URL}/api/categorias`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ estabelecimentoId, nome: novaCatNome.trim() }),
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
      ? `${API_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos/${produtoEditar.id}`
      : `${API_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos`;

    try {
      const resp = await fetch(url, {
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
    <div className="prod-modal-overlay" onClick={onClose}>
      <div className="prod-modal" onClick={e => e.stopPropagation()}>

        <div className="prod-modal-titulo">
          {isEdit ? '✏️ Editar produto' : '➕ Novo produto'}
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
                  placeholder="Ex: Arroz Tipo 1 5kg"
                  value={form.nome}
                  onChange={atualizar}
                  required
                />
              </div>

              <div className="prod-form-group">
                <label className="prod-label">Código de barras</label>
                <input
                  className="prod-input"
                  name="codigo_barras"
                  placeholder="Opcional"
                  value={form.codigo_barras}
                  onChange={atualizar}
                />
              </div>

              <div className="prod-form-group">
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
            <div className="prod-form-section-titulo">📦 Estoque</div>
            <div className="prod-form-grid">

              <div className="prod-form-group">
                <label className="prod-label">Vendido por *</label>
                <select
                  className="prod-select"
                  name="unidade_medida"
                  value={form.unidade_medida}
                  onChange={atualizar}
                >
                  <option value="un">Unidade (un)</option>
                  <option value="kg">Quilo (kg)</option>
                </select>
              </div>

              <div className="prod-form-group">
                <label className="prod-label">Estoque atual *</label>
                <input
                  className="prod-input"
                  type="number"
                  name="estoque_atual"
                  value={form.estoque_atual}
                  onChange={atualizar}
                  min="0"
                  step={stepEstoque}
                  required
                />
              </div>

              <div className="prod-form-group prod-form-full">
                <label className="prod-label">Estoque mínimo (alerta)</label>
                <input
                  className="prod-input"
                  type="number"
                  name="estoque_minimo"
                  value={form.estoque_minimo}
                  onChange={atualizar}
                  min="0"
                  step={stepEstoque}
                />
              </div>

            </div>
          </div>

          {/* ── Preços ────────────────────────────────── */}
          <div className="prod-form-section">
            <div className="prod-form-section-titulo">💰 Preços</div>
            <div className="prod-form-grid">

              <div className="prod-form-group">
                <label className="prod-label">{labelCusto}</label>
                <input
                  className="prod-input"
                  type="number"
                  name="preco_custo"
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
              Cancelar (Esc)
            </button>
            <button type="submit" className="prod-modal-btn-salvar" disabled={salvando}>
              {salvando ? '⏳ Salvando…' : isEdit ? '✓ Atualizar produto' : '✓ Criar produto'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}