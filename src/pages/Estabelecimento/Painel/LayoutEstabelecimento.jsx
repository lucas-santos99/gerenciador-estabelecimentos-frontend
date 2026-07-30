// src/pages/Estabelecimento/Painel/LayoutEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthProvider";
import { apiFetch } from "../../../utils/api";
import RenovacaoAntecipada from "../../../components/RenovacaoAntecipada";
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
  Relatorios: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  ),
  Operadores: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      <line x1="19" y1="11" x2="19" y2="17"/>
      <line x1="22" y1="14" x2="16" y2="14"/>
    </svg>
  ),
  Inventario: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="2"/>
      <line x1="9"  y1="12" x2="15" y2="12"/>
      <line x1="9"  y1="16" x2="13" y2="16"/>
    </svg>
  ),
  Fornecedores: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/>
      <path d="M16 8h4l3 3v5h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  Auditoria: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 14l2 2 4-4"/>
    </svg>
  ),
  Close: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6"  x2="6"  y2="18"/>
      <line x1="6"  y1="6"  x2="18" y2="18"/>
    </svg>
  ),
};

/* ── Abas base (todos os roles) ───────────────────────────── */
const ABAS_BASE = [
  { key: "pdv",        label: "PDV (Caixa)",     icon: Icons.PDV,        shortcut: "F2" },
  { key: "estoque",    label: "Estoque",          icon: Icons.Estoque,    shortcut: "F3" },
  { key: "clientes",   label: "Clientes / Fiado", icon: Icons.Clientes,   shortcut: "F4" },
  { key: "financeiro", label: "Financeiro",       icon: Icons.Financeiro, shortcut: "F5" },
];

/* ── Abas exclusivas do merchant ─────────────────────────── */
const ABA_RELATORIOS = {
  key: "relatorios", label: "Relatórios", icon: Icons.Relatorios, shortcut: null,
};

const ABA_OPERADORES = {
  key: "operadores", label: "Operadores", icon: Icons.Operadores, shortcut: null,
};

const ABA_INVENTARIO = {
  key: "inventario", label: "Inventário", icon: Icons.Inventario, shortcut: null,
};

const ABA_FORNECEDORES = {
  key: "fornecedores", label: "Fornecedores", icon: Icons.Fornecedores, shortcut: null,
};

const ABA_AUDITORIA = {
  key: "auditoria", label: "Auditoria", icon: Icons.Auditoria, shortcut: null,
};

// Config sempre por último, tanto pro merchant quanto pro operador —
// não faz parte do "pool" de abas extras, é tratado à parte no final.
const ABA_CONFIG = {
  key: "config", label: "Configurações", icon: Icons.Config, shortcut: "F6",
};

const SIDEBAR_KEY = "est_sidebar_collapsed";

