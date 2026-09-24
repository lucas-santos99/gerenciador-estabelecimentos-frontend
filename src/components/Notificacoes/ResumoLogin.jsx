// src/components/Notificacoes/ResumoLogin.jsx
// Resumo ao entrar: aparece UMA vez por login, só se a preferência estiver
// ligada e houver aviso não lido das categorias marcadas "no resumo".
import React, { useEffect, useState } from 'react';
import { useNotificacoes, resumoJaMostrado, marcarResumoMostrado, fmtDataHoraCurta } from './NotificacoesContext';
import './Notificacoes.css';

const fmtBRL = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MAX_ITENS = 6;

function saudacao(tz) {
  let h = new Date().getHours();
  try { h = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()), 10); } catch { /* usa o do navegador */ }
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export default function ResumoLogin({ nome = '', bloqueado = false }) {
  const ntf = useNotificacoes();
  const [aberto, setAberto] = useState(false);
  const [naoMostrar, setNaoMostrar] = useState(false);

  const pronto = !!ntf?.dados;
  useEffect(() => {
    // "bloqueado": outro aviso obrigatório na tela (ex.: comunicado) — espera ele sair
    if (!pronto || bloqueado || aberto || resumoJaMostrado()) return;
    const prefs = ntf.preferencias;
    const itens = ntf.itens.filter(i => i.no_resumo && !i.lida && !i.adiada && !i.dispensada);
    marcarResumoMostrado(); // decide uma vez só por login, mostrando ou não
    if (prefs?.resumo_login === false || itens.length === 0) return;
    setAberto(true);
  }, [pronto, bloqueado]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }); // sempre com o "naoMostrar" atual

  if (!ntf || !aberto) return null;

  const itens = ntf.itens.filter(i => i.no_resumo && !i.lida && !i.adiada && !i.dispensada);
  const atrasados = itens.filter(i => i.grupo === 'atrasado');
  const hoje = itens.filter(i => i.grupo === 'hoje');
  const proximos = itens.filter(i => i.grupo === 'proximo');
  const outros = itens.filter(i => i.grupo === 'info');
  const tz = ntf.dados?.timezone;

  async function fechar() {
    setAberto(false);
    if (naoMostrar && ntf.preferencias) {
      try { await ntf.salvarPreferencias({ ...ntf.preferencias, resumo_login: false }); } catch { /* segue */ }
    }
  }

  function verCentral() {
    fechar();
    ntf.irParaCentral('caixa');
  }

  function abrir(item) {
    fechar();
    if (item.acao && ['aba', 'rota'].includes(item.acao.tipo)) ntf.abrirAviso(item);
    else ntf.irParaCentral(item.categoria === 'lembretes' ? 'lembretes' : 'caixa');
  }

  const blocos = [
    { id: 'atrasado', n: atrasados.length, t: 'Atrasados', cls: 'perigo', ic: '⚠️' },
    { id: 'hoje', n: hoje.length, t: 'Para hoje', cls: 'alerta', ic: '📅' },
    { id: 'proximo', n: proximos.length, t: 'Próximos dias', cls: 'info', ic: '🗓️' },
    { id: 'info', n: outros.length, t: 'Outros avisos', cls: 'neutro', ic: '💬' },
  ].filter(b => b.n > 0);

  const destaque = [...atrasados, ...hoje, ...proximos, ...outros].slice(0, MAX_ITENS);
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0];

  return (
    <div className="ntf-modal-overlay ntf-resumo-overlay" onMouseDown={e => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="ntf-modal ntf-resumo" role="dialog" aria-modal="true" aria-labelledby="ntf-resumo-titulo">
        <div className="ntf-resumo-hero">
          <div className="ntf-resumo-sino" aria-hidden="true">🔔</div>
          <div>
            <h2 id="ntf-resumo-titulo">{saudacao(tz)}{primeiroNome ? `, ${primeiroNome}` : ''}!</h2>
            <p>Você tem <strong>{itens.length}</strong> aviso{itens.length === 1 ? '' : 's'} pra conferir.</p>
          </div>
          <button type="button" className="ntf-modal-x" onClick={fechar} aria-label="Fechar">✕</button>
        </div>

        <div className="ntf-resumo-blocos">
          {blocos.map(b => (
            <button key={b.id} type="button" className={`ntf-stat ntf-stat-${b.cls} clicavel`} title={`Ver ${b.t.toLowerCase()} na central`}
              onClick={() => { fechar(); ntf.irParaCentral('caixa', { grupo: b.id }); }}>
              <span className="ntf-stat-n">{b.n}</span>
              <span className="ntf-stat-t">{b.ic} {b.t}</span>
            </button>
          ))}
        </div>

        <div className="ntf-resumo-lista">
          {destaque.map(item => (
            <button key={item.chave} type="button" className={`ntf-pop-item prio-${item.prioridade}`} onClick={() => abrir(item)}>
              <span className="ntf-pop-icone" aria-hidden="true">{item.icone}</span>
              <span className="ntf-pop-txt">
                <span className="ntf-pop-titulo">{item.titulo}</span>
                {item.descricao && <span className="ntf-pop-desc">{item.descricao}</span>}
                {item.data_ref && (
                  <span className="ntf-pop-quando">
                    {item.dia_inteiro ? fmtDataHoraCurta(item.data_ref, tz).slice(0, 10) : fmtDataHoraCurta(item.data_ref, tz)}
                  </span>
                )}
              </span>
              {item.valor != null && <span className="ntf-pop-valor">{fmtBRL(item.valor)}</span>}
            </button>
          ))}
          {itens.length > MAX_ITENS && (
            <div className="ntf-resumo-mais">+ {itens.length - MAX_ITENS} outro{itens.length - MAX_ITENS === 1 ? '' : 's'} na central</div>
          )}
        </div>

        <div className="ntf-modal-rodape">
          <label className="ntf-pref-linha">
            <input type="checkbox" checked={naoMostrar} onChange={e => setNaoMostrar(e.target.checked)} />
            Não mostrar este resumo ao entrar
          </label>
          <div className="ntf-modal-botoes">
            <button type="button" className="ntf-btn ntf-btn-fantasma"
              onClick={() => { ntf.marcarLidas(itens.map(i => i.chave)); fechar(); }}>
              ✓ Marcar como lidos
            </button>
            <button type="button" className="ntf-btn ntf-btn-primario" onClick={verCentral}>Abrir central →</button>
          </div>
        </div>
        {naoMostrar && <small className="ntf-resumo-dica">Dá pra ligar de novo em Notificações → ⚙️ Preferências.</small>}
      </div>
    </div>
  );
}
