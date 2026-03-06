// ===== src/components/CategoriaModal.jsx (CORRIGIDO PARA RENDER) =====
import React, { useState, useEffect, useRef } from 'react';
import './CategoriaModal.css';

// BACKEND AUTOMÁTICO (LOCAL VS PRODUÇÃO)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

const CategoriaModal = ({ estabelecimentoId, onClose, onCategoriaSalva }) => {
    
    const [nome, setNome] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const inputRef = useRef(null);

    // Foco automático ao abrir
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Fechar com ESC
    useEffect(() => {
        const handleEsc = (event) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    // SALVAR NOVA CATEGORIA
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        if (!nome.trim()) {
            setError("O nome da categoria é obrigatório.");
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/categorias`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    estabelecimentoId,
                    nome: nome.trim()
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Falha ao criar categoria.");
            }

            onCategoriaSalva();
            onClose();

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="categoria-modal-overlay">
            <div className="categoria-modal-content">
                
                <h3>Adicionar Nova Categoria</h3>
                <p>A nova categoria aparecerá na lista de estoque.</p>

                <form onSubmit={handleSubmit}>
                    
                    <div className="form-group">
                        <label htmlFor="nome-categoria">Nome da Categoria</label>
                        <input
                            id="nome-categoria"
                            ref={inputRef}
                            type="text"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            required
                            disabled={loading}
                        />
                    </div>

                    {error && <p className="categoria-modal-error">{error}</p>}

                    <div className="categoria-modal-actions">
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-cancel"
                            disabled={loading}
                        >
                            Cancelar (Esc)
                        </button>

                        <button
                            type="submit"
                            className="btn-save"
                            disabled={loading}
                        >
                            {loading ? "Salvando..." : "Salvar Categoria"}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
};

export default CategoriaModal;
