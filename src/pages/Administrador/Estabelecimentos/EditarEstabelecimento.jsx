// src/pages/Administrador/Estabelecimentos/EditarEstabelecimento.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

export default function EditarEstabelecimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const API_URL = import.meta.env.VITE_API_URL;

  // Se URL contém ?view=details → modo somente leitura
  const modoDetalhes =
    new URLSearchParams(location.search).get("view") === "details";

  const [form, setForm] = useState({
    nome_fantasia: "",
    cnpj: "",
    telefone: "",
    email_contato: "",
    endereco_completo: "",
    status_assinatura: "ativa",
    data_vencimento: "",
    logo_url: "",
  });

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [logoFile, setLogoFile] = useState(null);

  async function carregarDados() {
    setCarregando(true);
    try {
      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        { credentials: "include" }
      );

      const data = await resp.json();

      if (resp.ok) {
        setForm({
          nome_fantasia: data.nome_fantasia || "",
          cnpj: data.cnpj || "",
          telefone: data.telefone || "",
          email_contato: data.email_contato || "",
          endereco_completo: data.endereco_completo || "",
          status_assinatura: data.status_assinatura || "ativa",
          data_vencimento: data.data_vencimento ?? "",
          logo_url: data.logo_url || "",
        });
      } else {
        setErro(data.error || "Erro ao carregar estabelecimento");
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dados");
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregarDados();
  }, [id]);

  function atualizarCampo(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);

    if (form.status_assinatura === "ativa" && !form.data_vencimento) {
      setErro("Data de vencimento é obrigatória quando o estabelecimento está ativo.");
      setSalvando(false);
      return;
    }

    const payload = {
      ...form,
      data_vencimento:
        form.status_assinatura === "ativa"
          ? form.data_vencimento
          : null,
    };

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        }
      );

      const json = await resp.json();

      if (!resp.ok) {
        setErro(json.error || "Erro ao salvar");
      } else {
        alert("Salvo com sucesso!");
        navigate(`/admin/estabelecimentos/${id}?view=details`);
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar.");
    }

    setSalvando(false);
  }

  async function enviarLogo() {
    if (!logoFile) return alert("Selecione um arquivo!");

    const formData = new FormData();
    formData.append("logo", logoFile);

    try {
      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/${id}/upload-logo`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        }
      );

      const json = await resp.json();

      if (resp.ok) {
        alert("Logo atualizada!");
        setForm((s) => ({ ...s, logo_url: json.logo_url }));
        setLogoFile(null);
      } else {
        alert("Erro: " + (json.error || "erro"));
      }
    } catch (e) {
      alert("Erro ao enviar logo");
    }
  }

  async function removerLogo() {
    if (!window.confirm("Remover logo?")) return;

    const resp = await fetch(
      `${API_URL}/admin/estabelecimentos/${id}/remover-logo`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    if (resp.ok) {
      alert("Logo removida!");
      setForm((s) => ({ ...s, logo_url: "" }));
    } else {
      alert("Erro ao remover logo");
    }
  }

  async function excluir() {
    if (!window.confirm("Tem certeza que deseja excluir?")) return;

    const resp = await fetch(
      `${API_URL}/admin/estabelecimentos/${id}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );

    if (resp.ok) {
      alert("Estabelecimento excluído!");
      navigate("/admin");
    } else {
      alert("Erro ao excluir");
    }
  }

  if (carregando) {
    return (
      <LayoutAdmin>
        <div className="merc-wrapper">
          <p>Carregando...</p>
        </div>
      </LayoutAdmin>
    );
  }

  // ============================
  // MODO DETALHES
  // ============================
  if (modoDetalhes) {
    return (
      <LayoutAdmin>
        <div className="merc-wrapper">
          <h1>Detalhes do Estabelecimento</h1>

          <div className="det-wrapper">
            <div className="det-header">
              <div className="det-logo-box">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="det-logo" />
                ) : (
                  <div className="det-logo-placeholder">Sem logo</div>
                )}
              </div>

              <div className="det-head-info">
                <h1>{form.nome_fantasia}</h1>
                <span className={`badge status-${form.status_assinatura}`}>
                  {form.status_assinatura}
                </span>
                <p>Vencimento: {form.data_vencimento || "-"}</p>
              </div>

              <div className="det-head-actions">
                <button
                  className="btn-edit"
                  onClick={() => navigate(`/admin/estabelecimentos/${id}`)}
                >
                  Editar
                </button>

                <button className="btn-excluir" onClick={excluir}>
                  Excluir
                </button>

                <Link to="/admin" className="btn-voltar">
                  Voltar
                </Link>
              </div>
            </div>

            <div className="det-grid">
              <div className="det-card">
                <h3>Informações da Empresa</h3>
                <p><strong>CNPJ:</strong> {form.cnpj || "-"}</p>
                <p><strong>Telefone:</strong> {form.telefone || "-"}</p>
                <p><strong>Email:</strong> {form.email_contato || "-"}</p>
                <p><strong>Endereço:</strong> {form.endereco_completo || "-"}</p>
              </div>
            </div>
          </div>
        </div>
      </LayoutAdmin>
    );
  }

  // ============================
  // MODO EDITAR
  // ============================
  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <h1>Editar Estabelecimento</h1>

        {erro && <p className="erro-box">{erro}</p>}

        <form className="merc-form" onSubmit={salvar}>
          <label>Nome Fantasia</label>
          <input
            name="nome_fantasia"
            value={form.nome_fantasia}
            onChange={atualizarCampo}
          />

          <label>CNPJ</label>
          <input name="cnpj" value={form.cnpj} onChange={atualizarCampo} />

          <label>Telefone</label>
          <input
            name="telefone"
            value={form.telefone}
            onChange={atualizarCampo}
          />

          <label>Email de Contato</label>
          <input
            name="email_contato"
            value={form.email_contato}
            onChange={atualizarCampo}
          />

          <label>Endereço Completo</label>
          <input
            name="endereco_completo"
            value={form.endereco_completo}
            onChange={atualizarCampo}
          />

          <label>Status da Assinatura</label>
          <select
            name="status_assinatura"
            value={form.status_assinatura}
            onChange={atualizarCampo}
          >
            <option value="ativa">Ativa</option>
            <option value="inativa">Inativa</option>
            <option value="bloqueada">Bloqueada</option>
          </select>

          {form.status_assinatura === "ativa" && (
            <>
              <label>Data de Vencimento</label>
              <input
                type="date"
                name="data_vencimento"
                value={form.data_vencimento}
                onChange={atualizarCampo}
              />
            </>
          )}

          <div className="logo-area">
            <h3>Logo do Estabelecimento</h3>

            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="logo-preview-box" />
            ) : (
              <p>Nenhuma logo enviada</p>
            )}

            <input type="file" onChange={(e) => setLogoFile(e.target.files[0])} />

            <div className="logo-actions">
              <button type="button" className="btn-primary" onClick={enviarLogo}>
                Enviar Logo
              </button>

              {form.logo_url && (
                <button
                  type="button"
                  className="btn-danger"
                  onClick={removerLogo}
                >
                  Remover Logo
                </button>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar Alterações"}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate("/admin")}
            >
              Voltar
            </button>
          </div>
        </form>
      </div>
    </LayoutAdmin>
  );
}
