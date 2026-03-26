import React, { useState } from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";

export default function SuperAdmins() {
  const API_URL = import.meta.env.VITE_API_URL;

  const [mostrarModal, setMostrarModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: ""
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function criarSuperAdmin() {
    try {
      setLoading(true);

      const token = JSON.parse(
        localStorage.getItem("sb-mrdfbujijgiaqutkpuch-auth-token") // ⚠️ depois ajustamos se precisar
      )?.access_token;

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

    } catch (err) {
      console.error(err);
      alert("Erro interno");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LayoutAdmin>
      <div style={{ padding: 20 }}>

        <h1>Super Administradores</h1>

        <button
          className="btn-primary"
          onClick={() => setMostrarModal(true)}
          style={{ marginTop: 10 }}
        >
          + Novo SuperAdmin
        </button>

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
              padding: 20,
              borderRadius: 10,
              width: 350
            }}>
              <h2>Novo SuperAdmin</h2>

              <input
                name="nome"
                placeholder="Nome"
                value={form.nome}
                onChange={handleChange}
                style={{ width: "100%", marginBottom: 10 }}
              />

              <input
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                style={{ width: "100%", marginBottom: 10 }}
              />

              <input
                name="senha"
                type="password"
                placeholder="Senha"
                value={form.senha}
                onChange={handleChange}
                style={{ width: "100%", marginBottom: 10 }}
              />

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="btn-primary"
                  onClick={criarSuperAdmin}
                  disabled={loading}
                >
                  {loading ? "Criando..." : "Criar"}
                </button>

                <button
                  className="btn-secondary"
                  onClick={() => setMostrarModal(false)}
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