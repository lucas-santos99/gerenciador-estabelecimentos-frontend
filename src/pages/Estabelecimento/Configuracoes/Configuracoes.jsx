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
  { key: 'telefone',          label: 'Telefone/celular principal' },
  { key: 'telefones_extras',  label: 'Telefones adicionais' },
  { key: 'email_contato',     label: 'E-mail de contato' },
  { key: 'endereco_completo', label: 'Endereço principal' },
  { key: 'enderecos_extras',  label: 'Endereços adicionais' },
  { key: 'logo',              label: 'Logo' },
  { key: 'outro',             label: 'Outro (descreva abaixo)' },
];

// Formata chave Pix do tipo telefone pro padrão exigido: +55DDDNUMERO,
// sem espaço/traço. Se já vier com o +55, não mexe; se faltar, completa.
function formatarChavePixTelefone(valor) {
  const digitos = (valor || '').replace(/\D/g, ''); // só números
  if (!digitos) return valor;

  // Já tem o 55 na frente (com 12 ou 13 dígitos: 55 + DDD + 8/9 dígitos)?
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) {
    return `+${digitos}`;
  }
  // Só DDD + número (10 ou 11 dígitos) — completa com 55 na frente
  if (digitos.length === 10 || digitos.length === 11) {
    return `+55${digitos}`;
  }
  // Não bateu com nenhum padrão esperado — devolve só com o + na frente,
  // pra pelo menos não ficar sem o símbolo exigido pelo Bacen
  return `+${digitos}`;
}

// Valor atual de cada campo alterável, lido direto dos dados do estabelecimento
function valorAtualDoCampo(key, dadosAtuais) {
  switch (key) {
    case 'nome_fantasia':     return dadosAtuais.nome_fantasia || '';
    case 'cnpj':               return dadosAtuais.cnpj || '';
    case 'telefone':           return dadosAtuais.telefone || '';
    case 'telefones_extras':   return (dadosAtuais.telefones_extras || []).join(', ');
    case 'email_contato':      return dadosAtuais.email_contato || '';
    case 'endereco_completo':  return dadosAtuais.endereco_completo || '';
    case 'enderecos_extras':   return (dadosAtuais.enderecos_extras || []).join(', ');
    case 'logo':               return '(imagem atual)';
    default:                   return '';
  }
}

