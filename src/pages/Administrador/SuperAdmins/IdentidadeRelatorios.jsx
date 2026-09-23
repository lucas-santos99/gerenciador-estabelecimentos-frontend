// src/pages/Administrador/SuperAdmins/IdentidadeRelatorios.jsx
// ============================================================
// IDENTIDADE DOS RELATÓRIOS (23/09/2026)
// Cabeçalho e rodapé de todos os relatórios do sistema (PDF, impressão,
// Excel e recibo do PDV). Qualquer SuperAdmin edita.
// A prévia à direita usa o MESMO molde que os relatórios de verdade
// (src/utils/relatorioIdentidade.js), então o que aparece aqui é o que
// sai no papel.
//
// Duas abas:
//   - "Padrão geral" (opção 1): vale pra todos os relatórios.
//   - "Por tipo de relatório" (opção 2): muda só alguns campos de um tipo
//     específico (ex.: rodapé diferente no recibo, outra cor no DRE).
//     O que não for personalizado continua seguindo o padrão geral — e
//     acompanha as mudanças futuras dele.
// Salvo em config_sistema.relatorio_identidade = { versao, padrao, por_tipo }.
// ============================================================
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import LayoutAdmin from "../Painel/LayoutAdmin";
import { apiFetch } from "../../../utils/api";
import { supabase } from "../../../utils/supabaseClient";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  IDENTIDADE_PADRAO,
  TIPOS_RELATORIO,
  htmlIdentidade,
  novoPdfRelatorio,
  salvarExcelIdentidade,
  definirConfigIdentidade,
  resolverIdentidade,
  esc,
  ESCALA_MIN,
  ESCALA_MAX,
} from "../../../utils/relatorioIdentidade";
import "./SuperAdmins.css";
import "./IdentidadeRelatorios.css";

// Logo fictícia (desenho simples) pra prévia — sem depender de arquivo
const LOGO_EXEMPLO = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
  '<circle cx="100" cy="100" r="96" fill="#f59e0b"/>' +
  '<text x="100" y="92" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">SUA</text>' +
  '<text x="100" y="132" font-family="Arial" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">LOJA</text></svg>'
);

// Loja fictícia só pra prévia
const LOJA_EXEMPLO = {
  nome: "Mercadinho Exemplo",
  logo_url: LOGO_EXEMPLO,
  cnpj: "12.345.678/0001-90",
  telefone: "(53) 3222-1111",
  email: "contato@mercadinhoexemplo.com",
  endereco: "Rua das Flores, 123 — Centro, Pelotas/RS",
};

const CAMPOS_TEXTO_LIMITE = {
  nome_sistema: 80, marca_nome: 80, rodape_gerado_por: 160, site: 120, instagram: 60,
  whatsapp: 30, email: 120, rodape_texto_livre: 300, recibo_mensagem: 120, recibo_rodape: 120,
};

// Nome curto de cada tipo (sem o prefixo "Financeiro — " etc.) pra usar
// como título do relatório de exemplo na prévia.
function tituloExemplo(tipo) {
  const t = TIPOS_RELATORIO.find(x => x.tipo === tipo);
  if (!t) return "Relatório de Estoque";
  const partes = t.label.split(" — ");
  return partes[partes.length - 1];
}

/* ── Componentes pequenos (fora do componente principal, senão o campo
   perde o foco a cada tecla digitada) ───────────────────────────────
   `hf` (opcional, só na aba "Por tipo"): hf(campo) → { personalizado,
   reverter }. Mostra se o campo segue o padrão ou foi personalizado. */
function Heranca({ hf, campo }) {
  if (!hf) return null;
  const h = hf(campo);
  return h.personalizado ? (
    <button type="button" className="idr-adm-reverter" onClick={h.reverter} title="Voltar a seguir o padrão geral">
      personalizado · ↺ usar padrão
    </button>
  ) : (
    <span className="idr-adm-herdado" title="Segue o padrão geral — edite pra personalizar só neste tipo">padrão</span>
  );
}

function Texto({ p, s, hf, campo, label, placeholder, dica }) {
  return (
    <div className="idr-adm-campo">
      <span className="idr-adm-rotulo">
        <span className="sa-config-item-label">{label}</span>
        <Heranca hf={hf} campo={campo} />
      </span>
      <input
        className="sa-config-textfield"
        maxLength={CAMPOS_TEXTO_LIMITE[campo] || 120}
        value={p[campo] ?? ""}
        placeholder={placeholder}
        onChange={e => s(campo, e.target.value)}
      />
      {dica && <span className="sa-config-hint">{dica}</span>}
    </div>
  );
}

