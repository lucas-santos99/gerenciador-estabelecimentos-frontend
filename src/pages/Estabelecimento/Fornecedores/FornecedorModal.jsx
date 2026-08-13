// src/pages/Estabelecimento/Fornecedores/FornecedorModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import '../Clientes.css';
import './Fornecedores.css';

const CONDICOES_PAGAMENTO = [
  { value: 'a_vista', label: 'À vista' },
  { value: '7_dias',  label: '7 dias' },
  { value: '15_dias', label: '15 dias' },
  { value: '30_dias', label: '30 dias' },
  { value: '45_dias', label: '45 dias' },
  { value: '60_dias', label: '60 dias' },
  { value: 'personalizado', label: 'Personalizado (dias)' },
  { value: 'outro',   label: 'Outro / combinar' },
];
const PRESETS_VALORES = CONDICOES_PAGAMENTO.map(c => c.value);

// Extrai o número de dias de um valor tipo "12_dias" — só quando NÃO
// é um dos presets fixos (7/15/30/45/60), ou seja, foi digitado como
// personalizado antes.
function extrairDiasPersonalizado(valor) {
  if (!valor || PRESETS_VALORES.includes(valor)) return '';
  const m = /^(\d+)_dias$/.exec(valor);
  return m ? m[1] : '';
}

function formatarTelefone(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
}

function formatarCnpjCpf(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4').trim();
  }
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5').trim();
}

