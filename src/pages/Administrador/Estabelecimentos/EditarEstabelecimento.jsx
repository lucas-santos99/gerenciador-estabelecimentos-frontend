// src/pages/Administrador/Estabelecimentos/EditarEstabelecimento.jsx
import { confirmar, avisar } from '../../../components/Dialogo/dialogo';
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import PersonificarModal from "../../../components/PersonificarModal";
import ResetSenhaModal from "../Operadores/ResetSenhaModal";
import { useAuth } from "../../../contexts/AuthProvider";
import "./Estabelecimentos.css";
import "../Operadores/Operadores.css"; // estilos do campo de limite de operadores (op-limite-*)
import { apiFetch } from "../../../utils/api";
import { supabase } from "../../../utils/supabaseClient";
import Dica from '../../../components/Notificacoes/Dica';
import Rastro from '../../../components/Rastro/Rastro';
import ValidarDocumento from '../../../components/ValidarDocumento/ValidarDocumento';

// apiFetch sempre manda Content-Type: application/json, o que quebra
// upload de arquivo (FormData). Pra upload usamos o token direto.
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

// Tipos que aparecem prontos na lista (os mesmos da tela Novo). Qualquer
// outro valor salvo cai em "Outro…" com o texto no campo ao lado.
const TIPOS_PADRAO = ["loja", "mercearia", "padaria", "ferragem", "agropecuaria", "restaurante"];

