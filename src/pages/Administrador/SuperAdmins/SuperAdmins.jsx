import React, { useState, useEffect } from "react";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../../../utils/supabaseClient";
import { useAuth } from "../../../contexts/AuthProvider";

export default function SuperAdmins() {
  const { profile } = useAuth();

  // 🔒 BLOQUEIO DE ACESSO
  if (!profile?.is_master) {
    return <Navigate to="/admin" />;
  }

  const API_URL = import.meta.env.VITE_API_URL;
  const navigate = useNavigate();

  const [mostrarModal, setMostrarModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lista, setLista] = useState([]);

  const [modalSenha, setModalSenha] = useState(false);
  const [userSelecionado, setUserSelecionado] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");

  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: ""
  });

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  // 🔥 CARREGAR LISTA SOMENTE SE FOR MASTER
  useEffect(() => {
    if (profile?.is_master) {
      carregarLista();
    }
  }, [profile]);

  async function carregarLista() {
    try {
      const token = await getToken();

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

      const token = await getToken();

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

  async function excluir(id) {
    if (!window.confirm("Deseja excluir este superadmin?")) return;

    try {
      const token = await getToken();

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

  async function toggleAtivo(id) {
    try {
      const token = await getToken();

      await fetch(`${API_URL}/superadmin/${id}/ativo`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      carregarLista();

    } catch (err) {
      console.error(err);
      alert("Erro ao alterar status");
    }
  }

  // 🔥 TORNAR MASTER
  async function tornarMaster(id) {
    if (!window.confirm("Deseja tornar este usuário um MASTER?")) return;

    try {
      const token = await getToken();

      const resp = await fetch(`${API_URL}/superadmin/${id}/master`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await resp.json();

      if (!resp.ok) {
        alert(data.error || "Erro ao tornar master");
        return;
      }

      alert("Usuário agora é MASTER!");
      carregarLista();

    } catch (err) {
      console.error(err);
      alert("Erro interno");
    }
  }

  // 🔥 ALTERAR SENHA
  async function alterarSenha() {
    try {
      const token = await getToken();

      console.log("userSelecionado:", userSelecionado);
      console.log("novaSenha:", novaSenha);

      const resp = await fetch(
        `${API_URL}/superadmin/${userSelecionado.id}/senha`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ senha: novaSenha })
        }
      );

    const data = await resp.json();

if (!resp.ok) {
  console.log("ERRO BACKEND:", data);
  alert(data.error || "Erro ao alterar senha");
  return;
}

      alert("Senha alterada com sucesso!");
      setModalSenha(false);
      setNovaSenha("");

    } catch (err) {
      console.error(err);
      alert("Erro interno");
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
       className="btn-primary"
        onClick={() => {
  setNovaSenha(""); // 🔥 IMPORTANTE
  setUserSelecionado({ id: profile.id });
  setModalSenha(true);
}}
      >
         Alterar Minha Senha
      </button>

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

        {/* LISTA */}
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

                  <div style={{
                    marginTop: 5,
                    fontSize: 12,
                    color: user.is_active === false ? "red" : "green"
                  }}>
                    {user.is_active === false ? "Inativo" : "Ativo"}
                  </div>

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
                    <>
                      <button
                        className="btn-secondary"
                        onClick={() => toggleAtivo(user.id)}
                      >
                        {user.is_active === false ? "Ativar" : "Desativar"}
                      </button>

                      <button
                        className="btn-primary"
                    onClick={() => {
                      setNovaSenha(""); // 🔥 IMPORTANTE
                      setUserSelecionado(user);
                      setModalSenha(true);
                    }}
                      >
                        Alterar Senha
                      </button>

                      <button
                        className="btn-secondary"
                        onClick={() => tornarMaster(user.id)}
                      >
                        Tornar Master
                      </button>

                      <button
                        className="btn-danger"
                        onClick={() => excluir(user.id)}
                      >
                        Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL CRIAR */}
        {mostrarModal && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h2>Novo SuperAdmin</h2>

              <input name="nome" placeholder="Nome" value={form.nome} onChange={handleChange} style={inputStyle}/>
              <input name="email" placeholder="Email" value={form.email} onChange={handleChange} style={inputStyle}/>
              <input name="senha" type="password" placeholder="Senha" value={form.senha} onChange={handleChange} style={inputStyle}/>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-primary" onClick={criarSuperAdmin}>
                  Criar
                </button>
                <button className="btn-secondary" onClick={() => setMostrarModal(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL SENHA */}
        {modalSenha && (
          <div style={modalOverlay}>
            <div style={modalBox}>
              <h3>
  {userSelecionado?.id === profile.id
    ? "Alterar Minha Senha"
    : "Alterar Senha"}
</h3>

              <input
                type="password"
                placeholder="Nova senha"
                value={novaSenha || ""}
                onChange={(e) => setNovaSenha(e.target.value)}
                style={inputStyle}
              />

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-primary" onClick={alterarSenha}>
                  Salvar
                </button>

                <button
                  className="btn-secondary"
                  onClick={() => setModalSenha(false)}
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

const modalOverlay = {
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
};

const modalBox = {
  background: "#fff",
  padding: 25,
  borderRadius: 12,
  width: 350
};