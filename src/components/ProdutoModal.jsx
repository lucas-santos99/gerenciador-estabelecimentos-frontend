// ===== ProdutoModal.jsx (Versão Corrigida Render/Localhost) =====
import React, { useState, useEffect, useRef } from 'react';
import './ProdutoModal.css'; 

// BACKEND AUTOMÁTICO (local vs produção)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

const ProdutoModal = ({ estabelecimentoId, onClose, onProdutoSalvo, produtoParaEditar }) => {
    
    const [formData, setFormData] = useState({
        nome: '',
        codigo_barras: '',
        estoque_atual: 0,
        estoque_minimo: 10,
        preco_custo: 0.00,
        preco_venda: 0.00,
        categoria_id: '',
        unidade_medida: 'un',
    });

    const [categorias, setCategorias] = useState([]); 
    const [loadingCategorias, setLoadingCategorias] = useState(true);
    const [showAddCategoria, setShowAddCategoria] = useState(false);
    const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
    const [loadingNovaCategoria, setLoadingNovaCategoria] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isEditMode = produtoParaEditar !== null;
    const nomeInputRef = useRef(null);

    // ================================
    // 1. BUSCAR CATEGORIAS
    // ================================
    useEffect(() => {
        const fetchCategorias = async () => {
            try {
                const response = await fetch(
                    `${BACKEND_BASE_URL}/api/categorias/${estabelecimentoId}`
                );
                if (!response.ok) throw new Error("Erro ao buscar categorias");

                const data = await response.json();
                setCategorias(data);

            } catch (err) {
                console.error("Erro buscando categorias:", err);
                setError("Não foi possível carregar as categorias.");
            } finally {
                setLoadingCategorias(false);
            }
        };

        fetchCategorias();

        if (isEditMode) {
            setFormData({
                nome: produtoParaEditar.nome || '',
                codigo_barras: produtoParaEditar.codigo_barras || '',
                estoque_atual: parseFloat(produtoParaEditar.estoque_atual) || 0,
                estoque_minimo: parseFloat(produtoParaEditar.estoque_minimo) || 10,
                preco_custo: parseFloat(produtoParaEditar.preco_custo) || 0.00,
                preco_venda: parseFloat(produtoParaEditar.preco_venda) || 0.00,
                categoria_id: produtoParaEditar.categoria_id || '',
                unidade_medida: produtoParaEditar.unidade_medida || 'un',
            });
        }

        nomeInputRef.current?.focus();
    }, [estabelecimentoId, isEditMode, produtoParaEditar]);

    // ESC FECHA O MODAL
    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                if (showAddCategoria) setShowAddCategoria(false);
                else onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose, showAddCategoria]);

    // ================================
    // MÉTODO GERAL DE TROCA DE INPUT
    // ================================
    const handleChange = (e) => {
        const { name, value } = e.target;

        let val = value;
        if (['estoque_atual', 'estoque_minimo', 'preco_custo', 'preco_venda'].includes(name)) {
            val = value.replace(',', '.');
        }

        setFormData((prev) => ({
            ...prev,
            [name]: val === '' ? null : val
        }));
    };

    // ================================
    // 3. NOVA CATEGORIA
    // ================================
    const handleNovaCategoria = async () => {
        if (!novaCategoriaNome) return;

        setLoadingNovaCategoria(true);
        setError(null);

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/categorias`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    estabelecimentoId: estabelecimentoId,
                    nome: novaCategoriaNome
                })
            });

            const novaCat = await response.json();
            if (!response.ok) throw new Error(novaCat.error || "Erro ao salvar categoria");

            setCategorias((prev) => [...prev, novaCat]);
            setFormData((prev) => ({ ...prev, categoria_id: novaCat.id }));

            setNovaCategoriaNome('');
            setShowAddCategoria(false);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoadingNovaCategoria(false);
        }
    };

    // ================================
    // 4. SALVAR PRODUTO
    // ================================
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const method = isEditMode ? "PUT" : "POST";

        const url = isEditMode
            ? `${BACKEND_BASE_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos/${produtoParaEditar.id}`
            : `${BACKEND_BASE_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos`;

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            const produtoSalvo = await response.json();

            if (!response.ok) {
                throw new Error(produtoSalvo.error || "Erro ao salvar produto");
            }

            onProdutoSalvo(produtoSalvo, isEditMode);
            onClose();

        } catch (err) {
            console.error("Erro ao salvar produto:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // =====================================
    // LABELS DINÂMICOS PARA "un" x "kg"
    // =====================================
    const estoqueStep = formData.unidade_medida === 'kg' ? "0.001" : "1";

    const labelPreco =
        formData.unidade_medida === 'kg'
            ? "Preço de Venda (R$ / kg) *"
            : "Preço de Venda (R$ / un) *";

    const labelCusto =
        formData.unidade_medida === 'kg'
            ? "Preço de Custo (R$ / kg)"
            : "Preço de Custo (R$ / un)";

    // ================================
    // RENDER DO MODAL
    // ================================
    return (
        <div className="modal-overlay">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>

                <h2>{isEditMode ? "Editar Produto" : "Adicionar Novo Produto"}</h2>

                {error && <p className="modal-error">{error}</p>}

                <form onSubmit={handleSubmit}>

                    <div className="form-group">
                        <label>Nome do Produto *</label>
                        <input
                            ref={nomeInputRef}
                            type="text"
                            name="nome"
                            value={formData.nome}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    {/* Código de barras + categoria */}
                    <div className="form-row">
                        <div className="form-group">
                            <label>Código de Barras (Opcional)</label>
                            <input
                                type="text"
                                name="codigo_barras"
                                value={formData.codigo_barras || ""}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="form-group">
                            <label>Categoria</label>
                            <div className="categoria-input-group">

                                <select
                                    name="categoria_id"
                                    value={formData.categoria_id || ""}
                                    onChange={handleChange}
                                    disabled={loadingCategorias}
                                >
                                    <option value="">
                                        {loadingCategorias ? "Carregando..." : "Sem Categoria"}
                                    </option>

                                    {categorias.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.nome}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    type="button"
                                    className="btn-add-cat"
                                    onClick={() => setShowAddCategoria(true)}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {showAddCategoria && (
                        <div className="add-categoria-form">
                            <input
                                type="text"
                                placeholder="Nome da Nova Categoria"
                                value={novaCategoriaNome}
                                onChange={(e) => setNovaCategoriaNome(e.target.value)}
                            />

                            <button
                                type="button"
                                onClick={handleNovaCategoria}
                                disabled={loadingNovaCategoria}
                            >
                                {loadingNovaCategoria ? "..." : "Salvar"}
                            </button>

                            <button type="button" onClick={() => setShowAddCategoria(false)}>
                                Cancelar
                            </button>
                        </div>
                    )}

                    {/* Estoque */}
                    <div className="form-row">
                        <div className="form-group">
                            <label>Vendido por *</label>
                            <select
                                name="unidade_medida"
                                value={formData.unidade_medida}
                                onChange={handleChange}
                            >
                                <option value="un">Unidade (un)</option>
                                <option value="kg">Quilo (kg)</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Estoque Atual *</label>
                            <input
                                type="number"
                                name="estoque_atual"
                                value={formData.estoque_atual}
                                onChange={handleChange}
                                required
                                min="0"
                                step={estoqueStep}
                            />
                        </div>

                        <div className="form-group">
                            <label>Estoque Mínimo</label>
                            <input
                                type="number"
                                name="estoque_minimo"
                                value={formData.estoque_minimo}
                                onChange={handleChange}
                                min="0"
                                step={estoqueStep}
                            />
                        </div>
                    </div>

                    {/* Preços */}
                    <div className="form-row">
                        <div className="form-group">
                            <label>{labelCusto}</label>
                            <input
                                type="number"
                                name="preco_custo"
                                value={formData.preco_custo}
                                onChange={handleChange}
                                min="0"
                                step="0.01"
                            />
                        </div>

                        <div className="form-group">
                            <label>{labelPreco}</label>
                            <input
                                type="number"
                                name="preco_venda"
                                value={formData.preco_venda}
                                onChange={handleChange}
                                required
                                min="0"
                                step="0.01"
                            />
                        </div>
                    </div>

                    {/* Botões */}
                    <div className="modal-actions">
                        <button
                            type="button"
                            className="btn-cancelar"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancelar
                        </button>

                        <button type="submit" className="btn-salvar" disabled={loading}>
                            {loading
                                ? "Salvando..."
                                : isEditMode
                                ? "Atualizar Produto"
                                : "Salvar Produto"}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default ProdutoModal;
