// src/components/Rastro/Rastro.jsx
// Linha discreta "Cadastrado por … · Alterado por …" de um cadastro.
//
// Uso (dentro da tela/modal de EDIÇÃO, perto do rodapé):
//   <Rastro entidade="produto" id={produto.id} />
// entidade: produto | cliente | fornecedor | categoria | operador | conta |
//           estabelecimento | comunicado | contato_suporte
// `versao` (opcional): mude o valor para buscar de novo (ex.: depois de salvar
// sem fechar a tela).
//
// Busca sozinho em GET /api/rastro/:entidade/:id. Não mostra NADA enquanto
// carrega, se der erro ou se o cadastro não tiver nenhuma informação
// guardada — é só informação, nunca atrapalha a tela.
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../utils/api';
import './Rastro.css';

function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function frase(verbo, por, em) {
  const data = quando(em);
  if (!por && !data) return null;
  return (
    <span className="rastro-item">
      {verbo}{por ? <> por <strong>{por}</strong></> : null}{data ? <> em {data}</> : null}
    </span>
  );
}

export default function Rastro({ entidade, id, versao = 0, className = '' }) {
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    if (!entidade || !id) return undefined;
    (async () => {
      try {
        const resp = await apiFetch(`/api/rastro/${entidade}/${id}`);
        if (!resp.ok) return;
        const j = await resp.json();
        if (vivo) setDados(j);
      } catch { /* sem rastro: não mostra nada */ }
    })();
    return () => { vivo = false; };
  }, [entidade, id, versao]);

  if (!dados || !dados.disponivel) return null;

  const criado   = frase('Cadastrado', dados.criado_por, dados.criado_em);
  // "Alterado" só aparece se houve alteração depois do cadastro
  const alterado = dados.atualizado_em ? frase('Última alteração', dados.atualizado_por, dados.atualizado_em) : null;
  if (!criado && !alterado) return null;

  return (
    <div className={`rastro-linha ${className}`.trim()} title="Registro de quem cadastrou e de quem fez a última alteração">
      <span className="rastro-icone" aria-hidden="true">🕘</span>
      {criado}
      {criado && alterado && <span className="rastro-sep" aria-hidden="true">·</span>}
      {alterado}
    </div>
  );
}
