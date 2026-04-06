// src/pages/Administrador/Painel/Sidebar.jsx
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthProvider";
import "./Sidebar.css";

/* ── Ícones SVG inline ─────────────────────────────────────── */
const Icons = {
  Dashboard: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>
  ),
  Logout: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  ChevronLeft: () => (
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
  Sun: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2"   x2="12" y2="4"/>
      <line x1="12" y1="20"  x2="12" y2="22"/>
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
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
};

const SIDEBAR_KEY = "sidebar_collapsed";

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  /* ── tema ─────────────────────────────────────────────────── */
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "dark";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.body.className = next;
    localStorage.setItem("theme", next);
  }

  /* ── colapso desktop ─────────────────────────────────────── */
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  });

  /* ── aberto mobile ───────────────────────────────────────── */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* ── modal de confirmação de logout ─────────────────────── */
  const [modalLogout, setModalLogout] = useState(false);

  /* ── persiste preferência de colapso ─────────────────────── */
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed);
  }, [collapsed]);

  /* ── fecha ao navegar (mobile) ───────────────────────────── */
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  /* ── toggle sidebar ao clicar no corpo dela (desktop) ───── */
  function handleSidebarClick(e) {
    // Ignora cliques em botões, links e no próprio toggle
    const isInteractive = e.target.closest("a, button");
    if (isInteractive) return;
    setCollapsed(p => !p);
  }

  /* ── logout confirmado ───────────────────────────────────── */
  async function confirmarLogout() {
    try { await logout(); navigate("/login"); }
    catch { alert("Erro ao encerrar sessão."); }
  }

  const menuItems = [
    {
      section: "Menu",
      items: [
        { label: "Dashboard",     path: "/admin",               icon: Icons.Dashboard },
        { label: "Configurações", path: "/admin/configuracoes", icon: Icons.Settings  },
      ],
    },
  ];

  const sidebarClass = [
    "sidebar",
    collapsed  ? "collapsed"   : "",
    mobileOpen ? "mobile-open" : "",
  ].filter(Boolean).join(" ");

  const isDark = theme === "dark";

  return (
    <>
      {/* BOTÃO HAMBURGER — mobile */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(p => !p)}
        aria-label="Menu"
      >
        {mobileOpen ? <Icons.Close /> : <Icons.Menu />}
      </button>

      {/* OVERLAY — mobile */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* SIDEBAR */}
      <div className={sidebarClass} onClick={handleSidebarClick}>

        {/* Botão colapso — desktop */}
        <button
          className="sidebar-toggle"
          onClick={e => { e.stopPropagation(); setCollapsed(p => !p); }}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <Icons.ChevronLeft />
        </button>

        {/* LOGO */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">LJ</div>
          <div className="sidebar-logo-text">
            <span className="logo-primary">Lucas</span>
            <span className="logo-secondary">J. Systems</span>
          </div>
        </div>

        {/* MENU */}
        <ul className="sidebar-menu">
          {menuItems.map(group => (
            <React.Fragment key={group.section}>
              <div className="sb-section-label">{group.section}</div>
              {group.items.map(item => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== "/admin" && location.pathname.startsWith(item.path));
                return (
                  <li key={item.path} className={isActive ? "active" : ""}>
                    <Link to={item.path}>
                      <span className="sb-icon"><item.icon /></span>
                      <span className="sb-label">{item.label}</span>
                    </Link>
                    <span className="sb-tooltip">{item.label}</span>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>

        {/* FOOTER */}
        <div className="sidebar-footer">

          {/* SEPARADOR */}
          <div className="sb-footer-divider" />

          {/* BOTÃO TEMA */}
          <button
            className="sidebar-theme-toggle"
            onClick={toggleTheme}
            aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
          >
            <span className="sb-icon">
              {isDark ? <Icons.Sun /> : <Icons.Moon />}
            </span>
            <span className="sb-label">
              {isDark ? "Modo claro" : "Modo escuro"}
            </span>
          </button>
          <span className="sb-theme-tooltip">
            {isDark ? "Modo claro" : "Modo escuro"}
          </span>

          {/* SEPARADOR */}
          <div className="sb-footer-divider" />

          {/* BOTÃO SAIR */}
          <button
            className="sidebar-logout"
            onClick={() => setModalLogout(true)}
          >
            <span className="sb-icon"><Icons.Logout /></span>
            <span className="sb-label">Sair</span>
          </button>
          <span className="sb-logout-tooltip">Sair</span>

        </div>

      </div>

      {/* MODAL CONFIRMAÇÃO DE LOGOUT */}
      {modalLogout && (
        <div
          className="sb-modal-overlay"
          onClick={() => setModalLogout(false)}
        >
          <div
            className="sb-modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="sb-modal-icon">🚪</div>
            <div className="sb-modal-title">Sair do sistema</div>
            <div className="sb-modal-desc">
              Tem certeza que deseja encerrar sua sessão?
            </div>
            <div className="sb-modal-actions">
              <button
                className="sb-modal-btn-cancel"
                onClick={() => setModalLogout(false)}
              >
                Cancelar
              </button>
              <button
                className="sb-modal-btn-confirm"
                onClick={confirmarLogout}
              >
                Sim, sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}