// src/pages/Estabelecimento/Estoque/AtributosLoja.jsx
//
// "Atributos da loja": o que varia nos produtos DESTA loja (tamanho, cor, gênero e o que
// mais ela quiser: personagem, nº de peças, material, voltagem…). Dá para criar, renomear,
// ocultar ou excluir (só se nenhum produto usa), sugestões por tipo de loja e reordenar. Também oferece modelos prontos como ponto de partida.
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiFetch } from '../../../utils/api';
import { confirmar } from '../../../components/Dialogo/dialogo';
import Dica from '../../../components/Notificacoes/Dica';
import '../Estoque.css';

const LIMITES_PADRAO = { atributos_loja: 30, atributos_produto: 8, valores_atributo: 300, nome_atributo: 40 };

async function lerErro(resp, padrao) {
  const d = await resp.json().catch(() => ({}));
  return d.error || padrao;
}

export default function AtributosLoja({ estabelecimentoId, onClose, onAlterado }) {
  const base = `/api/estabelecimentos/${estabelecimentoId}`;
  const [atributos, setAtributos] = useState([]);
  const [modelos,   setModelos]   = useState([]);
  const [sugestoes, setSugestoes] = useState([]);   // sugestões do tipo de estabelecimento (ainda não adicionadas)
  const [limites,   setLimites]   = useState(LIMITES_PADRAO);
  const [pronto,    setPronto]    = useState(true);
  const [loading,   setLoading]   = useState(true);
  const [ocupado,   setOcupado]   = useState(false);
  const [erro,      setErro]      = useState('');
  const [novoNome,  setNovoNome]  = useState('');
  const [editando,  setEditando]  = useState(null);   // chave em renomeação
  const [nomeEdit,  setNomeEdit]  = useState('');
  const [verOcultos, setVerOcultos] = useState(true);
  const alterouRef = useRef(false);

  async function carregar(primeira = false) {
    if (primeira) setLoading(true);
    try {
      const resp = await apiFetch(`${base}/atributos-variacao`);
      if (resp.ok) {
        const d = await resp.json();
        setAtributos(d.atributos || []);
        setModelos(d.modelos_prontos || []);
        setSugestoes(d.sugestoes || []);
        setLimites({ ...LIMITES_PADRAO, ...(d.limites || {}) });
        setPronto(d.pronto !== false);
      } else setErro(await lerErro(resp, 'Não foi possível carregar os atributos.'));
    } catch { setErro('Não foi possível carregar os atributos. Verifique a conexão.'); }
    setLoading(false);
  }
  useEffect(() => { carregar(true); }, [estabelecimentoId]); // eslint-disable-line

  function fechar() { onClose(alterouRef.current); }
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (editando) { setEditando(null); return; }
      fechar();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // sempre a versão atual de editando/fechar

  function avisarMudanca() { alterouRef.current = true; onAlterado?.(); }

  const ordenados = [...atributos].sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const ativos = ordenados.filter(a => a.ativo);
  const visiveis = verOcultos ? ordenados : ativos;
  const usados = atributos.filter(a => a.ativo || a.personalizado).length;
  const noLimite = usados >= limites.atributos_loja;

  async function chamar(path, metodo, corpo, msgPadrao) {
    const resp = await apiFetch(`${base}${path}`, {
      method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    if (!resp.ok) throw new Error(await lerErro(resp, msgPadrao));
    return resp.json().catch(() => ({}));
  }

  async function criar(e) {
    e?.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    setOcupado(true); setErro('');
    try {
      await chamar('/atributos-variacao', 'POST', { nome }, 'Não foi possível criar o atributo.');
      setNovoNome(''); avisarMudanca(); await carregar();
    } catch (err) { setErro(err.message); }
    setOcupado(false);
  }

  async function alterar(a, corpo, msg = 'Não foi possível salvar.') {
    setOcupado(true); setErro('');
    try {
      await chamar(`/atributos-variacao/${a.chave}`, 'PUT', corpo, msg);
      avisarMudanca(); await carregar();
      return true;
    } catch (err) { setErro(err.message); await carregar(); return false; }
    finally { setOcupado(false); }
  }

  async function salvarNome(a) {
    const nome = nomeEdit.trim();
    if (!nome || nome === a.nome) { setEditando(null); return; }
    if (await alterar(a, { nome })) setEditando(null);
  }

  async function alternarAtivo(a) {
    if (a.ativo) {
      const ok = await confirmar({
        titulo: `Ocultar "${a.nome}"?`,
        texto: 'Ele deixa de aparecer nos produtos novos e na lista de variações. Nada é apagado: os produtos que já usam esse atributo continuam com os valores, e você pode mostrar de novo quando quiser.',
        perigo: true, botao: 'Ocultar',
      });
      if (!ok) return;
    }
    await alterar(a, { ativo: !a.ativo });
  }

  async function sugestao(x, acao) {
    setOcupado(true); setErro('');
    try {
      const resp = await apiFetch(`${base}/atributos-variacao/sugestoes/${x.chave}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao }),
      });
      if (!resp.ok) throw new Error(await lerErro(resp, 'Não foi possível salvar.'));
      avisarMudanca();
    } catch (err) { setErro(err.message); }
    await carregar();
    setOcupado(false);
  }

  async function excluir(a) {
    const ok = await confirmar({
      titulo: `Excluir "${a.nome}" de vez?`,
      texto: 'O atributo e os valores sugeridos dele serão apagados. Só é possível se nenhum produto usa esse atributo — se algum usar, o sistema avisa e você pode apenas ocultar.' + (a.legado ? ' Como ele é uma sugestão para o seu tipo de estabelecimento, pode voltar a aparecer nas sugestões (e lá dá para dispensar).' : ''),
      perigo: true, botao: 'Excluir',
    });
    if (!ok) return;
    setOcupado(true); setErro('');
    try {
      const resp = await apiFetch(`${base}/atributos-variacao/${a.chave}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error(await lerErro(resp, 'Não foi possível excluir o atributo.'));
      avisarMudanca();
    } catch (err) { setErro(err.message); }
    await carregar();
    setOcupado(false);
  }

  // Troca de lugar com o vizinho (considera só os que estão na lista visível).
  async function mover(a, delta) {
    const lista = visiveis;
    const i = lista.findIndex(x => x.chave === a.chave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOcupado(true); setErro('');
    try {
      // renumera de 10 em 10 só o que mudou (poucas chamadas)
      let n = 0;
      for (let k = 0; k < nova.length; k++) {
        const ordem = (k + 1) * 10;
        if (nova[k].ordem !== ordem) {
          await chamar(`/atributos-variacao/${nova[k].chave}`, 'PUT', { ordem }, 'Não foi possível mudar a ordem.');
          n++;
        }
      }
      if (n) avisarMudanca();
    } catch (err) { setErro(err.message); }
    await carregar();
    setOcupado(false);
  }

  // Modelo pronto: cria os atributos que faltam (reativa os ocultos) e já cadastra os valores sugeridos.
  async function usarModelo(m) {
    const existentes = atributos.map(a => ({ ...a }));
    const achar = (nome) => existentes.find(a => a.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    const novos = m.atributos.filter(x => !achar(x.nome));
    const reativar = m.atributos.map(x => achar(x.nome)).filter(a => a && !a.ativo);
    if (usados + novos.length > limites.atributos_loja) {
      setErro(`Este modelo cria ${novos.length} atributo(s) e passaria do limite de ${limites.atributos_loja} da loja. Oculte algum que você não usa mais.`);
      return;
    }
    const ok = await confirmar({
      titulo: `Usar o modelo "${m.nome}"?`,
      texto: [
        novos.length ? `Serão criados: ${novos.map(x => x.nome).join(', ')}.` : '',
        reativar.length ? `Voltam a aparecer: ${reativar.map(a => a.nome).join(', ')}.` : '',
        !novos.length && !reativar.length ? 'Todos os atributos deste modelo já existem; só os valores sugeridos que faltarem serão adicionados.' : '',
        'Você pode renomear, ocultar ou mudar a ordem depois.',
      ].filter(Boolean).join(' '),
      botao: 'Usar modelo',
    });
    if (!ok) return;
    setOcupado(true); setErro('');
    try {
      for (const x of m.atributos) {
        let attr = achar(x.nome);
        if (!attr) {
          attr = await chamar('/atributos-variacao', 'POST', { nome: x.nome }, `Não foi possível criar "${x.nome}".`);
        } else if (!attr.ativo) {
          await chamar(`/atributos-variacao/${attr.chave}`, 'PUT', { ativo: true }, `Não foi possível reativar "${x.nome}".`);
        }
        for (const valor of x.valores || []) {
          const resp = await apiFetch(`${base}/opcoes-variacao`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: attr.chave, valor }),
          });
          if (!resp.ok && resp.status !== 409) throw new Error(await lerErro(resp, `Não foi possível adicionar "${valor}".`));
        }
      }
      avisarMudanca();
    } catch (err) { setErro(err.message); }
    await carregar();
    setOcupado(false);
  }

  const ocultos = ordenados.length - ativos.length;

  return createPortal(
    <div className="prod-modal-overlay" style={{ zIndex: 3100 }} onClick={e => { e.stopPropagation(); fechar(); }}>
      <div className="prod-modal gov-modal atl-modal" onClick={e => e.stopPropagation()}>

        <div className="gov-topo">
          <span className="gov-topo-icone">🧩</span>
          <div>
            <div className="gov-titulo">Atributos da loja</div>
            <div className="gov-sub">
              São as características que mudam de uma variação para outra do mesmo produto — a loja decide quais. Ex.: roupa varia em tamanho e cor; brinquedo, em personagem e idade; ferragem, em medida e material.
            </div>
          </div>
        </div>

        {!pronto && <div className="prod-modal-erro">⚠️ Esta função ainda será liberada: falta atualizar o banco de dados. Por enquanto você só consegue ver os atributos padrão.</div>}
        {erro && <div className="prod-modal-erro">⚠️ {erro}</div>}

        <div className="gov-secao">
          <div className="gov-secao-titulo gov-secao-linha">
            <span>
              Seus atributos <span>({usados} de {limites.atributos_loja})</span>{' '}
              <Dica texto={`Cada produto com variações pode usar até ${limites.atributos_produto} atributos ao mesmo tempo. Os que você não usa podem ser ocultados (dá para mostrar de novo) ou excluídos, se nenhum produto usa.`} />
            </span>
            {ocultos > 0 && (
              <button type="button" className="etq-link" onClick={() => setVerOcultos(v => !v)}>
                {verOcultos ? `Esconder ocultos (${ocultos})` : `Ver ocultos (${ocultos})`}
              </button>
            )}
          </div>

          {loading ? (
            <div className="gov-vazio">Carregando…</div>
          ) : (
            <ul className="atl-lista">
              {visiveis.map((a, idx) => (
                <li key={a.chave} className={`atl-item${a.ativo ? '' : ' oculto'}`}>
                  <span className="atl-ordem">
                    <button type="button" disabled={ocupado || !pronto || idx === 0} onClick={() => mover(a, -1)} title="Subir" aria-label={`Subir ${a.nome}`}>▲</button>
                    <button type="button" disabled={ocupado || !pronto || idx === visiveis.length - 1} onClick={() => mover(a, 1)} title="Descer" aria-label={`Descer ${a.nome}`}>▼</button>
                  </span>

                  <span className="atl-nome">
                    {editando === a.chave ? (
                      <input className="prod-input" autoFocus maxLength={limites.nome_atributo} value={nomeEdit}
                        onChange={e => setNomeEdit(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); salvarNome(a); } }}
                        onBlur={() => salvarNome(a)} />
                    ) : (
                      <>
                        <strong>{a.nome}</strong>
                        {!a.ativo && <em className="oculto-tag">oculto</em>}
                      </>
                    )}
                  </span>

                  <span className="atl-acoes">
                    {editando !== a.chave && (
                      <button type="button" className="etq-link" disabled={ocupado || !pronto}
                        onClick={() => { setEditando(a.chave); setNomeEdit(a.nome); setErro(''); }}>Renomear</button>
                    )}
                    <button type="button" className={`etq-link${a.ativo ? ' gov-perigo' : ''}`} disabled={ocupado || !pronto}
                      onClick={() => alternarAtivo(a)}>{a.ativo ? 'Ocultar' : 'Mostrar'}</button>
                    <button type="button" className="etq-link gov-perigo" disabled={ocupado || !pronto}
                      onClick={() => excluir(a)}>Excluir</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {sugestoes.length > 0 && (
          <div className="gov-secao atl-sugestoes">
            <div className="gov-secao-titulo">
              Sugestões para o seu tipo de estabelecimento{' '}
              <Dica texto="São os atributos mais comuns para o seu tipo de loja. Clique no nome para adicionar, ou no ✕ para dispensar a sugestão (ela some daqui). Nada é adicionado sozinho." />
            </div>
            <div className="gov-chips">
              {sugestoes.map(x => (
                <span key={x.chave} className="atl-sug">
                  <button type="button" className="atl-sug-add" disabled={ocupado || !pronto || noLimite}
                    onClick={() => sugestao(x, 'adicionar')} title={`Adicionar "${x.nome}"`}>＋ {x.nome}</button>
                  <button type="button" className="atl-sug-x" disabled={ocupado || !pronto}
                    onClick={() => sugestao(x, 'dispensar')} title="Dispensar esta sugestão" aria-label={`Dispensar a sugestão ${x.nome}`}>✕</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={criar} className="gov-add">
          <input maxLength={limites.nome_atributo} className="prod-input" placeholder="Novo atributo — ex: Material, Voltagem, Sabor"
            value={novoNome} onChange={e => setNovoNome(e.target.value)} disabled={ocupado || !pronto || noLimite} />
          <button type="submit" className="gov-btn-principal gov-btn-add" disabled={ocupado || !pronto || noLimite || !novoNome.trim()}>
            {ocupado ? '…' : '+ Criar atributo'}
          </button>
        </form>
        {noLimite && <small className="gov-nota">Você chegou ao limite de {limites.atributos_loja} atributos. Oculte algum que não usa mais para liberar espaço.</small>}

        {modelos.length > 0 && (
          <div className="gov-secao" style={{ marginTop: 14 }}>
            <div className="gov-secao-titulo">
              Modelos prontos <span>— atalhos opcionais</span>{' '}
              <Dica texto="Cria vários atributos de uma vez, já com sugestões de valores. São só pontos de partida: depois você renomeia, oculta e muda a ordem como quiser." />
            </div>
            <div className="gov-chips">
              {modelos.map(m => (
                <button key={m.id} type="button" className="gov-tipo gov-tipo-novo" disabled={ocupado || !pronto}
                  title={m.atributos.map(x => x.nome).join(', ')} onClick={() => usarModelo(m)}>
                  ＋ {m.nome}
                </button>
              ))}
            </div>
            <small className="gov-nota">Passe o mouse sobre um modelo para ver quais atributos ele cria.</small>
          </div>
        )}

        <div className="prod-modal-acoes" style={{ marginTop: 14 }}>
          <button type="button" className="prod-modal-btn-cancelar" onClick={fechar}>Fechar (Esc)</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
