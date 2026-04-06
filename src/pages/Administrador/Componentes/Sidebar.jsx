// src/pages/Administrador/Painel/Sidebar.jsx
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthProvider";
import "./Sidebar.css";

/* ── Ícones SVG inline (sem dependência extra) ─────────────── */
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
};

const SIDEBAR_KEY = "sidebar_collapsed";

/* ════════════════════════════════════════════════════════════ */
export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  /* ── colapso desktop ─────────────────────────────────────── */
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  });

  /* ── aberto mobile ───────────────────────────────────────── */
  const [mobileOpen, setMobileOpen] = useState(false);

  /* ── persiste preferência ────────────────────────────────── */
  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed);
  }, [collapsed]);

  /* ── fecha ao navegar (mobile) ───────────────────────────── */
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  /* ── logout ──────────────────────────────────────────────── */
  async function handleLogout() {
    try { await logout(); navigate("/login"); }
    catch { alert("Erro ao encerrar sessão."); }
  }

  const menuItems = [
    {
      section: "Menu",
      items: [
        { label: "Dashboard", path: "/admin",              icon: Icons.Dashboard },
        { label: "Configurações", path: "/admin/configuracoes", icon: Icons.Settings  },
      ],
    },
  ];

  const sidebarClass = [
    "sidebar",
    collapsed   ? "collapsed"    : "",
    mobileOpen  ? "mobile-open"  : "",
  ].filter(Boolean).join(" ");

  /* ════════════════════════════════════════════════════════ */
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
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <div className={sidebarClass}>

        {/* Botão colapso — desktop */}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(p => !p)}
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
                const isActive = location.pathname === item.path ||
                  (item.path !== "/admin" && location.pathname.startsWith(item.path));
                return (
                  <li key={item.path} className={isActive ? "active" : ""}>
                    <Link to={item.path}>
                      <span className="sb-icon"><item.icon /></span>
                      <span className="sb-label">{item.label}</span>
                    </Link>
                    {/* tooltip no modo collapsed */}
                    <span className="sb-tooltip">{item.label}</span>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>

        {/* FOOTER — SAIR */}
        <div className="sidebar-footer">
          <button className="sidebar-logout" onClick={handleLogout}>
            <span className="sb-icon"><Icons.Logout /></span>
            <span className="sb-label">Sair</span>
          </button>
          <span className="sb-logout-tooltip">Sair</span>
        </div>

      </div>
    </>
  );
}