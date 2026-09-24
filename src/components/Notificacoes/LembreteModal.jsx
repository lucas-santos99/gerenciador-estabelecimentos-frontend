// src/components/Notificacoes/LembreteModal.jsx
// Criar / editar lembrete (comerciante, operador ou SuperAdmin).
// A data e a hora são digitadas no horário do ESTABELECIMENTO (ou de Brasília,
// no SuperAdmin) e convertidas pra um instante UTC antes de enviar — assim
// quem estiver em outro fuso vê o lembrete no horário certo da loja.
import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../utils/api';
import { TIMEZONE_PADRAO, hojeStrTZ } from '../../utils/fusoHorario';

export const ROTULO_RECORRENCIA = {
  nenhuma: 'Não repete',
  diaria: 'Todo dia',
  semanal: 'Toda semana',
  mensal: 'Todo mês',
  anual: 'Todo ano',
};

const ANTECEDENCIAS = [
  { v: 0, t: 'Na hora' },
  { v: 15, t: '15 min antes' },
  { v: 30, t: '30 min antes' },
  { v: 60, t: '1 hora antes' },
  { v: 120, t: '2 horas antes' },
  { v: 1440, t: '1 dia antes' },
  { v: 2880, t: '2 dias antes' },
  { v: 4320, t: '3 dias antes' },
  { v: 10080, t: '1 semana antes' },
];

const SUGESTOES_CATEGORIA = ['Pagamento', 'Entrega', 'Ligação', 'Tarefa', 'Reunião', 'Pedido', 'Pessoal'];

/* ── Fuso ─────────────────────────────────────────────────── */
function partesNoFuso(date, timeZone) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, x) => { if (x.type !== 'literal') a[x.type] = x.value; return a; }, {});
  return p;
}

// "YYYY-MM-DD" + "HH:MM" no fuso → ISO UTC
function localParaIso(dataStr, horaStr, timeZone) {
  const aprox = new Date(`${dataStr}T${horaStr}:00Z`);
  const p = partesNoFuso(aprox, timeZone);
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = comoUTC - aprox.getTime();
  // segunda passada: corrige quando o offset muda perto do horário (horário de verão)
  let alvo = new Date(aprox.getTime() - offset);
  const p2 = partesNoFuso(alvo, timeZone);
  const comoUTC2 = Date.UTC(+p2.year, +p2.month - 1, +p2.day, +p2.hour, +p2.minute, +p2.second);
  const offset2 = comoUTC2 - alvo.getTime();
  if (offset2 !== offset) alvo = new Date(aprox.getTime() - offset2);
  return alvo.toISOString();
}

