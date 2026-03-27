import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate } from "react-router-dom";
import "./Login.css";
import { Link } from "react-router-dom";

import logo from "../../assets/logo-lucasjsystems.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  

async function handleSubmit(e) {
  e.preventDefault();
  setError("");

  try {
    // 🔥 LOGIN
    const { user, session } = await login({ email, password: senha });

    const token = session?.access_token;

    if (!token) {
      setError("Erro ao autenticar.");
      return;
    }

    // 🔥 VALIDAR NO BACKEND
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/superadmin/perfil`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    // 🚨 BLOQUEIO
    if (!response.ok || data.is_active === false) {

      await supabase.auth.signOut(); // 🔥 ESSENCIAL

      setError("Usuário desativado. Contate o administrador.");
      return;
    }

    // 🔥 REMEMBER
    if (remember) {
      localStorage.setItem("savedLogin", email);
    } else {
      localStorage.removeItem("savedLogin");
    }

    navigate("/");

  } catch (err) {
    setError("Credenciais inválidas. Tente novamente.");
  }
}
  return (
    <div className="login-container">
      {/* Painel Esquerdo */}
<div className="login-left">
    <div className="login-left-content">
        <img src={logo} className="login-logo" alt="Logo" />

        <h1 className="login-title">Gerenciador de Estabelecimentos</h1>

        <p className="login-subtitle">
            Plataforma completa para controle, gestão interna,
            operações financeiras e muito mais — tudo em um só lugar.
        </p>

        <div className="login-left-footer">
     © 2025 Lucas J. Systems
</div>

    </div>
</div>

      {/* Painel Direito */}
      <div className="login-right">
        <div className="login-box">

          <h2>Entrar</h2>

          {error && <p className="login-error">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">

            <label>E-mail ou Telefone</label>
            <input
              type="text"
              placeholder="Digite seu e-mail ou telefone"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label>Senha</label>
            <input
              type="password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
            />

           <div className="login-remember">
    <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <input type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
        />
        Lembrar no dispositivo
    </label>

   <Link to="/recuperar-senha" className="login-forgot">
  Esqueci a senha
</Link>
</div>


            <button type="submit" className="login-btn">
              Entrar
            </button>

          </form>

        </div>
      </div>
    </div>
  );
}
