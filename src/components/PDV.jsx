// ===== src/components/PDV.jsx (VERSÃO FINAL 2025 – PRONTA PARA PRODUÇÃO) =====
import React, { useState, useEffect, useRef } from 'react';
import './PDV.css';

// ============================================================================
// BACKEND AUTO-SELECIONADO (LOCALHOST VS PRODUÇÃO)
// ============================================================================
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// ============================================================================
// HELPER: FORMATAR MOEDA
// ============================================================================
const formatCurrency = (value) => {
    const number = parseFloat(value || 0);
    return number.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
};

// ============================================================================
// MODAL DE PAGAMENTO
// ============================================================================
const PagamentoModal = ({ total, onFinalizar, onCancelar, loading, estabelecimentoId }) => {

    const paymentMethods = [
        { key: 'Dinheiro', label: 'Dinheiro' },
        { key: 'Pix', label: 'Pix' },
        { key: 'Debito', label: 'Cartão de Débito' },
        { key: 'Credito', label: 'Cartão de Crédito' },
        { key: 'Fiado', label: 'Fiado (Na conta)' }
    ];

    const [selectedIndex, setSelectedIndex] = useState(0);
    const [meioPagamento, setMeioPagamento] = useState('Dinheiro');
    const [valorRecebido, setValorRecebido] = useState('');
    const [troco, setTroco] = useState(0.00);
    const [metodoConfirmado, setMetodoConfirmado] = useState(false);

    const [termoBuscaCliente, setTermoBuscaCliente] = useState('');
    const [resultadosCliente, setResultadosCliente] = useState([]);
    const [clienteSelecionado, setClienteSelecionado] = useState(null);
    const [loadingCliente, setLoadingCliente] = useState(false);
    const [errorCliente, setErrorCliente] = useState(null);

    const [clienteIndex, setClienteIndex] = useState(-1);

    const inputValorRecebidoRef = useRef(null);
    const inputClienteRef = useRef(null);
    const btnConfirmarRef = useRef(null);
    const modalOverlayRef = useRef(null);
    const clienteResultadosRef = useRef(null);
    const pagamentoListaRef = useRef(null);

    // ============================================================================
    // EFEITOS DE FOCO E NAVEGAÇÃO DO MODAL
    // ============================================================================
    useEffect(() => {
        if (!metodoConfirmado) modalOverlayRef.current?.focus();
    }, [metodoConfirmado]);

    const handleModalKeyDown = (e) => {
        if (e.target.tagName === 'INPUT' && e.key !== 'Escape') return;

        if (!metodoConfirmado) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % paymentMethods.length);
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + paymentMethods.length) % paymentMethods.length);
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                handleSetMetodo(paymentMethods[selectedIndex].key);
            }
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            onCancelar();
        }
    };

    useEffect(() => {
        if (!metodoConfirmado) return;

        if (meioPagamento === 'Dinheiro') {
            inputValorRecebidoRef.current?.focus();
            setValorRecebido(
                total.toLocaleString('pt-BR', {
                    useGrouping: false,
                    minimumFractionDigits: 2
                })
            );
            setTimeout(() => inputValorRecebidoRef.current?.select(), 0);
        }

        else if (meioPagamento === 'Fiado' && !clienteSelecionado) {
            inputClienteRef.current?.focus();
        }

        else {
            btnConfirmarRef.current?.focus();
        }
    }, [metodoConfirmado, meioPagamento, clienteSelecionado, total]);

    useEffect(() => {
        if (meioPagamento !== 'Dinheiro') return;

        const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
        const totalArredondado = parseFloat(total.toFixed(2));

        setTroco(recebido >= totalArredondado ? recebido - totalArredondado : 0.00);

    }, [valorRecebido, total, meioPagamento]);

    useEffect(() => {
        if (clienteIndex < 0 || !clienteResultadosRef.current) return;
        const lista = clienteResultadosRef.current;
        const item = lista.children[clienteIndex];
        if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [clienteIndex]);

    useEffect(() => {
        const lista = pagamentoListaRef.current;
        if (!lista) return;
        const item = lista.children[selectedIndex];
        if (item) item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex]);

    // ============================================================================
    // BUSCA DE CLIENTE (FIADO)
    // ============================================================================
    const handleBuscaCliente = async (termo) => {
        setTermoBuscaCliente(termo);
        setClienteIndex(-1);
        setErrorCliente(null);

        if (!estabelecimentoId) return;
        if (termo.length < 2) {
            setResultadosCliente([]);
            return;
        }

        setLoadingCliente(true);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/clientes/buscar/${estabelecimentoId}?termo=${encodeURIComponent(termo)}`
            );

            if (!response.ok) throw new Error("Erro ao buscar clientes");

            const data = await response.json();
            setResultadosCliente(data);

        } catch (err) {
            setErrorCliente(err.message);
            setResultadosCliente([]);
        } finally {
            setLoadingCliente(false);
        }
    };

    const handleCriarCliente = async () => {
        alert("Funcionalidade de novo cliente ainda não implementada!");
    };

    // ============================================================================
    // FINALIZAÇÃO DO PAGAMENTO
    // ============================================================================
    const handleConfirmarFinal = () => {
        const totalArredondado = parseFloat(total.toFixed(2));

        if (meioPagamento === 'Fiado') {
            if (!clienteSelecionado?.id) {
                setErrorCliente("Selecione um cliente válido!");
                return;
            }

            onFinalizar('Fiado', clienteSelecionado.id);
        }

        else if (meioPagamento === 'Dinheiro') {
            const recebido = parseFloat(valorRecebido.replace(',', '.')) || 0;
            if (recebido < totalArredondado) {
                setErrorCliente("Valor recebido insuficiente.");
                return;
            }
            onFinalizar('Dinheiro', null);
        }

        else {
            onFinalizar(meioPagamento, null);
        }
    };

    const selecionarCliente = (cliente) => {
        setClienteSelecionado(cliente);
        setResultadosCliente([]);
        setTermoBuscaCliente('');
        setClienteIndex(-1);
        setTimeout(() => btnConfirmarRef.current?.focus(), 0);
    };

    const handleSetMetodo = (key) => {
        setMeioPagamento(key);
        setMetodoConfirmado(true);
        setErrorCliente(null);

        if (key !== 'Fiado') setClienteSelecionado(null);
    };

    const handleDinheiroInputKeyDown = (e) => {
        if (e.key === "Enter") handleConfirmarFinal();
        if (e.key === "Escape") onCancelar();
    };

    const handleClienteInputKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setClienteIndex(prev => Math.min(prev + 1, resultadosCliente.length - 1));
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setClienteIndex(prev => Math.max(prev - 1, 0));
        }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (clienteIndex > -1 && resultadosCliente[clienteIndex]) {
                selecionarCliente(resultadosCliente[clienteIndex]);
            }
        }
        else if (e.key === 'Escape') {
            e.preventDefault();
            onCancelar();
        }
    };

    // ============================================================================
    // RENDER DO MODAL
    // ============================================================================
    return (
        <div className="modal-overlay-pdv" ref={modalOverlayRef} tabIndex="-1" onKeyDown={handleModalKeyDown}>
            <div className="modal-content-pdv">
                <h2>Finalizar Venda</h2>

                <div className="pagamento-total">
                    <span>Total a pagar</span>
                    <strong>{formatCurrency(total)}</strong>
                </div>
                {!metodoConfirmado && (
                    <div className="pagamento-meios-wrapper no-print">
                        <label>Forma de Pagamento (Use ↑ ↓ e Enter)</label>

                        <ul className="pagamento-meios-lista" ref={pagamentoListaRef}>
                            {paymentMethods.map((m, index) => (
                                <li
                                    key={m.key}
                                    className={`btn-meio-pagamento ${selectedIndex === index ? 'active' : ''}`}
                                    onClick={() => {
                                        setSelectedIndex(index);
                                        handleSetMetodo(m.key);
                                    }}
                                >
                                    {m.label}
                                    {selectedIndex === index && (
                                        <span className="indicador-enter">↩</span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="pagamento-conteudo">

                    {/* --------------------------------------------
                       PAGAMENTO EM DINHEIRO
                       -------------------------------------------- */}
                    {metodoConfirmado && meioPagamento === 'Dinheiro' && (
                        <div className="pagamento-troco no-print">
                            <label htmlFor="valorRecebido">Valor Recebido (R$):</label>
                            <input
                                ref={inputValorRecebidoRef}
                                type="text"
                                id="valorRecebido"
                                value={valorRecebido}
                                onChange={(e) => setValorRecebido(e.target.value)}
                                onKeyDown={handleDinheiroInputKeyDown}
                            />

                            <div className="troco-display">
                                <span>Troco</span>
                                <strong>{formatCurrency(troco)}</strong>
                            </div>
                        </div>
                    )}

                    {/* --------------------------------------------
                       PIX / DÉBITO / CRÉDITO
                       -------------------------------------------- */}
                    {metodoConfirmado &&
                        (meioPagamento === 'Pix' ||
                         meioPagamento === 'Debito' ||
                         meioPagamento === 'Credito') && (
                        <div className="pagamento-cartao no-print">
                            <p>Pagamento via: <strong>{meioPagamento}</strong></p>
                            <p>(Pressione Enter para confirmar)</p>
                        </div>
                    )}

                    {/* --------------------------------------------
                       PAGAMENTO FIADO
                       -------------------------------------------- */}
                    {metodoConfirmado && meioPagamento === 'Fiado' && (
                        <div className="pagamento-fiado">

                            {/* CLIENTE SELECIONADO */}
                            {clienteSelecionado ? (
                                <div className="cliente-selecionado-info">
                                    <strong>Cliente: {clienteSelecionado.nome}</strong>

                                    <span>
                                        Saldo Atual:
                                        {formatCurrency(clienteSelecionado.saldo_devedor)}
                                    </span>

                                    <span>
                                        Novo Saldo:
                                        {formatCurrency(
                                            (parseFloat(clienteSelecionado.saldo_devedor) || 0) + total
                                        )}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => setClienteSelecionado(null)}
                                    >
                                        Trocar Cliente
                                    </button>
                                </div>
                            ) : (

                                /* BUSCA DE CLIENTE */
                                <div className="cliente-search-container no-print">

                                    <input
                                        ref={inputClienteRef}
                                        type="text"
                                        placeholder="Buscar cliente por Nome ou Telefone..."
                                        value={termoBuscaCliente}
                                        onChange={(e) => handleBuscaCliente(e.target.value)}
                                        onKeyDown={handleClienteInputKeyDown}
                                    />

                                    {loadingCliente && (
                                        <p>Buscando...</p>
                                    )}

                                    <ul className="cliente-search-results" ref={clienteResultadosRef}>
                                        {resultadosCliente.map((cli, index) => (
                                            <li
                                                key={cli.id}
                                                className={index === clienteIndex ? 'resultado-selecionado' : ''}
                                                onClick={() => selecionarCliente(cli)}
                                                onMouseEnter={() => setClienteIndex(index)}
                                            >
                                                {cli.nome}
                                                <span>(Tel: {cli.telefone || 'N/A'})</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        type="button"
                                        className="btn-novo-cliente"
                                        onClick={() => alert('Cadastro de novo cliente em construção')}
                                    >
                                        + Cadastrar Novo Cliente
                                    </button>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {errorCliente && (
                    <p className="modal-error-pdv">{errorCliente}</p>
                )}

                <div className="modal-actions-pdv no-print">
                    <button className="btn-cancelar-pdv" onClick={onCancelar} disabled={loading}>
                        Cancelar (Esc)
                    </button>

                    <button
                        ref={btnConfirmarRef}
                        className="btn-confirmar-pdv"
                        onClick={handleConfirmarFinal}
                        disabled={loading || !metodoConfirmado}
                    >
                        {loading ? 'Processando...' : 'Confirmar Venda (Enter)'}
                    </button>
                </div>

            </div>
        </div>
    );
};
// ============================================================================
// COMPONENTE PRINCIPAL DO PDV
// ============================================================================
const PDV = ({ estabelecimentoId, supabaseProp }) => {

    // -------------------------------
    // ESTADOS PRINCIPAIS
    // -------------------------------
    const [termoBusca, setTermoBusca] = useState('');
    const [resultadosBusca, setResultadosBusca] = useState([]);
    const [carrinho, setCarrinho] = useState([]);
    const [total, setTotal] = useState(0.00);

    const [loadingBusca, setLoadingBusca] = useState(false);
    const [showPagamentoModal, setShowPagamentoModal] = useState(false);
    const [loadingVenda, setLoadingVenda] = useState(false);
    const [vendaStatus, setVendaStatus] = useState(null);

    const [itemParaQuantificar, setItemParaQuantificar] = useState(null);
    const [inputQuantidade, setInputQuantidade] = useState('1');

    const [buscaIndex, setBuscaIndex] = useState(-1);
    const [editIndex, setEditIndex] = useState(null);

    // Refs
    const inputBuscaRef = useRef(null);
    const modalQuantidadeInputRef = useRef(null);
    const btnFinalizarRef = useRef(null);
    const buscaResultadosRef = useRef(null);

    // ============================================================================
    // FOCOS AUTOMÁTICOS
    // ============================================================================
    useEffect(() => {
        if (!showPagamentoModal && !itemParaQuantificar && editIndex === null) {
            inputBuscaRef.current?.focus();
        }
    }, [showPagamentoModal, itemParaQuantificar, editIndex]);

    useEffect(() => {
        if (itemParaQuantificar && modalQuantidadeInputRef.current) {
            modalQuantidadeInputRef.current.focus();
            modalQuantidadeInputRef.current.select();
        }
    }, [itemParaQuantificar]);

    useEffect(() => {
        const novoTotal = carrinho
            .reduce((acc, item) => acc + (parseFloat(item.preco_venda) * item.quantidade), 0);
        setTotal(novoTotal);
    }, [carrinho]);

    // ============================================================================
    // SCROLL AUTOMÁTICO NO RESULTADO DA BUSCA
    // ============================================================================
    useEffect(() => {
        if (buscaIndex < 0 || !buscaResultadosRef.current) return;

        const lista = buscaResultadosRef.current;
        const item = lista.children[buscaIndex];

        if (item) {
            item.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }, [buscaIndex]);

    // ============================================================================
    // BUSCA LIVE DE PRODUTOS
    // ============================================================================
    const handleBuscaLive = async (termo) => {
        setTermoBusca(termo);
        setBuscaIndex(-1);

        if (!estabelecimentoId) return;

        if (termo.length < 2) {
            setResultadosBusca([]);
            return;
        }

        setLoadingBusca(true);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/estabelecimentoss/${estabelecimentoId}/produtos/buscar-global?termo=${encodeURIComponent(termo)}`
            );

            if (!response.ok) throw new Error("Erro ao buscar produtos");

            const data = await response.json();
            setResultadosBusca(data);

            if (data.length > 0) setBuscaIndex(0);

        } catch (err) {
            console.error("Erro na busca:", err);
        } finally {
            setLoadingBusca(false);
        }
    };

    // ============================================================================
    // ENTER NA BUSCA
    // ============================================================================
    const handleSearchSubmit = (e) => {
        e.preventDefault();

        if (buscaIndex > -1 && resultadosBusca[buscaIndex]) {
            handleItemSelecionado(resultadosBusca[buscaIndex]);
            return;
        }

        if (termoBusca.trim() === '' && carrinho.length > 0) {
            btnFinalizarRef.current?.focus();
            return;
        }
    };

    // ============================================================================
    // NAVEGAÇÃO COM SETAS NA BUSCA
    // ============================================================================
    const handleBuscaKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setBuscaIndex(prev => Math.min(prev + 1, resultadosBusca.length - 1));
        }

        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setBuscaIndex(prev => Math.max(prev - 1, 0));
        }

        else if (e.key === 'Escape') {
            e.preventDefault();
            setTermoBusca('');
            setResultadosBusca([]);
            setBuscaIndex(-1);
        }
    };

    // ============================================================================
    // SELEÇÃO DE PRODUTO E CHECAGEM DE ESTOQUE
    // ============================================================================
    const handleItemSelecionado = (produto) => {
        const estoqueAtual = parseFloat(produto.estoque_atual);

        if (estoqueAtual <= 0) {
            setVendaStatus({ tipo: 'erro', msg: `Produto '${produto.nome}' sem estoque!` });
            setTimeout(() => setVendaStatus(null), 3000);
            limparBusca();
            return;
        }

        const qtdeJaNoCarrinho = carrinho
            .filter(item => item.id === produto.id)
            .reduce((acc, item) => acc + item.quantidade, 0);

        const qtdeAdicional = produto.unidade_medida === 'kg' ? 0 : 1;

        if (qtdeAdicional > 0 && (qtdeJaNoCarrinho + qtdeAdicional) > estoqueAtual) {
            setVendaStatus({
                tipo: 'erro',
                msg: `Estoque máximo de '${produto.nome}' (${estoqueAtual} un.) atingido.`
            });
            setTimeout(() => setVendaStatus(null), 3000);
            limparBusca();
            return;
        }

        if (produto.unidade_medida === 'kg') {
            setInputQuantidade('1.000');
        } else {
            setInputQuantidade('1');
        }

        setItemParaQuantificar(produto);
        limparBusca();
    };

    const limparBusca = () => {
        setTermoBusca('');
        setResultadosBusca([]);
        setBuscaIndex(-1);
        inputBuscaRef.current?.focus();
    };

    // ============================================================================
    // CONFIRMAR QUANTIDADE
    // ============================================================================
    const handleConfirmarQuantidade = (e) => {
        e.preventDefault();

        const produto = itemParaQuantificar;
        const quantidadeNum = parseFloat(inputQuantidade) || 0;

        if (quantidadeNum <= 0) {
            fecharModalQuantidade();
            return;
        }

        const estoqueAtual = parseFloat(produto.estoque_atual);

        // --- EDITAR ITEM ---
        if (editIndex !== null) {
            const qtdeDosOutros = carrinho
                .filter((item, idx) => item.id === produto.id && idx !== editIndex)
                .reduce((acc, item) => acc + item.quantidade, 0);

            if ((qtdeDosOutros + quantidadeNum) > estoqueAtual) {
                setVendaStatus({
                    tipo: 'erro',
                    msg: `Estoque máximo: ${estoqueAtual} ${produto.unidade_medida}`
                });
                setTimeout(() => setVendaStatus(null), 3000);
                return;
            }

            const novoCarrinho = [...carrinho];
            novoCarrinho[editIndex] = { ...produto, quantidade: quantidadeNum };
            setCarrinho(novoCarrinho);
        }

        // --- ADICIONAR ITEM ---
        else {
            const qtdeJaNoCarrinho = carrinho
                .filter(item => item.id === produto.id)
                .reduce((acc, item) => acc + item.quantidade, 0);

            if ((qtdeJaNoCarrinho + quantidadeNum) > estoqueAtual) {
                setVendaStatus({
                    tipo: 'erro',
                    msg: `Estoque máximo: ${estoqueAtual} ${produto.unidade_medida}`
                });
                setTimeout(() => setVendaStatus(null), 3000);
                fecharModalQuantidade();
                return;
            }

            const idxExistente = carrinho.findIndex(
                item => item.id === produto.id && item.unidade_medida === produto.unidade_medida
            );

            if (idxExistente > -1) {
                setCarrinho(carrinho.map((item, idx) =>
                    idx === idxExistente
                        ? { ...item, quantidade: item.quantidade + quantidadeNum }
                        : item
                ));
            } else {
                setCarrinho([...carrinho, { ...produto, quantidade: quantidadeNum }]);
            }
        }

        fecharModalQuantidade();
    };

    const fecharModalQuantidade = () => {
        setItemParaQuantificar(null);
        setEditIndex(null);
        inputBuscaRef.current?.focus();
    };

    // ============================================================================
    // EDITAR E REMOVER ITEM DO CARRINHO
    // ============================================================================
    const handleEditarItem = (item, index) => {
        setItemParaQuantificar(item);
        setInputQuantidade(item.quantidade.toString());
        setEditIndex(index);
    };

    const handleRemoverItem = (indexRemover) => {
        const novo = carrinho.filter((_, idx) => idx !== indexRemover);
        setCarrinho(novo);
        inputBuscaRef.current?.focus();
    };

    // ============================================================================
    // FINALIZAR VENDA
    // ============================================================================
    const handleFinalizarVenda = async (meioPagamento, clienteId) => {
        setLoadingVenda(true);
        setVendaStatus(null);

        const carrinhoMapeado = carrinho.map(item => ({
            id: item.id,
            quantidade: parseFloat(item.quantidade),
            preco_venda: parseFloat(item.preco_venda)
        }));

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/vendas/finalizar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estabelecimentoId: estabelecimentoId,
                    valor_total: total,
                    meio_pagamento: meioPagamento,
                    carrinho: carrinhoMapeado,
                    clienteId: clienteId
                })
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.error?.includes("check constraint")) {
                    throw new Error("Falha de estoque. Verifique as quantidades.");
                }
                throw new Error(result.error || "Erro no backend");
            }

            setVendaStatus({
                tipo: 'sucesso',
                msg: `Venda (${formatCurrency(total)}) registrada com sucesso!`
            });

            setCarrinho([]);
            setShowPagamentoModal(false);

        } catch (err) {
            setVendaStatus({
                tipo: 'erro',
                msg: `Falha ao registrar venda: ${err.message}`
            });
            setShowPagamentoModal(false);
        } finally {
            setLoadingVenda(false);

            setTimeout(() => setVendaStatus(null), 4000);
        }
    };
    // ============================================================================
    // RENDERIZAÇÃO FINAL DO PDV
    // ============================================================================
    return (
        <div className="pdv-novo-container">

            {/* ===============================================================
                MODAL DE QUANTIDADE
               =============================================================== */}
            {itemParaQuantificar && (
                <div className="pdv-modal-overlay">
                    <div className="pdv-modal-content">
                        <h4>{editIndex !== null ? 'Editar Item' : 'Adicionar Item'}</h4>

                        <p>
                            {itemParaQuantificar.nome} <br />
                            ({formatCurrency(itemParaQuantificar.preco_venda)} / {itemParaQuantificar.unidade_medida})
                        </p>

                        <form onSubmit={handleConfirmarQuantidade}>
                            <label htmlFor="quantidade">
                                {itemParaQuantificar.unidade_medida === 'kg'
                                    ? 'Peso (kg)'
                                    : 'Quantidade (un)'}
                            </label>

                            <input
                                id="quantidade"
                                ref={modalQuantidadeInputRef}
                                type="number"
                                step={itemParaQuantificar.unidade_medida === 'kg' ? "0.001" : "1"}
                                min={itemParaQuantificar.unidade_medida === 'kg' ? "0.001" : "1"}
                                value={inputQuantidade}
                                onChange={(e) => setInputQuantidade(e.target.value)}
                                className="modal-input-quantidade"
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        fecharModalQuantidade();
                                    }
                                }}
                            />

                            <button type="submit" className="modal-btn-confirmar">
                                {editIndex !== null ? 'Atualizar (Enter)' : 'Adicionar (Enter)'}
                            </button>

                            <button
                                type="button"
                                className="modal-btn-cancelar"
                                onClick={fecharModalQuantidade}
                            >
                                Cancelar (Esc)
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ===============================================================
                MODAL DE PAGAMENTO
               =============================================================== */}
            {showPagamentoModal && (
                <PagamentoModal
                    total={total}
                    onCancelar={() => setShowPagamentoModal(false)}
                    onFinalizar={handleFinalizarVenda}
                    loading={loadingVenda}
                    estabelecimentoId={estabelecimentoId}
                />
            )}

            {/* ===============================================================
                PAINEL ESQUERDO - BUSCA
               =============================================================== */}
            <div className="pdv-painel-busca">
                <form onSubmit={handleSearchSubmit}>
                    <input
                        type="text"
                        ref={inputBuscaRef}
                        className="busca-input-pdv-novo"
                        placeholder="Digite o nome ou código de barras..."
                        value={termoBusca}
                        onChange={(e) => handleBuscaLive(e.target.value)}
                        onKeyDown={handleBuscaKeyDown}
                        disabled={loadingVenda}
                        autoComplete="off"
                    />
                </form>

                <ul className="busca-resultados-grid" ref={buscaResultadosRef}>
                    {loadingBusca && (
                        <li className="grid-status">Buscando...</li>
                    )}

                    {!loadingBusca && resultadosBusca.length === 0 && termoBusca.length > 1 && (
                        <li className="grid-status">
                            Nenhum produto encontrado para "{termoBusca}".
                        </li>
                    )}

                    {resultadosBusca.map((produto, index) => (
                        <li
                            key={produto.id}
                            className={`produto-card ${index === buscaIndex ? 'resultado-selecionado' : ''}`}
                            onClick={() => handleItemSelecionado(produto)}
                            onMouseEnter={() => setBuscaIndex(index)}
                        >
                            <span className="produto-card-nome">{produto.nome}</span>
                            <span className="produto-card-preco">{formatCurrency(produto.preco_venda)}</span>
                            <span className="produto-card-estoque">
                                ({produto.estoque_atual} / {produto.unidade_medida})
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {/* ===============================================================
                PAINEL DIREITO - CARRINHO
               =============================================================== */}
            <div className="pdv-painel-carrinho">

                <div className="carrinho-header">
                    <h3>Resumo da Venda</h3>
                </div>

                {vendaStatus && (
                    <div className={`venda-status ${vendaStatus.tipo === 'erro'
                        ? 'status-erro'
                        : 'status-sucesso'
                        }`}
                    >
                        {vendaStatus.msg}
                    </div>
                )}

                <ul className="carrinho-lista-novo">
                    {carrinho.length === 0 ? (
                        <li className="carrinho-vazio-novo">
                            <span>🛒</span>
                            <p>O carrinho está vazio</p>
                            <small>Adicione produtos pelo painel de busca.</small>
                        </li>
                    ) : (
                        carrinho.map((item, index) => (
                            <li key={`${item.id}-${index}`} className="carrinho-item-novo">
                                <div
                                    className="item-info-wrapper"
                                    onClick={() => handleEditarItem(item, index)}
                                >
                                    <span className="item-nome-novo">{item.nome}</span>

                                    <span className="item-qtde-novo">
                                        {item.unidade_medida === 'kg'
                                            ? `${parseFloat(item.quantidade).toFixed(3)} kg`
                                            : `${parseFloat(item.quantidade).toFixed(0)} un`}
                                        @ {formatCurrency(item.preco_venda)}
                                    </span>
                                </div>

                                <div className="item-preco-total">
                                    {formatCurrency(item.preco_venda * item.quantidade)}
                                </div>

                                <button
                                    className="item-remover-btn-novo"
                                    onClick={() => handleRemoverItem(index)}
                                >
                                    &times;
                                </button>
                            </li>
                        ))
                    )}
                </ul>

                <div className="pdv-carrinho-footer">
                    <div className="pdv-total-display-novo">
                        <span>Total</span>
                        <h2>{formatCurrency(total)}</h2>
                    </div>

                    <button
                        ref={btnFinalizarRef}
                        className="btn-finalizar-novo"
                        onClick={() => setShowPagamentoModal(true)}
                        disabled={carrinho.length === 0 || loadingVenda}
                    >
                        Finalizar Venda (Enter)
                    </button>
                </div>
            </div>

        </div>
    );
};

export default PDV;

