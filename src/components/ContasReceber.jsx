// ===== ContasReceber.jsx (CORRIGIDO PARA RENDER / LOCALHOST) =====
import React, { useState, useEffect } from 'react';

// BACKEND AUTOMÁTICO (Render vs Localhost)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// Formata data para pt-BR
const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
        return new Date(dateString).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    } catch (e) {
        return "Data Inválida";
    }
};

const ContasReceber = ({ estabelecimentoId }) => {

    const [fiados, setFiados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // ===============================
    // BUSCAR FIADOS PENDENTES
    // ===============================
    const fetchFiados = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/receber/${encodeURIComponent(
                    estabelecimentoId
                )}`
            );

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();
            setFiados(data);

        } catch (err) {
            console.error("Erro ao buscar fiados:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Load inicial
    useEffect(() => {
        if (estabelecimentoId) fetchFiados();
    }, [estabelecimentoId]);

    // ===============================
    // MARCAR FIADO COMO RECEBIDO
    // ===============================
    const handleReceberFiado = async (fiadoId) => {
        setSaving(true);
        setError(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/receber/${encodeURIComponent(
                    fiadoId
                )}/liquidar`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        estabelecimentoId: encodeURIComponent(estabelecimentoId),
                    }),
                }
            );

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || "Erro ao liquidar fiado.");
            }

            // Remove da lista imediatamente
            setFiados((prev) => prev.filter((f) => f.id !== fiadoId));

        } catch (err) {
            console.error(err);
            setError(`Falha ao liquidar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ===============================
    // RENDER
    // ===============================
    return (
        <div className="contas-receber-section">

            <h4 className="section-title">
                Fiado dos Clientes (Contas a Receber Pendentes)
            </h4>

            {error && <p className="financeiro-error">Erro: {error}</p>}

            {loading ? (
                <div className="financeiro-loading">
                    Carregando fiados pendentes...
                </div>
            ) : (
                <table className="contas-tabela">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th>Descrição</th>
                            <th>Vencimento</th>
                            <th>Valor (R$)</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>

                    <tbody>
                        {fiados.length === 0 ? (
                            <tr>
                                <td colSpan="6" style={{ textAlign: "center", padding: "20px" }}>
                                    Nenhum fiado pendente encontrado.
                                </td>
                            </tr>
                        ) : (
                            fiados.map((fiado) => (
                                <tr
                                    key={fiado.id}
                                    className={
                                        fiado.status === "atrasado" ? "conta-atrasada" : ""
                                    }
                                >
                                    <td>{fiado.nome_cliente}</td>
                                    <td>{fiado.descricao}</td>
                                    <td>{formatDate(fiado.data_vencimento)}</td>
                                    <td>R$ {parseFloat(fiado.valor).toFixed(2)}</td>
                                    <td
                                        className={`status-${fiado.status.toLowerCase()}`}
                                    >
                                        {fiado.status.toUpperCase()}
                                    </td>
                                    <td>
                                        <button
                                            className="btn-receber"
                                            disabled={saving}
                                            onClick={() => handleReceberFiado(fiado.id)}
                                        >
                                            {saving ? "..." : "Receber Pagamento"}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default ContasReceber;
