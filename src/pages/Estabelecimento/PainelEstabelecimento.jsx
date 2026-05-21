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
import OperadoresEstabelecimento from "./Operadores/OperadoresEstabelecimento";
import Relatorios    from "./Relatorios/Relatorios";

/* ════════════════════════════════════════════════════════════ */
export default function PainelEstabelecimento() {
  const { id: estabelecimentoId } = useParams();
  const { user, profile }         = useAuth();

  const [abaAtiva,            setAbaAtiva]           = useState("pdv");
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState("");
  const [logoUrl,             setLogoUrl]            = useState("");
  const [carregando,          setCarregando]         = useState(true);
  const [permissoes,          setPermissoes]         = useState([]); // [] = carregando, null = merchant

  const isMerchant = profile?.role === 'merchant';

  /* ── Carregar dados do estabelecimento + permissões ─────── */
  useEffect(() => {
    async function carregarDados() {
      if (!estabelecimentoId) return;
      setCarregando(true);
      try {
        const promises = [
          apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`),
        ];

        // Operadores carregam permissões
        if (!isMerchant) {
          promises.push(apiFetch('/api/operadores/minhas-permissoes'));
        }

        const [respDados, respPerms] = await Promise.all(promises);

        if (respDados.ok) {
          const data = await respDados.json();
          setNomeEstabelecimento(data.nome_fantasia || "");
          setLogoUrl(data.logo_url || "");
        }

        if (respPerms && respPerms.ok) {
          const perms = await respPerms.json();
          setPermissoes(perms);

          // Redirecionar para primeira aba permitida se pdv não estiver liberado
          if (!perms.includes('pdv') && perms.length > 0) {
            setAbaAtiva(perms[0]);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        setCarregando(false);
      }
    }
    carregarDados();
  }, [estabelecimentoId, isMerchant]);

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
            nomeEstabelecimento={nomeEstabelecimento}
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
            nomeEstabelecimento={nomeEstabelecimento}
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

      case "relatorios":
        return (
          <Relatorios
            estabelecimentoId={estabelecimentoId}
            nomeEstabelecimento={nomeEstabelecimento}
            logoUrl={logoUrl}
          />
        );

      case "operadores":
        return (
          <OperadoresEstabelecimento
            estabelecimentoId={estabelecimentoId}
          />
        );

      default:
        return (
          <PDV
            estabelecimentoId={estabelecimentoId}
            nomeEstabelecimento={nomeEstabelecimento}
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
      permissoes={permissoes}
    >
      {renderModulo()}
    </LayoutEstabelecimento>
  );
}