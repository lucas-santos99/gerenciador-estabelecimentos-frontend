// src/pages/Estabelecimento/Clientes/ClienteModal.jsx
import { confirmar } from '../../../components/Dialogo/dialogo';
import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../utils/api';
import Dica from '../../../components/Notificacoes/Dica';
import Rastro from '../../../components/Rastro/Rastro';
import '../Clientes.css';
import ValidarDocumento from '../../../components/ValidarDocumento/ValidarDocumento';


const fmt = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Máscara "tipo calculadora": dígitos entram da direita pra esquerda,
// vírgula fixa em 2 casas — digita "5000" e já vira "50,00" sozinho.
function digitarValorMascarado(valorBruto) {
  const digitos = (valorBruto || '').replace(/\D/g, '').slice(-9);
  if (!digitos) return '';
  const numero = parseInt(digitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatarDataInput(s) {
  if (!s) return '';
  try { return s.includes('T') ? s.split('T')[0] : s; }
  catch { return ''; }
}

// Detecta CPF (até 11 dígitos) ou CNPJ (12-14 dígitos) pela quantidade
// digitada — mesmo padrão usado no PDV, campo único que troca de
// máscara sozinho conforme a pessoa digita.
function formatarCpfCnpj(valor) {
  const d = (valor || '').replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  }
  // CNPJ
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

/* ════════════════════════════════════════════════════════════ */
export default function ClienteModal({
  estabelecimentoId,
  cliente,
  onClose,
  onSalvo,
  onExcluido,
  fiadoAtivo = true,
}) {
  const isEdit = !!cliente;

  const [nome,           setNome]           = useState(cliente?.nome || '');
  const [telefone,       setTelefone]       = useState(cliente?.telefone || '');
  const [cpf,            setCpf]            = useState(formatarCpfCnpj(cliente?.cpf || ''));
  const [permiteFiado,   setPermiteFiado]   = useState(cliente?.permite_fiado !== false);
  const [semLimite,      setSemLimite]      = useState(
    !cliente || parseFloat(cliente?.limite_credito || 0) === 0
  );
  const [limiteCredito,  setLimiteCredito]  = useState(
    parseFloat(cliente?.limite_credito || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  );
  const [dataVencimento, setDataVencimento] = useState(formatarDataInput(cliente?.data_vencimento));
  const [vencRecorrente, setVencRecorrente] = useState(cliente?.vencimento_ciclo || (cliente?.vencimento_recorrente ? 'mensal' : ''));
  const [salvando,       setSalvando]       = useState(false);
  const [erro,           setErro]           = useState('');

  const nomeRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nomeRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  /* ── Salvar ──────────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) { setErro('O nome do cliente é obrigatório.'); return; }
    setSalvando(true);
    setErro('');

    const url    = isEdit
      ? `/api/clientes/atualizar/${encodeURIComponent(cliente.id)}`
      : `/api/clientes/criar`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const resp = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estabelecimentoId,
          nome:          nome.trim(),
          telefone:      telefone.trim() || null,
          cpf:           cpf.replace(/\D/g, '') || null,
          permiteFiado,
          limiteCredito: semLimite ? '0' : limiteCredito.replace(/\./g, '').replace(',', '.'),
          dataVencimento: dataVencimento || null,
          vencimentoCiclo: dataVencimento ? (vencRecorrente || null) : null,
        }),
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

  /* ── Excluir ─────────────────────────────────────────────── */
  async function excluir() {
    if (!isEdit) return;
    if (parseFloat(cliente.saldo_devedor) > 0.01) {
      setErro('Não é possível excluir cliente com dívida pendente.');
      return;
    }
    if (!(await confirmar({ titulo: 'Excluir cliente?', texto: `"${cliente.nome}" será excluído. Esta ação é irreversível.`, perigo: true, botao: 'Excluir' }))) return;
    setSalvando(true);
    try {
      const resp = await apiFetch(`/api/clientes/deletar/${encodeURIComponent(cliente.id)}`,
        { method: 'DELETE' }
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao excluir');
      onExcluido?.();
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
      <div className="cli-modal">

        <div className="cli-modal-titulo">
          {isEdit ? `✏️ Editar — ${cliente.nome}` : '➕ Novo cliente'}
        </div>

        {erro && <div className="cli-modal-erro">⚠️ {erro}</div>}

        <form onSubmit={salvar} className="cli-modal-form">

          {/* Dados pessoais */}
          <div>
            {isEdit && cliente.codigo_cliente && (
              <div className="cli-form-small" style={{ marginBottom: 10 }}>
                🔖 Código do cliente: <strong>#{cliente.codigo_cliente}</strong> — útil pra localizar rápido no PDV
              </div>
            )}
            <div className="cli-form-group">
              <label className="cli-form-label">Nome completo *</label>
              <input maxLength={100}
                ref={nomeRef}
                className="cli-form-input"
                type="text"
                placeholder="Nome do cliente"
                value={nome}
                onChange={e => setNome(e.target.value)}
                required
                disabled={salvando}
              />
            </div>
            <div className="cli-form-group">
              <label className="cli-form-label">Telefone</label>
              <input maxLength={20}
                className="cli-form-input"
                type="text"
                placeholder="(00) 00000-0000"
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                disabled={salvando}
              />
            </div>
            <div className="cli-form-group">
              <label className="cli-form-label">CPF ou CNPJ (opcional)</label>
              <input maxLength={18}
                className="cli-form-input"
                type="text"
                placeholder="CPF ou CNPJ"
                value={cpf}
                onChange={e => setCpf(formatarCpfCnpj(e.target.value))}
                disabled={salvando}
              />
              <ValidarDocumento valor={cpf} tipo="auto" nomeAtual={nome} classeBotao="cli-btn"
                onEncontrar={e => setNome(e.nome)} />
              <span className="cli-form-small">
                Ajuda a localizar o cliente rápido no PDV, mesmo quem não usa fiado.
              </span>
            </div>
          </div>

          {/* Config fiado — só aparece se o módulo estiver ativo pro estabelecimento */}
          {fiadoAtivo && (
          <div className="cli-modal-section">
            <div className="cli-modal-section-titulo">💳 Configurações do Fiado</div>

            <div className="cli-form-group">
              <label className="cli-form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={permiteFiado} onChange={e => setPermiteFiado(e.target.checked)} disabled={salvando} />
                Esse cliente pode comprar fiado
              </label>
              <span className="cli-form-small">
                {permiteFiado
                  ? 'Vai aparecer na busca de fiado do PDV, com o limite e o vencimento que você definir abaixo.'
                  : 'Cliente cadastrado só pra identificação e histórico — não vai aparecer na busca de fiado do PDV.'}
              </span>
            </div>

            {permiteFiado && (
            <>
            <div className="cli-form-group">
              <label className="cli-form-label">Limite de crédito <Dica texto="Até quanto esse cliente pode ficar devendo no fiado. Serve de alerta, não de trava: o sistema não impede a venda. Numa venda fiada comum, o PDV avisa que o limite foi passado e pergunta se quer continuar." /></label>
              <div className="cli-limite-toggle">
                <button
                  type="button"
                  className={`cli-limite-btn${semLimite ? ' ativo' : ''}`}
                  onClick={() => setSemLimite(true)}
                  disabled={salvando}
                >
                  ∞ Sem limite
                </button>
                <button
                  type="button"
                  className={`cli-limite-btn${!semLimite ? ' ativo' : ''}`}
                  onClick={() => setSemLimite(false)}
                  disabled={salvando}
                >
                  R$ Definir limite
                </button>
              </div>
              {!semLimite && (
                <input maxLength={15}
                  className="cli-form-input"
                  type="text"
                  placeholder="0,00"
                  value={limiteCredito}
                  onChange={e => setLimiteCredito(digitarValorMascarado(e.target.value))}
                  disabled={salvando}
                  style={{ marginTop: 8 }}
                />
              )}
              {semLimite && (
                <span className="cli-form-small">Cliente pode comprar fiado sem limite de valor — o PDV não mostra aviso nenhum.</span>
              )}
            </div>

            <div className="cli-form-group">
              <label className="cli-form-label">Data de vencimento (opcional)</label>
              <input
                className="cli-form-input"
                type="date"
                value={dataVencimento}
                onChange={e => setDataVencimento(e.target.value)}
                disabled={salvando}
              />
              <span className="cli-form-small">
                Dia combinado pra esse cliente pagar o fiado. Perto dessa data e depois dela, o sistema avisa nesta tela e nas notificações, enquanto houver dívida.
              </span>
              {dataVencimento && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, fontSize: '0.85rem' }}>
                  <span>
                    🔁 Repetir o vencimento
                    <Dica texto="Quando a data passar e o cliente estiver sem dívida, o vencimento pula sozinho: +7 dias (semanal), +15 dias (quinzenal) ou o mesmo dia do mês seguinte (mensal; dia 31 vira o último dia dos meses menores). Se ainda houver dívida pendente, a data fica como está e continua avisando — só renova depois que tudo for pago." />
                  </span>
                  <select className="cli-form-input" value={vencRecorrente} onChange={e => setVencRecorrente(e.target.value)} disabled={salvando}>
                    <option value="">Não repetir</option>
                    <option value="semanal">Toda semana (a cada 7 dias)</option>
                    <option value="quinzenal">A cada 15 dias</option>
                    <option value="mensal">Todo mês (mesmo dia)</option>
                  </select>
                </label>
              )}
            </div>
            </>
            )}
          </div>
          )}

          {/* Dívida atual no modo editar — só faz sentido com fiado ativo */}
          {isEdit && fiadoAtivo && (
            <div className={`cli-saldo-info${parseFloat(cliente.saldo_devedor) > 0.01 ? ' devedor' : ' ok'}`}>
              {parseFloat(cliente.saldo_devedor) > 0.01 ? `Dívida atual: ${fmt(cliente.saldo_devedor)}` : '✓ Sem dívida'}
            </div>
          )}

          {/* Quem cadastrou / quem alterou por último (só ao editar) */}
          {isEdit && <Rastro entidade="cliente" id={cliente.id} />}

          {/* Ações */}
          <div className="cli-modal-acoes">
            {isEdit && parseFloat(cliente.saldo_devedor) <= 0.01 && (
              <button
                type="button"
                className="cli-modal-btn-excluir"
                onClick={excluir}
                disabled={salvando}
                title="Excluir cliente"
                aria-label="Excluir cliente"
              >
                🗑
              </button>
            )}
            <button
              type="button"
              className="cli-modal-btn-cancelar"
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar (Esc)
            </button>
            <button
              type="submit"
              className="cli-modal-btn-salvar"
              disabled={salvando}
            >
              {salvando
                ? '⏳ Salvando…'
                : isEdit ? '✓ Salvar alterações' : '✓ Criar cliente'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}