function formatarTipo(texto) {
  return texto
    .toLowerCase()
    .split(" ")
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function iniciais(nome) {
  if (!nome) return "?";
  return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

export default function EditarEstabelecimento() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const location    = useLocation();
  const API_URL     = import.meta.env.VITE_API_URL;
  const { profile } = useAuth();

  const modoDetalhes =
    new URLSearchParams(location.search).get("view") === "details";

  const [modalPersonificar, setModalPersonificar] = useState(false);
  const [modalSenhaDono, setModalSenhaDono] = useState(false);

  const [form, setForm] = useState({
    nome_fantasia:     "",
    cnpj:              "",
    telefone:          "",
    telefones_extras:  [],
    email_contato:     "",
    endereco_completo: "",
    enderecos_extras:  [],
    status_assinatura: "ativa",
    data_vencimento:   "",
    logo_url:          "",
    limite_operadores: 3,
    timezone:          "America/Sao_Paulo",
    tipo_estabelecimento: "loja",
    valor_mensalidade:    "", // vazio = usa o valor global
  });

  const [tipoOriginal,      setTipoOriginal]      = useState(""); // valor salvo, do jeito que está no cadastro
  const [tipoCustomizado,   setTipoCustomizado]   = useState("");
  const [tiposExistentes,   setTiposExistentes]   = useState([]);
  const [sugestoes,         setSugestoes]         = useState([]);
  const [mensalidadePadrao, setMensalidadePadrao] = useState(null);

  const [carregando,   setCarregando]   = useState(true);
  const [salvando,     setSalvando]     = useState(false);
  const [erro,         setErro]         = useState("");
  const [logoFile,     setLogoFile]     = useState(null);
  const [tipoCpfCnpj,  setTipoCpfCnpj]  = useState("cpf"); // "cpf" | "cnpj"
  const [cpfCnpjErro,  setCpfCnpjErro]  = useState("");

  /* ── carregar ────────────────────────────────────────────── */
  async function carregarDados() {
    setCarregando(true);
    try {
      const resp = await apiFetch(`/admin/estabelecimentos/${id}`);
      const data = await resp.json();
      if (resp.ok) {
        // Detectar se é CPF ou CNPJ pelo número de dígitos
        const docLimpo = (data.cnpj || "").replace(/\D/g, "");
        const tipoDetectado = docLimpo.length === 14 ? "cnpj" : "cpf";
        setTipoCpfCnpj(tipoDetectado);

        // Aplicar máscara no documento existente ao carregar
        const docComMascara = docLimpo ? aplicarMascaraCpfCnpjStatic(docLimpo, tipoDetectado) : "";

        setForm({
          nome_fantasia:     data.nome_fantasia     || "",
          cnpj:              docComMascara,
          telefone:          data.telefone          || "",
          telefones_extras:  Array.isArray(data.telefones_extras) ? data.telefones_extras : [],
          email_contato:     data.email_contato     || "",
          endereco_completo: data.endereco_completo || "",
          enderecos_extras:  Array.isArray(data.enderecos_extras) ? data.enderecos_extras : [],
          // "inativa" deixou de existir (05/10/2026): quem ainda vier assim do
          // banco é tratada como bloqueada.
          status_assinatura: data.status_assinatura === "inativa" ? "bloqueada" : (data.status_assinatura || "ativa"),
          data_vencimento:   data.data_vencimento   ?? "",
          logo_url:          data.logo_url          || "",
          limite_operadores: data.limite_operadores ?? 3,
          timezone:          data.timezone          || "America/Sao_Paulo",
          tipo_estabelecimento: TIPOS_PADRAO.includes((data.tipo_estabelecimento || "").trim().toLowerCase())
            ? (data.tipo_estabelecimento || "").trim().toLowerCase()
            : (data.tipo_estabelecimento ? "outro" : "loja"),
          valor_mensalidade: data.valor_mensalidade != null && Number(data.valor_mensalidade) > 0
            ? String(data.valor_mensalidade)
            : "",
        });
        setTipoOriginal(data.tipo_estabelecimento || "");
        setTipoCustomizado(
          data.tipo_estabelecimento && !TIPOS_PADRAO.includes(data.tipo_estabelecimento.trim().toLowerCase())
            ? data.tipo_estabelecimento
            : ""
        );
      } else {
        setErro(data.error || "Erro ao carregar.");
      }
    } catch { setErro("Erro ao carregar dados."); }
    setCarregando(false);
  }


  useEffect(() => { carregarDados(); }, [id]);

  // Apoio dos campos Tipo e Mensalidade (igual à tela Novo): tipos já
  // usados em outros cadastros, pra sugerir, e o valor global da
  // mensalidade, pra mostrar no campo vazio. Se falhar, a tela segue.
  useEffect(() => {
    (async () => {
      try {
        const resp  = await apiFetch(`/admin/estabelecimentos/listar`);
        const lista = await resp.json();
        if (Array.isArray(lista)) {
          setTiposExistentes([...new Set(lista.map(m => m.tipo_estabelecimento).filter(Boolean))]);
        }
      } catch {}
    })();
    (async () => {
      try {
        const resp = await apiFetch('/superadmin/config');
        if (resp.ok) {
          const d = await resp.json();
          const v = Number(d.valor_mensalidade);
          if (Number.isFinite(v)) setMensalidadePadrao(v);
        }
      } catch {}
    })();
  }, []);

  function filtrarSugestoes(valor) {
    setTipoCustomizado(valor);
    setSugestoes(
      valor
        ? tiposExistentes.filter(t => t.toLowerCase().includes(valor.toLowerCase()))
        : []
    );
  }

  function atualizar(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function adicionarTelefoneExtra() {
    setForm(prev => ({ ...prev, telefones_extras: [...prev.telefones_extras, ""] }));
  }
  function atualizarTelefoneExtra(idx, valor) {
    setForm(prev => ({
      ...prev,
      telefones_extras: prev.telefones_extras.map((t, i) => i === idx ? valor : t),
    }));
  }
  function removerTelefoneExtra(idx) {
    setForm(prev => ({ ...prev, telefones_extras: prev.telefones_extras.filter((_, i) => i !== idx) }));
  }

  function adicionarEnderecoExtra() {
    setForm(prev => ({ ...prev, enderecos_extras: [...prev.enderecos_extras, ""] }));
  }
  function atualizarEnderecoExtra(idx, valor) {
    setForm(prev => ({
      ...prev,
      enderecos_extras: prev.enderecos_extras.map((e, i) => i === idx ? valor : e),
    }));
  }
  function removerEnderecoExtra(idx) {
    setForm(prev => ({ ...prev, enderecos_extras: prev.enderecos_extras.filter((_, i) => i !== idx) }));
  }

  /* ── Função estática de máscara (usada no carregarDados) ────── */
  function aplicarMascaraCpfCnpjStatic(s, tipo) {
    const d = s.replace(/\D/g, "").slice(0, tipo === "cpf" ? 11 : 14);
    if (tipo === "cpf") {
      return d
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
    }
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
  }

  /* ── Máscara CPF/CNPJ ─────────────────────────────────────── */
  function aplicarMascaraCpfCnpj(valor, tipo) {
    const s = valor.replace(/\D/g, "").slice(0, tipo === "cpf" ? 11 : 14);
    if (tipo === "cpf") {
      return s
        .replace(/^(\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
    }
    return s
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, "$1/$2")
      .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, "$1-$2");
  }

  function handleCpfCnpj(e) {
    const valor = aplicarMascaraCpfCnpj(e.target.value, tipoCpfCnpj);
    setForm(prev => ({ ...prev, cnpj: valor }));
    // Validar tamanho esperado
    const digits = valor.replace(/\D/g, "");
    const esperado = tipoCpfCnpj === "cpf" ? 11 : 14;
    if (digits.length > 0 && digits.length < esperado) {
      setCpfCnpjErro(`${tipoCpfCnpj.toUpperCase()} incompleto — faltam ${esperado - digits.length} dígitos`);
    } else {
      setCpfCnpjErro("");
    }
  }

  function handleTipoCpfCnpj(tipo) {
    // Só troca o tipo, não limpa o campo
    setTipoCpfCnpj(tipo);
    setCpfCnpjErro("");
  }

  /* ── salvar ──────────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (form.status_assinatura === "ativa" && !form.data_vencimento) {
      setErro("Data de vencimento é obrigatória quando o status é Ativa.");
      return;
    }
    // Validar CPF/CNPJ se preenchido
    const docDigits = form.cnpj.replace(/\D/g, "");
    const esperado = tipoCpfCnpj === "cpf" ? 11 : 14;
    if (docDigits.length > 0 && docDigits.length !== esperado) {
      setErro(`${tipoCpfCnpj.toUpperCase()} inválido — deve ter ${esperado} dígitos.`);
      return;
    }

    // Tipo — mesma regra da tela Novo. Se a pessoa não mudou o tipo, manda
    // exatamente o que já estava salvo (não mexe em maiúsculas/minúsculas).
    let tipoFinal = form.tipo_estabelecimento;
    if (form.tipo_estabelecimento === "outro") {
      if (!tipoCustomizado.trim()) { setErro("Informe o tipo de estabelecimento."); return; }
      tipoFinal = formatarTipo(tipoCustomizado.trim());
    } else {
      tipoFinal = formatarTipo(tipoFinal);
    }
    if (tipoOriginal && tipoFinal.toLowerCase() === tipoOriginal.trim().toLowerCase()) {
      tipoFinal = tipoOriginal;
    }

    // Limite de operadores — 0 é válido (nenhum operador). Em branco, o
    // campo não é enviado e o limite que já estava continua valendo.
    const limiteTxt = String(form.limite_operadores ?? "").trim();
    const limiteNum = parseInt(limiteTxt, 10);
    if (limiteTxt !== "" && (Number.isNaN(limiteNum) || limiteNum < 0 || limiteNum > 50)) {
      setErro("Limite de operadores inválido — informe um número de 0 a 50.");
      return;
    }

    // Mensalidade individual — em branco = usar o valor global.
    const mensTxt = String(form.valor_mensalidade ?? "").trim();
    const mensNum = parseFloat(mensTxt.replace(",", "."));
    if (mensTxt !== "" && (Number.isNaN(mensNum) || mensNum < 0)) {
      setErro("Valor da mensalidade inválido.");
      return;
    }

    setSalvando(true);
    try {
      const resp = await apiFetch(`/admin/estabelecimentos/${id}`, {
        method:  "PUT",
        body:    JSON.stringify({
          ...form,
          // A data de vencimento é sempre mantida — antes era apagada ao
          // salvar como Bloqueada.
          data_vencimento:   form.data_vencimento || null,
          limite_operadores: limiteTxt === "" ? undefined : limiteNum,
          tipo_estabelecimento: tipoFinal,
          valor_mensalidade: mensTxt === "" ? null : mensNum,
          telefones_extras:  form.telefones_extras.map(t => t.trim()).filter(Boolean),
          enderecos_extras:  form.enderecos_extras.map(e => e.trim()).filter(Boolean),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) { setErro(json.error || "Erro ao salvar."); }
      else {
        if (json.login_atualizado) {
          await avisar({
            titulo: "E-mail de login trocado",
            texto:  `O dono agora entra no sistema com ${json.mercearia?.email_contato || form.email_contato}. A senha continua a mesma.`,
            tom:    "ok",
          });
        }
        navigate(`/admin/estabelecimentos/${id}?view=details`);
      }
    } catch { setErro("Erro ao salvar."); }
    setSalvando(false);
  }

  /* ── logo ────────────────────────────────────────────────── */
  async function enviarLogo() {
    if (!logoFile) { avisar("Selecione um arquivo."); return; }
    const fd = new FormData();
    fd.append("logo", logoFile);
    try {
      const token = await getToken();
      const resp = await fetch(`${API_URL}/admin/estabelecimentos/${id}/upload-logo`, {
        method: "POST", body: fd, headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      if (resp.ok) {
        setForm(s => ({ ...s, logo_url: json.logo_url }));
        setLogoFile(null);
      } else { avisar("Erro: " + (json.error || "erro")); }
    } catch { avisar("Erro ao enviar logo."); }
  }

  async function removerLogo() {
    if (!(await confirmar({ titulo: 'Remover a logo?', perigo: true, botao: 'Remover' }))) return;
    const resp = await apiFetch(`/admin/estabelecimentos/${id}/remover-logo`, { method: "DELETE" });
    if (resp.ok) setForm(s => ({ ...s, logo_url: "" }));
    else avisar("Erro ao remover logo.");
  }

  /* ── excluir ─────────────────────────────────────────────── */
  async function excluir() {
    if (!(await confirmar({ titulo: 'Excluir estabelecimento?', texto: `"${form.nome_fantasia}" será excluído.`, perigo: true, botao: 'Excluir' }))) return;
    const resp = await apiFetch(`/admin/estabelecimentos/${id}`, { method: "DELETE" });
    if (resp.ok) navigate("/admin");
    else avisar("Erro ao excluir.");
  }

  /* ── loading ─────────────────────────────────────────────── */
  if (carregando) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">
          <div className="est-loading">
            <div className="est-spinner" />
            Carregando...
          </div>
        </div>
      </LayoutAdmin>
    );
  }

  /* ════════════════════════════════════════════════════════
     MODO DETALHES
  ════════════════════════════════════════════════════════ */
  if (modoDetalhes) {
    return (
      <LayoutAdmin>
        <div className="est-wrapper">

          {/* HEADER */}
          <div className="est-page-header">
            <div className="est-page-header-left">
              <span className="est-breadcrumb">🏢 Estabelecimentos</span>
              <h1 className="est-page-title">Detalhes do <span>Estabelecimento</span></h1>
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

          {/* HERO CARD */}
          <div className="est-card" style={{ marginBottom: 16 }}>
            <div className="est-detail-hero">

              {/* Logo */}
              <div className="est-detail-logo-col">
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="est-detail-logo" />
                  : (
                    <div className="est-detail-logo-placeholder">
                      {iniciais(form.nome_fantasia)}
                    </div>
                  )
                }
              </div>

              {/* Info */}
              <div className="est-detail-info-col">
                <div className="est-detail-name">{form.nome_fantasia}</div>
                {form.email_contato && (
                  <div className="est-detail-email">{form.email_contato}</div>
                )}
                <div className="est-detail-meta">
                  <span className={`est-badge est-badge-${form.status_assinatura}`}>
                    {form.status_assinatura}
                  </span>
                  {form.data_vencimento && (
                    <span className="est-venc-label">
                      Vence em {form.data_vencimento.split("-").reverse().join("/")}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="est-detail-actions-col">
                <button
                  className="est-btn est-btn-outline"
                  onClick={() => navigate(`/admin/estabelecimentos/${id}`)}
                >
                  ✏️ Editar
                </button>
                <button
                  className="est-btn est-btn-blue"
                  onClick={() => navigate(`/admin/estabelecimentos/${id}/operadores`)}
                >
                  👥 Operadores
                </button>
                {profile?.is_master && form.status_assinatura !== "excluida" && (
                  <button
                    className="est-btn est-btn-outline"
                    style={{ borderColor: "var(--text-purple, #7c3aed)", color: "var(--text-purple, #7c3aed)" }}
                    onClick={() => setModalPersonificar(true)}
                    title="Entrar no sistema como o dono deste estabelecimento"
                  >
                    🔑 Entrar como
                  </button>
                )}
                {form.status_assinatura !== "excluida" && (
                  <button
                    className="est-btn est-btn-outline"
                    onClick={() => setModalSenhaDono(true)}
                    title="Definir uma senha nova para o dono (sem precisar da antiga)"
                  >
                    🔑 Senha do dono
                  </button>
                )}
                <button className="est-btn est-btn-danger" onClick={excluir}>
                  🗑 Excluir
                </button>
              </div>

            </div>
          </div>

          {/* INFO GRID */}
          <div className="est-info-grid">
            <div className="est-info-block">
              <div className="est-info-block-title">Dados da Empresa</div>
              {[
                { label: "CPF / CNPJ", value: form.cnpj,            mono: true },
                { label: "Telefone", value: form.telefone,           mono: true },
                { label: "E-mail",   value: form.email_contato,      mono: false },
              ].map(r => (
                <div className="est-info-row" key={r.label}>
                  <span className="est-info-row-label">{r.label}</span>
                  <span className={`est-info-row-value${r.mono ? " mono" : ""}`}>
                    {r.value || "—"}
                  </span>
                </div>
              ))}
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">Endereço</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Endereço</span>
                <span className="est-info-row-value">
                  {form.endereco_completo || "Não informado"}
                </span>
              </div>
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">Assinatura</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Status</span>
                <span className={`est-badge est-badge-${form.status_assinatura}`}>
                  {form.status_assinatura}
                </span>
              </div>
              <div className="est-info-row" style={{ marginTop: 10 }}>
                <span className="est-info-row-label">Vencimento</span>
                <span className="est-info-row-value mono">
                  {form.data_vencimento
                    ? form.data_vencimento.split("-").reverse().join("/")
                    : "—"}
                </span>
              </div>
            </div>

            <div className="est-info-block">
              <div className="est-info-block-title">👥 Operadores</div>
              <div className="est-info-row">
                <span className="est-info-row-label">Limite de operadores</span>
                <span className="est-info-row-value mono">
                  {form.limite_operadores ?? 3} operador(es)
                </span>
              </div>
              <div className="est-info-row" style={{ marginTop: 8 }}>
                <span className="est-info-row-label" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Para alterar, abra 👥 Operadores
                </span>
              </div>
            </div>

          </div>

          <Rastro entidade="estabelecimento" id={id} />

        </div>

        {modalPersonificar && (
          <PersonificarModal
            tipo="estabelecimento"
            id={id}
            nomeExibicao={form.nome_fantasia}
            onClose={() => setModalPersonificar(false)}
          />
        )}
        {modalSenhaDono && (
          <ResetSenhaModal id={id} quem="dono" onClose={() => setModalSenhaDono(false)} />
        )}
      </LayoutAdmin>
    );
  }

  /* ════════════════════════════════════════════════════════
     MODO EDITAR
  ════════════════════════════════════════════════════════ */
  return (
    <LayoutAdmin>
      <div className="est-wrapper">

        {/* HEADER */}
        <div className="est-page-header">
          <div className="est-page-header-left">
            <span className="est-breadcrumb">🏢 Estabelecimentos</span>
            <h1 className="est-page-title">Editar <span>Estabelecimento</span></h1>
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

        {erro && <div className="est-alert est-alert-error">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="est-form-wrapper">

          {/* SEÇÃO 1 — Identificação */}
          <div className="est-form-section">
            <div className="est-form-section-title">📋 Identificação</div>
            <div className="est-form-grid">
              <div className="est-form-group est-form-full">
                <label className="est-label">Nome Fantasia</label>
                <input maxLength={150}
                  className="est-input"
                  name="nome_fantasia"
                  value={form.nome_fantasia}
                  onChange={atualizar}
                />
              </div>

              <div className="est-form-group">
                <label className="est-label">Tipo de Estabelecimento <Dica texto="Serve para separar e filtrar as lojas no painel (lista, cobranças, solicitações) e para mandar comunicados só para um tipo. Não muda as funções do sistema para a loja." /></label>
                <select
                  className="est-select"
                  name="tipo_estabelecimento"
                  value={form.tipo_estabelecimento}
                  onChange={atualizar}
                >
                  <option value="loja">Loja</option>
                  <option value="mercearia">Mercearia</option>
                  <option value="padaria">Padaria</option>
                  <option value="ferragem">Ferragem</option>
                  <option value="agropecuaria">Agropecuária</option>
                  <option value="restaurante">Restaurante</option>
                  <option value="outro">Outro…</option>
                </select>
              </div>

              {form.tipo_estabelecimento === "outro" && (
                <div className="est-form-group">
                  <label className="est-label">Qual tipo?</label>
                  <div className="est-autocomplete-wrap">
                    <input maxLength={60}
                      className="est-input"
                      placeholder="Ex: Pet Shop, Oficina…"
                      value={tipoCustomizado}
                      onChange={e => filtrarSugestoes(e.target.value)}
                    />
                    {sugestoes.length > 0 && (
                      <div className="est-sugestoes">
                        {sugestoes.map((tipo, i) => (
                          <div
                            key={i}
                            className="est-sugestao-item"
                            onClick={() => { setTipoCustomizado(tipo); setSugestoes([]); }}
                          >
                            {tipo}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="est-form-group">
                <label className="est-label">CPF / CNPJ</label>
                {/* Toggle CPF / CNPJ */}
                <div style={{ display:"flex", gap:4, marginBottom:6 }}>
                  {["cpf","cnpj"].map(t => (
                    <button key={t} type="button"
                      onClick={() => handleTipoCpfCnpj(t)}
                      style={{
                        padding:"3px 14px", borderRadius:20, border:"1px solid",
                        borderColor: tipoCpfCnpj===t ? "#14b8a6" : "var(--border,#334155)",
                        background:  tipoCpfCnpj===t ? "#14b8a6" : "transparent",
                        color:       tipoCpfCnpj===t ? "#fff" : "inherit",
                        fontSize:"0.75rem", fontWeight:700, cursor:"pointer",
                        fontFamily:"Plus Jakarta Sans, sans-serif",
                      }}>
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
                <input
                  className={`est-input${cpfCnpjErro ? " est-input-erro" : ""}`}
                  name="cnpj"
                  value={form.cnpj}
                  onChange={handleCpfCnpj}
                  placeholder={tipoCpfCnpj === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
                  maxLength={tipoCpfCnpj === "cpf" ? 14 : 18}
                  inputMode="numeric"
                />
                {cpfCnpjErro && (
                  <span style={{ fontSize:"0.72rem", color:"#ef4444", marginTop:2, display:"block" }}>
                    ⚠️ {cpfCnpjErro}
                  </span>
                )}
                <ValidarDocumento valor={form.cnpj} tipo={tipoCpfCnpj} nomeAtual={form.nome_fantasia}
                  onEncontrar={e => setForm(prev => ({ ...prev, nome_fantasia: e.nome }))} />
              </div>
            </div>
          </div>

          {/* SEÇÃO 2 — Contato */}
          <div className="est-form-section">
            <div className="est-form-section-title">📞 Contato</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Telefone/celular principal</label>
                <input maxLength={20} className="est-input" name="telefone" value={form.telefone} onChange={atualizar} />
                {form.telefones_extras.map((tel, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input maxLength={20}
                      className="est-input"
                      placeholder="(53) 99999-9999"
                      value={tel}
                      onChange={e => atualizarTelefoneExtra(idx, e.target.value)}
                    />
                    <button type="button" className="est-btn est-btn-ghost" onClick={() => removerTelefoneExtra(idx)}>✕</button>
                  </div>
                ))}
                <button type="button" className="est-btn est-btn-ghost" style={{ marginTop: 6 }} onClick={adicionarTelefoneExtra}>
                  + Adicionar telefone
                </button>
              </div>
              <div className="est-form-group">
                <label className="est-label">E-mail de Contato <Dica texto="É também o e-mail de login do dono. Ao trocar aqui e salvar, o dono passa a entrar no sistema com o e-mail novo (a senha continua a mesma). Não pode ser um e-mail já usado por outro usuário. Também é usado nas cobranças por e-mail." /></label>
                <input maxLength={150} className="est-input" name="email_contato" type="email" value={form.email_contato} onChange={atualizar} />
                <button type="button" className="est-btn est-btn-ghost" style={{ marginTop: 6 }} onClick={() => setModalSenhaDono(true)}>
                  🔑 Definir nova senha do dono
                </button>
              </div>
              <div className="est-form-group est-form-full">
                <label className="est-label">Endereço Completo</label>
                <input maxLength={200} className="est-input" name="endereco_completo" value={form.endereco_completo} onChange={atualizar} />
                {form.enderecos_extras.map((end, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input maxLength={200}
                      className="est-input"
                      placeholder="Rua, número, bairro, cidade - UF"
                      value={end}
                      onChange={e => atualizarEnderecoExtra(idx, e.target.value)}
                    />
                    <button type="button" className="est-btn est-btn-ghost" onClick={() => removerEnderecoExtra(idx)}>✕</button>
                  </div>
                ))}
                <button type="button" className="est-btn est-btn-ghost" style={{ marginTop: 6 }} onClick={adicionarEnderecoExtra}>
                  + Adicionar outro local de atuação
                </button>
                <small style={{ display: "block", marginTop: 4, color: "var(--text-muted, #888)", fontSize: 12 }}>
                  Use se o estabelecimento atua em mais de um endereço.
                </small>
              </div>
              <div className="est-form-group est-form-full">
                <label className="est-label">Fuso Horário</label>
                <select className="est-select" name="timezone" value={form.timezone} onChange={atualizar}>
                  <option value="America/Sao_Paulo">Brasília (UTC-3) — SP, RJ, MG, RS, BA e a maioria dos estados</option>
                  <option value="America/Manaus">Amazônia (UTC-4) — AM, MT, MS, RO, RR</option>
                  <option value="America/Rio_Branco">Acre (UTC-5) — AC e oeste do AM</option>
                  <option value="America/Noronha">Fernando de Noronha (UTC-2)</option>
                </select>
                <small style={{ display: "block", marginTop: 4, color: "var(--text-muted, #888)", fontSize: 12 }}>
                  Usado pra calcular corretamente "hoje" nos relatórios, na auditoria e no financeiro deste estabelecimento.
                </small>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3 — Assinatura */}
          <div className="est-form-section">
            <div className="est-form-section-title">💳 Assinatura</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Status <Dica texto="Bloqueada impede o uso: o dono cai na tela de bloqueio, onde pode renovar a licença, e nada pode ser lançado. Pagar a renovação reativa a loja sozinho. Para tirar o acesso de vez, sem o dono poder voltar pagando, use Excluir: a loja some das listas, não entra mais e pode ser restaurada depois. Ativa exige data de vencimento; a data é mantida ao trocar o status." /></label>
                <select className="est-select" name="status_assinatura" value={form.status_assinatura} onChange={atualizar}>
                  <option value="ativa">Ativa</option>
                  <option value="bloqueada">Bloqueada</option>
                </select>
              </div>
              {form.status_assinatura === "ativa" && (
                <div className="est-form-group">
                  <label className="est-label">Data de Vencimento <Dica texto="A loja usa o sistema até o fim deste dia, no fuso dela. No dia seguinte o status passa sozinho para Bloqueada." /></label>
                  <input
                    className="est-input"
                    type="date"
                    name="data_vencimento"
                    value={form.data_vencimento}
                    onChange={atualizar}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SEÇÃO 3b — Operadores */}
          <div className="est-form-section">
            <div className="est-form-section-title">👥 Operadores</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Limite de operadores</label>
                <div className="op-limite-field">
                  <input
                    className="op-limite-input"
                    type="number"
                    name="limite_operadores"
                    min="0"
                    max="50"
                    value={form.limite_operadores}
                    onChange={atualizar}
                  />
                  <span className="op-limite-hint">
                    Máximo de operadores cadastrados (0–50): contam os ativos e os inativos, os excluídos não. 0 = nenhum operador.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3c — Mensalidade individual */}
          <div className="est-form-section">
            <div className="est-form-section-title">💰 Mensalidade</div>
            <div className="est-form-grid">
              <div className="est-form-group">
                <label className="est-label">Mensalidade individual (R$, opcional)</label>
                <input
                  className="est-input"
                  type="number"
                  name="valor_mensalidade"
                  min="0"
                  step="0.01"
                  value={form.valor_mensalidade}
                  onChange={atualizar}
                  placeholder={mensalidadePadrao != null
                    ? `Valor global: R$ ${mensalidadePadrao.toFixed(2).replace(".", ",")}`
                    : "Em branco = valor global"}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
                  Deixe em branco para usar o valor global. Preencha para aplicar um preço diferenciado a este cliente.
                </span>
              </div>
            </div>
          </div>

          {/* SEÇÃO 4 — Logo */}
          <div className="est-form-section">
            <div className="est-form-section-title">🖼 Logo do Estabelecimento</div>
            <div className="est-logo-area">
              {form.logo_url
                ? <img src={form.logo_url} alt="Logo" className="est-logo-preview" />
                : (
                  <div className="est-logo-placeholder">
                    <span style={{ fontSize: "1.5rem" }}>🖼</span>
                    Sem logo
                  </div>
                )
              }
              <div className="est-logo-upload-info">
                <input
                  className="est-file-input"
                  type="file"
                  accept="image/*"
                  onChange={e => setLogoFile(e.target.files[0])}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="est-btn est-btn-outline est-btn-sm"
                    onClick={enviarLogo}
                  >
                    ⬆ Enviar Logo
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      className="est-btn est-btn-danger est-btn-sm"
                      onClick={removerLogo}
                    >
                      🗑 Remover
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>


          <Rastro entidade="estabelecimento" id={id} />

          {/* AÇÕES */}
          <div className="est-form-actions">
            <button
              type="submit"
              className="est-btn est-btn-primary est-btn-lg"
              disabled={salvando}
            >
              {salvando ? "⏳ Salvando…" : "✓ Salvar Alterações"}
            </button>
            <button
              type="button"
              className="est-btn est-btn-ghost est-btn-lg"
              onClick={() => navigate("/admin")}
            >
              Cancelar
            </button>
          </div>

        </form>
      </div>
      {modalSenhaDono && (
        <ResetSenhaModal id={id} quem="dono" onClose={() => setModalSenhaDono(false)} />
      )}
    </LayoutAdmin>
  );
}