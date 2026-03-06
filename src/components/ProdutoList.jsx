// ======= ProdutoList.jsx (CORRIGIDO PARA PRODUÇÃO) ======
import React, { useState, useEffect, useRef } from 'react';
import './ProdutoList.css';
import ProdutoModal from './ProdutoModal';
import CategoriaModal from './CategoriaModal';
import * as XLSX from 'xlsx';

// ✔ Backend correto (local vs produção)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// --- Helpers ---
const formatCurrency = (value) => {
    const number = parseFloat(value || 0);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatarEstoque = (estoque, unidade) => {
    const valor = parseFloat(estoque);
    if (unidade === 'kg') {
        return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
    }
    return `${Math.trunc(valor)} un.`;
};

const normalizeText = (text) => {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
};

const ProdutoList = ({ estabelecimentoId, shouldFocusSearch, onFocusHandled }) => {

    // --- Estados ---
    const [produtos, setProdutos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [categoriaAtiva, setCategoriaAtiva] = useState('todos');
    const [termoBusca, setTermoBusca] = useState('');
    const [produtoFocadoId, setProdutoFocadoId] = useState(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false);

    const searchInputRef = useRef(null);

    // 🛑 Se estabelecimentoId ainda não carregou, evita erros
    useEffect(() => {
        if (!estabelecimentoId) {
            console.log("ProdutoList.jsx: aguardando estabelecimentoId...");
            return;
        }
        fetchData();
    }, [estabelecimentoId]);

    // === 1. BUSCAR PRODUTOS E CATEGORIAS ===
    const fetchData = async (focarNoProdutoId = null) => {
        if (!estabelecimentoId) return;

        setLoading(true);
        setError(null);

        try {
            const [produtosRes, categoriasRes] = await Promise.all([
                fetch(`${BACKEND_BASE_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos`),
                fetch(`${BACKEND_BASE_URL}/api/categorias/${estabelecimentoId}`)
            ]);

            if (!produtosRes.ok) throw new Error(`Erro ao buscar produtos (status ${produtosRes.status})`);
            if (!categoriasRes.ok) throw new Error("Erro ao buscar categorias");

            const produtosData = await produtosRes.json();
            const categoriasData = await categoriasRes.json();

            setProdutos(produtosData);
            setCategorias(categoriasData);

            if (focarNoProdutoId) {
                setProdutoFocadoId(focarNoProdutoId);
                const p = produtosData.find(x => x.id === focarNoProdutoId);
                if (p) setCategoriaAtiva(p.categoria_id || "sem_categoria");
            }

        } catch (err) {
            console.error("Erro no fetchData:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // === Foco automático (F7) ===
    useEffect(() => {
        if (!loading && shouldFocusSearch && searchInputRef.current) {
            setTimeout(() => {
                searchInputRef.current.focus();
                onFocusHandled?.();
            }, 120);
        }
    }, [shouldFocusSearch, loading]);

    // === Scroll para produto editado ===
    useEffect(() => {
        if (produtoFocadoId) {
            const el = document.getElementById(`produto-card-${produtoFocadoId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => setProdutoFocadoId(null), 3000);
            }
        }
    }, [produtoFocadoId, produtos]);

    // === Deletar produto ===
    const handleDeletarProduto = async (produtoId) => {
        if (!window.confirm("Deseja realmente excluir este produto?")) return;

        try {
            const resp = await fetch(
                `${BACKEND_BASE_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos/${produtoId}`,
                { method: "DELETE" }
            );

            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.error || "Erro ao excluir produto");
            }

            setProdutos(produtos.filter((p) => p.id !== produtoId));

        } catch (err) {
            console.error(err);
            setError(err.message);
        }
    };

    // === Salvar produto ===
    const handleProdutoSalvo = (obj) => {
        fetchData(obj.id);
    };

    // === EXPORTAR PARA EXCEL ===
    const handleExportarExcel = () => {
        if (produtos.length === 0) {
            alert("Nenhum produto para exportar.");
            return;
        }

        const dados = produtos.map(p => {
            const catNome = categorias.find(c => c.id === p.categoria_id)?.nome || 'Sem Categoria';

            const custo = parseFloat(p.preco_custo || 0);
            const venda = parseFloat(p.preco_venda || 0);

            return {
                "Categoria": catNome,
                "Produto": p.nome,
                "Cód. Barras": p.codigo_barras || '',
                "Estoque": parseFloat(p.estoque_atual),
                "Unid.": p.unidade_medida,
                "Custo (R$)": formatCurrency(custo),
                "Venda (R$)": formatCurrency(venda),
                "Lucro por Unid": formatCurrency(venda - custo)
            };
        });

        const planilha = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, planilha, "Produtos");

        const dataHoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, "-");
        XLSX.writeFile(wb, `Estoque-${dataHoje}.xlsx`);
    };

    // === FILTROS ===
    const produtosFiltrados = produtos.filter(prod => {

        let categoriaOK = false;
        if (categoriaAtiva === "todos") categoriaOK = true;
        else if (categoriaAtiva === "sem_categoria") categoriaOK = !prod.categoria_id;
        else categoriaOK = prod.categoria_id === categoriaAtiva;

        let buscaOK = true;
        const busca = normalizeText(termoBusca).trim();

        if (busca.length > 0) {
            const nome = normalizeText(prod.nome);
            const codigo = prod.codigo_barras?.toLowerCase() || "";

            if (busca.includes("%")) {
                const regexPattern = busca
                    .split("%")
                    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                    .join(".*");

                const regex = new RegExp(regexPattern, "i");
                buscaOK = regex.test(nome) || regex.test(codigo);

            } else {
                buscaOK = nome.includes(busca) || codigo.includes(busca);
            }
        }

        return categoriaOK && buscaOK;
    });

    const produtosSemCategoria = produtos.filter(p => !p.categoria_id).length;

    // === RENDER ===
    if (loading) return <div>Carregando produtos...</div>;

    return (
        <div className="estoque-layout-container">

            {/* Modais */}
            {isModalOpen && (
                <ProdutoModal 
                    estabelecimentoId={estabelecimentoId}
                    onClose={() => { setIsModalOpen(false); setProdutoSelecionado(null); }}
                    produtoParaEditar={produtoSelecionado}
                    onProdutoSalvo={handleProdutoSalvo}
                />
            )}

            {isCategoriaModalOpen && (
                <CategoriaModal
                    estabelecimentoId={estabelecimentoId}
                    onClose={() => setIsCategoriaModalOpen(false)}
                    onCategoriaSalva={() => { fetchData(); setIsCategoriaModalOpen(false); }}
                />
            )}

            {/* Sidebar categorias */}
            <nav className="estoque-sidebar-categorias no-print">
                <h4>Categorias</h4>

                <a
                    href="#todos"
                    className={`cat-filtro-item ${categoriaAtiva === "todos" ? "active" : ""}`}
                    onClick={(e) => { e.preventDefault(); setCategoriaAtiva("todos"); }}
                >
                    Todos os Produtos <span>{produtos.length}</span>
                </a>

                {categorias.map(cat => (
                    <a
                        key={cat.id}
                        href={`#${cat.id}`}
                        className={`cat-filtro-item ${categoriaAtiva === cat.id ? "active" : ""}`}
                        onClick={(e) => { e.preventDefault(); setCategoriaAtiva(cat.id); }}
                    >
                        {cat.nome}
                        <span>{produtos.filter(p => p.categoria_id === cat.id).length}</span>
                    </a>
                ))}

                {produtosSemCategoria > 0 && (
                    <a
                        href="#sem_categoria"
                        className={`cat-filtro-item ${categoriaAtiva === "sem_categoria" ? "active" : ""}`}
                        onClick={(e)=>{e.preventDefault(); setCategoriaAtiva("sem_categoria");}}
                    >
                        Sem Categoria <span>{produtosSemCategoria}</span>
                    </a>
                )}
            </nav>

            {/* Main */}
            <main className="estoque-main-content">

                {/* Header */}
                <div className="estoque-header no-print">

                    <input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Buscar produtos por nome ou código..."
                        className="estoque-busca-input"
                        value={termoBusca}
                        onChange={(e) => setTermoBusca(e.target.value)}
                    />

                    <div className="header-botoes">

                        <button className="btn-adicionar" onClick={handleExportarExcel} style={{ backgroundColor: "#217346" }}>
                            📥 Excel
                        </button>

                        <button className="btn-adicionar" onClick={() => window.print()} style={{ backgroundColor: "#6c757d" }}>
                            🖨️
                        </button>

                        <button className="btn-adicionar btn-categoria"
                                onClick={() => setIsCategoriaModalOpen(true)}>
                            + Nova Categoria
                        </button>

                        <button className="btn-adicionar" onClick={() => { setProdutoSelecionado(null); setIsModalOpen(true); }}>
                            + Adicionar Produto
                        </button>

                    </div>
                </div>

                {error && <p className="estoque-error">Erro: {error}</p>}

                {/* GRID */}
                <div className="estoque-grid-produtos">
                    {produtosFiltrados.length === 0 ? (
                        <div className="estoque-vazio">
                            <p>Nenhum produto encontrado.</p>
                        </div>
                    ) : (
                        produtosFiltrados.map(produto => (
                            <ProdutoCard
                                key={produto.id}
                                produto={produto}
                                onEditar={(p)=>{ setProdutoSelecionado(p); setIsModalOpen(true); }}
                                onDeletar={handleDeletarProduto}
                                isFocado={produto.id === produtoFocadoId}
                            />
                        ))
                    )}
                </div>

            </main>

        </div>
    );
};

// === ProdutoCard ===
const ProdutoCard = ({ produto, onEditar, onDeletar, isFocado }) => {

    let statusClasse = "estoque-ok";
    const estoque = parseFloat(produto.estoque_atual);
    const minimo = parseFloat(produto.estoque_minimo);

    if (estoque <= 0) statusClasse = "estoque-critico";
    else if (estoque <= minimo) statusClasse = "estoque-baixo";

    return (
        <div id={`produto-card-${produto.id}`} className={`produto-card-novo ${isFocado ? "focado" : ""}`}>

            <div className="card-corpo" onClick={() => onEditar(produto)}>
                <span className={`card-status-estoque ${statusClasse}`}>
                    {formatarEstoque(produto.estoque_atual, produto.unidade_medida)}
                </span>

                <div className="card-nome-produto">{produto.nome}</div>
                <div className="card-codigo-produto">{produto.codigo_barras || "Sem código"}</div>

                <div className="card-precos">
                    <div className="preco-item">
                        <span className="preco-label">Custo</span>
                        <span className="preco-valor">{formatCurrency(produto.preco_custo)}</span>
                    </div>
                    <div className="preco-item">
                        <span className="preco-label">Venda</span>
                        <span className="preco-valor venda">{formatCurrency(produto.preco_venda)}</span>
                    </div>
                </div>
            </div>

            <div className="card-acoes no-print">
                <button className="btn-acao-card btn-editar" onClick={() => onEditar(produto)}>Editar</button>
                <button className="btn-acao-card btn-excluir" onClick={() => onDeletar(produto.id)}>Excluir</button>
            </div>

        </div>
    );
};

export default ProdutoList;
