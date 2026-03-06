// ===== NovoOperador.jsx =====
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import "../Estabelecimentos/Estabelecimentos.css";

export default function NovoOperador() {
  const navigate = useNavigate();
  const { id: estabelecimentoId } = useParams();

  const API_URL = import.meta.env.VITE_API_URL;

  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    telefone: "",
    mercearia_id: estabelecimentoId || "",
  });

  const [estabelecimentos, setEstabelecimentos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  // ============================
  // CARREGAR ESTABELECIMENTOS
  // ============================
  async function carregarEstabelecimentos() {
    try {
      if (!API_URL) throw new Error("VITE_API_URL não definida");

      const resp = await fetch(
        `${API_URL}/admin/estabelecimentos/listar`,
        {
          credentials: "include",
        }
      );

      const data = await resp.json();
      setEstabelecimentos(data || []);
    } catch (err) {
      console.error("Erro ao carregar estabelecimentos:", err);
      setErro("Erro ao carregar estabelecimentos.");
    }
  }

  useEffect(() => {
    carregarEstabelecimentos();
  }, []);

  // ============================
  // HANDLER FORM
  // ============================
  function atualizar(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // ============================
  // SALVAR OPERADOR
  // ============================
  async function salvar(e) {
    e.preventDefault();

    setErro("");
    setLoading(true);

    if (!form.senha || form.senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch(
        `${API_URL}/admin/operadores/criar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
          credentials: "include",
        }
      );

      const json = await resp.json();

      if (!resp.ok) {
        setErro(json.error || "Erro ao criar operador.");
      } else {
        alert("Operador criado com sucesso!");

        navigate(
          `/admin/estabelecimentos/${form.mercearia_id}/operadores`
        );
      }
    } catch (err) {
      console.error("Erro salvar operador:", err);
      setErro("Erro interno ao criar operador.");
    }

    setLoading(false);
  }

  return (
    <LayoutAdmin>
      <div className="merc-wrapper">
        <h1>Novo Operador</h1>

        {erro && <p className="erro-box">{erro}</p>}

        <form className="merc-form" onSubmit={salvar}>

          {/* ESTABELECIMENTO */}
          <label>Estabelecimento</label>
          <select
            name="mercearia_id"
            value={form.mercearia_id}
            onChange={atualizar}
            required
          >
            <option value="">Selecione...</option>

            {estabelecimentos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome_fantasia}
              </option>
            ))}
          </select>

          {/* NOME */}
          <label>Nome</label>
          <input
            type="text"
            name="nome"
            value={form.nome}
            onChange={atualizar}
            required
          />

          {/* EMAIL */}
          <label>Email de Login</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={atualizar}
            required
          />

          {/* SENHA */}
          <label>Senha Inicial</label>
          <input
            type="password"
            name="senha"
            value={form.senha}
            onChange={atualizar}
            required
            placeholder="Mínimo 6 caracteres"
          />

          {/* TELEFONE */}
          <label>Telefone</label>
          <input
            type="text"
            name="telefone"
            value={form.telefone}
            onChange={atualizar}
          />

          {/* BOTÕES */}
          <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
            <button className="btn-primary" disabled={loading}>
              {loading ? "Salvando..." : "Cadastrar Operador"}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(-1)}
            >
              Voltar
            </button>
          </div>

        </form>
      </div>
    </LayoutAdmin>
  );
}