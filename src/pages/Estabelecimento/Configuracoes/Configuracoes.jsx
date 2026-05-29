// src/pages/Estabelecimento/Configuracoes/Configuracoes.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import { apiFetch } from '../../../utils/api';
import '../Configuracoes.css';

/* ════════════════════════════════════════════════════════════
   MODAL — Solicitar Alteração ao Administrador
   ════════════════════════════════════════════════════════════ */
const CAMPOS_ALTERAVEIS = [
  { key: 'nome_fantasia',     label: 'Nome do Estabelecimento' },
  { key: 'cnpj',              label: 'CNPJ' },
  { key: 'telefone',          label: 'Telefone' },
  { key: 'email_contato',     label: 'E-mail de contato' },
  { key: 'endereco_completo', label: 'Endereço' },
  { key: 'logo',              label: 'Logo' },
  { key: 'outro',             label: 'Outro (descreva abaixo)' },
];

function ModalSolicitarAlteracao({ nomeEstabelecimento, dadosAtuais, onFechar }) {
  const [camposSelecionados, setCamposSelecionados] = useState([]);
  const [detalhes, setDetalhes]     = useState('');
  const [enviado,  setEnviado]      = useState(false);

  function toggleCampo(key) {
    setCamposSelecionados(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function gerarMensagem() {
    const campos = camposSelecionados
      .map(k => CAMPOS_ALTERAVEIS.find(c => c.key === k)?.label)
      .filter(Boolean)
      .join(', ');

    const linhas = [
      `*Solicitação de Alteração de Dados*`,
      `Estabelecimento: *${nomeEstabelecimento}*`,
      '',
      `Campos a alterar: ${campos || '(não especificado)'}`,
    ];

    if (detalhes.trim()) {
      linhas.push('', `Detalhes: ${detalhes.trim()}`);
    }

    // Dados atuais relevantes
    linhas.push('', '*Dados atuais:*');
    if (dadosAtuais.nome_fantasia)     linhas.push(`• Nome: ${dadosAtuais.nome_fantasia}`);
    if (dadosAtuais.cnpj)             linhas.push(`• CNPJ: ${dadosAtuais.cnpj}`);
    if (dadosAtuais.telefone)         linhas.push(`• Tel: ${dadosAtuais.telefone}`);
    if (dadosAtuais.email_contato)    linhas.push(`• E-mail: ${dadosAtuais.email_contato}`);
    if (dadosAtuais.endereco_completo) linhas.push(`• Endereço: ${dadosAtuais.endereco_completo}`);

    return linhas.join('\n');
  }

  function enviarWhatsApp() {
    const msg = gerarMensagem();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setEnviado(true);
  }

  function copiarMensagem() {
    navigator.clipboard.writeText(gerarMensagem());
    setEnviado(true);
  }

  useEffect(() => {
    function handleEsc(e) { if (e.key === 'Escape') onFechar(); }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onFechar]);

  return (
    <div className="cfg-modal-overlay" onClick={onFechar}>
      <div className="cfg-modal" onClick={e => e.stopPropagation()}>
        <div className="cfg-modal-titulo">📨 Solicitar Alteração de Dados</div>
        <div className="cfg-modal-desc">
          Selecione o que deseja alterar e envie a solicitação ao administrador do sistema.
        </div>

        <div className="cfg-modal-campos">
          <span className="cfg-label">O que deseja alterar?</span>
          <div className="cfg-modal-checkboxes">
            {CAMPOS_ALTERAVEIS.map(c => (
              <label key={c.key} className="cfg-modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={camposSelecionados.includes(c.key)}
                  onChange={() => toggleCampo(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="cfg-modal-campos">
          <span className="cfg-label">Detalhes / novos valores</span>
          <textarea
            className="cfg-textarea"
            rows={4}
            placeholder="Ex: Novo nome: Mercearia do João&#10;Novo telefone: (54) 99999-8888"
            value={detalhes}
            onChange={e => setDetalhes(e.target.value)}
          />
        </div>

        {enviado && (
          <div className="cfg-modal-enviado">
            ✓ Solicitação preparada! Envie a mensagem ao administrador.
          </div>
        )}

        <div className="cfg-modal-acoes">
          <button className="cfg-modal-btn-cancelar" onClick={onFechar}>
            Cancelar (Esc)
          </button>
          <button
            className="cfg-modal-btn-copiar"
            onClick={copiarMensagem}
            disabled={camposSelecionados.length === 0 && !detalhes.trim()}
            title="Copiar mensagem para área de transferência"
          >
            📋 Copiar mensagem
          </button>
          <button
            className="cfg-modal-btn-whatsapp"
            onClick={enviarWhatsApp}
            disabled={camposSelecionados.length === 0 && !detalhes.trim()}
          >
            💬 Enviar pelo WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ════════════════════════════════════════════════════════════ */
export default function Configuracoes({ estabelecimentoId, onLogoAtualizada, logoUrl: logoUrlProp }) {

  const [dados,          setDados]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [erro,           setErro]           = useState('');
  const [showSolicitar,  setShowSolicitar]  = useState(false);

  const [uploading,     setUploading]     = useState(false);
  const [uploadErro,    setUploadErro]    = useState('');
  const [uploadSucesso, setUploadSucesso] = useState('');
  const fileInputRef = useRef(null);

  // Acordeões independentes: null = fechado, string = aba ativa
  const [abaImpressora,  setAbaImpressora]  = useState(null);
  const [abaBipador,     setAbaBipador]     = useState(null);
  const [abaCamera,      setAbaCamera]      = useState(null);

  /* ── Carregar dados ─────────────────────────────────────── */
  useEffect(() => {
    async function carregar() {
      if (!estabelecimentoId) return;
      setLoading(true);
      setErro('');
      try {
        const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`);
        if (!resp.ok) throw new Error('Falha ao carregar dados.');
        setDados(await resp.json());
      } catch (err) {
        setErro(err.message);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, [estabelecimentoId]);

  /* ── Upload de logo com deleção do arquivo antigo ──────── */
  async function handleUploadLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    const tiposPermitidos = ['image/png', 'image/jpeg', 'image/webp'];
    if (!tiposPermitidos.includes(file.type)) {
      setUploadErro('Formato inválido. Use PNG, JPG ou WEBP.');
      e.target.value = null;
      return;
    }

    // Validar tamanho (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setUploadErro('Arquivo muito grande. Tamanho máximo: 2MB.');
      e.target.value = null;
      return;
    }

    setUploading(true);
    setUploadErro('');
    setUploadSucesso('');

    try {
      // 1. Deletar logo antiga do storage (se existir)
      const logoAtual = dados?.logo_url;
      if (logoAtual) {
        // Extrair o path relativo dentro do bucket "logos"
        // URL formato: .../storage/v1/object/public/logos/CAMINHO
        const match = logoAtual.match(/\/logos\/(.+)$/);
        if (match?.[1]) {
          await supabase.storage.from('logos').remove([match[1]]);
        }
      }

      // 2. Upload do novo arquivo
      const ext      = file.name.split('.').pop().toLowerCase();
      const filePath = `public/${estabelecimentoId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      // 3. Obter URL pública
      const { data: publicData } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      if (!publicData?.publicUrl) throw new Error('Falha ao obter URL pública.');

      const novaUrl = `${publicData.publicUrl}?t=${Date.now()}`; // cache-bust

      // 4. Salvar no banco via API
      const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...dados, logo_url: novaUrl }),
      });
      if (!resp.ok) {
        const r = await resp.json();
        throw new Error(r.error || 'Erro ao salvar logo.');
      }

      // 5. Atualizar estado local
      setDados(prev => ({ ...prev, logo_url: novaUrl }));
      onLogoAtualizada?.(novaUrl);
      setUploadSucesso('Logo atualizada com sucesso!');
      setTimeout(() => setUploadSucesso(''), 4000);
    } catch (err) {
      setUploadErro(`Erro: ${err.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = null;
    }
  }

  if (loading) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando configurações…
      </div>
    );
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function Campo({ label, valor }) {
    return (
      <div className="cfg-form-group">
        <span className="cfg-label">{label}</span>
        <div className="cfg-campo-valor">
          {valor || <span className="cfg-campo-vazio">Não informado</span>}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="cfg-container">

      {showSolicitar && dados && (
        <ModalSolicitarAlteracao
          nomeEstabelecimento={dados.nome_fantasia}
          dadosAtuais={dados}
          onFechar={() => setShowSolicitar(false)}
        />
      )}

      {/* Header */}
      <div className="cfg-header">
        <span className="cfg-header-titulo">⚙️ Configurações</span>
        <span className="cfg-header-sub">Dados do estabelecimento — somente visualização</span>
      </div>

      <div className="cfg-content">
        <div className="cfg-grid">

          {/* ── Coluna esquerda ── */}
          <div>

            {/* Banner somente leitura */}
            <div className="cfg-banner-leitura">
              <span className="cfg-banner-icone">🔒</span>
              <div>
                <div className="cfg-banner-titulo">Dados gerenciados pelo administrador</div>
                <div className="cfg-banner-desc">
                  Para alterar qualquer informação, clique em <strong>Solicitar Alteração</strong> e envie a solicitação ao administrador do sistema.
                </div>
              </div>
              <button
                className="cfg-btn-solicitar"
                onClick={() => setShowSolicitar(true)}
              >
                📨 Solicitar Alteração
              </button>
            </div>

            {erro && <div className="cfg-alert erro">⚠️ {erro}</div>}

            {/* Dados do estabelecimento */}
            <div className="cfg-section">
              <span className="cfg-section-titulo">🏪 Dados do Estabelecimento</span>
              <div className="cfg-form-grid">
                <Campo label="Nome Fantasia"     valor={dados?.nome_fantasia} />
                <Campo label="CNPJ"              valor={dados?.cnpj} />
                <Campo label="Telefone"          valor={dados?.telefone} />
                <Campo label="E-mail de contato" valor={dados?.email_contato} />
                <div className="cfg-form-group cfg-form-full">
                  <span className="cfg-label">Endereço Completo</span>
                  <div className="cfg-campo-valor">
                    {dados?.endereco_completo || <span className="cfg-campo-vazio">Não informado</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Accordeão: Impressora Térmica ── */}
            <AccordionGuia
              icone="🖨️"
              titulo="Impressora Térmica"
              aberto={abaImpressora !== null}
              onToggle={() => setAbaImpressora(abaImpressora === null ? 'windows' : null)}
            >
              <p className="cfg-guia-intro">
                Configure sua impressora para imprimir recibos de 80mm diretamente do navegador — sem instalar nenhum software extra.
              </p>
              <SubAbas
                abas={[
                  { key: 'windows', label: '🖥️ Windows' },
                  { key: 'android', label: '📱 Android' },
                  { key: 'dicas',   label: '💡 Dicas' },
                ]}
                ativa={abaImpressora}
                onChange={setAbaImpressora}
              />

              {abaImpressora === 'windows' && (
                <GuiaSteps steps={[
                  { titulo: 'Instale o driver da impressora', desc: 'Conecte via USB e instale o driver. O Windows geralmente detecta automaticamente. Se não, baixe no site do fabricante (Elgin, Epson, Bematech).' },
                  { titulo: 'Defina como impressora padrão', desc: 'Painel de Controle → Dispositivos e Impressoras → botão direito na impressora → "Definir como impressora padrão".' },
                  { titulo: 'Configure o papel para 80mm', desc: 'Botão direito → Preferências de impressão → Tamanho do papel: "Receipt 80mm" ou crie um tamanho personalizado de 80mm de largura.' },
                  { titulo: 'Ajuste no Chrome', desc: 'Ao imprimir: selecione a impressora, desative cabeçalho/rodapé, margens: Nenhuma, escala: 100%.' },
                ]} dica="💡 Atalho: Win + I → Bluetooth e dispositivos → Impressoras e scanners" />
              )}

              {abaImpressora === 'android' && (
                <GuiaSteps steps={[
                  { titulo: 'Conecte via Bluetooth', desc: 'Ligue a impressora e ative o Bluetooth. Configurações → Bluetooth → pareie com a impressora (nome começa com "POS-" ou o modelo).' },
                  { titulo: 'Instale o RawBT', desc: 'Baixe o app "RawBT" (gratuito) na Play Store. Ele funciona como serviço de impressão para o Chrome Android.' },
                  { titulo: 'Configure o RawBT', desc: 'Abra o RawBT → selecione a impressora Bluetooth → papel: 80mm. O app fica em segundo plano.' },
                  { titulo: 'Imprima pelo Chrome', desc: 'Ao clicar em "Imprimir recibo", selecione "RawBT" como destino. O recibo vai direto para a impressora.' },
                ]} dica="💡 Impressoras WiFi são ainda mais fáceis — conecte na mesma rede e o Chrome detecta automaticamente." />
              )}

              {abaImpressora === 'dicas' && (
                <GuiaDicas dicas={[
                  { icone: '⚡', titulo: 'Teste antes de usar',      desc: 'Faça uma venda de R$ 0,01 e clique em Imprimir para conferir o layout.' },
                  { icone: '📐', titulo: 'Papel 80mm é o padrão',    desc: 'Se o recibo sair cortado, verifique o tamanho do papel nas preferências.' },
                  { icone: '🌐', titulo: 'Use Google Chrome',         desc: 'Chrome tem o melhor suporte a impressão. Evite Firefox e Safari.' },
                  { icone: '🔇', titulo: 'Impressão silenciosa',      desc: 'Configure como impressora padrão e ative impressão silenciosa em chrome://settings/content/print.' },
                  { icone: '🔋', titulo: 'Impressoras WiFi são melhores', desc: 'Modelos como Elgin i9 ou Epson TM-T20 funcionam sem fio em celular e computador.' },
                ]} />
              )}
            </AccordionGuia>

            {/* ── Accordeão: Bipador USB ── */}
            <AccordionGuia
              icone="📡"
              titulo="Bipador USB (Leitor de Código de Barras)"
              aberto={abaBipador !== null}
              onToggle={() => setAbaBipador(abaBipador === null ? 'como-funciona' : null)}
            >
              <p className="cfg-guia-intro">
                O bipador USB funciona automaticamente — não é necessário instalar nenhum software ou configurar nada no sistema.
              </p>
              <SubAbas
                abas={[
                  { key: 'como-funciona', label: '⚡ Como funciona' },
                  { key: 'configurar',    label: '🔧 Configurar' },
                  { key: 'dicas',         label: '💡 Dicas' },
                ]}
                ativa={abaBipador}
                onChange={setAbaBipador}
              />

              {abaBipador === 'como-funciona' && (
                <div className="cfg-guia-conteudo">
                  <div className="cfg-guia-destaque">
                    <span className="cfg-guia-destaque-icone">🎯</span>
                    <div>
                      <div className="cfg-guia-destaque-titulo">Plug & Play — só conectar e usar</div>
                      <div className="cfg-guia-destaque-desc">O bipador se comporta como um teclado USB. Quando você bipa um produto, ele "digita" o código de barras no campo de busca do PDV automaticamente.</div>
                    </div>
                  </div>
                  <GuiaSteps steps={[
                    { titulo: 'Conecte o bipador na porta USB', desc: 'O sistema operacional reconhece automaticamente como teclado. Nenhum driver adicional é necessário na maioria dos modelos.' },
                    { titulo: 'Abra o módulo PDV (Caixa)', desc: 'O cursor estará automaticamente no campo de busca. O PDV sempre volta o foco para esse campo após cada ação.' },
                    { titulo: 'Aponte e bipe o produto', desc: 'O bipador vai "digitar" o código e pressionar Enter automaticamente. O sistema detecta a velocidade de digitação do bipador e busca o produto.' },
                    { titulo: 'Produto selecionado automaticamente', desc: 'Se o código corresponder a exatamente 1 produto, ele é adicionado ao carrinho imediatamente. Se houver múltiplos resultados, a lista é exibida.' },
                  ]} />
                </div>
              )}

              {abaBipador === 'configurar' && (
                <div className="cfg-guia-conteudo">
                  <GuiaSteps steps={[
                    { titulo: 'Cadastre o código de barras no produto', desc: 'Vá em Estoque → edite o produto → campo "Código de barras". Digite manualmente, bipe direto no campo com o bipador USB, ou use o botão 📷 para escanear pela câmera.' },
                    { titulo: 'Teste no PDV', desc: 'Com o PDV aberto, bipe o produto. Se o código estiver cadastrado, o produto aparece na lista. Se não aparecer, verifique se o código foi salvo corretamente.' },
                    { titulo: 'Bipador não lê?', desc: 'Alguns bipadores precisam de configuração para enviar Enter após o código. Consulte o manual do modelo — geralmente é bipar um QR Code especial que vem no manual para ativar o "modo Enter".' },
                  ]} dica="💡 O campo de código de barras no cadastro de produto também aceita leitura direta do bipador — basta clicar no campo e bipar." />
                </div>
              )}

              {abaBipador === 'dicas' && (
                <GuiaDicas dicas={[
                  { icone: '🔌', titulo: 'USB é o mais confiável',        desc: 'Bipadores USB funcionam em qualquer computador sem configuração. Bluetooth pode ter latência e desconexões.' },
                  { icone: '📏', titulo: 'Distância ideal de leitura',    desc: 'Mantenha o bipador a 5–20cm do código. Muito perto ou muito longe pode dificultar a leitura.' },
                  { icone: '💡', titulo: 'Iluminação ajuda',              desc: 'Em ambientes escuros, alguns bipadores têm dificuldade com códigos impressos em superfícies brilhantes. Use o bipador com luz de mira.' },
                  { icone: '🏷️', titulo: 'Código não cadastrado',        desc: 'Se o bipador ler mas não encontrar o produto, o PDV mostrará "Código não encontrado". Cadastre o produto no Estoque com aquele código.' },
                  { icone: '⚡', titulo: 'Leitura instantânea',          desc: 'O sistema detecta que o código veio do bipador pela velocidade de digitação (< 50ms entre teclas) e finiza a busca automaticamente.' },
                  { icone: '🔁', titulo: 'Mesmo produto várias vezes',   desc: 'Bipe o mesmo código várias vezes para adicionar múltiplas unidades. Cada bipada soma +1 ao carrinho.' },
                ]} />
              )}
            </AccordionGuia>

            {/* ── Accordeão: Câmera ── */}
            <AccordionGuia
              icone="📷"
              titulo="Câmera (Leitura pelo Computador ou Notebook)"
              aberto={abaCamera !== null}
              onToggle={() => setAbaCamera(abaCamera === null ? 'pdv' : null)}
            >
              <p className="cfg-guia-intro">
                Use a câmera do computador, notebook ou tablet para ler códigos de barras diretamente no PDV e no cadastro de produtos — sem precisar de um bipador físico.
              </p>
              <SubAbas
                abas={[
                  { key: 'pdv',      label: '🛒 No PDV' },
                  { key: 'estoque',  label: '📦 No Estoque' },
                  { key: 'dicas',    label: '💡 Dicas' },
                ]}
                ativa={abaCamera}
                onChange={setAbaCamera}
              />

              {abaCamera === 'pdv' && (
                <div className="cfg-guia-conteudo">
                  <div className="cfg-guia-destaque">
                    <span className="cfg-guia-destaque-icone">📷</span>
                    <div>
                      <div className="cfg-guia-destaque-titulo">Botão 📷 ao lado do campo de busca</div>
                      <div className="cfg-guia-destaque-desc">No PDV, há um botão de câmera ao lado do campo de busca. Clique nele para abrir o leitor de câmera.</div>
                    </div>
                  </div>
                  <GuiaSteps steps={[
                    { titulo: 'Clique no botão 📷 no PDV', desc: 'O botão fica ao lado direito do campo de busca de produtos. Uma janela com o feed da câmera será aberta.' },
                    { titulo: 'Permita o acesso à câmera', desc: 'O navegador pedirá permissão de acesso à câmera na primeira vez. Clique em "Permitir". Essa permissão fica salva para as próximas vezes.' },
                    { titulo: 'Aponte para o código de barras', desc: 'Centralize o código de barras na área de mira (cantos verdes). A câmera detecta automaticamente e fecha o modal ao ler.' },
                    { titulo: 'Produto buscado automaticamente', desc: 'Após a leitura, o sistema busca o produto pelo código detectado — mesmo fluxo do bipador USB.' },
                  ]} dica="💡 Para melhor leitura: boa iluminação, código limpo e centralizado na tela. Distância ideal: 15–30cm." />
                </div>
              )}

              {abaCamera === 'estoque' && (
                <div className="cfg-guia-conteudo">
                  <GuiaSteps steps={[
                    { titulo: 'Edite ou crie um produto no Estoque', desc: 'Vá em Estoque → clique em + Novo produto ou edite um existente.' },
                    { titulo: 'Localize o campo "Código de barras"', desc: 'No formulário do produto, o campo de código de barras tem um botão 📷 ao lado.' },
                    { titulo: 'Clique no botão 📷 e escaneie', desc: 'O modal da câmera abre. Aponte para o código de barras do produto físico e o código será preenchido automaticamente no campo.' },
                    { titulo: 'Salve o produto', desc: 'Com o código preenchido, confira os demais dados e clique em Salvar. O produto agora pode ser buscado pelo bipador ou câmera no PDV.' },
                  ]} dica="💡 Essa é a forma mais rápida de cadastrar o código de barras de vários produtos — sem digitar nada." />
                </div>
              )}

              {abaCamera === 'dicas' && (
                <GuiaDicas dicas={[
                  { icone: '💡', titulo: 'Iluminação é essencial',         desc: 'Câmeras de notebook leem melhor com boa luz. Evite reflexos diretos no código de barras.' },
                  { icone: '📐', titulo: 'Distância ideal: 15–30cm',       desc: 'Muito perto pode desfocar. Muito longe pode perder detalhes. Ajuste até a linha laser ficar sobre o código.' },
                  { icone: '🔄', titulo: 'Botão de trocar câmera',         desc: 'Se o dispositivo tiver mais de uma câmera, há um botão 🔄 para alternar entre elas.' },
                  { icone: '🖥️', titulo: 'Melhor no notebook/desktop',    desc: 'A câmera traseira do celular é melhor para leitura, mas em computadores a câmera frontal funciona bem para códigos impressos.' },
                  { icone: '❌', titulo: 'Câmera não abre?',               desc: 'Verifique se o navegador tem permissão de câmera: clique no ícone de cadeado na barra de endereço → Câmera → Permitir.' },
                  { icone: '🔌', titulo: 'Para uso intenso: use bipador',  desc: 'Para caixas com alto volume, um bipador USB físico é mais rápido e confiável. A câmera é ideal para uso esporádico.' },
                ]} />
              )}
            </AccordionGuia>

          </div>

          {/* ── Coluna direita: logo ── */}
          <div className="cfg-logo-section">
            <span className="cfg-logo-titulo">🖼 Logo</span>

            <div className="cfg-logo-preview">
              {(dados?.logo_url || logoUrlProp) ? (
                <img src={dados?.logo_url || logoUrlProp} alt="Logo do estabelecimento" />
              ) : (
                <div className="cfg-logo-preview-vazio">
                  <span>🖼</span>
                  <p>Sem logo</p>
                </div>
              )}
            </div>

            {/* Input file oculto */}
            <input
              ref={fileInputRef}
              type="file"
              className="cfg-logo-file-input"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={handleUploadLogo}
            />

            <label
              className={`cfg-btn-upload${uploading ? ' uploading' : ''}`}
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              {uploading ? '⏳ Enviando…' : '📸 Alterar logo'}
            </label>

            {uploadErro && (
              <div className="cfg-logo-feedback erro">⚠️ {uploadErro}</div>
            )}
            {uploadSucesso && (
              <div className="cfg-logo-feedback sucesso">✓ {uploadSucesso}</div>
            )}

            <span className="cfg-logo-hint">
              PNG, JPG ou WEBP · máx. 2MB<br />
              A logo anterior é removida automaticamente.
            </span>
          </div>

        </div>
      </div>

    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   SUB-COMPONENTES INTERNOS
   ════════════════════════════════════════════════════════════ */
function AccordionGuia({ icone, titulo, aberto, onToggle, children }) {
  return (
    <div className="cfg-section cfg-accordion">
      <button type="button" className="cfg-accordion-header" onClick={onToggle}>
        <span className="cfg-section-titulo" style={{ margin: 0, padding: 0, border: 'none' }}>
          {icone} {titulo}
        </span>
        <span className={`cfg-accordion-chevron${aberto ? ' aberto' : ''}`}>▼</span>
      </button>
      {aberto && (
        <div className="cfg-accordion-body">
          {children}
        </div>
      )}
    </div>
  );
}

function SubAbas({ abas, ativa, onChange }) {
  return (
    <div className="cfg-guia-tabs">
      {abas.map(t => (
        <button
          key={t.key}
          type="button"
          className={`cfg-guia-tab${ativa === t.key ? ' ativo' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function GuiaSteps({ steps, dica }) {
  return (
    <div className="cfg-guia-conteudo">
      <div className="cfg-guia-steps">
        {steps.map((s, i) => (
          <div key={i} className="cfg-guia-step">
            <span className="cfg-guia-step-num">{i + 1}</span>
            <div>
              <div className="cfg-guia-step-titulo">{s.titulo}</div>
              <div className="cfg-guia-step-desc">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
      {dica && <div className="cfg-guia-dica">{dica}</div>}
    </div>
  );
}

function GuiaDicas({ dicas }) {
  return (
    <div className="cfg-guia-conteudo">
      <div className="cfg-guia-dicas-lista">
        {dicas.map((d, i) => (
          <div key={i} className="cfg-guia-dica-item">
            <span className="cfg-guia-dica-icone">{d.icone}</span>
            <div>
              <div className="cfg-guia-step-titulo">{d.titulo}</div>
              <div className="cfg-guia-step-desc">{d.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}