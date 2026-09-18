// src/pages/Administrador/Comunicados/Comunicados.jsx
//
// Central de Comunicados do SuperAdmin (backlog item 20). Cadastra avisos
// (mudança de valores, instabilidade, manutenção programada, etc.) que
// aparecem pro comerciante/operador ao acessar o sistema. Cada comunicado
// escolhe seus próprios formatos de exibição — hoje "Modal bloqueante" e
// "Fixo no canto", com espaço pra crescer sem mudar a modelagem (ver
// FORMATOS_DISPONIVEIS abaixo e a coluna `formatos`, jsonb, no backend).
//
// Segmentação: cada comunicado também escolhe um alvo — todos os
// estabelecimentos, um ou mais tipos de estabelecimento (mercearias.
// tipo_estabelecimento), ou um ou mais estabelecimentos específicos. Ver
// ALVO_OPCOES abaixo e a validação equivalente em comunicadosRoutes.js.
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import "../SuperAdmins/SuperAdmins.css";
import "./Comunicados.css";

// Formatos suportados hoje. Adicionar um formato novo no futuro (faixa no
// topo, toast periódico) é só acrescentar um item aqui — o backend já
// aceita qualquer `tipo` dentro do array `formatos` (coluna jsonb).
const FORMATOS_DISPONIVEIS = [
  { tipo: "modal", icone: "🪟", label: "Modal bloqueante", desc: "Aparece antes da tela principal — o comerciante precisa fechar/confirmar pra continuar." },
  { tipo: "fixo",  icone: "📌", label: "Fixo no canto",     desc: "Card fixado num canto da tela, com botão de fechar, sem travar o uso do sistema." },
];

// Alvos de segmentação suportados hoje. "especificos" cobre tanto "um"
// quanto "vários" estabelecimentos — é a mesma lista, só muda a
// quantidade marcada.
const ALVO_OPCOES = [
  { tipo: "todos",               icone: "🌐", label: "Todos os estabelecimentos", desc: "Aparece pra rede inteira." },
  { tipo: "tipo_estabelecimento", icone: "🏷️", label: "Por tipo de estabelecimento", desc: "Só pra estabelecimentos de um ou mais tipos (ex: Mercearia, Restaurante)." },
  { tipo: "especificos",         icone: "🎯", label: "Estabelecimentos específicos", desc: "Escolha um ou vários estabelecimentos, individualmente." },
];

const FORM_VAZIO = {
  titulo: "", mensagem: "", formatos: [], ativo: true,
  alvo_tipo: "todos", alvo_tipos_estabelecimento: [], estabelecimento_ids: [],
};

