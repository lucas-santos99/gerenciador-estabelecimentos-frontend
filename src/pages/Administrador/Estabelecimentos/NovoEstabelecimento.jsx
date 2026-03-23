// src/pages/Administrador/Estabelecimentos/NovoEstabelecimento.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "./Estabelecimentos.css";

export default function NovoEstabelecimento() {
  const navigate = useNavigate();

  const API_URL = import.meta.env.VITE_API_URL;

  const [form, setForm] = useState({
    nome_fantasia: "",
    cnpj: "",
    telefone: "",
    email_contato: "",
    endereco_completo: "",
    senha: "",
    status_assinatura: "ativa",
    data_vencimento: "",
    tipo_estabelecimento: "mercearia",
  });

  // 🔥 NOVO: tipo personalizado
  const [tipoCustomizado, setTipoCustomizado] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function atualizar(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");

    if (!form.senha) {
      setErro("A senha inicial é obrigatória.");
      return;
    }

    if (form.status_assinatura === "ativa" && !form.data_vencimento) {
      setErro("Data de vencimento é obrigatória para estabelecimentos ativos.");
      return;
    }

    // 🔥 AJUSTE DO TIPO
    let tipoFinal = form.tipo_estabelecimento;

    if (form.tipo_estabelecimento === "outro") {
      if (!tipoCustomizado) {
        setErro("Informe o tipo de estabelecimento.");
        return;
      }
      tipoFinal = tipoCustomizado.toLowerCase();
    }

    setSalvando(true);

    try {
      if (!API_URL) {
        throw new Error("VITE_API_URL não definida");
      }

      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/criar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            tipo_estabelecimento: tipoFinal,
          }),
          credentials: "include",
        }
      );

      const json = await resp.json();

      if (!resp.ok) {
        setErro(json.error || "Erro ao criar estabelecimento");
      } else {
        alert("Estabelecimento criado com sucesso!");
        navigate("/admin");
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao criar estabelecimento.");
    }

    setSalvando(false);
  }

  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <h1>Novo estabelecimento</h1>

        {erro && <p className="erro-box">{erro}</p>}

        <form className="merc-form" onSubmit={salvar}>
          <label>Nome Fantasia</label>
          <input
            name="nome_fantasia"
            value={form.nome_fantasia}
            onChange={atualizar}
            required
          />

          <label>Tipo de Estabelecimento</label>
          <select
            name="tipo_estabelecimento"
            value={form.tipo_estabelecimento}
            onChange={atualizar}
          >
            <option value="mercearia">Mercearia</option>
            <option value="padaria">Padaria</option>
            <option value="ferragem">Ferragem</option>
            <option value="agropecuaria">Agropecuária</option>
            <option value="loja">Loja</option>
            <option value="restaurante">Restaurante</option>
            <option value="outro">Outro</option>
          </select>

          {/* 🔥 CAMPO DINÂMICO */}
          {form.tipo_estabelecimento === "outro" && (
            <>
              <label>Digite o tipo de estabelecimento</label>
              <input
                value={tipoCustomizado}
                onChange={(e) => setTipoCustomizado(e.target.value)}
                placeholder="Ex: Pet Shop, Oficina, Clínica..."
              />
            </>
          )}

          <label>CNPJ</label>
          <input
            name="cnpj"
            value={form.cnpj}
            onChange={atualizar}
          />

          <label>Telefone</label>
          <input
            name="telefone"
            value={form.telefone}
            onChange={atualizar}
          />

          <label>Email de Contato</label>
          <input
            name="email_contato"
            type="email"
            value={form.email_contato}
            onChange={atualizar}
          />

          <label>Senha inicial do proprietário</label>
          <input
            type="password"
            name="senha"
            value={form.senha}
            onChange={atualizar}
            required
          />

          <label>Endereço Completo</label>
          <input
            name="endereco_completo"
            value={form.endereco_completo}
            onChange={atualizar}
          />

          <label>Status da Assinatura</label>
          <select
            name="status_assinatura"
            value={form.status_assinatura}
            onChange={atualizar}
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
                value={form.data_vencimento || ""}
                onChange={atualizar}
              />
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn-primary" disabled={salvando}>
              {salvando ? "Salvando..." : "Criar Estabelecimento"}
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