/* ════════════════════════════════════════════════════════════ */
export default function FornecedorModal({ fornecedor, onClose, onSalvo, fontScale = 1 }) {
  const isEdit = !!fornecedor;

  const [form, setForm] = useState({
    nome:               fornecedor?.nome               || '',
    razao_social:       fornecedor?.razao_social        || '',
    cnpj_cpf:           formatarCnpjCpf(fornecedor?.cnpj_cpf || ''),
    telefone:           formatarTelefone(fornecedor?.telefone || ''),
    whatsapp:           formatarTelefone(fornecedor?.whatsapp || ''),
    email:              fornecedor?.email               || '',
    endereco:           fornecedor?.endereco             || '',
    contato_nome:       fornecedor?.contato_nome         || '',
    prazo_entrega_dias: fornecedor?.prazo_entrega_dias   || '',
    condicao_pagamento: fornecedor?.condicao_pagamento   || 'a_vista',
    observacoes:        fornecedor?.observacoes          || '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState('');
  const [diasPersonalizado, setDiasPersonalizado] = useState(() => extrairDiasPersonalizado(fornecedor?.condicao_pagamento));

  // O <select> mostra "personalizado" sempre que o valor salvo não bate
  // com nenhum preset fixo (ex: veio "12_dias" de um cadastro anterior)
  const condicaoSelect = PRESETS_VALORES.includes(form.condicao_pagamento) ? form.condicao_pagamento : 'personalizado';

  const nomeRef = useRef(null);

  useEffect(() => { setTimeout(() => nomeRef.current?.focus(), 0); }, []);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  function atualizar(e) {
    const { name, value } = e.target;
    const v = name === 'telefone' || name === 'whatsapp' ? formatarTelefone(value)
      : name === 'cnpj_cpf' ? formatarCnpjCpf(value)
      : value;
    setForm(prev => ({ ...prev, [name]: v }));
  }

  function alterarCondicaoSelect(e) {
    const novo = e.target.value;
    if (novo === 'personalizado') {
      // Já entra usando o número que tiver digitado (ou vazio, corrige no salvar)
      setForm(prev => ({ ...prev, condicao_pagamento: diasPersonalizado ? `${diasPersonalizado}_dias` : '' }));
    } else {
      setDiasPersonalizado('');
      setForm(prev => ({ ...prev, condicao_pagamento: novo }));
    }
  }

  function alterarDiasPersonalizado(e) {
    const num = e.target.value.replace(/\D/g, '');
    setDiasPersonalizado(num);
    setForm(prev => ({ ...prev, condicao_pagamento: num ? `${num}_dias` : '' }));
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('O nome do fornecedor é obrigatório.'); return; }
    if (condicaoSelect === 'personalizado' && !diasPersonalizado) {
      setErro('Informe o número de dias da condição personalizada.');
      return;
    }
    setSalvando(true);
    setErro('');

    const url    = isEdit ? `/api/fornecedores/${fornecedor.id}` : `/api/fornecedores`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar');
      onSalvo?.();
      onClose();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="cli-modal-overlay">
      <div className="cli-modal forn-zoom-scope" style={{ maxWidth: 560, '--forn-font-scale': fontScale }}>

        <div className="cli-modal-titulo">
          {isEdit ? `✏️ Editar — ${fornecedor.nome}` : '🚚 Novo fornecedor'}
        </div>

        {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="cli-modal-form">

          <div className="forn-form-grid">
            <div className="cli-form-group forn-full">
              <label className="cli-form-label">Nome do fornecedor *</label>
              <input maxLength={100} ref={nomeRef} className="cli-form-input" name="nome"
                value={form.nome} onChange={atualizar} required />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Razão social</label>
              <input maxLength={150} className="cli-form-input" name="razao_social" value={form.razao_social} onChange={atualizar} />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">CNPJ/CPF</label>
              <input maxLength={18} className="cli-form-input" name="cnpj_cpf" value={form.cnpj_cpf} onChange={atualizar} />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Telefone</label>
              <input maxLength={20} className="cli-form-input" name="telefone" value={form.telefone} onChange={atualizar} placeholder="(00) 00000-0000" />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">WhatsApp</label>
              <input maxLength={20} className="cli-form-input" name="whatsapp" value={form.whatsapp} onChange={atualizar} placeholder="(00) 00000-0000" />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">E-mail</label>
              <input maxLength={150} className="cli-form-input" type="email" name="email" value={form.email} onChange={atualizar} />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Nome do contato</label>
              <input maxLength={100} className="cli-form-input" name="contato_nome" value={form.contato_nome} onChange={atualizar} placeholder="Ex: vendedor, representante" />
            </div>

            <div className="cli-form-group forn-full">
              <label className="cli-form-label">Endereço</label>
              <input maxLength={200} className="cli-form-input" name="endereco" value={form.endereco} onChange={atualizar} />
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Condição de pagamento padrão</label>
              <select className="cli-form-input" name="condicao_pagamento" value={condicaoSelect} onChange={alterarCondicaoSelect}>
                {CONDICOES_PAGAMENTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {condicaoSelect === 'personalizado' && (
              <div className="cli-form-group">
                <label className="cli-form-label">Quantos dias?</label>
                <input className="cli-form-input" type="number" min="1" inputMode="numeric"
                  value={diasPersonalizado} onChange={alterarDiasPersonalizado} placeholder="Ex: 21" />
              </div>
            )}

            <div className="cli-form-group">
              <label className="cli-form-label">Prazo médio de entrega (dias)</label>
              <input className="cli-form-input" type="number" min="0" name="prazo_entrega_dias"
                value={form.prazo_entrega_dias} onChange={atualizar} placeholder="Ex: 3" />
            </div>

            <div className="cli-form-group forn-full">
              <label className="cli-form-label">Observações</label>
              <textarea maxLength={500} className="cli-form-input" name="observacoes" rows={2} value={form.observacoes} onChange={atualizar} />
            </div>
          </div>

          <div className="cli-modal-acoes">
            <button type="button" className="cli-modal-btn-cancelar" onClick={onClose} disabled={salvando}>
              Cancelar (Esc)
            </button>
            <button type="submit" className="cli-modal-btn-salvar" disabled={salvando}>
              {salvando ? '⏳ Salvando…' : isEdit ? '✓ Salvar alterações' : '✓ Cadastrar fornecedor'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}