function Chave({ p, s, hf, campo, label }) {
  return (
    <span className="idr-adm-chave-linha">
      <label className="idr-adm-chave">
        <input type="checkbox" checked={!!p[campo]} onChange={e => s(campo, e.target.checked)} />
        <span>{label}</span>
      </label>
      <Heranca hf={hf} campo={campo} />
    </span>
  );
}

function Cor({ p, s, hf, campo, label }) {
  return (
    <span className="idr-adm-chave-linha">
      <label className="idr-adm-cor">
        <input type="color" value={p[campo] || IDENTIDADE_PADRAO[campo]} onChange={e => s(campo, e.target.value)} />
        <span>{label}</span>
      </label>
      <Heranca hf={hf} campo={campo} />
    </span>
  );
}

const OPCOES_EXIBICAO = [
  { v: "logo",        t: "Só logo" },
  { v: "nome",        t: "Só nome" },
  { v: "logo_e_nome", t: "Logo + nome" },
];

// Botões lado a lado pra escolher uma opção (ex.: logo / nome / logo + nome)
function Opcoes({ p, s, hf, campo, label, opcoes, dica }) {
  return (
    <div className="idr-adm-campo">
      <span className="idr-adm-rotulo">
        <span className="sa-config-item-label">{label}</span>
        <Heranca hf={hf} campo={campo} />
      </span>
      <div className="idr-adm-segmentos" role="radiogroup" aria-label={label}>
        {opcoes.map(o => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={p[campo] === o.v}
            className={`idr-adm-segmento${p[campo] === o.v ? " ativo" : ""}`}
            onClick={() => s(campo, o.v)}
          >
            {o.t}
          </button>
        ))}
      </div>
      {dica && <span className="sa-config-hint">{dica}</span>}
    </div>
  );
}

// Controle deslizante de tamanho (em %)
function Escala({ p, s, hf, campo, label, dica }) {
  const valor = Number(p[campo]) || 100;
  return (
    <div className="idr-adm-campo">
      <span className="idr-adm-rotulo">
        <span className="sa-config-item-label">{label}</span>
        <Heranca hf={hf} campo={campo} />
      </span>
      <div className="idr-adm-escala">
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => s(campo, Math.max(ESCALA_MIN, valor - 10))}
          disabled={valor <= ESCALA_MIN} title="Diminuir">−</button>
        <input type="range" min={ESCALA_MIN} max={ESCALA_MAX} step={5} value={valor}
          onChange={e => s(campo, parseInt(e.target.value, 10))} aria-label={label} />
        <button type="button" className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => s(campo, Math.min(ESCALA_MAX, valor + 10))}
          disabled={valor >= ESCALA_MAX} title="Aumentar">+</button>
        <span className="idr-adm-escala-valor">{valor}%</span>
        {valor !== 100 && (
          <button type="button" className="idr-adm-escala-reset" onClick={() => s(campo, 100)} title="Voltar pro tamanho normal">normal</button>
        )}
      </div>
      {dica && <span className="sa-config-hint">{dica}</span>}
    </div>
  );
}

