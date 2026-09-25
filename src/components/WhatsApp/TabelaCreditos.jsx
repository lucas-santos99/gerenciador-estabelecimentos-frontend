// src/components/WhatsApp/TabelaCreditos.jsx
// ============================================================
// "Como funcionam os créditos" (24/09/2026) — a MESMA explicação que o
// SuperAdmin vê no painel do WhatsApp e que o comerciante vai ver na
// tela de contratação/uso do WhatsApp da loja. Um componente só, pra
// nunca mostrar regras diferentes pros dois lados.
// Os pesos vêm dos parâmetros salvos (config_sistema.whatsapp_params):
// mudou o peso no painel, muda aqui também.
// Usa os tokens globais de tema (body.dark / body.light), então funciona
// igual no painel da loja e no SuperAdmin. Prefixo: wacr-
// ============================================================
import React from "react";
import "./TabelaCreditos.css";

const LINHAS = [
  { t: "consulta", nome: "Pergunta / consulta", icone: "💬", exemplo: "“Quanto vendi hoje?”, “Quantas Coca Zero eu tenho?”, “Quem está me devendo?”", plural: "perguntas" },
  { t: "pdf", nome: "Relatório em PDF", icone: "📄", exemplo: "“Me manda o relatório de vendas do mês”", plural: "relatórios" },
  { t: "cadastro", nome: "Cadastro ou ajuste", icone: "✍️", exemplo: "“Cadastra 10 Coca Zero a R$ 8,50”, “Recebi R$ 50 do João” — sempre com confirmação e PIN", plural: "cadastros" },
  { t: "foto", nome: "Foto de nota ou contagem", icone: "📷", exemplo: "Foto da nota de compra: o sistema lê, você confere e confirma", plural: "fotos" },
  { t: "alerta", nome: "Alerta automático", icone: "🔔", exemplo: "Fiado vencendo, estoque baixo, contas do dia, resumo diário", plural: "alertas" },
];

const fmt = (n) => (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const rotuloCreditos = (p) => `${fmt(p)} crédito${Number(p) < 2 ? "" : "s"}`; // 0,5 e 1 → singular

/**
 * @param {object}   props
 * @param {object}   props.pesos      { consulta, pdf, cadastro, foto, alerta }
 * @param {number}   [props.creditos] saldo usado nos exemplos (padrão 150)
 * @param {string[]} [props.tipos]    só os tipos incluídos no plano (padrão: todos)
 * @param {string}   [props.titulo]
 */
export default function TabelaCreditos({ pesos, creditos = 150, tipos, titulo = "Como funcionam os créditos" }) {
  const p = pesos || {};
  const linhas = LINHAS.filter(l => !tipos || tipos.includes(l.t));
  return (
    <section className="wacr">
      <h3 className="wacr-titulo">{titulo}</h3>
      <p className="wacr-intro">
        Você recebe um <strong>saldo de créditos por mês</strong> e usa como quiser. Cada pedido <strong>completo</strong> (do
        começo ao fim) gasta créditos conforme o tipo — confirmações e correções dentro do mesmo pedido não gastam de novo.
      </p>

      <div className="wacr-rolagem">
        <table className="wacr-tabela">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Exemplo</th>
              <th className="num">Gasta</th>
              <th className="num">Com {fmt(creditos)} créditos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => {
              const peso = Number(p[l.t]) || 0;
              const qtd = peso > 0 ? Math.floor(creditos / peso) : 0;
              return (
                <tr key={l.t}>
                  <td className="wacr-nome"><span aria-hidden="true">{l.icone}</span> {l.nome}</td>
                  <td className="wacr-exemplo">{l.exemplo}</td>
                  <td className="num"><span className="wacr-peso">{rotuloCreditos(peso)}</span></td>
                  <td className="num">≈ {fmt(qtd)} {l.plural}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="wacr-mistura">Os números com “≈” são “se usar tudo só nisso”. Na prática você mistura: por exemplo, alertas todo dia e o resto em perguntas.</p>

      <div className="wacr-caixas">
        <div className="wacr-caixa ok">
          <strong>✅ Não gasta crédito</strong>
          <ul>
            <li>As mensagens que você manda (texto, áudio, foto).</li>
            <li>Confirmações, PIN e até 3 correções dentro do mesmo pedido.</li>
            <li>Pedido que deu erro ou mensagem que não foi entregue.</li>
          </ul>
        </div>
        <div className="wacr-caixa aviso">
          <strong>⏳ Quando o saldo acaba</strong>
          <ul>
            <li>O assistente e os alertas pausam até o próximo mês ou até você comprar um pacote extra.</li>
            <li><strong>Nunca há cobrança extra automática.</strong></li>
            <li>Créditos que sobram não passam pro mês seguinte.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
