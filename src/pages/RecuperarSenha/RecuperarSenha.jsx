import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../utils/supabaseClient";
import "./RecuperarSenha.css";

import logo from "../../assets/logo-lucasjsystems.png";

export default function RecuperarSenha() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setErro("");
    setEnviado(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          "https://gerenciador-mercearia-frontend.onrender.com/auth/callback",
      });

      if (error) {
        setErro("Não foi possível enviar o e-mail. Verifique e tente novamente.");
        return;
      }

      setEnviado(true);
    } catch (err) {
      setErro("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="recover-container">

      {/* ========================= */}
      {/* LADO ESQUERDO */}
      {/* ========================= */}

      <div className="recover-left">

        <div className="recover-card">

          <h1 className="recover-title">
            Recuperar senha<span>.</span>
          </h1>

          {erro && <p className="recover-error">{erro}</p>}

          {enviado ? (
            <p className="recover-success">
              Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha em alguns minutos.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="recover-form">

              <label>Email cadastrado</label>
              <input
                type="email"
                placeholder="Digite seu e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <button type="submit" className="recover-btn" disabled={loading}>
                {loading ? "Enviando..." : "Enviar instruções"}
              </button>

            </form>
          )}

          <Link to="/login" className="recover-back">
            Voltar ao login
          </Link>

        </div>

      </div>

      {/* ========================= */}
      {/* LADO DIREITO - BRANDING */}
      {/* ========================= */}

      <div className="recover-right">

        <div className="recover-brand">

          <img src={logo} alt="Logo" className="recover-logo" />

          <h2>Gerenciador de Estabelecimentos</h2>

          <p>
            Controle total do seu negócio em um só lugar.
          </p>

          <div className="recover-footer">
            © 2026 Lucas J. Systems
          </div>

        </div>

      </div>

    </div>
  );
}