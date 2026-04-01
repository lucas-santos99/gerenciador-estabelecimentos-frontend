import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";
import { FaWhatsapp, FaInstagram, FaFacebook, FaMoon, FaSun } from "react-icons/fa";

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

  // 🔥 TEMA
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

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

    } catch {
      setError("Credenciais inválidas. Tente novamente.");
    }
  }

  return (
    <div className="login-container">

      {/* 🔥 BOTÃO DE TEMA */}
      <button className="theme-toggle" onClick={toggleTheme}>
        {theme === "dark" ? <FaSun /> : <FaMoon />}
      </button>

      {/* LADO ESQUERDO */}
      <div className="login-left">

        <div className="login-card">

          <h1 className="login-heading">
            Faça seu login<span>.</span>
          </h1>

          {error && <p className="login-error">{error}</p>}

          <form onSubmit={handleSubmit} className="login-form">

            <label>E-mail</label>
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

      {/* LADO DIREITO */}
      <div className="login-right">

        <div className="login-brand">

          <img src={logo} alt="Logo" className="login-brand-logo" />

          <h2>Gerenciador de Estabelecimentos</h2>

          <p>
            Controle total do seu negócio em um só lugar.
          </p>

          <div className="login-socials">
            <a href="https://wa.me/5553991947320" target="_blank" rel="noopener noreferrer">
              <FaWhatsapp />
            </a>

            <a href="https://instagram.com/llucas.sj" target="_blank" rel="noopener noreferrer">
              <FaInstagram />
            </a>

            <a href="https://facebook.com/luckassanttos18" target="_blank" rel="noopener noreferrer">
              <FaFacebook />
            </a>
          </div>

          <div className="login-footer">
            © 2026 Lucas J. Systems
          </div>

        </div>

      </div>

    </div>
  );
}