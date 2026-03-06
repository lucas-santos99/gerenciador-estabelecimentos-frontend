// ===== QuickSearch.jsx (CORRIGIDO PARA RENDER/LOCALHOST) =====
import React, { useState, useEffect, useRef } from 'react';
import './QuickSearch.css';

// BACKEND AUTOMÁTICO (local vs produção)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

const QuickSearch = ({ estabelecimentoId, onProdutoSelecionado, onClose }) => {

    const [termo, setTermo] = useState('');
    const [resultados, setResultados] = useState([]);
    const [loading, setLoading] = useState(false);

    const [buscaIndex, setBuscaIndex] = useState(-1);
    const resultadosRef = useRef(null);

    const debounceTimeout = useRef(null);
    const modalContentRef = useRef(null);
    const inputRef = useRef(null);

    // Focar no input ao abrir o modal
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Fechar clicando fora
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (modalContentRef.current && !modalContentRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [onClose]);

    // Scroll da lista ao navegar com setas
    useEffect(() => {
        if (buscaIndex < 0 || !resultadosRef.current) return;

        const item = resultadosRef.current.children[buscaIndex];
        if (item) {
            item.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }, [buscaIndex]);

    // =============================
    // Handler de teclas
    // =============================
    const handleKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
        else if (e.key === "ArrowDown") {
            e.preventDefault();
            setBuscaIndex((prev) => Math.min(prev + 1, resultados.length - 1));
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            setBuscaIndex((prev) => Math.max(prev - 1, 0));
        }
        else if (e.key === "Enter") {
            e.preventDefault();
            if (buscaIndex > -1 && resultados[buscaIndex]) {
                handleSelecionar(resultados[buscaIndex]);
            }
        }
    };

    // =============================
    // Buscar produtos (com debounce)
    // =============================
    const handleBusca = (e) => {
        const valorBusca = e.target.value;
        setTermo(valorBusca);
        setBuscaIndex(-1);

        // cancel debounce anterior
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }

        // requisito mínimo
        if (valorBusca.length < 2) {
            setResultados([]);
            setLoading(false);
            return;
        }

        setLoading(true);

        debounceTimeout.current = setTimeout(async () => {
            try {
                const response = await fetch(
                    `${BACKEND_BASE_URL}/api/estabelecimentoss/${encodeURIComponent(
                        estabelecimentoId
                    )}/produtos/buscar-global?termo=${encodeURIComponent(valorBusca)}`
                );

                if (!response.ok) throw new Error("Erro na busca global");

                const data = await response.json();
                setResultados(data);

                // Autoselecionar 1º resultado
                if (data.length > 0) setBuscaIndex(0);
                else setBuscaIndex(-1);

            } catch (err) {
                console.error(err);
                setResultados([]);
            } finally {
                setLoading(false);
            }
        }, 300);
    };

    // Seleção de produto
    const handleSelecionar = (produto) => {
        onProdutoSelecionado(produto);
    };

    // =============================
    // Render
    // =============================
    return (
        <div className="qs-modal-overlay">
            <div className="qs-modal-content" ref={modalContentRef}>
                
                <input
                    ref={inputRef}
                    type="text"
                    placeholder="Buscar produto global... (Esc para fechar)"
                    className="qs-search-bar"
                    value={termo}
                    onChange={handleBusca}
                    onKeyDown={handleKeyDown}
                />

                {(resultados.length > 0 || loading || termo.length > 1) && (
                    <ul className="quick-search-results" ref={resultadosRef}>
                        
                        {loading && (
                            <li className="qs-info-item">Buscando...</li>
                        )}

                        {!loading && resultados.length === 0 && termo.length > 1 && (
                            <li className="qs-info-item">Nenhum produto encontrado.</li>
                        )}

                        {resultados.map((produto, index) => (
                            <li
                                key={produto.id}
                                className={`qs-result-item ${
                                    index === buscaIndex ? "selecionado" : ""
                                }`}
                                onClick={() => handleSelecionar(produto)}
                                onMouseEnter={() => setBuscaIndex(index)}
                            >
                                <span className="qs-nome">{produto.nome}</span>
                                <span className="qs-categoria">
                                    {produto.nome_categoria || "Sem Categoria"}
                                </span>
                                <span className="qs-preco">
                                    R$ {parseFloat(produto.preco_venda).toFixed(2)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

            </div>
        </div>
    );
};

export default QuickSearch;
