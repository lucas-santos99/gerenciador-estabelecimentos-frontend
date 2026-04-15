// src/pages/Estabelecimento/PainelEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";
import LayoutEstabelecimento from "./Painel/LayoutEstabelecimento";

// ── Módulos (serão criados um a um) ────────────────────────────
import PDV          from "./PDV/PDV";
// import ProdutoList  from "./Estoque/ProdutoList";
// import DividasList  from "./Clientes/DividasList";
// import Financeiro   from "./Financeiro/Financeiro";
// import Configuracoes from "./Configuracoes/Configuracoes";

const API_URL = import.meta.env.VITE_API_URL;

/* ── Placeholder temporário enquanto módulos não existem ────── */
function ModuloEmBreve({ nome, icone, descricao }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      gap: 16,
      color: "var(--est-text-soft)",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      textAlign: "center",
      padding: 32,
    }}>
      <span style={{ fontSize: "3rem" }}>{icone}</span>
      <div style={{
        fontSize: "1.4rem",
        fontWeight: 800,
        color: "var(--est-text)",
        letterSpacing: "-0.02em",
      }}>
        {nome}
      </div>
      <div style={{ fontSize: "0.875rem", maxWidth: 340, lineHeight: 1.6 }}>
        {descricao}
      </div>
      <div style={{
        marginTop: 8,
        padding: "6px 16px",
        borderRadius: 20,
        background: "var(--est-accent-dim)",
        color: "var(--est-accent)",
        fontSize: "0.75rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        Em desenvolvimento
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function PainelEstabelecimento() {
  const { id: estabelecimentoId } = useParams();
  const { user, profile }         = useAuth();

  const [abaAtiva,           setAbaAtiva]           = useState("pdv");
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState("");
  const [logoUrl,             setLogoUrl]             = useState("");
  const [carregando,          setCarregando]          = useState(true);

  /* ── Carregar dados do estabelecimento ───────────────────── */
  useEffect(() => {
    async function carregarDados() {
      if (!estabelecimentoId) return;
      setCarregando(true);
      try {
        const resp = await fetch(
          `${API_URL}/api/estabelecimentos/dados/${estabelecimentoId}`
        );
        if (resp.ok) {
          const data = await resp.json();
          setNomeEstabelecimento(data.nome_fantasia || "");
          setLogoUrl(data.logo_url || "");
        }
      } catch (err) {
        console.error("Erro ao carregar dados do estabelecimento:", err);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, [estabelecimentoId]);

  /* ── Atualizar logo (callback do módulo Config) ──────────── */
  function handleLogoAtualizada(novaUrl) {
    setLogoUrl(novaUrl);
  }

  /* ── Renderizar módulo ativo ─────────────────────────────── */
  function renderModulo() {
    switch (abaAtiva) {
      case "pdv":
        return (
          <PDV
            estabelecimentoId={estabelecimentoId}
          />
        );
        
        /*
        return (
          <ModuloEmBreve
            nome="PDV (Caixa)"
            icone="🛒"
            descricao="Registre vendas rapidamente. Suporte a código de barras, fiado, troco e múltiplos meios de pagamento. Atalho: F2"
          />
        );
        */
      case "estoque":
        /* return (
          <ProdutoList
            estabelecimentoId={estabelecimentoId}
          />
        ); */
        return (
          <ModuloEmBreve
            nome="Estoque"
            icone="📦"
            descricao="Gerencie produtos, categorias, preços e controle de estoque mínimo. Exportação para Excel. Atalho: F3"
          />
        );

      case "clientes":
        /* return (
          <DividasList
            estabelecimentoId={estabelecimentoId}
          />
        ); */
        return (
          <ModuloEmBreve
            nome="Clientes / Fiado"
            icone="👥"
            descricao="Cadastre clientes, controle fiado, histórico de compras e limite de crédito. Atalho: F4"
          />
        );

      case "financeiro":
        /* return (
          <Financeiro
            estabelecimentoId={estabelecimentoId}
          />
        ); */
        return (
          <ModuloEmBreve
            nome="Financeiro"
            icone="💰"
            descricao="Resumo do dia, contas a pagar e a receber, relatório DRE e fluxo de caixa. Atalho: F5"
          />
        );

      case "config":
        /* return (
          <Configuracoes
            estabelecimentoId={estabelecimentoId}
            onLogoAtualizada={handleLogoAtualizada}
            logoUrl={logoUrl}
          />
        ); */
        return (
          <ModuloEmBreve
            nome="Configurações"
            icone="⚙️"
            descricao="Dados do estabelecimento, logo, CNPJ, telefone e endereço. Atalho: F6"
          />
        );

      default:
        return null;
    }
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (carregando) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando estabelecimento...
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <LayoutEstabelecimento
      abaAtiva={abaAtiva}
      onAbaChange={setAbaAtiva}
      nomeEstabelecimento={nomeEstabelecimento}
      logoUrl={logoUrl}
    >
      {renderModulo()}
    </LayoutEstabelecimento>
  );
}