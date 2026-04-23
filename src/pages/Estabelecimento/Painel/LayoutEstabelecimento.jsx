// src/pages/Estabelecimento/Painel/LayoutEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthProvider";
import "./LayoutEstabelecimento.css";

/* ── Ícones SVG inline ─────────────────────────────────────── */
const Icons = {
  PDV: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  Estoque: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  ),
  Clientes: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Financeiro: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  Config: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  ),
  Sun: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"  x2="12" y2="4"/>
      <line x1="12" y1="20" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22"   x2="5.64"  y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="2"  y1="12" x2="4"  y2="12"/>
      <line x1="20" y1="12" x2="22" y2="12"/>
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
    </svg>
  ),
  Moon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  Chevron: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  Menu: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6"  x2="6"  y2="18"/>
      <line x1="6"  y1="6"  x2="18" y2="18"/>
    </svg>
  ),
};

/* ── Definição das abas ────────────────────────────────────── */
const ABAS = [
  { key: "pdv",        label: "PDV (Caixa)",    icon: Icons.PDV,        shortcut: "F2" },
  { key: "estoque",    label: "Estoque",         icon: Icons.Estoque,    shortcut: "F3" },
  { key: "clientes",   label: "Clientes / Fiado",icon: Icons.Clientes,   shortcut: "F4" },
  { key: "financeiro", label: "Financeiro",      icon: Icons.Financeiro, shortcut: "F5" },
  { key: "config",     label: "Configurações",   icon: Icons.Config,     shortcut: "F6" },
];

const SIDEBAR_KEY = "est_sidebar_collapsed";

/* ════════════════════════════════════════════════════════════ */
export default function LayoutEstabelecimento({
  abaAtiva,
  onAbaChange,
  children,
  nomeEstabelecimento,
  logoUrl,
}) {
  const navigate  = useNavigate();
  const { logout, profile } = useAuth();

  /* ── tema ─────────────────────────────────────────────────── */
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(p => p === "dark" ? "light" : "dark");
  }

  /* ── colapso ─────────────────────────────────────────────── */
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed);
  }, [collapsed]);

  /* ── mobile ──────────────────────────────────────────────── */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* ── modal logout ────────────────────────────────────────── */
  const [modalLogout, setModalLogout] = useState(false);

  /* ── atalhos de teclado F2–F6 ────────────────────────────── */
  useEffect(() => {
    function handleKey(e) {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mapa = { F2:"pdv", F3:"estoque", F4:"clientes", F5:"financeiro", F6:"config" };
      if (mapa[e.key]) {
        e.preventDefault();
        onAbaChange?.(mapa[e.key]);
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onAbaChange]);

  /* ── logout confirmado ───────────────────────────────────── */
  async function confirmarLogout() {
    try { await logout(); navigate("/login"); }
    catch { alert("Erro ao encerrar sessão."); }
  }

  /* ── iniciais do nome ────────────────────────────────────── */
  function iniciais(nome) {
    if (!nome) return "LJ";
    return nome.split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase();
  }

  const isDark = theme === "dark";

  const sidebarClass = [
    "est-sidebar",
    collapsed   ? "collapsed"   : "",
    mobileOpen  ? "mobile-open" : "",
  ].filter(Boolean).join(" ");

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="est-layout">

      {/* BOTÃO MOBILE */}
      <button
        className="est-mobile-toggle"
        onClick={() => setMobileOpen(p => !p)}
        aria-label="Menu"
      >
        {mobileOpen ? <Icons.Close /> : <Icons.Menu />}
      </button>

      {/* OVERLAY MOBILE */}
      {mobileOpen && (
        <div className="est-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* ── SIDEBAR ────────────────────────────────────────── */}
      <aside className={sidebarClass} onClick={e => {
        // Clicar em área vazia da sidebar → toggle colapso (desktop)
        if (!e.target.closest("a, button") && window.innerWidth > 768) {
          setCollapsed(p => !p);
        }
      }}>

        {/* Toggle colapso desktop */}
        <button
          className="est-sidebar-toggle"
          onClick={e => { e.stopPropagation(); setCollapsed(p => !p); }}
          aria-label={collapsed ? "Expandir" : "Recolher"}
        >
          <Icons.Chevron />
        </button>

        {/* Brand */}
        <div className="est-sidebar-brand">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="est-brand-logo" />
            : <div className="est-brand-initials">{iniciais(nomeEstabelecimento)}</div>
          }
          <div className="est-brand-text">
            <span className="est-brand-name">
              {nomeEstabelecimento || "Estabelecimento"}
            </span>
            <span className="est-brand-role">
              {profile?.role === 'merchant' ? 'Administrador' : 'Operador'}
            </span>
          </div>
        </div>

        {/* Nav */}
        <ul className="est-nav">
          <div className="est-nav-section">Menu</div>
          {ABAS.map(aba => (
            <li
              key={aba.key}
              className={`est-nav-item${abaAtiva === aba.key ? " active" : ""}`}
            >
              <button
                className="est-nav-link"
                onClick={() => { onAbaChange?.(aba.key); setMobileOpen(false); }}
              >
                <span className="est-nav-icon"><aba.icon /></span>
                <span className="est-nav-label">{aba.label}</span>
                <span className="est-nav-shortcut">{aba.shortcut}</span>
              </button>
              <span className="est-nav-tooltip">{aba.label}</span>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="est-sidebar-footer">

          {/* Identidade Lucas J. Systems */}
          <div className="est-ljs-badge">
            <span className="est-ljs-dot" />
            <span className="est-ljs-label">Lucas J. Systems</span>
          </div>

          <div className="est-footer-divider" />

          {/* Tema */}
          <button className="est-theme-btn" onClick={toggleTheme}>
            <span className="est-nav-icon">
              {isDark ? <Icons.Sun /> : <Icons.Moon />}
            </span>
            <span className="est-footer-label">
              {isDark ? "Modo claro" : "Modo escuro"}
            </span>
          </button>

          <div className="est-footer-divider" />

          {/* Sair */}
          <button className="est-logout-btn" onClick={() => setModalLogout(true)}>
            <span className="est-nav-icon"><Icons.Logout /></span>
            <span className="est-footer-label">Sair</span>
          </button>

          {/* Tooltip do footer collapsed */}
          <span className="est-footer-tooltip">
            {isDark ? "Modo claro" : "Modo escuro"} · Sair
          </span>
        </div>

      </aside>

      {/* ── CONTEÚDO PRINCIPAL ─────────────────────────────── */}
      <main className={`est-main${collapsed ? " collapsed" : ""}`}>
        <div className="est-content">
          {children}
        </div>
      </main>

      {/* ── MODAL LOGOUT ───────────────────────────────────── */}
      {modalLogout && (
        <div className="est-modal-overlay" onClick={() => setModalLogout(false)}>
          <div className="est-modal" onClick={e => e.stopPropagation()}>
            <span className="est-modal-icon">🚪</span>
            <div className="est-modal-title">Sair do sistema</div>
            <div className="est-modal-desc">
              Tem certeza que deseja encerrar sua sessão?
            </div>
            <div className="est-modal-actions">
              <button className="est-modal-cancel" onClick={() => setModalLogout(false)}>
                Cancelar
              </button>
              <button className="est-modal-confirm" onClick={confirmarLogout}>
                Sim, sair
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}