import React, { useMemo, useState } from 'react';
import { paraDataStrTZ, TIMEZONE_PADRAO } from '../utils/fusoHorario';
import './HistoricoRenovacoes.css';

const fmtMoeda = (v) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtDataHora = (iso) => {
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return '—'; }
};

const FORMAS = {
  pix:       { rotulo: 'Pix',        cls: 'pix' },
  cartao:    { rotulo: 'Cartão',     cls: 'cartao' },
  cortesia:  { rotulo: 'Cortesia',   cls: 'cortesia' },
  liberacao: { rotulo: 'Liberação',  cls: 'cortesia' },
  estorno:   { rotulo: 'Estorno',    cls: 'estorno' },
  dinheiro:  { rotulo: 'Dinheiro',   cls: 'outro' },
  transferencia: { rotulo: 'Transferência', cls: 'outro' },
};
const STATUS = {
  pago:      { rotulo: '✓ Pago',      cls: 'ok' },
  estornado: { rotulo: '↩ Estornado', cls: 'estornado' },
  pendente:  { rotulo: '⏳ Pendente', cls: 'pendente' },
};

// Linha do tempo de renovações da assinatura. `admin` mostra também o motivo
// e quem liberou (liberações manuais) — o dono da loja não recebe esses campos.
export default function HistoricoRenovacoes({ linhas: todas, admin = false, timezone = TIMEZONE_PADRAO, vazio = 'Nenhuma renovação registrada ainda.' }) {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const invertido = !!(de && ate && de > ate);
  const linhas = useMemo(() => (todas || []).filter(l => {
    if (!de && !ate) return true;
    const dia = paraDataStrTZ(new Date(l.data), timezone);
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  }), [todas, de, ate, timezone]);
  if (!todas || todas.length === 0) return <div className="hren-vazio">{vazio}</div>;
  return (
    <div className="hren-wrap">
      <div className="hren-filtro">
        <label>De <input type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
        <label>Até <input type="date" value={ate} onChange={e => setAte(e.target.value)} /></label>
        {(de || ate) && <button type="button" className="hren-filtro-limpar" onClick={() => { setDe(''); setAte(''); }}>✕ Limpar filtro</button>}
        <span className="hren-filtro-qtd">{linhas.length} de {todas.length} registro(s)</span>
      </div>
      {invertido && <div className="hren-vazio">A data inicial é maior que a final. Ajuste o período.</div>}
      {!invertido && linhas.length === 0 && <div className="hren-vazio">Nenhuma renovação neste período.</div>}
      {!invertido && linhas.length > 0 && (
      <table className="hren-tabela">
        <thead>
          <tr>
            <th>Data</th>
            <th>Forma</th>
            <th>Dias</th>
            <th>Valor</th>
            <th>Vencimento</th>
            <th>Situação</th>
            {admin && <th>Detalhes</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => {
            const f = FORMAS[l.forma] || { rotulo: l.forma || '—', cls: 'outro' };
            const s = STATUS[l.status] || { rotulo: l.status, cls: 'outro' };
            return (
              <tr key={l.id} className={l.status === 'estornado' ? 'hren-estornado' : ''}>
                <td className="hren-mono">{fmtDataHora(l.data)}</td>
                <td><span className={`hren-chip hren-forma-${f.cls}`}>{f.rotulo}</span></td>
                <td className="hren-mono">{l.dias != null ? `${l.dias}d` : '—'}</td>
                <td className="hren-mono">{l.valor != null ? fmtMoeda(l.valor) : '—'}</td>
                <td className="hren-mono">
                  {l.venc_anterior && <span className="hren-venc-ant">{fmtData(l.venc_anterior)} → </span>}
                  {fmtData(l.venc_novo)}
                  {l.status === 'estornado' && l.venc_apos_estorno && (
                    <small className="hren-sub">voltou para {fmtData(l.venc_apos_estorno)}</small>
                  )}
                </td>
                <td><span className={`hren-chip hren-status-${s.cls}`}>{s.rotulo}</span></td>
                {admin && (
                  <td className="hren-detalhes">
                    {l.origem === 'liberacao'
                      ? <>{l.motivo || '—'}{l.liberado_por && <small className="hren-sub">por {l.liberado_por}</small>}</>
                      : <span className="hren-sub">{l.provedor === 'efi' ? 'Efí (Pix)' : l.provedor === 'asaas' ? 'Asaas (cartão)' : ''}</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
}
