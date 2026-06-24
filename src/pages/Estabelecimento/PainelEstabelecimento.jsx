// src/pages/Estabelecimento/PainelEstabelecimento.jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
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
import Inventario    from "./Inventario/Inventario";

/* ════════════════════════════════════════════════════════════ */
export default function PainelEstabelecimento() {
  const { id: estabelecimentoId } = useParams();
  const { user, profile }         = useAuth();

  const [abaAtiva,            setAbaAtiva]           = useState("pdv");
  const [nomeEstabelecimento, setNomeEstabelecimento] = useState("");
  const [logoUrl,             setLogoUrl]            = useState("");
  const [licencaInfo,         setLicencaInfo]        = useState(null); // { status_assinatura, data_vencimento }
  const [carregando,          setCarregando]         = useState(true);
  const [permissoes,          setPermissoes]         = useState([]); // [] = carregando, null = merchant

  const isMerchant = profile?.role === 'merchant';
  // null = merchant (acesso total); array = operador com permissões específicas
  const permsParaModulo = isMerchant ? null : permissoes;

  // Ref para o interceptor do PDV — preenchido pelo próprio PDV via prop onNavegar
  const pdvInterceptorRef = useRef(null);

  // Troca de aba com proteção: se o PDV tiver carrinho cheio, ele bloqueia
  const handleAbaChange = useCallback((novaAba) => {
    if (abaAtiva === 'pdv' && pdvInterceptorRef.current) {
      const podeSair = pdvInterceptorRef.current(novaAba);
      if (podeSair === false) return; // PDV vai mostrar o modal internamente
    }
    setAbaAtiva(novaAba);
  }, [abaAtiva]);

  // Callback passado ao PDV para registrar seu interceptor
  const registrarInterceptorPDV = useCallback((fn) => {
    pdvInterceptorRef.current = fn;
  }, []);

  /* ── Ouvir evento de navegação confirmada pelo PDV ─────── */
  useEffect(() => {
    function handlePdvNavegar(e) {
      setAbaAtiva(e.detail);
    }
    window.addEventListener('pdv-navegar', handlePdvNavegar);
    return () => window.removeEventListener('pdv-navegar', handlePdvNavegar);
  }, []);

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
          setNomeEstabelecimento(data.nome_fantasia || data.nome || "");
          setLogoUrl(data.logo_url || "");
          setLicencaInfo({
            status_assinatura: data.status_assinatura || null,
            data_vencimento:   data.data_vencimento   || null,
          });
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
            onNavegar={registrarInterceptorPDV}
            permissoes={permsParaModulo}
            isMerchant={isMerchant}
          />
        );

      case "estoque":
        return (
          <ProdutoList
            estabelecimentoId={estabelecimentoId}
            permissoes={permsParaModulo}
            isMerchant={isMerchant}
          />
        );

      case "clientes":
        return (
          <DividasList
            estabelecimentoId={estabelecimentoId}
            nomeEstabelecimento={nomeEstabelecimento}
            permissoes={permsParaModulo}
            isMerchant={isMerchant}
          />
        );

      case "financeiro":
        return (
          <Financeiro
            estabelecimentoId={estabelecimentoId}
            logoUrl={logoUrl}
            nomeFantasia={nomeEstabelecimento}
            permissoes={permsParaModulo}
            isMerchant={isMerchant}
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

      case "inventario":
        return (
          <Inventario
            estabelecimentoId={estabelecimentoId}
            nomeEstabelecimento={nomeEstabelecimento}
            permissoes={permsParaModulo}
            isMerchant={isMerchant}
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
      onAbaChange={handleAbaChange}
      nomeEstabelecimento={nomeEstabelecimento}
      logoUrl={logoUrl}
      permissoes={permissoes}
      licencaInfo={licencaInfo}
    >
      {renderModulo()}
    </LayoutEstabelecimento>
  );
}