// src/utils/fusoHorario.js
//
// Espelha o utils/fusoHorario.js do backend. Existe porque cálculos de
// "dias restantes até vencer" não podem depender do relógio/fuso do
// dispositivo de quem está olhando a tela — dois usuários olhando o
// mesmo estabelecimento de cidades/fusos diferentes têm que ver a
// MESMA contagem, baseada no fuso OFICIAL do estabelecimento (salvo em
// mercearias.timezone), não no fuso do navegador de cada um.
//
// Usa Intl.DateTimeFormat, disponível nativamente no browser — mesma
// técnica do backend, sem depender de nenhuma lib externa.

export const TIMEZONE_PADRAO = 'America/Sao_Paulo';

/** Offset (em minutos) de uma timezone IANA num instante específico. */
function offsetMinutos(instanteUTC, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const partes = dtf.formatToParts(instanteUTC).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const comoSeUTC = Date.UTC(
    Number(partes.year), Number(partes.month) - 1, Number(partes.day),
    Number(partes.hour), Number(partes.minute), Number(partes.second),
  );
  return (comoSeUTC - instanteUTC.getTime()) / 60000;
}

/** Instante UTC correspondente a 'dataStr' + 'horaStr' no horário local da timezone. */
function limiteDiaTZ(dataStr, horaStr, timeZone = TIMEZONE_PADRAO) {
  const aproxUTC = new Date(`${dataStr}T${horaStr}Z`);
  const offset = offsetMinutos(aproxUTC, timeZone);
  return new Date(aproxUTC.getTime() - offset * 60000);
}

/** Fim do dia (23:59:59) no fuso do estabelecimento, como instante UTC (objeto Date). */
export function fimDiaTZ(dataStr, timeZone = TIMEZONE_PADRAO) {
  return limiteDiaTZ(dataStr, '23:59:59', timeZone);
}

/** Data de HOJE ('YYYY-MM-DD') no calendário da timezone informada. */
export function hojeStrTZ(timeZone = TIMEZONE_PADRAO) {
  // locale 'en-CA' formata datas como YYYY-MM-DD nativamente
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

/** Diferença em dias entre duas datas 'YYYY-MM-DD' (dataB - dataA). */
export function diasEntre(dataA, dataB) {
  const a = new Date(`${dataA}T00:00:00Z`).getTime();
  const b = new Date(`${dataB}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}