function BlocoLogo({ p, s, hf, ctx, campo, label, dica, inputRef }) {
  const { enviando, enviarLogo } = ctx;
  const chave = campo === "sistema" ? "sistema_logo_url" : "marca_logo_url";
  const url = p[chave];
  return (
    <div className="idr-adm-logo">
      <div className="idr-adm-logo-prev" style={{ background: p.cor_faixa }}>
        {url ? <img src={url} alt="" /> : <span style={{ color: p.cor_texto_faixa }}>sem logo</span>}
      </div>
      <div className="idr-adm-logo-info">
        <span className="idr-adm-rotulo">
          <span className="sa-config-item-label">{label}</span>
          <Heranca hf={hf} campo={chave} />
        </span>
        <span className="sa-config-hint">{dica}</span>
        <div className="idr-adm-logo-botoes">
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
            onChange={e => { enviarLogo(campo, e.target.files?.[0], s); e.target.value = ""; }} />
          <button className="sa-btn sa-btn-primary sa-btn-sm" onClick={() => inputRef.current?.click()} disabled={enviando !== null}>
            {enviando === campo ? "⏳ Enviando…" : url ? "Trocar logo" : "Enviar logo"}
          </button>
          {url && (
            <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => s(chave, "")} disabled={enviando !== null}>
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SeletorModo({ p, s, hf }) {
  return (
    <>
      <span className="idr-adm-rotulo">
        <span className="sa-config-item-label">Modo do cabeçalho</span>
        <Heranca hf={hf} campo="cabecalho_modo" />
      </span>
      <div className="idr-adm-modos">
        <label className={`idr-adm-modo${p.cabecalho_modo === "loja" ? " ativo" : ""}`}>
          <input type="radio" checked={p.cabecalho_modo === "loja"} onChange={() => s("cabecalho_modo", "loja")} />
          <strong>Só a loja</strong>
          <span>Logo e dados do estabelecimento. Sua marca aparece só no rodapé.</span>
        </label>
        <label className={`idr-adm-modo${p.cabecalho_modo === "loja_e_marca" ? " ativo" : ""}`}>
          <input type="radio" checked={p.cabecalho_modo === "loja_e_marca"} onChange={() => s("cabecalho_modo", "loja_e_marca")} />
          <strong>Loja + minha marca</strong>
          <span>Faixa com a sua logo no topo, e a loja logo abaixo.</span>
        </label>
      </div>
    </>
  );
}

/* ── Blocos do formulário (os mesmos nas duas abas) ─────────────── */
function BoxCabecalho({ p, s, hf, ctx, refs }) {
  return (
    <div className="sa-config-box">
      <div className="sa-config-header">
        <div className="sa-config-header-left">
          <span className="sa-config-icon">🧾</span>
          <div>
            <div className="sa-config-title">Cabeçalho</div>
            <div className="sa-config-subtitle">PDFs, impressões e Excel.</div>
          </div>
        </div>
      </div>
      <div className="sa-config-body">
        <SeletorModo p={p} s={s} hf={hf} />

        <div className="idr-adm-duas">
          <Texto p={p} s={s} hf={hf} campo="marca_nome" label="Nome da sua marca" placeholder="Lucas J. Systems" />
          <Texto p={p} s={s} hf={hf} campo="nome_sistema" label="Nome do sistema" placeholder="Gerenciador de Estabelecimentos" />
        </div>

        <BlocoLogo p={p} s={s} hf={hf} ctx={ctx} campo="marca" label="Logo da sua marca" inputRef={refs.marca}
          dica="Vai na faixa do topo (modo Loja + minha marca) e no rodapé. Logo clara? Deixe a cor da faixa escura." />
        <Opcoes p={p} s={s} hf={hf} campo="marca_exibicao" label="Sua marca aparece como" opcoes={OPCOES_EXIBICAO}
          dica="Vale pro topo e pro rodapé. Sem logo enviada, sai sempre o nome." />
        <BlocoLogo p={p} s={s} hf={hf} ctx={ctx} campo="sistema" label="Logo do sistema (opcional)" inputRef={refs.sistema}
          dica="Canto direito da faixa do topo." />
        <Opcoes p={p} s={s} hf={hf} campo="sistema_exibicao" label="O sistema aparece como" opcoes={OPCOES_EXIBICAO}
          dica="Sem logo do sistema enviada, sai sempre o nome." />

        <Escala p={p} s={s} hf={hf} campo="escala_cabecalho" label="Tamanho do cabeçalho"
          dica="Aumenta ou diminui a faixa do topo, as logos e os textos do cabeçalho (PDF, impressão e Excel)." />

        <div className="idr-adm-cores">
          <Cor p={p} s={s} hf={hf} campo="cor_faixa" label="Cor da faixa" />
          <Cor p={p} s={s} hf={hf} campo="cor_texto_faixa" label="Texto da faixa" />
          <Cor p={p} s={s} hf={hf} campo="cor_destaque" label="Cor de destaque (títulos e tabelas)" />
        </div>

        <span className="sa-config-item-label" style={{ marginTop: 6 }}>Dados da loja no cabeçalho</span>
        <div className="idr-adm-chaves">
          <Chave p={p} s={s} hf={hf} campo="mostrar_logo_loja" label="Logo da loja" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_cnpj" label="CNPJ" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_telefone" label="Telefone" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_email" label="E-mail" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_endereco" label="Endereço" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_data_geracao" label="Data/hora de geração" />
        </div>
        <span className="sa-config-hint">Os dados vêm do cadastro de cada estabelecimento — o que estiver vazio lá simplesmente não aparece.</span>
      </div>
    </div>
  );
}

function BoxRodape({ p, s, hf }) {
  return (
    <div className="sa-config-box">
      <div className="sa-config-header">
        <div className="sa-config-header-left">
          <span className="sa-config-icon">📌</span>
          <div>
            <div className="sa-config-title">Rodapé (sua marca)</div>
            <div className="sa-config-subtitle">Faixa no fim de cada página.</div>
          </div>
        </div>
      </div>
      <div className="sa-config-body">
        <Texto p={p} s={s} hf={hf} campo="rodape_gerado_por" label="Frase principal" placeholder="Gerado por {sistema} · {marca}"
          dica={<>Pode usar <code>{"{sistema}"}</code> e <code>{"{marca}"}</code> — são trocados pelos nomes do cabeçalho.</>} />
        <div className="idr-adm-duas">
          <Texto p={p} s={s} hf={hf} campo="site" label="Site" placeholder="www.seusite.com.br" />
          <Texto p={p} s={s} hf={hf} campo="instagram" label="Instagram" placeholder="@suamarca" />
        </div>
        <div className="idr-adm-duas">
          <Texto p={p} s={s} hf={hf} campo="whatsapp" label="WhatsApp" placeholder="(53) 99999-9999" />
          <Texto p={p} s={s} hf={hf} campo="email" label="E-mail" placeholder="contato@suamarca.com" />
        </div>
        <Texto p={p} s={s} hf={hf} campo="rodape_texto_livre" label="Texto livre (opcional)" placeholder="Ex.: Suporte de seg. a sex., 8h às 18h" />
        <div className="idr-adm-chaves">
          <Chave p={p} s={s} hf={hf} campo="mostrar_contatos_rodape" label="Mostrar contatos" />
          <Chave p={p} s={s} hf={hf} campo="mostrar_paginacao" label="Número da página (PDF)" />
        </div>
        <Escala p={p} s={s} hf={hf} campo="escala_rodape" label="Tamanho do rodapé"
          dica="Aumenta ou diminui a faixa do rodapé, a logo e os textos dele (PDF, impressão e Excel)." />
      </div>
    </div>
  );
}

function BoxRecibo({ p, s, hf, comDadosLoja }) {
  return (
    <div className="sa-config-box">
      <div className="sa-config-header">
        <div className="sa-config-header-left">
          <span className="sa-config-icon">🧾</span>
          <div>
            <div className="sa-config-title">Recibo do PDV</div>
            <div className="sa-config-subtitle">Impressora térmica (preto e branco) — sem faixa colorida.</div>
          </div>
        </div>
      </div>
      <div className="sa-config-body">
        <div className="idr-adm-chaves">
          <Chave p={p} s={s} hf={hf} campo="recibo_mostrar_logo_loja" label="Logo da loja no recibo" />
          <Chave p={p} s={s} hf={hf} campo="recibo_mostrar_dados_loja" label="Dados da loja" />
        </div>
        {comDadosLoja && (
          <>
            <span className="sa-config-hint">Quais dados da loja entram no recibo:</span>
            <div className="idr-adm-chaves">
              <Chave p={p} s={s} hf={hf} campo="mostrar_cnpj" label="CNPJ" />
              <Chave p={p} s={s} hf={hf} campo="mostrar_telefone" label="Telefone" />
              <Chave p={p} s={s} hf={hf} campo="mostrar_email" label="E-mail" />
              <Chave p={p} s={s} hf={hf} campo="mostrar_endereco" label="Endereço" />
            </div>
          </>
        )}
        <div className="idr-adm-duas">
          <Texto p={p} s={s} hf={hf} campo="recibo_mensagem" label="Mensagem final" placeholder="Obrigado!" />
          <Texto p={p} s={s} hf={hf} campo="recibo_rodape" label="Última linha" placeholder="{marca}"
            dica={<>Aceita <code>{"{sistema}"}</code> e <code>{"{marca}"}</code>. Vazio = não imprime.</>} />
        </div>
        {comDadosLoja && (
          <div className="idr-adm-duas">
            <Texto p={p} s={s} hf={hf} campo="marca_nome" label="Nome da sua marca (pro {marca})" placeholder="Lucas J. Systems" />
            <Texto p={p} s={s} hf={hf} campo="nome_sistema" label="Nome do sistema (pro {sistema})" placeholder="Gerenciador de Estabelecimentos" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function IdentidadeRelatorios() {
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [msg,        setMsg]        = useState("");
  const [alterado,   setAlterado]   = useState(false);
  const [enviando,   setEnviando]   = useState(null); // 'marca' | 'sistema' | null
  const [gerandoExemplo, setGerandoExemplo] = useState(null);

  const [padrao,   setPadrao]   = useState({ ...IDENTIDADE_PADRAO });
  const [porTipo,  setPorTipo]  = useState({});           // opção 2
  const [aba,      setAba]      = useState("padrao");     // 'padrao' | 'por_tipo'
  const [tipoSel,  setTipoSel]  = useState(TIPOS_RELATORIO[0].tipo);
  const [mostrarLojaNaPrevia, setMostrarLojaNaPrevia] = useState(true);

  const refs = { marca: useRef(null), sistema: useRef(null) };

  const [fontScale, setFontScale] = useState(() => {
    const s = localStorage.getItem("sa-font-scale");
    return s ? parseFloat(s) : 1;
  });
  function changeFontScale(delta) {
    setFontScale(prev => {
      const next = Math.min(1.4, Math.max(0.8, parseFloat((prev + delta).toFixed(1))));
      localStorage.setItem("sa-font-scale", next);
      return next;
    });
  }

  /* ── Carregar ─────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiFetch("/superadmin/identidade-relatorios");
        if (resp.ok) {
          const cfg = await resp.json();
          setPadrao({ ...IDENTIDADE_PADRAO, ...(cfg.padrao || {}) });
          setPorTipo(cfg.por_tipo || {});
        }
      } catch { /* segue com os valores de fábrica */ }
      setCarregando(false);
    })();
  }, []);

  // Aviso ao sair da página com alteração não salva
  useEffect(() => {
    if (!alterado) return;
    const aviso = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [alterado]);

  function marcarAlterado() { setAlterado(true); setMsg(""); }

  /* ── Padrão geral ─────────────────────────────────────────── */
  function set(campo, valor) {
    setPadrao(p => ({ ...p, [campo]: valor }));
    marcarAlterado();
  }

  /* ── Por tipo (opção 2) ───────────────────────────────────── */
  const overrideSel = porTipo[tipoSel] || {};
  const valoresTipo = useMemo(() => ({ ...padrao, ...overrideSel }), [padrao, overrideSel]);

  function setTipo(campo, valor) {
    setPorTipo(pt => ({ ...pt, [tipoSel]: { ...(pt[tipoSel] || {}), [campo]: valor } }));
    marcarAlterado();
  }

  function reverterCampoTipo(campo) {
    setPorTipo(pt => {
      const atual = { ...(pt[tipoSel] || {}) };
      delete atual[campo];
      const novo = { ...pt };
      if (Object.keys(atual).length) novo[tipoSel] = atual; else delete novo[tipoSel];
      return novo;
    });
    marcarAlterado();
  }

  function removerPersonalizacoesTipo(tipo) {
    const t = TIPOS_RELATORIO.find(x => x.tipo === tipo);
    if (!window.confirm(`Remover todas as personalizações de "${t?.label || tipo}"? Ele volta a seguir o padrão geral. Nada é salvo até você clicar em Salvar.`)) return;
    setPorTipo(pt => { const novo = { ...pt }; delete novo[tipo]; return novo; });
    marcarAlterado();
  }

  const hfTipo = (campo) => ({
    personalizado: Object.prototype.hasOwnProperty.call(overrideSel, campo),
    reverter: () => reverterCampoTipo(campo),
  });

  const qtdPersonalizados = (tipo) => Object.keys(porTipo[tipo] || {}).length;

  /* ── Prévia (mesmo molde dos relatórios) ─────────────────── */
  const configAtual = useMemo(() => ({ versao: 1, padrao, por_tipo: porTipo }), [padrao, porTipo]);
  const lojaPrevia = mostrarLojaNaPrevia ? LOJA_EXEMPLO : null;
  const tipoPrevia = aba === "por_tipo" ? tipoSel : "geral";
  const tituloPrevia = aba === "por_tipo" ? tituloExemplo(tipoSel) : "Relatório de Estoque";

  const previaHtml = useMemo(() => {
    const idr = htmlIdentidade({
      tipo: tipoPrevia,
      titulo: tituloPrevia,
      subtitulo: "Período: 01/09/2026 a 23/09/2026",
      configOverride: configAtual,
      lojaOverride: lojaPrevia,
      semLoja: !lojaPrevia,
    });
    const linhas = [
      ["Arroz 5kg", "Mercearia", "32 un", "R$ 27,90"],
      ["Feijão 1kg", "Mercearia", "18 un", "R$ 8,49"],
      ["Refrigerante 2L", "Bebidas", "40 un", "R$ 9,99"],
      ["Café 500g", "Mercearia", "12 un", "R$ 18,90"],
    ].map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 0; padding: 18px; background: #fff; }
      ${idr.css}
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      thead th { background: ${idr.identidade.cor_destaque}; color: #fff; text-align: left; padding: 7px 9px; }
      td { padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) td { background: #f8fafc; }
    </style></head><body>
      ${idr.cabecalho}
      <table><thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Preço</th></tr></thead><tbody>${linhas}</tbody></table>
      ${idr.rodape}
    </body></html>`;
  }, [configAtual, lojaPrevia, tipoPrevia, tituloPrevia]);

  // Recibo sempre resolvido como o PDV resolve (padrão + personalização do tipo "recibo")
  const rec = useMemo(() => resolverIdentidade("recibo", configAtual), [configAtual]);
  const trocarMarcadores = (t) => String(t || "")
    .replace(/\{sistema\}/g, rec.nome_sistema || "").replace(/\{marca\}/g, rec.marca_nome || "");

  /* ── Salvar ───────────────────────────────────────────────── */
  async function salvar() {
    setSalvando(true);
    setMsg("");
    try {
      const resp = await apiFetch("/superadmin/identidade-relatorios", {
        method: "PUT",
        body: JSON.stringify({ padrao, por_tipo: porTipo }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || "Erro ao salvar.");
      if (json.config) {
        setPadrao({ ...IDENTIDADE_PADRAO, ...(json.config.padrao || {}) });
        setPorTipo(json.config.por_tipo || {});
        definirConfigIdentidade(json.config); // os relatórios desta aba já usam o novo
      }
      setAlterado(false);
      setMsg("✓ Salvo! Os próximos relatórios já saem com essa identidade.");
    } catch (e) {
      setMsg("❌ " + e.message);
    }
    setSalvando(false);
  }

  function restaurarPadraoFabrica() {
    if (!window.confirm("Voltar o PADRÃO GERAL pros valores de fábrica? (As personalizações por tipo continuam; as logos enviadas continuam guardadas, só deixam de ser usadas.) Nada é salvo até você clicar em Salvar.")) return;
    setPadrao({ ...IDENTIDADE_PADRAO });
    marcarAlterado();
  }

  /* ── Upload de logo ───────────────────────────────────────── */
  // `setter` = set (padrão geral) ou setTipo (aba por tipo)
  async function enviarLogo(campo, arquivo, setter) {
    if (!arquivo) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(arquivo.type)) {
      setMsg("❌ Formato não aceito. Use PNG, JPG, WEBP ou GIF.");
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      setMsg("❌ Imagem maior que 5 MB.");
      return;
    }
    setEnviando(campo);
    setMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const form = new FormData();
      form.append("imagem", arquivo);
      // apiFetch força Content-Type JSON — upload de arquivo vai com fetch direto
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/superadmin/identidade-relatorios/logo?campo=${campo}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || "Erro ao enviar a logo.");
      (setter || set)(campo === "sistema" ? "sistema_logo_url" : "marca_logo_url", json.url);
      setMsg("Logo enviada — confira a prévia e clique em Salvar pra valer nos relatórios.");
    } catch (e) {
      setMsg("❌ " + e.message);
    }
    setEnviando(null);
  }

  /* ── Exemplos pra baixar (usam o que está na tela, sem salvar) ── */
  async function baixarPdfExemplo(modo) {
    setGerandoExemplo("pdf");
    try {
      const rel = await novoPdfRelatorio({
        tipo: tipoPrevia,
        titulo: tituloPrevia,
        subtitulo: "Período: 01/09/2026 a 23/09/2026",
        configOverride: configAtual,
        lojaOverride: lojaPrevia,
        semLoja: !lojaPrevia,
      });
      const body = Array.from({ length: 60 }, (_, i) => [`Produto de exemplo ${i + 1}`, i % 2 ? "Bebidas" : "Mercearia", `${(i * 7) % 50} un`, "R$ 9,99"]);
      autoTable(rel.doc, {
        ...rel.tabela,
        startY: rel.y,
        head: [["Produto", "Categoria", "Estoque", "Preço"]],
        body,
        theme: "striped",
        styles: { fontSize: 9, cellPadding: 2.5 },
      });
      rel.concluir(modo, "Exemplo_identidade_relatorios.pdf");
    } catch (e) {
      setMsg("❌ Erro ao gerar o PDF de exemplo: " + e.message);
    }
    setGerandoExemplo(null);
  }

  async function baixarExcelExemplo() {
    setGerandoExemplo("xlsx");
    try {
      const ws = XLSX.utils.json_to_sheet([
        { Produto: "Arroz 5kg", Categoria: "Mercearia", Estoque: 32, "Preço (R$)": 27.9 },
        { Produto: "Feijão 1kg", Categoria: "Mercearia", Estoque: 18, "Preço (R$)": 8.49 },
        { Produto: "Refrigerante 2L", Categoria: "Bebidas", Estoque: 40, "Preço (R$)": 9.99 },
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Exemplo");
      await salvarExcelIdentidade(wb, "Exemplo_identidade_relatorios.xlsx", {
        tipo: tipoPrevia,
        titulo: tituloPrevia,
        subtitulo: "Período: 01/09/2026 a 23/09/2026",
        configOverride: configAtual,
        lojaOverride: lojaPrevia,
        semLoja: !lojaPrevia,
      });
    } catch (e) {
      setMsg("❌ Erro ao gerar o Excel de exemplo: " + e.message);
    }
    setGerandoExemplo(null);
  }

  const ctxLogo = { enviando, enviarLogo };
  const tipoSelInfo = TIPOS_RELATORIO.find(t => t.tipo === tipoSel);
  const ehRecibo = tipoSel === "recibo";
  const tiposPersonalizados = TIPOS_RELATORIO.filter(t => qtdPersonalizados(t.tipo) > 0);

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <LayoutAdmin>
      <div className="sa-wrapper" style={{ "--sa-font-scale": fontScale }}>

        <div className="sa-page-header">
          <div className="sa-page-header-left">
            <span className="sa-breadcrumb">🧾 Painel Administrativo</span>
            <h1 className="sa-page-title">Identidade dos <span>Relatórios</span></h1>
          </div>
          <div className="sa-page-actions">
            <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => changeFontScale(-0.1)} disabled={fontScale <= 0.8} title="Diminuir fonte">A−</button>
            <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => changeFontScale(0.1)}  disabled={fontScale >= 1.4} title="Aumentar fonte">A+</button>
            <button className="sa-btn sa-btn-ghost" onClick={() => navigate("/admin")}>← Voltar ao painel</button>
          </div>
        </div>

        {carregando ? (
          <div className="sa-loading"><div className="sa-spinner" /> Carregando...</div>
        ) : (
          <>
            <div className="sa-tabs">
              <button className={`sa-tab${aba === "padrao" ? " ativo" : ""}`} onClick={() => setAba("padrao")}>
                🧾 Padrão geral
              </button>
              <button className={`sa-tab${aba === "por_tipo" ? " ativo" : ""}`} onClick={() => setAba("por_tipo")}>
                🗂️ Por tipo de relatório{tiposPersonalizados.length > 0 ? ` (${tiposPersonalizados.length})` : ""}
              </button>
            </div>

            <div className="idr-adm-grade">

              {/* ── FORMULÁRIO ─────────────────────────────── */}
              <div className="idr-adm-coluna">

                {aba === "padrao" ? (
                  <>
                    <BoxCabecalho p={padrao} s={set} ctx={ctxLogo} refs={refs} />
                    <BoxRodape p={padrao} s={set} />
                    <BoxRecibo p={padrao} s={set} />
                  </>
                ) : (
                  <>
                    <div className="sa-config-box">
                      <div className="sa-config-header">
                        <div className="sa-config-header-left">
                          <span className="sa-config-icon">🗂️</span>
                          <div>
                            <div className="sa-config-title">Escolha o tipo de relatório</div>
                            <div className="sa-config-subtitle">
                              Mude só o que quiser diferente nele. O resto segue o padrão geral (e acompanha quando o padrão mudar).
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="sa-config-body">
                        <div className="idr-adm-tipos">
                          {TIPOS_RELATORIO.map(t => {
                            const n = qtdPersonalizados(t.tipo);
                            return (
                              <button
                                key={t.tipo}
                                type="button"
                                className={`idr-adm-tipo${tipoSel === t.tipo ? " ativo" : ""}${n ? " personalizado" : ""}`}
                                onClick={() => setTipoSel(t.tipo)}
                              >
                                <span>{t.label}</span>
                                {n > 0 && <span className="idr-adm-tipo-badge">{n}</span>}
                              </button>
                            );
                          })}
                        </div>
                        <div className="idr-adm-tipo-resumo">
                          <span className="sa-config-hint">
                            <strong>{tipoSelInfo?.label}</strong>:{" "}
                            {qtdPersonalizados(tipoSel) === 0
                              ? "segue 100% o padrão geral. Edite qualquer campo abaixo pra personalizar só este tipo."
                              : `${qtdPersonalizados(tipoSel)} campo(s) personalizado(s) — o resto segue o padrão geral.`}
                          </span>
                          {qtdPersonalizados(tipoSel) > 0 && (
                            <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => removerPersonalizacoesTipo(tipoSel)}>
                              ↺ Remover personalizações deste tipo
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {ehRecibo ? (
                      <BoxRecibo p={valoresTipo} s={setTipo} hf={hfTipo} comDadosLoja />
                    ) : (
                      <>
                        <BoxCabecalho p={valoresTipo} s={setTipo} hf={hfTipo} ctx={ctxLogo} refs={refs} />
                        <BoxRodape p={valoresTipo} s={setTipo} hf={hfTipo} />
                      </>
                    )}
                  </>
                )}

                {msg && <div className={`sa-config-msg ${msg.startsWith("❌") ? "erro" : "sucesso"}`}>{msg}</div>}

                <div className="idr-adm-acoes">
                  {aba === "padrao" && (
                    <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={restaurarPadraoFabrica} disabled={salvando}>
                      ↺ Valores de fábrica
                    </button>
                  )}
                  <button className="sa-btn sa-btn-primary" onClick={salvar} disabled={salvando || enviando !== null}>
                    {salvando ? "⏳ Salvando…" : alterado ? "✓ Salvar alterações" : "✓ Salvar"}
                  </button>
                </div>
                <span className="sa-config-hint" style={{ textAlign: "right" }}>
                  O botão Salvar grava as duas abas juntas.
                </span>
              </div>

              {/* ── PRÉVIA ─────────────────────────────────── */}
              <div className="idr-adm-coluna idr-adm-coluna-previa">
                <div className="sa-config-box">
                  <div className="sa-config-header">
                    <div className="sa-config-header-left">
                      <span className="sa-config-icon">👀</span>
                      <div>
                        <div className="sa-config-title">
                          Prévia ao vivo{aba === "por_tipo" ? ` — ${tipoSelInfo?.label}` : " — padrão geral"}
                        </div>
                        <div className="sa-config-subtitle">Mesmo molde dos relatórios de verdade{alterado ? " — ainda não salvo" : ""}.</div>
                      </div>
                    </div>
                  </div>
                  <div className="sa-config-body">
                    {!(aba === "por_tipo" && ehRecibo) && (
                      <>
                        <label className="idr-adm-chave">
                          <input type="checkbox" checked={mostrarLojaNaPrevia} onChange={e => setMostrarLojaNaPrevia(e.target.checked)} />
                          <span>Prévia como relatório de um estabelecimento (desmarque pra ver como sai num relatório do SuperAdmin)</span>
                        </label>
                        <iframe title="Prévia do relatório" className="idr-adm-iframe" srcDoc={previaHtml} sandbox="" />
                      </>
                    )}

                    <div className="idr-adm-recibo">
                      <div className="idr-adm-recibo-papel">
                        {rec.recibo_mostrar_logo_loja && <div className="idr-adm-recibo-logo">[logo da loja]</div>}
                        <div className="idr-adm-recibo-nome">{LOJA_EXEMPLO.nome}</div>
                        {rec.recibo_mostrar_dados_loja && (
                          <div className="idr-adm-recibo-info">
                            {[rec.mostrar_cnpj && `CNPJ ${LOJA_EXEMPLO.cnpj}`, rec.mostrar_telefone && `Tel. ${LOJA_EXEMPLO.telefone}`, rec.mostrar_email && LOJA_EXEMPLO.email].filter(Boolean).join(" · ")}
                            {rec.mostrar_endereco && <><br />{LOJA_EXEMPLO.endereco}</>}
                          </div>
                        )}
                        <div className="idr-adm-recibo-linha" />
                        <div className="idr-adm-recibo-item"><span>Arroz 5kg</span><span>R$ 27,90</span></div>
                        <div className="idr-adm-recibo-item"><strong>TOTAL</strong><strong>R$ 27,90</strong></div>
                        <div className="idr-adm-recibo-linha" />
                        {rec.recibo_mensagem && <div className="idr-adm-recibo-msg">{rec.recibo_mensagem}</div>}
                        {rec.recibo_rodape && <div className="idr-adm-recibo-info">{trocarMarcadores(rec.recibo_rodape)}</div>}
                      </div>
                      <span className="sa-config-hint">Prévia do recibo térmico (80mm){qtdPersonalizados("recibo") ? " — com as personalizações do tipo Recibo" : ""}.</span>
                    </div>

                    {!(aba === "por_tipo" && ehRecibo) && (
                      <>
                        <div className="idr-adm-acoes">
                          <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => baixarPdfExemplo("baixar")} disabled={gerandoExemplo !== null}>
                            {gerandoExemplo === "pdf" ? "⏳" : "📄"} PDF de exemplo
                          </button>
                          <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={() => baixarPdfExemplo("imprimir")} disabled={gerandoExemplo !== null}>
                            🖨️ Imprimir exemplo
                          </button>
                          <button className="sa-btn sa-btn-ghost sa-btn-sm" onClick={baixarExcelExemplo} disabled={gerandoExemplo !== null}>
                            {gerandoExemplo === "xlsx" ? "⏳" : "📊"} Excel de exemplo
                          </button>
                        </div>
                        <span className="sa-config-hint">Os exemplos usam o que está na tela agora, mesmo sem salvar.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </>
        )}
      </div>
    </LayoutAdmin>
  );
}
