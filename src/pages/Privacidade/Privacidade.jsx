// src/pages/Privacidade/Privacidade.jsx
// ============================================================
// Política de Privacidade — página PÚBLICA (sem login), 30/09/2026.
// Exigida pela Meta para publicar o app do WhatsApp; também serve
// como política geral do sistema. Rota: /privacidade
// A seção de exclusão tem âncora própria (/privacidade#exclusao),
// usada no campo "Instruções de exclusão de dados" do app na Meta.
// ============================================================
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import "./Privacidade.css";

const ATUALIZADA_EM = "30 de setembro de 2026";
const CONTATO = "lucasdossantos30@hotmail.com";

const SECOES = [
  { id: "quem-somos", titulo: "Quem somos" },
  { id: "dados", titulo: "Quais dados tratamos" },
  { id: "finalidades", titulo: "Para que usamos" },
  { id: "whatsapp", titulo: "WhatsApp do sistema" },
  { id: "compartilhamento", titulo: "Com quem compartilhamos" },
  { id: "retencao", titulo: "Por quanto tempo guardamos" },
  { id: "seguranca", titulo: "Segurança" },
  { id: "direitos", titulo: "Seus direitos" },
  { id: "exclusao", titulo: "Como pedir a exclusão dos dados" },
  { id: "navegador", titulo: "Armazenamento no navegador" },
  { id: "alteracoes", titulo: "Alterações desta política" },
  { id: "contato", titulo: "Contato" },
];