function isoParaLocal(iso, timeZone) {
  const p = partesNoFuso(new Date(iso), timeZone);
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function somarDiasStr(dataStr, dias) {
  const d = new Date(`${dataStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function horaSugerida(timeZone) {
  // próxima hora cheia (+1h) no fuso da loja
  const p = partesNoFuso(new Date(Date.now() + 3600000), timeZone);
  return `${p.hour}:00`;
}

export default function LembreteModal({ lembrete = null, contexto = 'estab', timezone, onFechar, onSalvo }) {
  const tz = timezone || TIMEZONE_PADRAO;
  const editando = !!lembrete?.id;
  const hoje = hojeStrTZ(tz);

  const [form, setForm] = useState(() => {
    if (editando) {
      const { data, hora } = isoParaLocal(lembrete.data_hora, tz);
      return {
        titulo: lembrete.titulo || '',
        descricao: lembrete.descricao || '',
        categoria: lembrete.categoria || '',
        data,
        hora: lembrete.dia_inteiro ? '08:00' : hora,
        dia_inteiro: !!lembrete.dia_inteiro,
        recorrencia: lembrete.recorrencia || 'nenhuma',
        antecedencia_min: lembrete.antecedencia_min || 0,
        prioridade: lembrete.prioridade || 'normal',
        visibilidade: lembrete.visibilidade || 'so_eu',
      };
    }
    return {
      titulo: '', descricao: '', categoria: '',
      data: hoje, hora: horaSugerida(tz), dia_inteiro: false,
      recorrencia: 'nenhuma', antecedencia_min: 0, prioridade: 'normal', visibilidade: 'so_eu',
    };
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const tituloRef = useRef(null);

  useEffect(() => { tituloRef.current?.focus(); }, []);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !salvando) onFechar?.(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onFechar, salvando]);

  const set = (campo, valor) => { setErro(''); setForm(f => ({ ...f, [campo]: valor })); };

  const antecedencias = form.dia_inteiro ? ANTECEDENCIAS.filter(a => a.v === 0 || a.v >= 1440) : ANTECEDENCIAS;
  const dataIsoPrevista = form.data && (form.dia_inteiro || /^\d{2}:\d{2}$/.test(form.hora))
    ? localParaIso(form.data, form.dia_inteiro ? '00:00' : form.hora, tz) : null;
  const noPassado = dataIsoPrevista && (form.dia_inteiro ? form.data < hoje : Date.parse(dataIsoPrevista) < Date.now());

  async function salvar(e) {
    e?.preventDefault();
    if (!form.titulo.trim()) { setErro('Dê um título pro lembrete.'); tituloRef.current?.focus(); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) { setErro('Escolha a data.'); return; }
    if (!form.dia_inteiro && !/^\d{2}:\d{2}$/.test(form.hora)) { setErro('Escolha a hora.'); return; }
    setSalvando(true); setErro('');
    try {
      const antecedencia = form.dia_inteiro && form.antecedencia_min > 0 && form.antecedencia_min < 1440 ? 0 : form.antecedencia_min;
      const corpo = {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        categoria: form.categoria.trim(),
        data_hora: localParaIso(form.data, form.dia_inteiro ? '00:00' : form.hora, tz),
        dia_inteiro: form.dia_inteiro,
        recorrencia: form.recorrencia,
        antecedencia_min: antecedencia,
        prioridade: form.prioridade,
        visibilidade: form.visibilidade,
      };
      const resp = await apiFetch(editando ? `/api/notificacoes/lembretes/${lembrete.id}` : '/api/notificacoes/lembretes', {
        method: editando ? 'PUT' : 'POST',
        body: JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'Não foi possível salvar o lembrete.');
      onSalvo?.(json);
    } catch (e2) {
      setErro(e2.message);
      setSalvando(false);
    }
  }

  const atalhosData = [
    { t: 'Hoje', d: hoje },
    { t: 'Amanhã', d: somarDiasStr(hoje, 1) },
    { t: 'Em 1 semana', d: somarDiasStr(hoje, 7) },
    { t: 'Em 1 mês', d: somarDiasStr(hoje, 30) },
  ];

  return (
    <div className="ntf-modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !salvando) onFechar?.(); }}>
      <form className="ntf-modal" onSubmit={salvar} role="dialog" aria-modal="true" aria-labelledby="ntf-lem-titulo">
        <div className="ntf-modal-topo">
          <div>
            <h2 id="ntf-lem-titulo">{editando ? '✏️ Editar lembrete' : '⏰ Novo lembrete'}</h2>
            <span>Você recebe o aviso no sininho e na central{form.visibilidade === 'todos' ? ' — assim como todos da equipe' : ''}.</span>
          </div>
          <button type="button" className="ntf-modal-x" onClick={onFechar} disabled={salvando} aria-label="Fechar">✕</button>
        </div>

        <div className="ntf-modal-corpo">
          <label className="ntf-campo">
            <span>Título *</span>
            <input ref={tituloRef} className="ntf-input" maxLength={150} placeholder="Ex.: Pagar boleto da energia, ligar pro fornecedor…"
              value={form.titulo} onChange={e => set('titulo', e.target.value)} />
          </label>

          <label className="ntf-campo">
            <span>Detalhes <small>(opcional)</small></span>
            <textarea className="ntf-input" rows={3} maxLength={500} placeholder="Anotações, valores, telefone…"
              value={form.descricao} onChange={e => set('descricao', e.target.value)} />
            <small className="ntf-contador">{form.descricao.length}/500</small>
          </label>

          <div className="ntf-campo">
            <span>Quando *</span>
            <div className="ntf-chips">
              {atalhosData.map(a => (
                <button key={a.t} type="button" className={`ntf-chip${form.data === a.d ? ' ativo' : ''}`} onClick={() => set('data', a.d)}>{a.t}</button>
              ))}
            </div>
            <div className="ntf-linha-2">
              <input className="ntf-input" type="date" value={form.data} onChange={e => set('data', e.target.value)} />
              <input className="ntf-input" type="time" value={form.hora} disabled={form.dia_inteiro} onChange={e => set('hora', e.target.value)} />
            </div>
            <label className="ntf-pref-linha">
              <input type="checkbox" checked={form.dia_inteiro} onChange={e => set('dia_inteiro', e.target.checked)} />
              Dia inteiro (sem horário)
            </label>
            {noPassado && !editando && <small className="ntf-aviso-campo">⚠️ Essa data já passou — o lembrete vai aparecer como atrasado.</small>}
          </div>

          <div className="ntf-linha-2">
            <label className="ntf-campo">
              <span>Repetir</span>
              <select className="ntf-select" value={form.recorrencia} onChange={e => set('recorrencia', e.target.value)}>
                {Object.entries(ROTULO_RECORRENCIA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="ntf-campo">
              <span>Avisar</span>
              <select className="ntf-select" value={antecedencias.some(a => a.v === form.antecedencia_min) ? form.antecedencia_min : 0}
                onChange={e => set('antecedencia_min', parseInt(e.target.value, 10))}>
                {antecedencias.map(a => <option key={a.v} value={a.v}>{a.t}</option>)}
              </select>
            </label>
          </div>
          {form.recorrencia !== 'nenhuma' && (
            <small className="ntf-dica">🔁 Ao marcar como feito, o lembrete pula sozinho pra próxima data.</small>
          )}

          <div className="ntf-campo">
            <span>Prioridade</span>
            <div className="ntf-seg ntf-seg-cheio">
              {[['baixa', '▽ Baixa'], ['normal', '◆ Normal'], ['alta', '▲ Alta']].map(([v, t]) => (
                <button key={v} type="button" className={`${form.prioridade === v ? 'ativo' : ''} prio-${v}`} onClick={() => set('prioridade', v)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="ntf-linha-2">
            <label className="ntf-campo">
              <span>Etiqueta <small>(opcional)</small></span>
              <input className="ntf-input" list="ntf-sugestoes-cat" maxLength={40} placeholder="Ex.: Pagamento"
                value={form.categoria} onChange={e => set('categoria', e.target.value)} />
              <datalist id="ntf-sugestoes-cat">
                {SUGESTOES_CATEGORIA.map(s => <option key={s} value={s} />)}
              </datalist>
            </label>
            <label className="ntf-campo">
              <span>Quem vê</span>
              <select className="ntf-select" value={form.visibilidade} onChange={e => set('visibilidade', e.target.value)}>
                <option value="so_eu">🔒 Só eu</option>
                <option value="todos">{contexto === 'admin' ? '👥 Todos os SuperAdmins' : '👥 Toda a equipe da loja'}</option>
              </select>
            </label>
          </div>

          {erro && <div className="ntf-erro">⚠️ {erro}</div>}
        </div>

        <div className="ntf-modal-rodape">
          <small>Horário {contexto === 'admin' ? 'de referência' : 'da loja'}: {tz.replace('America/', '').replace(/_/g, ' ')}</small>
          <div className="ntf-modal-botoes">
            <button type="button" className="ntf-btn ntf-btn-fantasma" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" className="ntf-btn ntf-btn-primario" disabled={salvando}>
              {salvando ? '⏳ Salvando…' : editando ? 'Salvar alterações' : 'Criar lembrete'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
