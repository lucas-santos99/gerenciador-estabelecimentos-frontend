import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthProvider";
import { useNavigate, Link } from "react-router-dom";
import "./Login.css";
import { FaWhatsapp, FaInstagram, FaFacebook, FaMoon, FaSun } from "react-icons/fa";
import logo from "../../assets/logo-lucasjsystems.png";

export default function Login() {
  const { login }  = useAuth();
  const navigate   = useNavigate();

  const [email,    setEmail]    = useState(() => localStorage.getItem("savedLogin") || "");
  const [senha,    setSenha]    = useState("");
  const [remember, setRemember] = useState(() => !!localStorage.getItem("savedLogin"));
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  /* ── tema ─────────────────────────────────────────────────── */
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  }

  /* ── submit ──────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { session } = await login({ email, password: senha });
      const token = session?.access_token;

      if (!token) {
        setError("Erro ao autenticar. Tente novamente.");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/superadmin/perfil`,
        { headers: { Authorization: `Bearer ${token}` } }
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
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === "dark";

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="login-container">

      {/* BOTÃO TEMA */}
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema">
        {isDark ? <FaSun /> : <FaMoon />}
      </button>

      {/* ── LADO ESQUERDO ──────────────────────────────────── */}
      <div className="login-left">
        <div className="login-card">

          {/* Cabeçalho */}
          <div className="login-card-header">
            <div className="login-eyebrow">Bem-vindo de volta</div>
            <h1 className="login-heading">
              Faça seu login<span>.</span>
            </h1>
            <p className="login-subheading">
              Acesse o painel administrativo do sistema
            </p>
          </div>

          {/* Erro */}
          {error && (
            <div className="login-error" style={{ marginBottom: 20 }}>
              ⚠️ {error}
            </div>
          )}

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="login-form">

            <div className="login-field">
              <label className="login-label">E-mail</label>
              <div className="login-input-wrap">
                <input
                  className="login-input"
                  type="text"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label">Senha</label>
              <div className="login-input-wrap">
                <input
                  className="login-input"
                  type="password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="login-remember">
              <label className="login-remember-label">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => {
                    setRemember(e.target.checked);
                    if (!e.target.checked) localStorage.removeItem("savedLogin");
                  }}
                />
                Lembrar neste dispositivo
              </label>

              <Link to="/recuperar-senha" className="login-forgot">
                Esqueci minha senha
              </Link>
            </div>

            <button
              type="submit"
              className="login-btn"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>

          </form>

        </div>
      </div>

      {/* ── LADO DIREITO — BRANDING ────────────────────────── */}
      <div className="login-right">
        <div className="login-right-glow" />

        <div className="login-brand">
          <img src={logo} alt="Lucas J. Systems" className="login-brand-logo" />

          <h2>Gerenciador de Estabelecimentos</h2>

          <p>Controle total do seu negócio em um só lugar.</p>

          <div className="login-brand-divider" />

          <div className="login-socials">
            <a href="https://wa.me/5553991947320" target="_blank" rel="noopener noreferrer" title="WhatsApp">
              <FaWhatsapp />
            </a>
            <a href="https://instagram.com/llucas.sj" target="_blank" rel="noopener noreferrer" title="Instagram">
              <FaInstagram />
            </a>
            <a href="https://facebook.com/luckassanttos18" target="_blank" rel="noopener noreferrer" title="Facebook">
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