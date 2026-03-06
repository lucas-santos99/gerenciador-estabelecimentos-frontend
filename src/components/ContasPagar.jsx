// ===== ContasPagar.jsx (CORRIGIDO PARA RENDER / LOCALHOST) =====
import React, { useState, useEffect } from 'react';

// BACKEND AUTOMÁTICO
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// Formata data para pt-BR
const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
        return new Date(dateString).toLocaleDateString("pt-BR", { timeZone: "UTC" });
    } catch {
        return "Data Inválida";
    }
};

const ContasPagar = ({ estabelecimentoId }) => {

    const [contas, setContas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    const [filterStatus, setFilterStatus] = useState("pendente");
    const [saving, setSaving] = useState(false);

    const [showForm, setShowForm] = useState(false);
    const [novaConta, setNovaConta] = useState({
        descricao: "",
        valor: "",
        data_vencimento: "",
    });

    // ===============================
    // Buscar CONTAS A PAGAR
    // ===============================
    const fetchContas = async (status = filterStatus) => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/pagar/${encodeURIComponent(
                    estabelecimentoId
                )}?status=${encodeURIComponent(status)}`
            );

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();
            setContas(data);

        } catch (err) {
            console.error("Erro ao buscar contas a pagar:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContas();
    }, [estabelecimentoId, filterStatus]);

    // ===============================
    // Adicionar nova conta
    // ===============================
    const handleAddConta = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            const valorCorrigido = novaConta.valor.toString().replace(",", ".");

            const response = await fetch(`${BACKEND_BASE_URL}/api/financeiro/pagar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    estabelecimentoId: estabelecimentoId,
                    descricao: novaConta.descricao,
                    valor: valorCorrigido,
                    data_vencimento: novaConta.data_vencimento,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Erro ao adicionar conta.");
            }

            if (filterStatus === "pendente") {
                setContas((prev) => [result, ...prev]);
            }

            setNovaConta({
                descricao: "",
                valor: "",
                data_vencimento: "",
            });
            setShowForm(false);

        } catch (err) {
            setError(`Falha ao adicionar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ===============================
    // Marcar como paga
    // ===============================
    const handleMarcarPaga = async (contaId) => {
        setSaving(true);
        setError(null);

        try {
            const response = await fetch(
                `${BACKEND_BASE_URL}/api/financeiro/pagar/${encodeURIComponent(
                    contaId
                )}/pagar`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ estabelecimentoId }),
                }
            );

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Erro ao marcar como paga.");
            }

            if (filterStatus === "pendente") {
                setContas((prev) => prev.filter((c) => c.id !== contaId));
            } else {
                fetchContas();
            }

        } catch (err) {
            setError(`Falha ao pagar: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // ===============================
    // RENDER
    // ===============================
    return (
        <div className="contas-pagar-section">

            {/* CONTROLES */}
            <div className="financeiro-controles">
                
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

                    <button
                        className={`btn-filtro ${filterStatus === "todas" ? "active" : ""}`}
                        onClick={() => setFilterStatus("todas")}
                    >
                        Todas
                    </button>
                </div>

                <button
                    className="btn-nova-conta"
                    onClick={() => setShowForm(!showForm)}
                >
                    {showForm ? "Cancelar" : "+ Nova Conta a Pagar"}
                </button>
            </div>

            {/* FORMULÁRIO */}
            {showForm && (
                <div className="modal-financeiro">
                    <h4>Adicionar Despesa (Conta a Pagar)</h4>

                    <form onSubmit={handleAddConta}>
                        <input
                            type="text"
                            placeholder="Descrição"
                            value={novaConta.descricao}
                            required
                            onChange={(e) =>
                                setNovaConta({ ...novaConta, descricao: e.target.value })
                            }
                        />

                        <input
                            type="number"
                            step="0.01"
                            placeholder="Valor (R$)"
                            value={novaConta.valor}
                            required
                            onChange={(e) =>
                                setNovaConta({ ...novaConta, valor: e.target.value })
                            }
                        />

                        <input
                            type="date"
                            value={novaConta.data_vencimento}
                            required
                            onChange={(e) =>
                                setNovaConta({
                                    ...novaConta,
                                    data_vencimento: e.target.value,
                                })
                            }
                        />

                        <div className="modal-actions-financeiro">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                disabled={saving}
                            >
                                Cancelar
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    saving ||
                                    !novaConta.descricao ||
                                    !novaConta.valor ||
                                    !novaConta.data_vencimento
                                }
                            >
                                {saving ? "Salvando..." : "Salvar Conta"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* LISTA */}
            {error && <p className="financeiro-error">Erro: {error}</p>}

            {loading ? (
                <div className="financeiro-loading">Carregando contas a pagar...</div>
            ) : (
                <table className="contas-tabela">
                    <thead>
                        <tr>
                            <th>Descrição</th>
                            <th>Vencimento</th>
                            <th>Valor (R$)</th>
                            <th>Status</th>
                            <th>Ação</th>
                        </tr>
                    </thead>

                    <tbody>
                        {contas.length === 0 ? (
                            <tr>
                                <td colSpan="5" style={{ textAlign: "center", padding: "20px" }}>
                                    Nenhuma conta a pagar encontrada.
                                </td>
                            </tr>
                        ) : (
                            contas.map((conta) => (
                                <tr
                                    key={conta.id}
                                    className={
                                        conta.status === "atrasada" ||
                                        (conta.status === "pendente" &&
                                            new Date(conta.data_vencimento) < new Date())
                                            ? "conta-atrasada"
                                            : ""
                                    }
                                >
                                    <td>{conta.descricao}</td>
                                    <td>{formatDate(conta.data_vencimento)}</td>
                                    <td>R$ {parseFloat(conta.valor).toFixed(2)}</td>
                                    <td className={`status-${conta.status.toLowerCase()}`}>
                                        {conta.status.toUpperCase()}
                                    </td>
                                    <td>
                                        {conta.status !== "paga" && (
                                            <button
                                                className="btn-pagar"
                                                onClick={() => handleMarcarPaga(conta.id)}
                                                disabled={saving}
                                            >
                                                {saving ? "..." : "Marcar Pago"}
                                            </button>
                                        )}
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

export default ContasPagar;
