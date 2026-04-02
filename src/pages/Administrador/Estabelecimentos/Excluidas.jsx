// src/pages/Administrador/Estabelecimentos/Excluidas.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function Excluidas() {
  const API_URL  = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  const [lista,         setLista]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [modalAtivo,    setModalAtivo]    = useState(false);
  const [idSelecionado, setIdSelecionado] = useState(null);
  const [nomeSel,       setNomeSel]       = useState("");

  async function carregar() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/excluidas`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error();
      setLista((await resp.json()) || []);
    } catch { setLista([]); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function restaurar(id, nome) {
    if (!window.confirm(`Restaurar "${nome}"?`)) return;
    try {
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/restaurar`, {
        method: "PUT", credentials: "include",
      });
      if (resp.ok) carregar();
      else { const j = await resp.json(); alert("Erro: " + j.error); }
    } catch { alert("Erro ao restaurar."); }
  }

  function abrirModal(id, nome) {
    setIdSelecionado(id);
    setNomeSel(nome);
    setModalAtivo(true);
  }

  async function excluirDefinitivo() {
    if (!idSelecionado) return;
    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${idSelecionado}/apagar-definitivo`,
        { method: "DELETE", credentials: "include" }
      );
      if (resp.ok) { setModalAtivo(false); carregar(); }
      else { const j = await resp.json(); alert("Erro: " + j.error); }
    } catch { alert("Erro ao excluir definitivamente."); }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Estabelecimentos</span>
            <h1 className="est-page-title">
              Estabelecimentos <span>Excluídos</span>
            </h1>
          </div>
          <div className="est-page-actions">
            <button
              className="est-btn est-btn-ghost"
              onClick={() => navigate("/admin")}
            >
              ← Voltar ao painel
            </button>
          </div>
        </div>

        {/* CONTEÚDO */}
        {loading ? (
          <div className="est-loading">
            <div className="est-spinner" />
            Carregando...
          </div>
        ) : lista.length === 0 ? (
          <div className="est-empty">
            <span className="est-empty-icon">✅</span>
            Nenhum estabelecimento excluído. Tudo limpo!
          </div>
        ) : (
          <div className="est-excl-grid">
            {lista.map((m, i) => (
              <div
                key={m.id}
                className="est-excl-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* Card header */}
                <div className="est-excl-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: "var(--bg-danger)",
                        display: "flex", alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700, fontSize: "0.8rem",
                        color: "var(--text-danger)", flexShrink: 0,
                      }}
                    >
                      {iniciais(m.nome_fantasia)}
                    </div>
                    <span className="est-excl-card-name">{m.nome_fantasia}</span>
                  </div>
                  <span className="est-badge est-badge-excluida">Excluída</span>
                </div>

                {/* Dados */}
                <div className="est-excl-info">
                  <div className="est-excl-info-row">
                    <span className="est-excl-info-label">CNPJ</span>
                    <span className="est-excl-info-value">{m.cnpj || "—"}</span>
                  </div>
                  <div className="est-excl-info-row">
                    <span className="est-excl-info-label">Tel.</span>
                    <span className="est-excl-info-value">{m.telefone || "—"}</span>
                  </div>
                </div>

                {/* Ações */}
                <div className="est-excl-actions">
                  <button
                    className="est-btn est-btn-success est-btn-sm"
                    onClick={() => restaurar(m.id, m.nome_fantasia)}
                  >
                    ↩ Restaurar
                  </button>
                  <button
                    className="est-btn est-btn-danger est-btn-sm"
                    onClick={() => abrirModal(m.id, m.nome_fantasia)}
                  >
                    🗑 Excluir definitivamente
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL */}
        {modalAtivo && (
          <div className="est-modal-overlay" onClick={() => setModalAtivo(false)}>
            <div className="est-modal" onClick={e => e.stopPropagation()}>
              <div className="est-modal-icon">⚠️</div>
              <div className="est-modal-title">Excluir Permanentemente</div>
              <div className="est-modal-desc">
                Você está prestes a remover <strong>{nomeSel}</strong> do sistema.
                Esta ação é <strong>irreversível</strong> e todos os dados serão perdidos.
              </div>
              <div className="est-modal-actions">
                <button
                  className="est-btn est-btn-ghost"
                  onClick={() => setModalAtivo(false)}
                >
                  Cancelar
                </button>
                <button
                  className="est-btn est-btn-danger"
                  onClick={excluirDefinitivo}
                >
                  🗑 Sim, excluir
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutAdmin>
  );
}