import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../utils/supabaseClient";
import "./RecuperarSenha.css";
import { FaMoon, FaSun } from "react-icons/fa";
import logo from "../../assets/logo-lucasjsystems.png";

export default function RecuperarSenha() {
  const [email,   setEmail]   = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro,    setErro]    = useState("");

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
    setLoading(true);
    setErro("");
    setEnviado(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://gerenciador-estabelecimentos-fronte.vercel.app/auth/callback",
      });

      if (error) {
        setErro("Não foi possível enviar o e-mail. Verifique e tente novamente.");
        return;
      }

      setEnviado(true);
    } catch {
      setErro("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === "dark";

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="recover-container">

      {/* BOTÃO TEMA */}
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Alternar tema">
        {isDark ? <FaSun /> : <FaMoon />}
      </button>

      {/* ── LADO ESQUERDO ──────────────────────────────────── */}
      <div className="recover-left">
        <div className="recover-card">

          {/* Cabeçalho */}
          <div className="recover-card-header">
            <div className="recover-eyebrow">Acesso ao sistema</div>
            <h1 className="recover-title">
              Recuperar senha<span>.</span>
            </h1>
            <p className="recover-subtitle">
              Informe seu e-mail e enviaremos as instruções de redefinição
            </p>
          </div>

          {/* Erro */}
          {erro && (
            <div className="recover-error">⚠️ {erro}</div>
          )}

          {/* Sucesso */}
          {enviado ? (
            <div className="recover-success">
              <div className="recover-success-icon">✉️</div>
              <div className="recover-success-title">E-mail enviado!</div>
              <div className="recover-success-text">
                Se o endereço estiver cadastrado, você receberá as instruções
                para redefinir sua senha em alguns minutos.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="recover-form">
              <div className="recover-field">
                <label className="recover-label">E-mail cadastrado</label>
                <input
                  className="recover-input"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <button type="submit" className="recover-btn" disabled={loading}>
                {loading ? "Enviando…" : "Enviar instruções"}
              </button>
            </form>
          )}

          <Link to="/login" className="recover-back">
            ← Voltar ao login
          </Link>

        </div>
      </div>

      {/* ── LADO DIREITO — BRANDING ────────────────────────── */}
      <div className="recover-right">
        <div className="recover-right-glow" />

        <div className="recover-brand">
          <img src={logo} alt="Lucas J. Systems" className="recover-logo" />

          <h2>Gerenciador de Estabelecimentos</h2>

          <p>Controle total do seu negócio em um só lugar.</p>

          <div className="recover-brand-divider" />

          <div className="recover-footer">
            © 2026 Lucas J. Systems
          </div>
        </div>
      </div>

    </div>
  );
}