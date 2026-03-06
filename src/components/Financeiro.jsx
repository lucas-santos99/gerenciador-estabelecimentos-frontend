// ===== Financeiro.jsx (CORRIGIDO PARA RENDER / LOCALHOST) =====
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// BACKEND AUTOMÁTICO (LOCALHOST → DEV | RENDER → PRODUÇÃO)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// --- Helpers ---
const formatCurrency = (value) => {
    const number = parseFloat(value || 0);
    return number.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
};

const getLocalDateISOString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatDate = (isoDate) => {
    if (!isoDate) return "N/A";
    const date = new Date(isoDate);
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

// --- Componentes auxiliares ---
const ResumoCard = ({ titulo, valor, loading, cor = "azul" }) => (
    <div className={`resumo-card ${cor}`}>
        <h4>{titulo}</h4>
        {loading ? (
            <div className="resumo-loading-spinner"></div>
        ) : (
            <p>{formatCurrency(valor)}</p>
        )}
    </div>
);

const DreRow = ({ label, valor, isTotal = false, isNegative = false, className = "" }) => (
    <div className={`dre-row ${isTotal ? "total" : ""} ${className}`}>
        <span>{label}</span>
        <span className={isNegative ? "valor-negativo" : "valor-positivo"}>
            {isNegative ? "- " : ""}
            {formatCurrency(valor)}
        </span>
    </div>
);

const DreSubRow = ({ label, valor }) => (
    <div className="dre-sub-row">
        <span>{label}</span>
        <span className="valor-positivo">{formatCurrency(valor)}</span>
    </div>
);

// ===== COMPONENTE PRINCIPAL =====
const Financeiro = ({ estabelecimentoId, logoUrl, nomeFantasia }) => {

    // --- Aba ativa ---
    const [activeTab, setActiveTab] = useState("fluxo");

    // --- Resumo do Fluxo ---
    const [resumo, setResumo] = useState(null);
    const [loadingResumo, setLoadingResumo] = useState(true);
    const [errorResumo, setErrorResumo] = useState(null);

    // --- DRE ---
    const [relatorioDRE, setRelatorioDRE] = useState(null);
    const [loadingDRE, setLoadingDRE] = useState(false);
    const [errorDRE, setErrorDRE] = useState(null);
    const [dataInicioDRE, setDataInicioDRE] = useState(getLocalDateISOString());
    const [dataFimDRE, setDataFimDRE] = useState(getLocalDateISOString());

    // --- Contas a pagar ---
    const [contas, setContas] = useState([]);
    const [loadingContas, setLoadingContas] = useState(true);
    const [errorContas, setErrorContas] = useState(null);
    const [filterStatus, setFilterStatus] = useState("pendente");

    const [showFormContas, setShowFormContas] = useState(false);
    const [formDataContas, setFormDataContas] = useState({
        descricao: "",
        valor: "",
        data_vencimento: "",
    });
    const [savingContas, setSavingContas] = useState(false);
    const [contaEmEdicao, setContaEmEdicao] = useState(null);

    // --- Relatório de produtos ---
    const [categorias, setCategorias] = useState([]);
    const [reportProdutos, setReportProdutos] = useState([]);
    const [loadingReportProdutos, setLoadingReportProdutos] = useState(false);
    const [errorReportProdutos, setErrorReportProdutos] = useState(null);
    const [dataInicioProdutos, setDataInicioProdutos] = useState(getLocalDateISOString());
    const [dataFimProdutos, setDataFimProdutos] = useState(getLocalDateISOString());
    const [categoriaFiltro, setCategoriaFiltro] = useState("");

    // --- Carregamento inicial ---
    useEffect(() => {
        if (estabelecimentoId) {
            fetchResumo();
            fetchCategorias();
        }
    }, [estabelecimentoId]);
    // ================================
    // 📌 1. FUNÇÕES — FLUXO DE CAIXA
    // ================================
    const fetchResumo = async () => {
        setLoadingResumo(true);
        setErrorResumo(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/resumo/${encodeURIComponent(estabelecimentoId)}`
            );

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            setResumo(data);

        } catch (err) {
            setErrorResumo(err.message);
        } finally {
            setLoadingResumo(false);
        }
    };


    // ================================
    // 📌 2. FUNÇÕES — RELATÓRIO DRE
    // ================================
    const handleGerarDRE = async (e) => {
        e.preventDefault();
        setLoadingDRE(true);
        setErrorDRE(null);
        setRelatorioDRE(null);

        try {
            const params = new URLSearchParams({
                data_inicio: dataInicioDRE,
                data_fim: dataFimDRE,
            });

            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/relatorio_dre/${encodeURIComponent(
                    estabelecimentoId
                )}?${params.toString()}`
            );

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || `Erro HTTP: ${response.status}`);

            setRelatorioDRE(data);

        } catch (err) {
            setErrorDRE(err.message);
        } finally {
            setLoadingDRE(false);
        }
    };


    // ================================
    // 📌 3. FUNÇÃO — BAIXAR PDF DO DRE
    // ================================
    const handleBaixarPDF = () => {
        if (!relatorioDRE) return;

        const doc = new jsPDF();
        let startY = 15;

        // Carregar logo no PDF
        if (logoUrl) {
            try {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.src = logoUrl;

                img.onload = () => {
                    const aspectRatio = img.width / img.height;
                    const imgHeight = 25 / aspectRatio;

                    doc.addImage(img, "PNG", 15, 10, 25, imgHeight);
                    continuePDF(imgHeight + 15);
                };

                img.onerror = () => continuePDF(startY);

            } catch {
                continuePDF(startY);
            }
        } else {
            continuePDF(startY);
        }

        // Continuação PDF
        const continuePDF = (y) => {
            doc.setFontSize(16);
            doc.setFont(undefined, "bold");
            doc.text(nomeFantasia || "Relatório da Mercearia", 105, y, { align: "center" });

            doc.setFontSize(12);
            doc.setFont(undefined, "normal");
            doc.setTextColor(80);
            doc.text(
                "Relatório de Resultado do Exercício (DRE)",
                105,
                y + 7,
                { align: "center" }
            );

            const periodo = `Período de ${formatDate(dataInicioDRE)} até ${formatDate(dataFimDRE)}`;
            doc.setFontSize(10);
            doc.text(periodo, 105, y + 12, { align: "center" });

            const tableData = [
                ["(+) Receita Bruta Total", formatCurrency(relatorioDRE.receita_bruta)],
                ["   Em Dinheiro", formatCurrency(relatorioDRE.receita_dinheiro)],
                ["   Em Pix", formatCurrency(relatorioDRE.receita_pix)],
                ["   Em Cartão", formatCurrency(relatorioDRE.receita_cartao)],
                ["(-) CMV", `- ${formatCurrency(relatorioDRE.cmv)}`],
                ["(=) Lucro Bruto", formatCurrency(relatorioDRE.lucro_bruto)],
                ["(-) Despesas", `- ${formatCurrency(relatorioDRE.despesas)}`],
                ["(=) Lucro Líquido", formatCurrency(relatorioDRE.lucro_liquido)],
            ];

            autoTable(doc, {
                startY: y + 20,
                head: [["Descrição", "Valor"]],
                body: tableData,
                theme: "striped",
                styles: { fontSize: 10, cellPadding: 3 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                columnStyles: {
                    0: { cellWidth: 120 },
                    1: { cellWidth: "auto", halign: "right" },
                },
            });

            doc.save(`DRE_${nomeFantasia}_${dataInicioDRE}_a_${dataFimDRE}.pdf`);
        };
    };


    // ================================
    // 📌 4. FUNÇÕES — CONTAS A PAGAR
    // ================================
    useEffect(() => {
        if (estabelecimentoId && (activeTab === "contas" || loadingContas)) {
            fetchContas(filterStatus);
        }
    }, [filterStatus, estabelecimentoId, activeTab]);

    const fetchContas = async (status = filterStatus) => {
        setLoadingContas(true);
        setErrorContas(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/${encodeURIComponent(
                    estabelecimentoId
                )}?status=${encodeURIComponent(status)}`
            );

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            setContas(data);

        } catch (err) {
            setErrorContas(err.message);
        } finally {
            setLoadingContas(false);
        }
    };

    const handleContasFormChange = (e) => {
        const { name, value } = e.target;
        setFormDataContas((prev) => ({ ...prev, [name]: value }));
    };

    const handleCancelarContasForm = () => {
        setShowFormContas(false);
        setFormDataContas({ descricao: "", valor: "", data_vencimento: "" });
        setContaEmEdicao(null);
        setErrorContas(null);
    };

    const handleContasFormSubmit = async (e) => {
        e.preventDefault();
        if (contaEmEdicao) await handleUpdateConta();
        else await handleAddConta();
    };

    const handleAddConta = async () => {
        setSavingContas(true);
        setErrorContas(null);

        try {
            const valorFormatado = formDataContas.valor.replace(",", ".");

            const response = await fetch(`${BACKEND_BASE_URL}/api/financeiro`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    estabelecimentoId,
                    descricao: formDataContas.descricao,
                    valor: valorFormatado,
                    data_vencimento: formDataContas.data_vencimento,
                }),
            });

            const result = await response.json();

            if (!response.ok) throw new Error(result.error || "Erro ao adicionar conta.");

            fetchContas(filterStatus);
            handleCancelarContasForm();

        } catch (err) {
            setErrorContas(`Falha ao adicionar: ${err.message}`);
        } finally {
            setSavingContas(false);
        }
    };

    const handleUpdateConta = async () => {
        setSavingContas(true);
        setErrorContas(null);

        try {
            const valorFormatado = formDataContas.valor.replace(",", ".");

            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/${encodeURIComponent(contaEmEdicao)}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        estabelecimentoId,
                        descricao: formDataContas.descricao,
                        valor: valorFormatado,
                        data_vencimento: formDataContas.data_vencimento,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) throw new Error(result.error || "Erro ao atualizar conta.");

            setContas((prev) =>
                prev.map((c) => (c.id === contaEmEdicao ? result : c))
            );

            handleCancelarContasForm();

        } catch (err) {
            setErrorContas(`Falha ao atualizar: ${err.message}`);
        } finally {
            setSavingContas(false);
        }
    };
    // -----------------------------
    // EDIÇÃO / AÇÕES SOBRE CONTAS
    // -----------------------------
    const handleEditClick = (conta) => {
        // Formata YYYY-MM-DD a partir do ISO (se existir 'T')
        const dataFormatada = conta.data_vencimento ? conta.data_vencimento.split('T')[0] : getLocalDateISOString();
        setFormDataContas({
            descricao: conta.descricao || '',
            valor: parseFloat(conta.valor || 0).toLocaleString('pt-BR', { useGrouping: false, minimumFractionDigits: 2 }),
            data_vencimento: dataFormatada,
        });
        setContaEmEdicao(conta.id);
        setShowFormContas(true);
    };

    const handleMarcarPaga = async (contaId) => {
        setSavingContas(true);
        setErrorContas(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/${encodeURIComponent(contaId)}/pagar`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ estabelecimentoId }),
                }
            );

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || "Erro ao marcar como paga.");
            }

            // Atualiza resumo e lista localmente
            fetchResumo();
            if (filterStatus === "pendente" || filterStatus === "atrasada") {
                setContas((prev) => prev.filter((c) => c.id !== contaId));
            } else {
                fetchContas(filterStatus);
            }

        } catch (err) {
            setErrorContas(`Falha ao pagar: ${err.message}`);
        } finally {
            setSavingContas(false);
        }
    };

    const handleDeleteConta = async (contaId) => {
        if (!window.confirm("Tem certeza que deseja excluir esta conta pendente?")) return;

        setSavingContas(true);
        setErrorContas(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/${encodeURIComponent(contaId)}`,
                {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ estabelecimentoId }),
                }
            );

            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || "Erro ao excluir conta.");
            }

            setContas((prev) => prev.filter((c) => c.id !== contaId));

        } catch (err) {
            setErrorContas(`Falha ao excluir: ${err.message}`);
        } finally {
            setSavingContas(false);
        }
    };


    // ================================
    // 📌 5. FUNÇÕES — RELATÓRIO DE PRODUTOS
    // ================================
    const fetchCategorias = async () => {
        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/categorias/${encodeURIComponent(estabelecimentoId)}`
            );

            if (!response.ok) throw new Error("Erro ao buscar categorias.");

            const data = await response.json();
            setCategorias(data);

        } catch (err) {
            console.error("Erro ao carregar categorias:", err);
            setErrorReportProdutos("Falha ao carregar categorias para o filtro.");
        }
    };

    const handleGerarReportProdutos = async (e) => {
        e.preventDefault();
        setLoadingReportProdutos(true);
        setErrorReportProdutos(null);
        setReportProdutos([]);

        try {
            const params = new URLSearchParams({
                data_inicio: dataInicioProdutos,
                data_fim: dataFimProdutos,
            });
            if (categoriaFiltro) params.append("categoria_id", categoriaFiltro);

            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/relatorio_produtos/${encodeURIComponent(estabelecimentoId)}?${params.toString()}`
            );

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || "Erro ao gerar relatório.");

            setReportProdutos(data);

        } catch (err) {
            setErrorReportProdutos(err.message);
        } finally {
            setLoadingReportProdutos(false);
        }
    };

    // ================================
    // 📌 6. FUNÇÃO — IMPRIMIR TELA
    // ================================
    const handleImprimirTela = () => {
        window.print();
    };

    // === FIM DAS FUNÇÕES (PARTE 3) ===
    // ================================
    // 📌 7. RENDERIZAÇÃO FINAL
    // ================================
    return (
        <div className="financeiro-container">

            {/* ================================
                ❗ Cabeçalho com Tabs + Botão Imprimir
            ================================= */}
            <div
                className="financeiro-header-row no-print"
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    marginBottom: "20px",
                }}
            >
                <div className="tabs-nav">
                    <button
                        className={`tab-btn ${activeTab === "fluxo" ? "active" : ""}`}
                        onClick={() => setActiveTab("fluxo")}
                    >
                        Fluxo de Caixa
                    </button>

                    <button
                        className={`tab-btn ${activeTab === "contas" ? "active" : ""}`}
                        onClick={() => setActiveTab("contas")}
                    >
                        Contas a Pagar
                    </button>

                    <button
                        className={`tab-btn ${activeTab === "relatorios" ? "active" : ""}`}
                        onClick={() => setActiveTab("relatorios")}
                    >
                        Relatórios de Vendas
                    </button>
                </div>

                <button
                    className="btn-nova-conta"
                    style={{
                        backgroundColor: "#6c757d",
                        width: "auto",
                        minWidth: "auto",
                        padding: "10px 16px",
                    }}
                    onClick={handleImprimirTela}
                >
                    🖨️ Imprimir Tela
                </button>
            </div>

            {/* ================================
                ❗ CONTEÚDO DAS ABAS
            ================================= */}
            <div className="tab-content">

                {/* ==========================================
                    ABA 1 — FLUXO DE CAIXA
                =========================================== */}
                {activeTab === "fluxo" && (
                    <div className="tab-pane">
                        <div className="resumo-dia-header">
                            <h3>Resumo do Dia</h3>

                            <button
                                className="btn-atualizar-resumo no-print"
                                onClick={fetchResumo}
                                disabled={loadingResumo}
                            >
                                {loadingResumo ? "..." : "Atualizar"}
                            </button>
                        </div>

                        {errorResumo && (
                            <p className="financeiro-error">
                                Erro ao carregar resumo: {errorResumo}
                            </p>
                        )}

                        {/* CARDS DO RESUMO */}
                        <div className="resumo-cards-container">
                            <ResumoCard
                                titulo="Entradas Totais (Hoje)"
                                valor={resumo?.total_entradas_dia}
                                loading={loadingResumo}
                                cor="verde"
                            />
                            <ResumoCard
                                titulo="Dinheiro"
                                valor={resumo?.total_dinheiro}
                                loading={loadingResumo}
                            />
                            <ResumoCard
                                titulo="Pix"
                                valor={resumo?.total_pix}
                                loading={loadingResumo}
                            />
                            <ResumoCard
                                titulo="Cartão"
                                valor={resumo?.total_cartao}
                                loading={loadingResumo}
                            />
                        </div>

                        {/* DRE */}
                        <h3 className="section-title">Relatório DRE</h3>

                        <form className="relatorio-form no-print" onSubmit={handleGerarDRE}>
                            <div className="form-group">
                                <label>Data Início</label>
                                <input
                                    type="date"
                                    value={dataInicioDRE}
                                    onChange={(e) => setDataInicioDRE(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label>Data Fim</label>
                                <input
                                    type="date"
                                    value={dataFimDRE}
                                    onChange={(e) => setDataFimDRE(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="btn-gerar-relatorio">
                                {loadingDRE ? "Gerando..." : "Gerar DRE"}
                            </button>

                            <button
                                type="button"
                                className="btn-pdf-relatorio"
                                onClick={handleBaixarPDF}
                                disabled={!relatorioDRE}
                            >
                                Baixar PDF
                            </button>
                        </form>

                        {loadingDRE && <div className="financeiro-loading">Gerando...</div>}
                        {errorDRE && <p className="financeiro-error">{errorDRE}</p>}

                        {relatorioDRE && (
                            <div className="dre-card-grid">

                                {/* RECEITA BRUTA */}
                                <div className="dre-card dre-card-receita">
                                    <h4>(+) Receita Bruta Total</h4>
                                    <p>{formatCurrency(relatorioDRE.receita_bruta)}</p>
                                    <div className="dre-card-sub-items">
                                        <span>Dinheiro: {formatCurrency(relatorioDRE.receita_dinheiro)}</span>
                                        <span>Pix: {formatCurrency(relatorioDRE.receita_pix)}</span>
                                        <span>Cartão: {formatCurrency(relatorioDRE.receita_cartao)}</span>
                                    </div>
                                </div>

                                {/* CMV */}
                                <div className="dre-card dre-card-despesa">
                                    <h4>(-) CMV</h4>
                                    <p>- {formatCurrency(relatorioDRE.cmv)}</p>
                                </div>

                                {/* LUCRO BRUTO */}
                                <div className="dre-card dre-card-lucro-bruto">
                                    <h4>(=) Lucro Bruto</h4>
                                    <p>{formatCurrency(relatorioDRE.lucro_bruto)}</p>
                                </div>

                                {/* DESPESAS */}
                                <div className="dre-card dre-card-despesa">
                                    <h4>(-) Despesas Operacionais</h4>
                                    <p>- {formatCurrency(relatorioDRE.despesas)}</p>
                                </div>

                                {/* LUCRO LÍQUIDO */}
                                <div className="dre-card dre-card-lucro-liquido">
                                    <h4>(=) Lucro Líquido</h4>
                                    <p>{formatCurrency(relatorioDRE.lucro_liquido)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ==========================================
                    ABA 2 — CONTAS A PAGAR
                =========================================== */}
                {activeTab === "contas" && (
                    <div className="tab-pane">

                        <h3 className="section-title">Gestão de Contas a Pagar</h3>

                        {/* FILTROS */}
                        <div className="financeiro-controles no-print">
                            <div className="status-filtros">
                                <button
                                    className={`btn-filtro ${filterStatus === "pendente" ? "active" : ""}`}
                                    onClick={() => setFilterStatus("pendente")}
                                >
                                    Pendente
                                </button>

                                <button
                                    className={`btn-filtro ${filterStatus === "paga" ? "active" : ""}`}
                                    onClick={() => setFilterStatus("paga")}
                                >
                                    Paga
                                </button>

                                <button
                                    className={`btn-filtro ${filterStatus === "atrasada" ? "active" : ""}`}
                                    onClick={() => setFilterStatus("atrasada")}
                                >
                                    Atrasada
                                </button>
                            </div>

                            <button
                                className="btn-nova-conta"
                                onClick={() => {
                                    setContaEmEdicao(null);
                                    setFormDataContas({ descricao: "", valor: "", data_vencimento: "" });
                                    setShowFormContas(true);
                                }}
                            >
                                + Nova Conta
                            </button>
                        </div>

                        {/* FORMULÁRIO DE ADIÇÃO/EDIÇÃO */}
                        {showFormContas && (
                            <div className="modal-financeiro no-print">
                                <h4>{contaEmEdicao ? "Editar Conta" : "Adicionar Conta"}</h4>

                                <form onSubmit={handleContasFormSubmit}>
                                    <input
                                        type="text"
                                        name="descricao"
                                        placeholder="Descrição"
                                        value={formDataContas.descricao}
                                        onChange={handleContasFormChange}
                                    />

                                    <input
                                        type="text"
                                        name="valor"
                                        placeholder="Valor (R$)"
                                        value={formDataContas.valor}
                                        onChange={handleContasFormChange}
                                    />

                                    <input
                                        type="date"
                                        name="data_vencimento"
                                        value={formDataContas.data_vencimento}
                                        onChange={handleContasFormChange}
                                    />

                                    <div className="modal-actions-financeiro">
                                        <button type="button" onClick={handleCancelarContasForm}>
                                            Cancelar
                                        </button>

                                        <button type="submit">
                                            {savingContas
                                                ? "Salvando..."
                                                : contaEmEdicao
                                                ? "Atualizar"
                                                : "Salvar"}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {errorContas && (
                            <p className="financeiro-error">{errorContas}</p>
                        )}

                        {/* LISTA / CARDS */}
                        {loadingContas ? (
                            <div className="financeiro-loading">Carregando...</div>
                        ) : (
                            <div className="contas-card-container">
                                {contas.length === 0 ? (
                                    <p style={{ textAlign: "center", gridColumn: "1 / -1" }}>
                                        Nenhuma conta encontrada.
                                    </p>
                                ) : (
                                    contas.map((conta) => (
                                        <div key={conta.id} className={`conta-card status-${conta.status}`}>
                                            <div className="conta-card-header">
                                                <h5>{conta.descricao}</h5>
                                            </div>

                                            <div className="conta-card-body">
                                                <div className="conta-card-info">
                                                    <span>Vencimento</span>
                                                    <span>{formatDate(conta.data_vencimento)}</span>
                                                </div>
                                                <div className="conta-card-info">
                                                    <span>Valor</span>
                                                    <span className="valor">
                                                        {formatCurrency(conta.valor)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* BOTÕES */}
                                            {(conta.status === "pendente" ||
                                                conta.status === "atrasada") && (
                                                <div className="conta-card-footer no-print">
                                                    <button
                                                        className="btn-editar"
                                                        onClick={() => handleEditClick(conta)}
                                                    >
                                                        Editar
                                                    </button>

                                                    <button
                                                        className="btn-excluir"
                                                        onClick={() => handleDeleteConta(conta.id)}
                                                    >
                                                        Excluir
                                                    </button>

                                                    <button
                                                        className="btn-pagar"
                                                        onClick={() => handleMarcarPaga(conta.id)}
                                                    >
                                                        Pagar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ==========================================
                    ABA 3 — RELATÓRIOS DE PRODUTOS
                =========================================== */}
                {activeTab === "relatorios" && (
                    <div className="tab-pane">
                        <h3 className="section-title">Produtos Mais Vendidos</h3>

                        <form className="relatorio-form-produtos no-print" onSubmit={handleGerarReportProdutos}>
                            <div className="form-group">
                                <label>Data Início</label>
                                <input
                                    type="date"
                                    value={dataInicioProdutos}
                                    onChange={(e) => setDataInicioProdutos(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label>Data Fim</label>
                                <input
                                    type="date"
                                    value={dataFimProdutos}
                                    onChange={(e) => setDataFimProdutos(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label>Categoria</label>
                                <select
                                    value={categoriaFiltro}
                                    onChange={(e) => setCategoriaFiltro(e.target.value)}
                                >
                                    <option value="">Todas</option>
                                    {categorias.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button className="btn-gerar-relatorio" type="submit">
                                {loadingReportProdutos ? "Gerando..." : "Gerar"}
                            </button>
                        </form>

                        {loadingReportProdutos && (
                            <div className="financeiro-loading">Carregando...</div>
                        )}
                        {errorReportProdutos && (
                            <p className="financeiro-error">{errorReportProdutos}</p>
                        )}

                        <div className="report-card-container">
                            {reportProdutos.length === 0 && !loadingReportProdutos ? (
                                <p style={{ textAlign: "center", padding: "20px", gridColumn: "1 / -1" }}>
                                    Nenhum produto encontrado.
                                </p>
                            ) : (
                                reportProdutos.map((prod, i) => (
                                    <div key={i} className="report-card">
                                        <h5>{prod.produto_nome}</h5>

                                        <div className="report-card-info">
                                            <span className="label">Categoria</span>
                                            <span>{prod.categoria_nome || "Sem Categoria"}</span>
                                        </div>

                                        <div className="report-card-info">
                                            <span className="label">Total Vendido</span>
                                            <span className="quantidade">
                                                {prod.unidade_medida === "kg"
                                                    ? parseFloat(prod.total_vendido).toFixed(3)
                                                    : parseFloat(prod.total_vendido).toFixed(0)}
                                                <span className="unidade-medida"> ({prod.unidade_medida})</span>
                                            </span>
                                        </div>

                                        <div className="report-card-info">
                                            <span className="label">Receita</span>
                                            <span className="receita">
                                                {formatCurrency(prod.receita_total)}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Financeiro;

