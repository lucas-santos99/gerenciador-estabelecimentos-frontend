import React, { useState, useEffect } from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../utils/supabaseClient"; // 🔥 NOVO

export default function SuperAdmins() {
  const API_URL = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  const [mostrarModal, setMostrarModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lista, setLista] = useState([]);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: ""
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // 🔥 TOKEN CORRETO
  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  // 🔥 CARREGAR LISTA
  useEffect(() => {
    carregarLista();
  }, []);

  async function carregarLista() {
    try {
      const token = await getToken(); // 🔥 CORRIGIDO

      const resp = await fetch(`${API_URL}/superadmin/listar`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!resp.ok) {
        console.error("Erro ao buscar lista");
        return;
      }

      const data = await resp.json();
      setLista(data);

    } catch (err) {
      console.error(err);
    }
  }

  async function criarSuperAdmin() {
    try {
      setLoading(true);

      const token = await getToken(); // 🔥 CORRIGIDO

      const resp = await fetch(`${API_URL}/superadmin/criar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await resp.json();

      if (!resp.ok) {
        alert(data.error || "Erro ao criar superadmin");
        return;
      }

      alert("SuperAdmin criado com sucesso!");

      setMostrarModal(false);
      setForm({ nome: "", email: "", senha: "" });

      carregarLista();

    } catch (err) {
      console.error(err);
      alert("Erro interno");
    } finally {
      setLoading(false);
    }
  }

  // 🔥 EXCLUIR
  async function excluir(id) {
    if (!window.confirm("Deseja excluir este superadmin?")) return;

    try {
      const token = await getToken(); // 🔥 CORRIGIDO

      await fetch(`${API_URL}/superadmin/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      carregarLista();

    } catch (err) {
      console.error(err);
      alert("Erro ao excluir");
    }
  }

  return (
    <LayoutAdmin>
      <div style={{ padding: 20 }}>

        {/* HEADER */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <h1>Super Administradores</h1>

          <button
            className="btn-secondary"
            onClick={() => navigate("/admin")}
          >
            ← Voltar
          </button>
        </div>

        {/* BOTÃO CRIAR */}
        <button
          className="btn-primary"
          onClick={() => setMostrarModal(true)}
          style={{ marginTop: 20 }}
        >
          + Novo SuperAdmin
        </button>

        {/* 🔥 LISTA REAL */}
        <div style={{
          marginTop: 20,
          padding: 20,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.08)"
        }}>
          {lista.length === 0 ? (
            <p style={{ color: "#666" }}>
              Nenhum SuperAdmin encontrado.
            </p>
          ) : (
            lista.map((user) => (
              <div key={user.id} style={{
                padding: 12,
                borderBottom: "1px solid #eee",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <div>
                  <strong>{user.nome}</strong><br />
                  <span style={{ color: "#666" }}>{user.email}</span>

                  {user.is_master && (
                    <span style={{
                      color: "red",
                      marginLeft: 10,
                      fontWeight: "bold"
                    }}>
                      (Master)
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  {!user.is_master && (
                    <button
                      className="btn-danger"
                      onClick={() => excluir(user.id)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL */}
        {mostrarModal && (
          <div style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999
          }}>
            <div style={{
              background: "#fff",
              padding: 25,
              borderRadius: 12,
              width: 380,
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
            }}>
              <h2 style={{ marginBottom: 15 }}>Novo SuperAdmin</h2>

              <input
                name="nome"
                placeholder="Nome completo"
                value={form.nome}
                onChange={handleChange}
                style={inputStyle}
              />

              <input
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                style={inputStyle}
              />

              <input
                name="senha"
                type="password"
                placeholder="Senha"
                value={form.senha}
                onChange={handleChange}
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
                <button
                  className="btn-primary"
                  onClick={criarSuperAdmin}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {loading ? "Criando..." : "Criar"}
                </button>

                <button
                  className="btn-secondary"
                  onClick={() => setMostrarModal(false)}
                  style={{ flex: 1 }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </LayoutAdmin>
  );
}

const inputStyle = {
  width: "100%",
  padding: "10px",
  marginBottom: "10px",
  borderRadius: "8px",
  border: "1px solid #ccc"
};