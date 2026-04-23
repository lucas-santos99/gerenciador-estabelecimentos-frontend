// src/pages/Estabelecimento/PainelEstabelecimento.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthProvider";
import { apiFetch } from "../../utils/api";
import LayoutEstabelecimento from "./Painel/LayoutEstabelecimento";

import PDV           from "./PDV/PDV";
import ProdutoList   from "./Estoque/ProdutoList";
import DividasList   from "./Clientes/DividasList";
import Financeiro    from "./Financeiro/Financeiro";
import Configuracoes from "./Configuracoes/Configuracoes";

/* ════════════════════════════════════════════════════════════ */
export default function PainelEstabelecimento() {
  const { id: estabelecimentoId } = useParams();
  const { user, profile }         = useAuth();

  const [abaAtiva,            setAbaAtiva]           = useState("pdv");
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState("");
  const [logoUrl,             setLogoUrl]            = useState("");
  const [carregando,          setCarregando]         = useState(true);

  /* ── Carregar dados do estabelecimento ───────────────────── */
  useEffect(() => {
    async function carregarDados() {
      if (!estabelecimentoId) return;
      setCarregando(true);
      try {
        const resp = await apiFetch(
          `/api/estabelecimentos/dados/${estabelecimentoId}`
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

  /* ── Callback quando logo é atualizada nas configurações ─── */
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

      case "estoque":
        return (
          <ProdutoList
            estabelecimentoId={estabelecimentoId}
          />
        );

      case "clientes":
        return (
          <DividasList
            estabelecimentoId={estabelecimentoId}
          />
        );

      case "financeiro":
        return (
          <Financeiro
            estabelecimentoId={estabelecimentoId}
            logoUrl={logoUrl}
            nomeFantasia={nomeEstabelecimento}
          />
        );

      case "config":
        return (
          <Configuracoes
            estabelecimentoId={estabelecimentoId}
            onLogoAtualizada={handleLogoAtualizada}
            logoUrl={logoUrl}
          />
        );

      default:
        return (
          <PDV
            estabelecimentoId={estabelecimentoId}
          />
        );
    }
  }

  /* ── Loading inicial ─────────────────────────────────────── */
  if (carregando) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando estabelecimento…
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