/* ════════════════════════════════════════════════════════════ */
export default function LayoutEstabelecimento({
  abaAtiva,
  onAbaChange,
  children,
  nomeEstabelecimento,
  logoUrl,
  permissoes = [], // array de IDs de permissão do operador (vazio = merchant/sem restrição)
  licencaInfo = null, // { status_assinatura, data_vencimento } — vem do PainelEstabelecimento
  estabelecimentoId = null,
  onLicencaAtualizada = null, // callback pro PainelEstabelecimento atualizar o licencaInfo após renovação antecipada
}) {
  const navigate  = useNavigate();
  const { logout, profile } = useAuth();

  /* ── abas disponíveis para este role/permissões ───────────── */
  const isMerchant = profile?.role === 'merchant';

  /* ── status da licença (só exibido para merchant) ─────────── */
  // Tick a cada 60s só pra manter a contagem regressiva do último dia
  // atualizada — não precisa de nada mais preciso que isso pro badge.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const licenca = (() => {
    if (!isMerchant || !licencaInfo) return null;
    const { status_assinatura, data_vencimento } = licencaInfo;
    if (status_assinatura === 'bloqueada') return { tipo: 'bloqueada', texto: 'Licença bloqueada', dias: null };
    if (!data_vencimento) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const venc = new Date(data_vencimento + 'T12:00:00'); venc.setHours(0, 0, 0, 0);
    const diff = Math.round((venc - hoje) / (1000 * 60 * 60 * 24));
    const dataFmt = new Date(data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR');
    if (diff < 0)   return { tipo: 'vencida',   texto: 'Licença vencida',         dias: diff,  dataFmt };
    if (diff === 0) {
      // Último dia — mostra contagem regressiva em horas/minutos até o
      // fim do dia, em vez de "vence em 0 dias".
      const fimDoDia    = new Date(data_vencimento + 'T23:59:59');
      const msRestantes = fimDoDia - new Date();
      let contagem;
      if (msRestantes <= 0) {
        contagem = 'Vence a qualquer momento';
      } else {
        const horas   = Math.floor(msRestantes / (1000 * 60 * 60));
        const minutos = Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60));
        contagem = horas > 0 ? `Restam ${horas}h ${minutos}min` : `Restam ${minutos}min`;
      }
      return { tipo: 'critica', texto: 'Vence hoje', dias: 0, dataFmt: contagem };
    }
    if (diff <= 7)  return { tipo: 'critica',   texto: `Vence em ${diff} dia${diff === 1 ? '' : 's'}`, dias: diff, dataFmt };
    if (diff <= 30) return { tipo: 'atencao',   texto: `Vence em ${diff} dias`,   dias: diff,  dataFmt };
    return               { tipo: 'ativa',      texto: `Ativa até ${dataFmt}`,     dias: diff,  dataFmt };
  })();

  const ABAS = (() => {
    const base = isMerchant
      ? [...ABAS_BASE, ABA_RELATORIOS, ABA_INVENTARIO, ABA_FORNECEDORES, ABA_OPERADORES, ABA_AUDITORIA, ABA_CONFIG]
      : (() => {
          // Operador: só mostra abas cujo key está nas permissões.
          // Auditoria entra no "pool" mas fica desativada por padrão — só
          // aparece se o admin marcar essa permissão especificamente pro
          // operador (ela NUNCA vem ligada por padrão, diferente das demais).
          // Operadores não têm acesso à gestão de Operadores, então essa aba
          // fica de fora do pool mesmo com permissão (é exclusiva do merchant).
          const TODAS = [...ABAS_BASE, ABA_RELATORIOS, ABA_INVENTARIO, ABA_FORNECEDORES, ABA_AUDITORIA, ABA_CONFIG];
          return TODAS.filter(aba => permissoes.includes(aba.key));
        })();

    // Nome do menu de Clientes só menciona Fiado se o módulo estiver
    // ativo pro estabelecimento — senão fica só "Clientes", mais limpo
    // pra quem não trabalha com fiado.
    return base.map(aba => aba.key === 'clientes'
      ? { ...aba, label: fiadoAtivo ? 'Clientes / Fiado' : 'Clientes' }
      : aba
    );
  })();

  // Só pra saber se menciona "Fiado" no nome do menu — busca uma vez,
  // bem leve, não precisa repetir em nenhum outro lugar desse arquivo.
  const [fiadoAtivo, setFiadoAtivo] = useState(true);
  useEffect(() => {
    if (!estabelecimentoId) return;
    (async () => {
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`);
        if (resp.ok) {
          const d = await resp.json();
          setFiadoAtivo(d.fiado_ativo !== false);
        }
      } catch { /* mantém o label com "Fiado" por padrão se isso falhar */ }
    })();
  }, [estabelecimentoId]);

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
  const [modalFaleConosco, setModalFaleConosco] = useState(false);
  const [contatosSuporte, setContatosSuporte] = useState(null); // null = ainda não buscou

  async function abrirFaleConosco() {
    setModalFaleConosco(true);
    if (contatosSuporte === null) {
      try {
        const resp = await apiFetch('/superadmin/contatos-suporte');
        setContatosSuporte(resp.ok ? await resp.json() : []);
      } catch { setContatosSuporte([]); }
    }
  }

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
            <React.Fragment key={aba.key}>
              {/* Divisor antes do bloco de módulos extras, e outro isolando Configurações no final */}
              {(aba.key === 'relatorios' || aba.key === 'inventario' || aba.key === 'operadores' || aba.key === 'auditoria') && (
                <div className="est-nav-divider" />
              )}
              {aba.key === 'config' && <div className="est-nav-divider" />}
              <li className={`est-nav-item${abaAtiva === aba.key ? " active" : ""}`}>
                <button
                  className="est-nav-link"
                  onClick={() => { onAbaChange?.(aba.key); setMobileOpen(false); }}
                >
                  <span className="est-nav-icon"><aba.icon /></span>
                  <span className="est-nav-label">{aba.label}</span>
                  {aba.shortcut && (
                    <span className="est-nav-shortcut">{aba.shortcut}</span>
                  )}
                </button>
                <span className="est-nav-tooltip">{aba.label}</span>
              </li>
            </React.Fragment>
          ))}
        </ul>

        {/* Footer */}
        <div className="est-sidebar-footer">

          {/* Badge de licença — só merchant */}
          {licenca && (
            <div className={`est-licenca-badge est-licenca-badge--${licenca.tipo}`} title={licenca.dataFmt ? `Vencimento: ${licenca.dataFmt}` : ''}>
              <span className="est-licenca-dot" />
              <span className="est-licenca-textos">
                <span className="est-licenca-texto">{licenca.texto}</span>
                {licenca.dataFmt && <span className="est-licenca-data">{licenca.dataFmt}</span>}
              </span>
            </div>
          )}

          {/* Identidade Lucas J. Systems */}
          <div className="est-ljs-badge">
            <span className="est-ljs-dot" />
            <span className="est-ljs-label">Lucas J. Systems</span>
          </div>

          <div className="est-footer-divider" />

          {/* Fale Conosco */}
          <button className="est-theme-btn" onClick={abrirFaleConosco}>
            <span className="est-nav-icon">💬</span>
            <span className="est-footer-label">Fale Conosco</span>
          </button>

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
          {isMerchant && licencaInfo && estabelecimentoId && (
            <RenovacaoAntecipada
              merceariaId={estabelecimentoId}
              nomeEstabelecimento={nomeEstabelecimento}
              dataVencimento={licencaInfo.data_vencimento}
              statusAssinatura={licencaInfo.status_assinatura}
              onRenovado={onLicencaAtualizada}
            />
          )}
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

      {/* ── MODAL FALE CONOSCO ─────────────────────────────── */}
      {modalFaleConosco && (
        <div className="est-modal-overlay" onClick={() => setModalFaleConosco(false)}>
          <div className="est-modal" onClick={e => e.stopPropagation()}>
            <span className="est-modal-icon">💬</span>
            <div className="est-modal-title">Fale Conosco</div>
            {contatosSuporte === null ? (
              <div className="est-modal-desc">Carregando...</div>
            ) : contatosSuporte.length === 0 ? (
              <div className="est-modal-desc">Nenhum contato de suporte cadastrado.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '4px 0 20px' }}>
                {contatosSuporte.map(c => (
                  <a
                    key={c.id}
                    href={c.tipo === 'whatsapp' ? `https://wa.me/${c.valor}` : `mailto:${c.valor}`}
                    target={c.tipo === 'whatsapp' ? '_blank' : undefined}
                    rel="noreferrer"
                    className="est-contato-suporte-link"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                      borderRadius: 12, textDecoration: 'none', textAlign: 'left',
                      background: c.tipo === 'whatsapp' ? 'rgba(37,211,102,0.1)' : 'rgba(59,130,246,0.1)',
                      border: `1px solid ${c.tipo === 'whatsapp' ? 'rgba(37,211,102,0.3)' : 'rgba(59,130,246,0.3)'}`,
                      color: c.tipo === 'whatsapp' ? '#128c7e' : '#1d4ed8', fontWeight: 600,
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                  >
                    {c.tipo === 'whatsapp' ? (
                      <svg viewBox="0 0 24 24" width="26" height="26" fill="#25D366" style={{ flexShrink: 0 }}>
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5.01L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.92 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m0 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.24-8.24 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24m-4.53 4.7c-.16 0-.42.06-.64.3-.22.24-.85.83-.85 2.02s.87 2.34 1 2.5c.12.16 1.7 2.6 4.14 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.15.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.77.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.36-.76-1.86-.2-.48-.4-.42-.55-.43z"/>
                      </svg>
                    ) : (
                      <span style={{ fontSize: '1.3rem' }}>✉️</span>
                    )}
                    <div>
                      <div>{c.label || (c.tipo === 'whatsapp' ? 'WhatsApp' : 'E-mail')}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.85 }}>{c.valor}</div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: 3 }}>
                        {c.tipo === 'whatsapp' ? '👉 Clique aqui para conversar no WhatsApp' : '👉 Clique aqui para enviar um e-mail'}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
            <div className="est-modal-actions">
              <button className="est-modal-cancel" onClick={() => setModalFaleConosco(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}