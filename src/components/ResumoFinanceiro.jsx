import React, { useState, useEffect } from 'react';

// BACKEND AUTOMÁTICO (LOCAL VS PRODUÇÃO)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// Formata moeda brasileira
const formatCurrency = (value) => {
    return (value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
};

const ResumoFinanceiro = ({ estabelecimentoId }) => {

    const [resumo, setResumo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {

        const fetchResumo = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    `${BACKEND_BASE_URL}/api/financeiro/resumo/${encodeURIComponent(estabelecimentoId)}`
                );

                if (!response.ok) {
                    throw new Error('Falha ao buscar resumo do caixa.');
                }

                const data = await response.json();
                setResumo(data);

            } catch (err) {
                console.error("Erro ao buscar resumo:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (estabelecimentoId) fetchResumo();

    }, [estabelecimentoId]);

    // ======== RENDER =========

    if (loading) {
        return <div className="loading-card">Carregando resumo financeiro...</div>;
    }

    if (error) {
        return <div className="error-card">Erro ao carregar o Resumo: {error}</div>;
    }

    if (!resumo) {
        return <div className="info-card">Nenhum dado de resumo disponível.</div>;
    }

    return (
        <div className="resumo-dashboard">
            
            <h4 className="resumo-subtitle">Situação de Hoje e Pendências</h4>

            <div className="resumo-grid">
                
                {/* Total de Vendas do Dia */}
                <div className="resumo-card highlight-card">
                    <p className="card-title">Vendas (Entradas) do Dia</p>
                    <p className="card-value total-entrada">
                        {formatCurrency(resumo.total_entradas_dia)}
                    </p>
                </div>

                {/* Fiado Pendente */}
                <div className="resumo-card info-card">
                    <p className="card-title">Fiado Pendente</p>
                    <p className="card-value total-receber">
                        {formatCurrency(resumo.total_fiado_pendente)}
                    </p>
                </div>

                {/* Contas a pagar */}
                <div className="resumo-card danger-card">
                    <p className="card-title">Contas a Pagar Pendente</p>
                    <p className="card-value total-pagar">
                        {formatCurrency(resumo.total_contas_pagar_pendente)}
                    </p>
                </div>

            </div>

            <h4 className="resumo-subtitle mt-8">Detalhamento das Entradas do Dia</h4>

            <div className="resumo-grid detalhes-grid">
                {Object.entries(resumo.meios_pagamento).map(([meio, valor]) => (
                    <div key={meio} className="detail-card">
                        <p className="card-title">{meio}</p>
                        <p className="card-value">{formatCurrency(valor)}</p>
                    </div>
                ))}
            </div>

        </div>
    );
};

export default ResumoFinanceiro;
