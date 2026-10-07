// Botão opcional "Validar" ao lado do campo CPF/CNPJ.
// - Confere o dígito verificador (CPF ou CNPJ). Salvar NUNCA depende dele,
//   então dá para cadastrar dados inventados em testes.
// - Se for um CNPJ válido e a tela passar `onEncontrar`, consulta a Receita
//   (via backend) e traz o nome da empresa: preenche sozinho quando o nome
//   ainda está vazio; se já tem nome, oferece o botão "Usar este nome".
//
//   <ValidarDocumento valor={form.cnpj} tipo="cnpj" nomeAtual={form.nome}
//                     onEncontrar={e => …} />
// tipo: 'cpf' | 'cnpj' | 'auto' (decide pela quantidade de dígitos digitados)
// classeBotao: classe do botão (padrão das telas do SuperAdmin; nas telas da loja use 'cli-btn')
// onEncontrar recebe { nome, razao_social } (nome = fantasia, ou razão social).
import React, { useEffect, useState } from 'react';
import { verificarDocumento } from '../../utils/documento';
import { apiFetch } from '../../utils/api';
import Dica from '../Notificacoes/Dica';

export default function ValidarDocumento({ valor, tipo = 'auto', nomeAtual = '', onEncontrar, classeBotao = 'est-btn est-btn-ghost' }) {
  const [resultado, setResultado] = useState(null);
  const [empresa,   setEmpresa]   = useState(null);   // { nome, razao_social, situacao } | { naoEncontrada } | { falhou }
  const [preenchido, setPreenchido] = useState(false);
  const [buscando,  setBuscando]  = useState(false);

  const digitos = String(valor || '').replace(/\D/g, '');
  const tipoEfetivo = tipo === 'auto' ? (digitos.length > 11 ? 'cnpj' : 'cpf') : tipo;
  const rotulo = tipoEfetivo === 'cnpj' ? 'CNPJ' : 'CPF';

  // Mudou o número ou o tipo: o resultado anterior deixa de valer.
  useEffect(() => { setResultado(null); setEmpresa(null); setPreenchido(false); }, [valor, tipo]);

  async function validar() {
    const r = verificarDocumento(valor, tipoEfetivo);
    setResultado(r);
    setEmpresa(null);
    setPreenchido(false);
    if (!r.ok || tipoEfetivo !== 'cnpj' || !onEncontrar) return;

    setBuscando(true);
    try {
      const resp = await apiFetch(`/api/consulta/cnpj/${digitos}`);
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) { setEmpresa({ falhou: true }); return; }
      if (!j.encontrado) { setEmpresa({ naoEncontrada: true }); return; }
      const dados = {
        nome: j.nome_fantasia || j.razao_social || '',
        razao_social: j.razao_social || '',
        situacao: j.situacao || '',
      };
      setEmpresa(dados);
      if (dados.nome && !String(nomeAtual || '').trim()) {
        onEncontrar({ nome: dados.nome, razao_social: dados.razao_social });
        setPreenchido(true);
      }
    } catch {
      setEmpresa({ falhou: true });
    } finally {
      setBuscando(false);
    }
  }

  const situacaoAtiva = !empresa?.situacao || /ativ/i.test(empresa.situacao);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={classeBotao} onClick={validar} disabled={buscando}>
          {buscando ? '⏳ Consultando…' : `✓ Validar ${rotulo}`}
        </button>
        <Dica texto="Confere se o número existe de verdade (dígitos verificadores). É opcional: salvar não depende disso, então dá para cadastrar dados de teste. Em CNPJ válido, também busca o nome da empresa na Receita para preencher o cadastro." />
        {resultado && (
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: resultado.ok ? '#16a34a' : '#d97706' }}>
            {resultado.ok ? '✅' : '⚠️'} {resultado.mensagem}
          </span>
        )}
      </div>

      {empresa && !empresa.falhou && !empresa.naoEncontrada && (
        <div style={{ marginTop: 6, fontSize: '0.78rem' }}>
          <div>
            🏢 <strong>{empresa.nome || empresa.razao_social}</strong>
            {empresa.nome && empresa.razao_social && empresa.nome !== empresa.razao_social ? ` (${empresa.razao_social})` : ''}
            {empresa.situacao && (
              <span style={{ color: situacaoAtiva ? '#16a34a' : '#d97706', fontWeight: 600 }}> · Situação: {empresa.situacao}</span>
            )}
          </div>
          {preenchido ? (
            <div style={{ opacity: 0.75 }}>Nome preenchido automaticamente.</div>
          ) : (
            <button
              type="button" className={classeBotao} style={{ marginTop: 4 }}
              onClick={() => { onEncontrar({ nome: empresa.nome, razao_social: empresa.razao_social }); setPreenchido(true); }}
            >
              Usar este nome
            </button>
          )}
        </div>
      )}
      {empresa?.naoEncontrada && (
        <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#d97706' }}>
          ⚠️ CNPJ com dígitos válidos, mas não encontrado na Receita.
        </div>
      )}
      {empresa?.falhou && (
        <div style={{ marginTop: 6, fontSize: '0.78rem', opacity: 0.75 }}>
          Não consegui buscar o nome agora (serviço da Receita indisponível). Os dígitos estão corretos; preencha o nome à mão.
        </div>
      )}
    </div>
  );
}