function ModalSolicitarAlteracao({ nomeEstabelecimento, dadosAtuais, estabelecimentoId, onFechar }) {
  // valoresNovos: { [chaveDoCampo]: novoValorDigitado } — a presença da
  // chave aqui é o que define se o campo está selecionado ou não.
  const [valoresNovos, setValoresNovos] = useState({});
  const [detalhes, setDetalhes]     = useState('');
  const [feedback, setFeedback] = useState(null); // { texto } — mensagem específica da última ação
  const [enviandoPainel, setEnviandoPainel] = useState(false);
  const [erroPainel,     setErroPainel]     = useState('');

  function toggleCampo(key) {
    setFeedback(null);
    setValoresNovos(prev => {
      if (key in prev) {
        const { [key]: _, ...resto } = prev;
        return resto;
      }
      return { ...prev, [key]: '' };
    });
  }

  function atualizarValorNovo(key, valor) {
    setFeedback(null);
    setValoresNovos(prev => ({ ...prev, [key]: valor }));
  }

  const camposSelecionados = Object.keys(valoresNovos);

  function montarListaCampos() {
    return camposSelecionados.map(key => ({
      campo:        key,
      label:        CAMPOS_ALTERAVEIS.find(c => c.key === key)?.label || key,
      valor_atual:  valorAtualDoCampo(key, dadosAtuais),
      valor_novo:   valoresNovos[key],
    }));
  }

  function gerarMensagem() {
    const linhas = [
      `*Solicitação de Alteração de Dados*`,
      `Estabelecimento: *${nomeEstabelecimento}*`,
      '',
    ];

    if (camposSelecionados.length > 0) {
      linhas.push('*Campos a alterar:*');
      montarListaCampos().forEach(c => {
        linhas.push(`• ${c.label}: "${c.valor_atual || '—'}" → "${c.valor_novo || '(não informado)'}"`);
      });
      linhas.push('');
    }

    if (detalhes.trim()) {
      linhas.push(`Detalhes: ${detalhes.trim()}`, '');
    }

    return linhas.join('\n');
  }

  function enviarWhatsApp() {
    const msg = gerarMensagem();
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setFeedback('💬 WhatsApp aberto — confirme o envio por lá.');
  }

  function copiarMensagem() {
    navigator.clipboard.writeText(gerarMensagem());
    setFeedback('📋 Mensagem copiada! Cole onde quiser enviar.');
  }

  async function enviarPainel() {
    setEnviandoPainel(true);
    setErroPainel('');
    try {
      const resp = await apiFetch('/api/solicitacoes', {
        method: 'POST',
        body: JSON.stringify({
          campos: montarListaCampos(),
          detalhes: detalhes.trim() || null,
        }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setErroPainel(j.error || 'Erro ao enviar solicitação.');
      } else {
        setFeedback('✓ Solicitação enviada! O administrador vai receber o pedido.');
      }
    } catch {
      setErroPainel('Erro ao enviar solicitação. Verifique sua conexão.');
    }
    setEnviandoPainel(false);
  }

  // Cada campo selecionado precisa ter um valor novo preenchido — não
  // basta marcar a caixinha (ex: marcar "Outro" e deixar em branco não
  // gera uma solicitação útil pro admin). Se nenhum campo foi
  // selecionado, exige ao menos os detalhes preenchidos.
  const todosCamposComValor = camposSelecionados.every(k => (valoresNovos[k] || '').trim());
  const podeEnviar = camposSelecionados.length > 0
    ? todosCamposComValor
    : detalhes.trim().length > 0;

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
          Selecione o que deseja alterar, digite o novo valor e envie a solicitação ao administrador do sistema.
        </div>

        <div className="cfg-modal-campos">
          <span className="cfg-label">O que deseja alterar?</span>
          <div className="cfg-modal-campos-lista">
            {CAMPOS_ALTERAVEIS.map(c => {
              const selecionado = c.key in valoresNovos;
              const atual = valorAtualDoCampo(c.key, dadosAtuais);
              return (
                <div key={c.key} className="cfg-modal-campo-item">
                  <label className="cfg-modal-checkbox-label">
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => toggleCampo(c.key)}
                    />
                    {c.label}
                  </label>

                  {selecionado && c.key !== 'outro' && c.key !== 'logo' && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 10px 24px" }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted, #888)", display: "block" }}>Atual</span>
                        <div className="cfg-campo-valor" style={{ opacity: 0.7 }}>
                          {atual || <span className="cfg-campo-vazio">Não informado</span>}
                        </div>
                      </div>
                      <span style={{ color: "var(--text-muted, #888)" }}>→</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted, #888)", display: "block" }}>Novo valor</span>
                        <input
                          className="est-input"
                          value={valoresNovos[c.key]}
                          onChange={e => atualizarValorNovo(c.key, e.target.value)}
                          placeholder="Digite o novo valor…"
                        />
                      </div>
                    </div>
                  )}

                  {selecionado && (c.key === 'outro' || c.key === 'logo') && (
                    <div style={{ margin: "6px 0 10px 24px" }}>
                      <input
                        className="est-input"
                        value={valoresNovos[c.key]}
                        onChange={e => atualizarValorNovo(c.key, e.target.value)}
                        placeholder={c.key === 'logo' ? 'Alguma observação sobre a nova logo? (opcional)' : 'Descreva o que precisa mudar…'}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cfg-modal-campos">
          <span className="cfg-label">Detalhes adicionais (opcional)</span>
          <textarea
            className="cfg-textarea"
            rows={3}
            placeholder="Alguma outra informação que ajude o administrador a entender o pedido…"
            value={detalhes}
            onChange={e => { setDetalhes(e.target.value); setFeedback(null); }}
          />
        </div>

        {erroPainel && <div className="cfg-alert erro">⚠️ {erroPainel}</div>}

        {feedback && (
          <div className="cfg-modal-enviado">
            {feedback}
          </div>
        )}

        {!podeEnviar && (
          <div style={{ fontSize: 12, color: "var(--text-muted, #888)", marginTop: -4, marginBottom: 8 }}>
            {camposSelecionados.length > 0
              ? "Preencha o novo valor de cada campo selecionado pra poder enviar."
              : "Selecione um campo ou escreva os detalhes pra poder enviar."}
          </div>
        )}

        <div className="cfg-modal-acoes">
          <button className="cfg-modal-btn-cancelar" onClick={onFechar}>
            Cancelar (Esc)
          </button>
          <button
            className="cfg-modal-btn-copiar"
            onClick={copiarMensagem}
            disabled={!podeEnviar}
            title="Copiar mensagem para área de transferência"
          >
            📋 Copiar
          </button>
          <button
            className="cfg-modal-btn-whatsapp"
            onClick={enviarWhatsApp}
            disabled={!podeEnviar}
          >
            💬 WhatsApp
          </button>
          <button
            className="cfg-modal-btn-whatsapp"
            onClick={enviarPainel}
            disabled={!podeEnviar || enviandoPainel}
            title="Envia a solicitação direto pro painel do administrador"
          >
            {enviandoPainel ? "⏳ Enviando…" : "📨 Enviar pro Painel"}
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

  const [abaCfg, setAbaCfg] = useState('dados'); // 'dados' | 'logo' | 'pagamentos' | 'tutoriais'

  // Configuração de Pix — carregada de `dados` quando chega da API
  const [pixForm,      setPixForm]      = useState({ pix_chave: '', pix_tipo_chave: 'cpf', pix_cidade: '', pix_modo: 'maquininha' });
  const [salvandoPix,  setSalvandoPix]  = useState(false);
  const [pixErro,      setPixErro]      = useState('');
  const [pixSucesso,   setPixSucesso]   = useState('');

  // Fiado — opcional por estabelecimento (lojas que não trabalham com
  // crédito informal simplesmente desligam e a aba some pros clientes)
  const [fiadoAtivo,    setFiadoAtivo]    = useState(true);
  const [salvandoFiado, setSalvandoFiado] = useState(false);
  const [fiadoErro,     setFiadoErro]     = useState('');
  const [fiadoSucesso,  setFiadoSucesso]  = useState('');

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

  /* ── Sincroniza o form de Pix quando os dados chegam ──────── */
  useEffect(() => {
    if (!dados) return;
    setPixForm({
      pix_chave:      dados.pix_chave      || '',
      pix_tipo_chave: dados.pix_tipo_chave || 'cpf',
      pix_cidade:     dados.pix_cidade     || '',
      pix_modo:       dados.pix_modo       || 'maquininha',
    });
    setFiadoAtivo(dados.fiado_ativo !== false); // default true se ainda não vier definido
  }, [dados]);

  /* ── Salvar liga/desliga do Fiado ───────────────────────────── */
  async function salvarFiado(novoValor) {
    setFiadoErro('');
    setFiadoSucesso('');
    setSalvandoFiado(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fiado_ativo: novoValor }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao salvar.');
      setFiadoAtivo(novoValor);
      setDados(prev => ({ ...prev, fiado_ativo: novoValor }));
      setFiadoSucesso(novoValor ? 'Fiado ativado!' : 'Fiado desativado.');
      setTimeout(() => setFiadoSucesso(''), 4000);
    } catch (err) {
      setFiadoErro(err.message);
    } finally {
      setSalvandoFiado(false);
    }
  }

  /* ── Salvar configuração de Pix ────────────────────────────── */
  async function salvarPix() {
    setPixErro('');
    setPixSucesso('');

    if (pixForm.pix_modo === 'sistema' && (!pixForm.pix_chave.trim() || !pixForm.pix_cidade.trim())) {
      setPixErro('Pra usar o Pix pelo sistema, preencha a chave Pix e a cidade.');
      return;
    }

    setSalvandoPix(true);
    try {
      const resp = await apiFetch(`/api/estabelecimentos/dados/${estabelecimentoId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(pixForm),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'Erro ao salvar.');
      setDados(prev => ({ ...prev, ...pixForm }));
      setPixSucesso('Configuração de Pix salva!');
      setTimeout(() => setPixSucesso(''), 4000);
    } catch (err) {
      setPixErro(err.message);
    } finally {
      setSalvandoPix(false);
    }
  }

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
          estabelecimentoId={estabelecimentoId}
          onFechar={() => setShowSolicitar(false)}
        />
      )}

      {/* Header com tabs */}
      <div className="cfg-header">
        <span className="cfg-header-titulo">⚙️ Configurações</span>
        <div className="cfg-tabs">
          {[
            { key: 'dados',      label: '🏪 Dados' },
            { key: 'logo',       label: '🖼️ Logo' },
            { key: 'pagamentos', label: '💳 Pagamentos' },
            { key: 'fiado',      label: '💰 Fiado' },
            { key: 'tutoriais',  label: '📚 Tutoriais' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              className={`cfg-tab${abaCfg === t.key ? ' ativo' : ''}`}
              onClick={() => setAbaCfg(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cfg-content">

        {/* ══ ABA DADOS ══ */}
        {abaCfg === 'dados' && (
          <div className="cfg-aba-maxwidth">
            <div className="cfg-banner-leitura">
              <span className="cfg-banner-icone">🔒</span>
              <div>
                <div className="cfg-banner-titulo">Dados gerenciados pelo administrador</div>
                <div className="cfg-banner-desc">
                  Para alterar qualquer informação, clique em <strong>Solicitar Alteração</strong> e envie a solicitação ao administrador do sistema.
                </div>
              </div>
              <button className="cfg-btn-solicitar" onClick={() => setShowSolicitar(true)}>
                📨 Solicitar Alteração
              </button>
            </div>

            {erro && <div className="cfg-alert erro">⚠️ {erro}</div>}

            <div className="cfg-section">
              <span className="cfg-section-titulo">🏪 Dados do Estabelecimento</span>
              <div className="cfg-form-grid">
                <Campo label="Nome Fantasia"          valor={dados?.nome_fantasia} />
                <Campo label="CNPJ"                   valor={dados?.cnpj} />
                <Campo label="Telefone/celular principal" valor={dados?.telefone} />
                <Campo label="E-mail de contato"      valor={dados?.email_contato} />
                {(dados?.telefones_extras || []).map((tel, idx) => (
                  <Campo key={`tel-extra-${idx}`} label={`Telefone adicional ${idx + 1}`} valor={tel} />
                ))}
                <div className="cfg-form-group cfg-form-full">
                  <span className="cfg-label">Endereço Completo</span>
                  <div className="cfg-campo-valor">
                    {dados?.endereco_completo || <span className="cfg-campo-vazio">Não informado</span>}
                  </div>
                </div>
                {(dados?.enderecos_extras || []).map((end, idx) => (
                  <div className="cfg-form-group cfg-form-full" key={`end-extra-${idx}`}>
                    <span className="cfg-label">Local adicional {idx + 1}</span>
                    <div className="cfg-campo-valor">{end}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ ABA LOGO ══ */}
        {abaCfg === 'logo' && (
          <div className="cfg-aba-logo-centrada">
            <div className="cfg-logo-card">
              <span className="cfg-section-titulo">🖼️ Logo do Estabelecimento</span>
              <p className="cfg-guia-intro">
                Você pode alterar a logo diretamente. A imagem anterior é removida automaticamente do sistema para não ocupar espaço desnecessário.
              </p>

              <div className="cfg-logo-preview cfg-logo-preview--grande">
                {(dados?.logo_url || logoUrlProp) ? (
                  <img src={dados?.logo_url || logoUrlProp} alt="Logo do estabelecimento" />
                ) : (
                  <div className="cfg-logo-preview-vazio">
                    <span>🖼</span>
                    <p>Sem logo cadastrada</p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className="cfg-logo-file-input"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={handleUploadLogo}
              />

              <label
                className={`cfg-btn-upload cfg-btn-upload--grande${uploading ? ' uploading' : ''}`}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                {uploading ? '⏳ Enviando…' : '📸 Escolher nova logo'}
              </label>

              {uploadErro    && <div className="cfg-logo-feedback erro">⚠️ {uploadErro}</div>}
              {uploadSucesso && <div className="cfg-logo-feedback sucesso">✓ {uploadSucesso}</div>}

              <div className="cfg-logo-requisitos">
                <div className="cfg-logo-req-item">✅ Formatos aceitos: PNG, JPG, WEBP</div>
                <div className="cfg-logo-req-item">✅ Tamanho máximo: 2MB</div>
                <div className="cfg-logo-req-item">✅ Recomendado: imagem quadrada, fundo transparente</div>
                <div className="cfg-logo-req-item">🗑️ A logo anterior é removida automaticamente</div>
              </div>
            </div>
          </div>
        )}

        {/* ══ ABA PAGAMENTOS ══ */}
        {abaCfg === 'pagamentos' && (
          <div className="cfg-aba-maxwidth">
            <div className="cfg-section">
              <span className="cfg-section-titulo">💳 Pix — como receber</span>
              <p className="cfg-guia-intro">
                Escolha o padrão de recebimento de Pix do seu estabelecimento. Isso vale tanto pro PDV quanto
                pro recebimento de fiado — o caixa ainda pode trocar na hora se precisar, isso aqui só define
                o que já vem selecionado.
              </p>

              <div className="cfg-form-grid" style={{ marginBottom: 18 }}>
                <label className={`cfg-radio-card${pixForm.pix_modo === 'maquininha' ? ' ativo' : ''}`}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, border: '1.5px solid var(--est-border, #e2e8f0)', borderRadius: 10, cursor: 'pointer' }}>
                  <input type="radio" checked={pixForm.pix_modo === 'maquininha'}
                    onChange={() => setPixForm(p => ({ ...p, pix_modo: 'maquininha' }))} style={{ marginTop: 3 }} />
                  <div>
                    <strong>📟 Pela maquininha</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--est-text-muted, #64748b)' }}>
                      O caixa seleciona Pix e cobra na própria máquina de cartão. Nada muda no sistema.
                    </div>
                  </div>
                </label>

                <label className={`cfg-radio-card${pixForm.pix_modo === 'sistema' ? ' ativo' : ''}`}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 14, border: '1.5px solid var(--est-border, #e2e8f0)', borderRadius: 10, cursor: 'pointer' }}>
                  <input type="radio" checked={pixForm.pix_modo === 'sistema'}
                    onChange={() => setPixForm(p => ({ ...p, pix_modo: 'sistema' }))} style={{ marginTop: 3 }} />
                  <div>
                    <strong>🖥️ Pela tela do sistema</strong>
                    <div style={{ fontSize: '0.82rem', color: 'var(--est-text-muted, #64748b)' }}>
                      O PDV gera um QR Code na hora, com o valor já preenchido. O caixa confirma manualmente
                      quando o dinheiro cair na conta.
                    </div>
                  </div>
                </label>
              </div>

              {pixForm.pix_modo === 'sistema' && (
                <>
                  <div className="cfg-form-grid">
                    <div className="cfg-form-group">
                      <span className="cfg-label">Tipo de chave Pix</span>
                      <select className="cfg-input" value={pixForm.pix_tipo_chave}
                        onChange={e => setPixForm(p => ({ ...p, pix_tipo_chave: e.target.value }))}>
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="telefone">Telefone</option>
                        <option value="aleatoria">Chave aleatória</option>
                      </select>
                    </div>
                    <div className="cfg-form-group">
                      <span className="cfg-label">Chave Pix</span>
                      <input className="cfg-input" value={pixForm.pix_chave}
                        placeholder={
                          pixForm.pix_tipo_chave === 'telefone' ? '+5553999999999' :
                          pixForm.pix_tipo_chave === 'cpf'       ? '12345678900' :
                          pixForm.pix_tipo_chave === 'cnpj'      ? '12345678000199' :
                          pixForm.pix_tipo_chave === 'email'     ? 'seu@email.com' :
                                                                    'Chave aleatória gerada pelo banco'
                        }
                        onChange={e => setPixForm(p => ({ ...p, pix_chave: e.target.value }))}
                        onBlur={e => {
                          if (pixForm.pix_tipo_chave !== 'telefone') return;
                          const formatada = formatarChavePixTelefone(e.target.value);
                          if (formatada !== pixForm.pix_chave) setPixForm(p => ({ ...p, pix_chave: formatada }));
                        }}
                      />
                      {pixForm.pix_tipo_chave === 'telefone' && (
                        <span className="cfg-label-hint" style={{ fontSize: '0.75rem', color: 'var(--est-text-muted, #94a3b8)' }}>
                          Precisa do código do país (+55) na frente — se você digitar só o DDD e o número, a gente completa sozinho ao sair do campo.
                        </span>
                      )}
                    </div>
                    <div className="cfg-form-group">
                      <span className="cfg-label">Cidade (do beneficiário)</span>
                      <input className="cfg-input" value={pixForm.pix_cidade}
                        placeholder="Ex: PORTO ALEGRE" maxLength={15}
                        onChange={e => setPixForm(p => ({ ...p, pix_cidade: e.target.value.toUpperCase() }))} />
                      <span className="cfg-label-hint" style={{ fontSize: '0.75rem', color: 'var(--est-text-muted, #94a3b8)' }}>
                        Exigido pelo padrão do Banco Central, máx. 15 caracteres
                      </span>
                    </div>
                  </div>
                  <div className="cfg-alert" style={{ background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', border: '1px solid rgba(59,130,246,0.2)', marginTop: 12 }}>
                    ℹ️ Essa chave é sua — o dinheiro cai direto na sua conta. O sistema só gera o código do
                    QR, nunca recebe nem intermedia o valor.
                  </div>
                </>
              )}

              {pixErro    && <div className="cfg-alert erro" style={{ marginTop: 12 }}>⚠️ {pixErro}</div>}
              {pixSucesso && <div className="cfg-alert" style={{ marginTop: 12, background: 'rgba(34,197,94,0.1)', color: '#15803d' }}>✓ {pixSucesso}</div>}

              <button className="cfg-btn-solicitar" style={{ marginTop: 16 }} onClick={salvarPix} disabled={salvandoPix}>
                {salvandoPix ? '⏳ Salvando…' : '✓ Salvar configuração de Pix'}
              </button>
            </div>
          </div>
        )}

        {/* ══ ABA FIADO ══ */}
        {abaCfg === 'fiado' && (
          <div className="cfg-aba-maxwidth">
            <div className="cfg-section">
              <span className="cfg-section-titulo">💰 Fiado</span>
              <p className="cfg-guia-intro">
                Nem toda loja trabalha com crédito informal — ligue só se fizer sentido pro seu negócio.
              </p>

              <label
                className={`cfg-radio-card${fiadoAtivo ? ' ativo' : ''}`}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 14, border: '1.5px solid var(--est-border, #e2e8f0)', borderRadius: 10, cursor: salvandoFiado ? 'not-allowed' : 'pointer', opacity: salvandoFiado ? 0.6 : 1 }}
                onClick={() => !salvandoFiado && salvarFiado(!fiadoAtivo)}
              >
                <input type="checkbox" checked={fiadoAtivo} readOnly style={{ marginTop: 3 }} disabled={salvandoFiado} />
                <div>
                  <strong>💰 Fiado (crédito informal pra cliente)</strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--est-text-muted, #64748b)', marginTop: 2 }}>
                    Quando ativo, o menu mostra "Clientes / Fiado" e o PDV permite vender fiado pra clientes habilitados.
                    Desligando, o menu volta a ser só "Clientes" e não dá mais pra vender fiado novo — mas dívidas antigas
                    continuam podendo ser cobradas e quitadas normalmente, sem trava nenhuma.
                  </div>
                </div>
              </label>

              {fiadoErro    && <div className="cfg-alert erro" style={{ marginTop: 12 }}>⚠️ {fiadoErro}</div>}
              {fiadoSucesso && <div className="cfg-alert" style={{ marginTop: 12, background: 'rgba(34,197,94,0.1)', color: '#15803d' }}>✓ {fiadoSucesso}</div>}
            </div>
          </div>
        )}

        {/* ══ ABA TUTORIAIS ══ */}
        {abaCfg === 'tutoriais' && (
          <div className="cfg-aba-maxwidth">
            <AccordionGuia
              icone="🖨️"
              titulo="Impressora Térmica"
              aberto={abaImpressora !== null}
              onToggle={() => setAbaImpressora(abaImpressora === null ? 'windows' : null)}
            >
              <p className="cfg-guia-intro">Configure sua impressora para imprimir recibos de 80mm diretamente do navegador.</p>
              <SubAbas abas={[{ key: 'windows', label: '🖥️ Windows' },{ key: 'android', label: '📱 Android' },{ key: 'dicas', label: '💡 Dicas' }]} ativa={abaImpressora} onChange={setAbaImpressora} />
              {abaImpressora === 'windows' && <GuiaSteps steps={[{ titulo: 'Instale o driver', desc: 'Conecte via USB. O Windows detecta automaticamente. Se não, baixe no site do fabricante (Elgin, Epson, Bematech).' },{ titulo: 'Defina como padrão', desc: 'Painel de Controle → Dispositivos e Impressoras → botão direito → "Definir como impressora padrão".' },{ titulo: 'Configure papel 80mm', desc: 'Botão direito → Preferências → Tamanho: "Receipt 80mm" ou crie tamanho personalizado 80mm.' },{ titulo: 'Ajuste no Chrome', desc: 'Ao imprimir: selecione a impressora, desative cabeçalho/rodapé, margens: Nenhuma, escala: 100%.' }]} dica="💡 Atalho: Win + I → Bluetooth e dispositivos → Impressoras e scanners" />}
              {abaImpressora === 'android' && <GuiaSteps steps={[{ titulo: 'Conecte via Bluetooth', desc: 'Ligue a impressora, ative Bluetooth e pareie (nome começa com "POS-" ou modelo).' },{ titulo: 'Instale o RawBT', desc: 'Baixe "RawBT" (gratuito) na Play Store. Funciona como serviço de impressão para o Chrome.' },{ titulo: 'Configure o RawBT', desc: 'Abra o RawBT → selecione a impressora → papel: 80mm. Fica em segundo plano.' },{ titulo: 'Imprima pelo Chrome', desc: 'Ao clicar em "Imprimir recibo", selecione "RawBT" como destino.' }]} dica="💡 Impressoras WiFi são mais fáceis — conecte na mesma rede e o Chrome detecta automaticamente." />}
              {abaImpressora === 'dicas' && <GuiaDicas dicas={[{ icone: '⚡', titulo: 'Teste antes de usar', desc: 'Faça uma venda de R$ 0,01 e clique em Imprimir para conferir o layout.' },{ icone: '📐', titulo: 'Papel 80mm é o padrão', desc: 'Se o recibo sair cortado, verifique o tamanho nas preferências de impressão.' },{ icone: '🌐', titulo: 'Use Google Chrome', desc: 'Chrome tem o melhor suporte. Evite Firefox e Safari para impressoras térmicas.' },{ icone: '🔋', titulo: 'Impressoras WiFi são melhores', desc: 'Modelos como Elgin i9 ou Epson TM-T20 funcionam sem fio no celular e computador.' }]} />}
            </AccordionGuia>

            <AccordionGuia
              icone="📡"
              titulo="Bipador USB (Leitor de Código de Barras)"
              aberto={abaBipador !== null}
              onToggle={() => setAbaBipador(abaBipador === null ? 'como-funciona' : null)}
            >
              <p className="cfg-guia-intro">O bipador USB funciona automaticamente — não é necessário instalar nenhum software ou configurar nada.</p>
              <SubAbas abas={[{ key: 'como-funciona', label: '⚡ Como funciona' },{ key: 'configurar', label: '🔧 Configurar' },{ key: 'dicas', label: '💡 Dicas' }]} ativa={abaBipador} onChange={setAbaBipador} />
              {abaBipador === 'como-funciona' && (
                <div className="cfg-guia-conteudo">
                  <div className="cfg-guia-destaque">
                    <span className="cfg-guia-destaque-icone">🎯</span>
                    <div><div className="cfg-guia-destaque-titulo">Plug & Play — só conectar e usar</div><div className="cfg-guia-destaque-desc">O bipador se comporta como teclado USB. Quando você bipa, ele "digita" o código no campo de busca do PDV automaticamente.</div></div>
                  </div>
                  <GuiaSteps steps={[{ titulo: 'Conecte o bipador USB', desc: 'O SO reconhece como teclado automaticamente. Nenhum driver necessário na maioria dos modelos.' },{ titulo: 'Abra o PDV (Caixa)', desc: 'O cursor já estará no campo de busca. O PDV sempre retorna o foco para esse campo após cada ação.' },{ titulo: 'Aponte e bipe o produto', desc: 'O bipador digita o código e pressiona Enter. O sistema detecta a velocidade e busca automaticamente.' },{ titulo: 'Produto selecionado', desc: 'Se 1 resultado: adicionado ao carrinho automaticamente. Se múltiplos: lista exibida para escolha.' }]} />
                </div>
              )}
              {abaBipador === 'configurar' && <GuiaSteps steps={[{ titulo: 'Cadastre o código de barras', desc: 'Estoque → edite o produto → "Código de barras". Digite, bipe direto no campo, ou use 📷 para escanear pela câmera.' },{ titulo: 'Teste no PDV', desc: 'Com o PDV aberto, bipe o produto. Se cadastrado, o produto aparece. Se não, verifique se o código foi salvo.' },{ titulo: 'Bipador não funciona?', desc: 'Alguns modelos precisam de configuração para enviar Enter. Consulte o manual — geralmente é bipar um QR Code especial.' }]} dica="💡 O campo de código de barras no Estoque também aceita leitura direta do bipador — basta clicar no campo e bipar." />}
              {abaBipador === 'dicas' && <GuiaDicas dicas={[{ icone: '🔌', titulo: 'USB é o mais confiável', desc: 'Funciona em qualquer computador sem configuração. Bluetooth pode ter latência.' },{ icone: '📏', titulo: 'Distância ideal: 5–20cm', desc: 'Muito perto ou longe dificulta a leitura. Ajuste conforme o modelo.' },{ icone: '🏷️', titulo: 'Código não encontrado', desc: 'PDV mostrará "Código não encontrado". Cadastre o produto no Estoque com aquele código.' },{ icone: '⚡', titulo: 'Leitura instantânea', desc: 'O sistema detecta o bipador pela velocidade de digitação (< 50ms entre teclas).' },{ icone: '🔁', titulo: 'Mesmo produto várias vezes', desc: 'Bipe várias vezes para adicionar múltiplas unidades — cada bipada soma +1.' }]} />}
            </AccordionGuia>

            <AccordionGuia
              icone="📷"
              titulo="Câmera (Leitura pelo Computador ou Notebook)"
              aberto={abaCamera !== null}
              onToggle={() => setAbaCamera(abaCamera === null ? 'pdv' : null)}
            >
              <p className="cfg-guia-intro">Use a câmera do computador ou notebook para ler códigos de barras no PDV e no cadastro de produtos.</p>
              <SubAbas abas={[{ key: 'pdv', label: '🛒 No PDV' },{ key: 'estoque', label: '📦 No Estoque' },{ key: 'dicas', label: '💡 Dicas' }]} ativa={abaCamera} onChange={setAbaCamera} />
              {abaCamera === 'pdv' && (
                <div className="cfg-guia-conteudo">
                  <div className="cfg-guia-destaque">
                    <span className="cfg-guia-destaque-icone">📷</span>
                    <div><div className="cfg-guia-destaque-titulo">Botão 📷 ao lado do campo de busca</div><div className="cfg-guia-destaque-desc">No PDV, clique no botão de câmera ao lado do campo de busca para abrir o leitor.</div></div>
                  </div>
                  <GuiaSteps steps={[{ titulo: 'Clique no botão 📷 no PDV', desc: 'Fica ao lado direito do campo de busca. Uma janela com o feed da câmera será aberta.' },{ titulo: 'Permita o acesso à câmera', desc: 'O navegador pedirá permissão na primeira vez. Clique em "Permitir" — fica salva para as próximas.' },{ titulo: 'Aponte para o código', desc: 'Centralize na área de mira (cantos verdes). A câmera detecta e fecha o modal automaticamente.' },{ titulo: 'Produto buscado', desc: 'O sistema busca pelo código detectado — mesmo fluxo do bipador USB.' }]} dica="💡 Boa iluminação e código centralizado. Distância ideal: 15–30cm." />
                </div>
              )}
              {abaCamera === 'estoque' && <GuiaSteps steps={[{ titulo: 'Edite ou crie um produto', desc: 'Vá em Estoque → + Novo produto ou edite um existente.' },{ titulo: 'Campo "Código de barras"', desc: 'O campo tem um botão 📷 ao lado.' },{ titulo: 'Clique em 📷 e escaneie', desc: 'O modal abre. Aponte para o código do produto físico — preenchido automaticamente.' },{ titulo: 'Salve o produto', desc: 'Com o código preenchido, clique em Salvar. Produto disponível para busca no PDV.' }]} dica="💡 Forma mais rápida de cadastrar código de barras — sem digitar nada." />}
              {abaCamera === 'dicas' && <GuiaDicas dicas={[{ icone: '💡', titulo: 'Iluminação é essencial', desc: 'Câmeras de notebook leem melhor com boa luz. Evite reflexos no código.' },{ icone: '📐', titulo: 'Distância: 15–30cm', desc: 'Muito perto desenfoca. Muito longe perde detalhes.' },{ icone: '🔄', titulo: 'Trocar câmera', desc: 'Se tiver mais de uma câmera, o botão 🔄 alterna entre elas.' },{ icone: '❌', titulo: 'Câmera não abre?', desc: 'Ícone de cadeado na barra → Câmera → Permitir.' },{ icone: '🔌', titulo: 'Para uso intenso: bipador', desc: 'Para alto volume, bipador USB é mais rápido e confiável.' }]} />}
            </AccordionGuia>
          </div>
        )}

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