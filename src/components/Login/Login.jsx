import React, { useState } from "react";
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";

import logo from "../../assets/logo-lucasjsystems.png";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(() => {
    return localStorage.getItem("savedLogin") || "";
  });

  const [senha, setSenha] = useState("");

  const [remember, setRemember] = useState(() => {
    return !!localStorage.getItem("savedLogin");
  });

  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const { session } = await login({ email, password: senha });

      const token = session?.access_token;

      if (!token) {
        setError("Erro ao autenticar.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/superadmin/perfil`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok || data.is_active === false) {
        setError("Usuário desativado. Contate o administrador.");
        return;
      }

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

      {/* ========================= */}
      {/* LADO ESQUERDO - LOGIN */}
      {/* ========================= */}
      <div className="login-left">

        <div className="login-card">

          <h1 className="login-heading">
            Faça seu login<span>.</span>
          </h1>

          <p className="login-desc">
            Acesse sua plataforma de gestão e controle completo do seu negócio.
          </p>

          {error && <p className="login-error">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">

            <label>Email</label>
            <input
              type="text"
              placeholder="Digite seu e-mail"
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

              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setRemember(checked);

                    if (!checked) {
                      localStorage.removeItem("savedLogin");
                    }
                  }}
                />
                Lembrar no dispositivo
              </label>

              <Link to="/recuperar-senha" className="login-forgot">
                Esqueci minha senha
              </Link>

            </div>

            <button type="submit" className="login-btn">
              Entrar
            </button>

          </form>

        </div>

      </div>

      {/* ========================= */}
      {/* LADO DIREITO - BRANDING */}
      {/* ========================= */}
      <div className="login-right">

        <div className="login-brand">

          <img src={logo} alt="Logo" className="login-brand-logo" />

          <h2>Gerenciador de Estabelecimentos</h2>

          <p>
            Controle total do seu negócio em um só lugar.  
            Gestão, financeiro, PDV e muito mais.
          </p>

          <div className="login-socials">
            <span>🌐</span>
            <span>📱</span>
            <span>📷</span>
          </div>

          <div className="login-footer">
            © 2025 Lucas J. Systems
          </div>

        </div>

      </div>

    </div>
  );
}