export default function Privacidade() {
  useEffect(() => {
    document.title = "Política de Privacidade — Gerenciador de Estabelecimentos";
    // Abre direto na seção quando vier com âncora (ex.: #exclusao)
    const id = window.location.hash.replace("#", "");
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
  }, []);

  return (
    <div className="priv-root">
      <div className="priv-pagina">
        <header className="priv-topo">
          <span className="priv-marca">Lucas J. Systems</span>
          <h1>Política de Privacidade</h1>
          <p className="priv-sub">Gerenciador de Estabelecimentos · atualizada em {ATUALIZADA_EM}</p>
          <p className="priv-resumo">
            Em poucas palavras: usamos os dados só para o sistema funcionar para a sua loja. Não vendemos dados, não usamos para
            propaganda, e você pode pedir a exclusão a qualquer momento pelo e-mail <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
          </p>
        </header>

        <nav className="priv-indice" aria-label="Seções">
          {SECOES.map((s, i) => <a key={s.id} href={`#${s.id}`}>{i + 1}. {s.titulo}</a>)}
        </nav>

        <main className="priv-conteudo">
          <section id="quem-somos">
            <h2>1. Quem somos</h2>
            <p>
              O <strong>Gerenciador de Estabelecimentos</strong> é um sistema on-line de gestão para comércios (caixa, estoque, clientes e fiado,
              financeiro, relatórios) oferecido pela <strong>Lucas J. Systems</strong>, responsável: Lucas dos Santos Jorge, Brasil.
              Esta política explica como tratamos dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
            </p>
            <p>
              Os dados que cada estabelecimento cadastra sobre os <em>próprios clientes, fornecedores e vendas</em> pertencem ao estabelecimento.
              Nesses casos, o estabelecimento é o controlador e nós tratamos os dados em nome dele, só para o sistema funcionar.
            </p>
          </section>

          <section id="dados">
            <h2>2. Quais dados tratamos</h2>
            <ul>
              <li><strong>Conta de acesso:</strong> nome, e-mail, telefone e senha (a senha é guardada de forma criptografada pelo provedor de autenticação — nós não temos acesso a ela).</li>
              <li><strong>Dados do estabelecimento:</strong> nome, CPF/CNPJ, endereço, telefone, e-mail e logotipo.</li>
              <li><strong>Dados de uso do sistema lançados pela loja:</strong> produtos, estoque, vendas, clientes (nome, telefone, CPF quando informado, compras e fiado), fornecedores, contas a pagar e relatórios.</li>
              <li><strong>Registros de atividade (auditoria):</strong> quem fez o quê e quando dentro do sistema, incluindo logins.</li>
              <li><strong>Pagamento da mensalidade:</strong> valor, data e situação do pagamento. Cartão e Pix são processados pelos intermediários de pagamento; <strong>não guardamos número de cartão</strong>.</li>
              <li><strong>WhatsApp do sistema:</strong> ver a seção 4.</li>
            </ul>
          </section>

          <section id="finalidades">
            <h2>3. Para que usamos</h2>
            <ul>
              <li>Prestar o serviço contratado: fazer o sistema funcionar, gerar relatórios e mostrar as informações da loja para quem tem acesso a ela.</li>
              <li>Cobrar a mensalidade e liberar ou bloquear o acesso conforme o pagamento.</li>
              <li>Enviar avisos do próprio serviço (vencimentos, alertas, comunicados), sem propaganda de terceiros.</li>
              <li>Segurança: evitar fraudes e acessos indevidos, e manter o registro de auditoria.</li>
              <li>Cumprir obrigações legais.</li>
            </ul>
            <p>Não vendemos dados e não usamos dados para publicidade.</p>
          </section>

          <section id="whatsapp">
            <h2>4. WhatsApp do sistema</h2>
            <p>O sistema tem um número de WhatsApp oficial (API do WhatsApp Business, da Meta) usado para atendimento automático das lojas que contratam o serviço. Nele tratamos:</p>
            <ul>
              <li><strong>Números cadastrados pela loja</strong> para usar o serviço, com o apelido informado e a confirmação por código.</li>
              <li><strong>Registro das mensagens:</strong> número, data e hora, tipo (alerta, resposta, mensagem recebida), situação (enviada, entregue, lida) e custo estimado. Esse registro serve para controle de uso, créditos e cobrança.</li>
              <li><strong>Conteúdo das mensagens:</strong> usado só para entender o pedido e responder. Quando o assistente com inteligência artificial estiver ativo, o texto da pergunta é enviado a um provedor de IA <em>apenas</em> para gerar a resposta, sem uso para outros fins.</li>
            </ul>
            <p>O WhatsApp do sistema é só para interação automática. Para falar com uma pessoa, o próprio robô indica o contato de suporte.</p>
          </section>

          <section id="compartilhamento">
            <h2>5. Com quem compartilhamos</h2>
            <p>Só com fornecedores que precisamos para o sistema funcionar, cada um apenas com o necessário:</p>
            <ul>
              <li><strong>Supabase</strong> — banco de dados, autenticação e armazenamento de arquivos;</li>
              <li><strong>Railway</strong> e <strong>Vercel</strong> — hospedagem do servidor e das telas;</li>
              <li><strong>Meta (WhatsApp Business Platform)</strong> — envio e recebimento das mensagens do WhatsApp do sistema;</li>
              <li><strong>Asaas</strong> e <strong>Efí Bank</strong> — cobrança da mensalidade (cartão e Pix);</li>
              <li><strong>Provedor de inteligência artificial</strong> — somente quando o assistente do WhatsApp estiver ativo, como descrito na seção 4.</li>
            </ul>
            <p>Alguns desses fornecedores podem guardar dados em servidores fora do Brasil, sempre com medidas de segurança adequadas. Também podemos compartilhar dados quando exigido por lei ou por ordem judicial.</p>
          </section>

          <section id="retencao">
            <h2>6. Por quanto tempo guardamos</h2>
            <p>
              Enquanto a conta do estabelecimento estiver ativa. Depois do encerramento, os dados são excluídos ou tornados anônimos,
              exceto o que precisamos manter por obrigação legal (por exemplo, registros fiscais e de pagamento) pelo prazo que a lei exigir.
            </p>
          </section>

          <section id="seguranca">
            <h2>7. Segurança</h2>
            <p>
              Conexões criptografadas (HTTPS), controle de acesso por perfil (administrador, operador), senhas criptografadas,
              registro de auditoria e separação dos dados de cada estabelecimento. Nenhum sistema é 100% imune a falhas; se ocorrer
              um incidente que possa trazer risco, avisaremos os afetados e as autoridades conforme a LGPD.
            </p>
          </section>

          <section id="direitos">
            <h2>8. Seus direitos</h2>
            <p>Pela LGPD, você pode pedir: confirmação de que tratamos seus dados, acesso a eles, correção, anonimização ou exclusão, portabilidade, informação sobre com quem compartilhamos e revogação de consentimento. Basta escrever para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.</p>
            <p>Se você é cliente de uma loja que usa o sistema, também pode falar direto com a loja, que é quem decide sobre esses dados.</p>
          </section>

          <section id="exclusao" className="priv-destaque">
            <h2>9. Como pedir a exclusão dos dados</h2>
            <ol>
              <li>Envie um e-mail para <a href={`mailto:${CONTATO}?subject=Exclus%C3%A3o%20de%20dados`}>{CONTATO}</a> com o assunto <strong>"Exclusão de dados"</strong>, informando seu nome e o e-mail ou número de telefone usado no sistema (e o nome do estabelecimento, se souber).</li>
              <li>Para parar de usar o WhatsApp do sistema, o dono da loja também pode remover o número na tela <strong>WhatsApp</strong> do sistema, a qualquer momento.</li>
              <li>Confirmamos o pedido e concluímos a exclusão em até <strong>15 dias</strong>, mantendo apenas o que a lei obriga a guardar.</li>
            </ol>
          </section>

          <section id="navegador">
            <h2>10. Armazenamento no navegador</h2>
            <p>O sistema guarda no seu navegador só o necessário para funcionar: a sessão de login e preferências como o tema claro/escuro e o tamanho da letra. Não usamos cookies de propaganda nem rastreadores de terceiros.</p>
          </section>

          <section id="alteracoes">
            <h2>11. Alterações desta política</h2>
            <p>Podemos atualizar esta política. A data da última versão fica no topo da página; mudanças importantes serão avisadas dentro do sistema.</p>
          </section>

          <section id="contato">
            <h2>12. Contato</h2>
            <p>Lucas J. Systems — responsável: Lucas dos Santos Jorge<br />E-mail: <a href={`mailto:${CONTATO}`}>{CONTATO}</a></p>
          </section>
        </main>

        <footer className="priv-rodape">
          <span>© {new Date().getFullYear()} Lucas J. Systems</span>
          <Link to="/login">Entrar no sistema</Link>
        </footer>
      </div>
    </div>
  );
}
