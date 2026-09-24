// src/components/Notificacoes/SinoNotificacoes.jsx
// Sininho com contador + painel rápido com os avisos mais importantes.
// O painel vai direto no <body> (portal), "fixed" e posicionado a partir do
// botão — assim não é cortado nem deslocado pela sidebar, e fecha com Esc, clique fora ou ao abrir um aviso.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotificacoes, tempoRelativo, fmtDataHoraCurta } from './NotificacoesContext';
import './Notificacoes.css';

export function IconeSino({ tamanho = 18 }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const LIMITE_PAINEL = 8;

export default function SinoNotificacoes({ className = '', titulo = 'Notificações' }) {
  const ntf = useNotificacoes();
  const onVerTodas = (aba) => ntf?.irParaCentral(aba);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const painelRef = useRef(null);

  const posicionar = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const largura = Math.min(380, window.innerWidth - 16);
    let left = r.left;
    if (left + largura > window.innerWidth - 8) left = Math.max(8, r.right - largura);
    const top = r.bottom + 8;
    setPos({ left, top, width: largura, maxHeight: Math.max(240, window.innerHeight - top - 12) });
  };

  useLayoutEffect(() => { if (aberto) posicionar(); }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (painelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setAberto(false);
    };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    const reposicionar = () => posicionar();
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', reposicionar);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', reposicionar);
    };
  }, [aberto]);

  if (!ntf) return null;
  const naoLidas = ntf.contagem.nao_lidas || 0;
  const temUrgente = ntf.itens.some(i => !i.lida && !i.adiada && !i.dispensada && (i.prioridade === 'critica' || i.grupo === 'atrasado'));
  const ativos = ntf.itens.filter(i => !i.adiada && !i.dispensada);
  // Não lidas primeiro (já vêm ordenadas por grupo/prioridade do backend)
  const lista = [...ativos.filter(i => !i.lida), ...ativos.filter(i => i.lida)].slice(0, LIMITE_PAINEL);
  const tz = ntf.dados?.timezone;

  function abrirItem(item) {
    setAberto(false);
    if (item.acao && ['aba', 'rota'].includes(item.acao.tipo)) ntf.abrirAviso(item);
    else { if (!item.lida) ntf.marcarLidas([item.chave]); onVerTodas?.(item.categoria === 'lembretes' ? 'lembretes' : 'caixa'); }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`ntf-sino${naoLidas > 0 ? ' tem' : ''}${temUrgente ? ' urgente' : ''}${aberto ? ' aberto' : ''} ${className}`}
        onClick={(e) => { e.stopPropagation(); setAberto(a => !a); }}
        aria-label={naoLidas ? `${titulo}: ${naoLidas} não lida${naoLidas === 1 ? '' : 's'}` : titulo}
        aria-expanded={aberto}
        title={naoLidas ? `${naoLidas} notificação${naoLidas === 1 ? '' : 'ões'} não lida${naoLidas === 1 ? '' : 's'}` : titulo}
      >
        <IconeSino />
        {naoLidas > 0 && <span className="ntf-sino-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>

      {aberto && pos && createPortal(
        <div ref={painelRef} className="ntf-pop" role="dialog" aria-label="Notificações"
          style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
          onClick={e => e.stopPropagation()}>
          <div className="ntf-pop-topo">
            <strong>Notificações</strong>
            {naoLidas > 0 && <span className="ntf-pop-n">{naoLidas} nova{naoLidas === 1 ? '' : 's'}</span>}
            {naoLidas > 0 && (
              <button type="button" className="ntf-pop-link" onClick={() => ntf.marcarLidas(ativos.filter(i => !i.lida).map(i => i.chave))}>
                Marcar todas como lidas
              </button>
            )}
          </div>

          {(ntf.contagem.atrasadas > 0 || ntf.contagem.hoje > 0) && (
            <div className="ntf-pop-resumo">
              {ntf.contagem.atrasadas > 0 && (
                <button type="button" className="perigo" onClick={() => { setAberto(false); ntf.irParaCentral('caixa', { grupo: 'atrasado' }); }} title="Ver só os atrasados">
                  ● {ntf.contagem.atrasadas} atrasado{ntf.contagem.atrasadas === 1 ? '' : 's'}
                </button>
              )}
              {ntf.contagem.hoje > 0 && (
                <button type="button" className="alerta" onClick={() => { setAberto(false); ntf.irParaCentral('caixa', { grupo: 'hoje' }); }} title="Ver só os de hoje">
                  ● {ntf.contagem.hoje} para hoje
                </button>
              )}
            </div>
          )}

          <div className="ntf-pop-lista">
            {ntf.carregando && !ntf.dados ? (
              <div className="ntf-pop-vazio"><div className="ntf-spinner" /> Carregando…</div>
            ) : lista.length === 0 ? (
              <div className="ntf-pop-vazio">
                <span className="ntf-vazio-icone">🎉</span>
                <strong>Tudo em dia!</strong>
                <span>Nenhum aviso pendente agora.</span>
              </div>
            ) : lista.map(item => (
              <button key={item.chave} type="button" className={`ntf-pop-item prio-${item.prioridade}${item.lida ? ' lida' : ''}`} onClick={() => abrirItem(item)}>
                <span className="ntf-pop-icone" aria-hidden="true">{item.icone}</span>
                <span className="ntf-pop-txt">
                  <span className="ntf-pop-titulo">{!item.lida && <span className="ntf-ponto" />}{item.titulo}</span>
                  {item.descricao && <span className="ntf-pop-desc">{item.descricao}</span>}
                  {item.data_ref && (
                    <span className="ntf-pop-quando">
                      {item.dia_inteiro || /^\d{4}-\d{2}-\d{2}$/.test(item.data_ref)
                        ? fmtDataHoraCurta(item.data_ref, tz).slice(0, 10)
                        : `${fmtDataHoraCurta(item.data_ref, tz)} · ${tempoRelativo(item.data_ref)}`}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          <div className="ntf-pop-rodape">
            <button type="button" className="ntf-pop-link" onClick={() => { setAberto(false); onVerTodas?.('lembretes-novo'); }}>+ Lembrete</button>
            <button type="button" className="ntf-btn ntf-btn-primario ntf-btn-mini" onClick={() => { setAberto(false); onVerTodas?.('caixa'); }}>
              Ver central {ntf.contagem.total > LIMITE_PAINEL ? `(${ntf.contagem.total})` : ''} →
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