export default function Comunicados() {
  const navigate = useNavigate();

  const [lista,        setLista]        = useState([]);
  const [loadingLista, setLoadingLista]  = useState(true);

  const [tiposDisponiveis,          setTiposDisponiveis]          = useState([]);
  const [estabelecimentosDisponiveis, setEstabelecimentosDisponiveis] = useState([]);
  const [buscaEstab,                setBuscaEstab]                = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId,  setEditandoId]  = useState(null); // null = criando
  const [form,        setForm]        = useState(FORM_VAZIO);
  const [salvando,    setSalvando]    = useState(false);
  const [erroModal,   setErroModal]   = useState("");

  // Navegação por teclado (mesmo padrão do resto do painel SuperAdmin) —
  // setas navegam a lista, Enter abre edição, Delete exclui, Escape limpa.
  const [comNavId, setComNavId] = useState(null);

  async function carregarLista() {
    setLoadingLista(true);
    try {
      const resp = await apiFetch("/api/comunicados/admin");
      setLista(resp.ok ? await resp.json() : []);
    } catch { setLista([]); }
    setLoadingLista(false);
  }

  async function carregarOpcoesAlvo() {
    try {
      const [respTipos, respEstab] = await Promise.all([
        apiFetch("/api/comunicados/admin/tipos-estabelecimento"),
        apiFetch("/api/comunicados/admin/estabelecimentos-lista"),
      ]);
      setTiposDisponiveis(respTipos.ok ? await respTipos.json() : []);
      setEstabelecimentosDisponiveis(respEstab.ok ? await respEstab.json() : []);
    } catch {
      setTiposDisponiveis([]);
      setEstabelecimentosDisponiveis([]);
    }
  }

  useEffect(() => { carregarLista(); carregarOpcoesAlvo(); }, []);

  function abrirCriar() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setBuscaEstab("");
    setErroModal("");
    setModalAberto(true);
  }

  function abrirEditar(c) {
    setEditandoId(c.id);
    setForm({
      titulo: c.titulo,
      mensagem: c.mensagem,
      formatos: (c.formatos || []).map(f => f.tipo),
      ativo: c.ativo,
      alvo_tipo: c.alvo_tipo || "todos",
      alvo_tipos_estabelecimento: c.alvo_tipos_estabelecimento || [],
      estabelecimento_ids: (c.estabelecimentos_alvo || []).map(e => e.id),
    });
    setBuscaEstab("");
    setErroModal("");
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setErroModal("");
  }

  function toggleFormato(tipo) {
    setForm(p => ({
      ...p,
      formatos: p.formatos.includes(tipo)
        ? p.formatos.filter(t => t !== tipo)
        : [...p.formatos, tipo],
    }));
  }

  function toggleTipoEstabelecimento(tipo) {
    setForm(p => ({
      ...p,
      alvo_tipos_estabelecimento: p.alvo_tipos_estabelecimento.includes(tipo)
        ? p.alvo_tipos_estabelecimento.filter(t => t !== tipo)
        : [...p.alvo_tipos_estabelecimento, tipo],
    }));
  }

  function toggleEstabelecimento(id) {
    setForm(p => ({
      ...p,
      estabelecimento_ids: p.estabelecimento_ids.includes(id)
        ? p.estabelecimento_ids.filter(x => x !== id)
        : [...p.estabelecimento_ids, id],
    }));
  }

  async function salvar() {
    if (!form.titulo.trim())   { setErroModal("Informe o título."); return; }
    if (!form.mensagem.trim()) { setErroModal("Informe a mensagem."); return; }
    if (form.formatos.length === 0) { setErroModal("Escolha ao menos um formato de exibição."); return; }
    if (form.alvo_tipo === "tipo_estabelecimento" && form.alvo_tipos_estabelecimento.length === 0) {
      setErroModal("Selecione ao menos um tipo de estabelecimento.");
      return;
    }
    if (form.alvo_tipo === "especificos" && form.estabelecimento_ids.length === 0) {
      setErroModal("Selecione ao menos um estabelecimento.");
      return;
    }

    setSalvando(true);
    setErroModal("");
    try {
      const payload = {
        titulo: form.titulo,
        mensagem: form.mensagem,
        formatos: form.formatos.map(tipo => ({ tipo })),
        ativo: form.ativo,
        alvo_tipo: form.alvo_tipo,
        alvo_tipos_estabelecimento: form.alvo_tipos_estabelecimento,
        estabelecimento_ids: form.estabelecimento_ids,
      };
      const resp = await apiFetch(
        editandoId ? `/api/comunicados/admin/${editandoId}` : "/api/comunicados/admin",
        { method: editandoId ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");

      // A resposta do backend não traz `estabelecimentos_alvo` populado —
      // recarrega a lista inteira pra já vir com os vínculos corretos em
      // vez de fazer o merge manual e arriscar ficar com a exibição
      // dessincronizada até a próxima F5.
      await carregarLista();
      setModalAberto(false);
    } catch (e) {
      setErroModal(e.message);
    }
    setSalvando(false);
  }

  async function alternarAtivo(c) {
    try {
      const resp = await apiFetch(`/api/comunicados/admin/${c.id}/ativo`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !c.ativo }),
      });
      if (!resp.ok) throw new Error();
      const json = await resp.json();
      setLista(prev => prev.map(x => (x.id === c.id ? { ...x, ativo: json.ativo } : x)));
    } catch { alert("Erro ao atualizar o comunicado."); }
  }

  async function excluir(id, titulo) {
    if (!window.confirm(`Excluir o comunicado "${titulo}"? Essa ação não pode ser desfeita.`)) return;
    try {
      const resp = await apiFetch(`/api/comunicados/admin/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error();
      setLista(prev => prev.filter(c => c.id !== id));
      if (comNavId === id) setComNavId(null);
    } catch { alert("Erro ao excluir o comunicado."); }
  }

  function handleListaKeyDown(e) {
    if (modalAberto) return;
    if (lista.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const idxAtual = comNavId ? lista.findIndex(c => c.id === comNavId) : -1;
      const novoIdx = e.key === "ArrowDown"
        ? (idxAtual === -1 ? 0 : Math.min(idxAtual + 1, lista.length - 1))
        : (idxAtual === -1 ? lista.length - 1 : Math.max(idxAtual - 1, 0));
      const alvo = lista[novoIdx];
      setComNavId(alvo.id);
      document.getElementById(`com-item-${alvo.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (e.key === "Enter" && comNavId) {
      const alvo = lista.find(c => c.id === comNavId);
      if (alvo) { e.preventDefault(); abrirEditar(alvo); }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && comNavId) {
      const alvo = lista.find(c => c.id === comNavId);
      if (alvo) { e.preventDefault(); excluir(alvo.id, alvo.titulo); }
      return;
    }
    if (e.key === "Escape" && comNavId) { setComNavId(null); return; }
  }

  function formatoLabel(tipo) {
    return FORMATOS_DISPONIVEIS.find(f => f.tipo === tipo)?.label || tipo;
  }
  function formatoIcone(tipo) {
    return FORMATOS_DISPONIVEIS.find(f => f.tipo === tipo)?.icone || "🔔";
  }

  function alvoResumo(c) {
    if (c.alvo_tipo === "tipo_estabelecimento") {
      return `🏷️ ${(c.alvo_tipos_estabelecimento || []).join(", ") || "—"}`;
    }
    if (c.alvo_tipo === "especificos") {
      const nomes = (c.estabelecimentos_alvo || []).map(e => e.nome);
      const qtd = nomes.length;
      return `🎯 ${qtd} estabelecimento${qtd === 1 ? "" : "s"}`;
    }
    return "🌐 Todos os estabelecimentos";
  }

  function alvoTitle(c) {
    if (c.alvo_tipo === "especificos") {
      return (c.estabelecimentos_alvo || []).map(e => e.nome).join(", ");
    }
    return undefined;
  }

  const estabelecimentosFiltrados = buscaEstab
    ? estabelecimentosDisponiveis.filter(e =>
        (e.nome_fantasia || "").toLowerCase().includes(buscaEstab.toLowerCase())
      )
    : estabelecimentosDisponiveis;

  return (
    <LayoutAdmin>
      <div className="sa-wrapper">

        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">📣 Painel Administrativo</span>
            <h1 className="sa-page-title">Central de <span>Comunicados</span></h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>
              ← Voltar ao painel
            </button>
            <button className="sa-btn sa-btn-purple" onClick={abrirCriar}>
              📣 + Novo Comunicado
            </button>
          </div>
        </div>

        <div
          className="sa-list-box"
          tabIndex={0}
          onKeyDown={handleListaKeyDown}
        >
          <div className="sa-list-header">
            <span className="sa-list-title">Comunicados cadastrados</span>
            <span className="sa-count-badge">{lista.length}</span>
          </div>

          {loadingLista ? (
            <div className="sa-loading"><div className="sa-spinner" /> Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="sa-empty">Nenhum comunicado cadastrado ainda.</div>
          ) : (
            lista.map(c => (
              <div
                key={c.id}
                id={`com-item-${c.id}`}
                className={`sa-user-item${c.id === comNavId ? " foco-teclado" : ""}`}
                onClick={() => setComNavId(c.id)}
              >
                <div className="com-item-info">
                  <div className="com-item-topo">
                    <span className={`sa-badge ${c.ativo ? "sa-badge-ativo" : "sa-badge-inativo"}`}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                    <span className="com-item-titulo">{c.titulo}</span>
                    <span className="com-alvo-chip" title={alvoTitle(c)}>{alvoResumo(c)}</span>
                  </div>
                  <div className="com-item-mensagem">{c.mensagem}</div>
                  <div className="com-item-formatos">
                    {(c.formatos || []).map(f => (
                      <span key={f.tipo} className="com-formato-chip">
                        {formatoIcone(f.tipo)} {formatoLabel(f.tipo)}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => abrirEditar(c)}>
                    ✏️ Editar
                  </button>
                  <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => alternarAtivo(c)}>
                    {c.ativo ? "⏸ Desativar" : "▶️ Ativar"}
                  </button>
                  <button className="sa-btn sa-btn-danger sa-btn-sm" onClick={() => excluir(c.id, c.titulo)}>
                    🗑 Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL: CRIAR/EDITAR */}
        {modalAberto && (
          <div className="sa-modal-overlay" onClick={fecharModal}>
            <div className="sa-modal com-modal-largo" onClick={e => e.stopPropagation()}>
              <div className="sa-modal-icon">📣</div>
              <div className="sa-modal-title">{editandoId ? "Editar Comunicado" : "Novo Comunicado"}</div>
              <div className="sa-modal-subtitle">
                Escolha pelo menos um formato de exibição pra este comunicado — pode combinar mais de um.
              </div>
              {erroModal && (
                <div style={{ background: "var(--bg-danger)", color: "var(--text-danger)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "10px 14px", fontSize: "0.85rem", fontWeight: 500, marginBottom: 16 }}>
                  ⚠️ {erroModal}
                </div>
              )}
              <div className="sa-modal-form">
                <div className="sa-form-group">
                  <label className="sa-label">Título</label>
                  <input
                    maxLength={200} className="sa-input"
                    placeholder="Ex: Manutenção programada"
                    value={form.titulo}
                    onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                  />
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">Mensagem</label>
                  <textarea
                    maxLength={3000} rows={4} className="sa-input"
                    placeholder="Ex: No dia 20/09, das 2h às 4h, o sistema ficará indisponível para manutenção."
                    value={form.mensagem}
                    onChange={e => setForm(p => ({ ...p, mensagem: e.target.value }))}
                  />
                </div>
                <div className="sa-form-group">
                  <label className="sa-label">Formatos de exibição</label>
                  <div className="com-formatos-opcoes">
                    {FORMATOS_DISPONIVEIS.map(f => (
                      <label key={f.tipo} className={`com-formato-opcao${form.formatos.includes(f.tipo) ? " selecionado" : ""}`}>
                        <input
                          type="checkbox"
                          checked={form.formatos.includes(f.tipo)}
                          onChange={() => toggleFormato(f.tipo)}
                        />
                        <span className="com-formato-opcao-texto">
                          <span className="com-formato-opcao-label">{f.icone} {f.label}</span>
                          <span className="com-formato-opcao-desc">{f.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="sa-form-group">
                  <label className="sa-label">Para quem esse comunicado vai aparecer</label>
                  <div className="com-formatos-opcoes">
                    {ALVO_OPCOES.map(a => (
                      <label key={a.tipo} className={`com-formato-opcao${form.alvo_tipo === a.tipo ? " selecionado" : ""}`}>
                        <input
                          type="radio"
                          name="alvo_tipo"
                          checked={form.alvo_tipo === a.tipo}
                          onChange={() => setForm(p => ({ ...p, alvo_tipo: a.tipo }))}
                        />
                        <span className="com-formato-opcao-texto">
                          <span className="com-formato-opcao-label">{a.icone} {a.label}</span>
                          <span className="com-formato-opcao-desc">{a.desc}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {form.alvo_tipo === "tipo_estabelecimento" && (
                    <div className="com-alvo-subselecao">
                      {tiposDisponiveis.length === 0 ? (
                        <div className="com-alvo-vazio">Nenhum tipo de estabelecimento cadastrado ainda.</div>
                      ) : (
                        <div className="com-chip-selecao">
                          {tiposDisponiveis.map(tipo => (
                            <button
                              type="button"
                              key={tipo}
                              className={`com-chip-opcao${form.alvo_tipos_estabelecimento.includes(tipo) ? " selecionado" : ""}`}
                              onClick={() => toggleTipoEstabelecimento(tipo)}
                            >
                              {form.alvo_tipos_estabelecimento.includes(tipo) ? "✓ " : ""}{tipo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {form.alvo_tipo === "especificos" && (
                    <div className="com-alvo-subselecao">
                      <input
                        className="sa-input com-busca-estab"
                        placeholder="Buscar estabelecimento..."
                        value={buscaEstab}
                        onChange={e => setBuscaEstab(e.target.value)}
                      />
                      {estabelecimentosDisponiveis.length === 0 ? (
                        <div className="com-alvo-vazio">Nenhum estabelecimento cadastrado ainda.</div>
                      ) : (
                        <div className="com-lista-estab">
                          {estabelecimentosFiltrados.map(e => (
                            <label key={e.id} className="com-estab-item">
                              <input
                                type="checkbox"
                                checked={form.estabelecimento_ids.includes(e.id)}
                                onChange={() => toggleEstabelecimento(e.id)}
                              />
                              <span className="com-estab-nome">{e.nome_fantasia}</span>
                              {e.tipo_estabelecimento && (
                                <span className="com-estab-tipo">{e.tipo_estabelecimento}</span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                      {form.estabelecimento_ids.length > 0 && (
                        <div className="com-alvo-contagem">
                          {form.estabelecimento_ids.length} selecionado{form.estabelecimento_ids.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="sa-form-group">
                  <label className="sa-config-switch">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))}
                    />
                    <span className="sa-config-switch-texto">{form.ativo ? "Ativo" : "Inativo"}</span>
                  </label>
                </div>
              </div>
              <div className="sa-modal-actions">
                <button className="sa-btn sa-btn-ghost" onClick={fecharModal}>Cancelar</button>
                <button className="sa-btn sa-btn-purple" onClick={salvar} disabled={salvando}>
                  {salvando ? "⏳ Salvando…" : (editandoId ? "✓ Salvar" : "✓ Criar Comunicado")}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutAdmin>
  );
}
