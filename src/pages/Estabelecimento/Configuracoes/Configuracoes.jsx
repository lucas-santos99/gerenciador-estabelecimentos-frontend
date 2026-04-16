// src/pages/Estabelecimento/Configuracoes/Configuracoes.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabaseClient';
import '../Configuracoes.css';

const API_URL = import.meta.env.VITE_API_URL;

/* ── Máscaras ──────────────────────────────────────────────── */
function mascaraCNPJ(v) {
  return v.replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .substring(0, 18);
}

function mascaraTelefone(v) {
  let r = v.replace(/\D/g, '').replace(/^0/, '');
  if (r.length > 10) return r.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
  if (r.length > 5)  return r.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  if (r.length > 2)  return r.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
  return r.replace(/^(\d*)/, '($1');
}

/* ════════════════════════════════════════════════════════════ */
export default function Configuracoes({ estabelecimentoId, onLogoAtualizada, logoUrl: logoUrlProp }) {

  const [form, setForm] = useState({
    nome_fantasia:     '',
    cnpj:              '',
    telefone:          '',
    email_contato:     '',
    endereco_completo: '',
    logo_url:          logoUrlProp || '',
  });

  const [loading,    setLoading]    = useState(true);
  const [salvando,   setSalvando]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [erro,       setErro]       = useState('');
  const [sucesso,    setSucesso]    = useState('');

  const fileInputRef = useRef(null);

  /* ── Carregar dados ─────────────────────────────────────── */
  useEffect(() => {
    async function carregarDados() {
      if (!estabelecimentoId) return;
      setLoading(true);
      setErro('');
      try {
        const resp = await fetch(`${API_URL}/api/estabelecimentos/dados/${estabelecimentoId}`);
        if (!resp.ok) throw new Error('Falha ao carregar dados.');
        const data = await resp.json();
        setForm({
          nome_fantasia:     data.nome_fantasia     || '',
          cnpj:              data.cnpj              || '',
          telefone:          data.telefone          || '',
          email_contato:     data.email_contato     || '',
          endereco_completo: data.endereco_completo || '',
          logo_url:          data.logo_url          || '',
        });
      } catch (err) {
        setErro(err.message);
      } finally {
        setLoading(false);
      }
    }
    carregarDados();
  }, [estabelecimentoId]);

  /* ── Atualizar campo ─────────────────────────────────────── */
  function atualizar(e) {
    const { name, value } = e.target;
    let v = value;
    if (name === 'cnpj')     v = mascaraCNPJ(value);
    if (name === 'telefone') v = mascaraTelefone(value);
    setForm(prev => ({ ...prev, [name]: v }));
  }

  /* ── Upload de logo ──────────────────────────────────────── */
  async function handleUploadLogo(e) {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];

    if (file.size > 2 * 1024 * 1024) {
      setErro('Arquivo muito grande. Tamanho máximo: 2MB.');
      e.target.value = null;
      return;
    }

    const ext      = file.name.split('.').pop();
    const filePath = `public/${estabelecimentoId}.${ext}`;

    setUploading(true);
    setErro('');
    setSucesso('');

    try {
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      if (!publicData?.publicUrl) throw new Error('Falha ao obter URL pública.');

      const novaUrl = publicData.publicUrl;
      setForm(prev => ({ ...prev, logo_url: novaUrl }));
      setSucesso('Logo enviada! Clique em Salvar para confirmar.');
      onLogoAtualizada?.(novaUrl);
    } catch (err) {
      setErro(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = null;
    }
  }

  /* ── Salvar dados ────────────────────────────────────────── */
  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    setSucesso('');

    try {
      const resp = await fetch(
        `${API_URL}/api/estabelecimentos/dados/${estabelecimentoId}`,
        {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(form),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Erro ao salvar.');

      setSucesso('Dados atualizados com sucesso!');
      onLogoAtualizada?.(result.logo_url);
      setTimeout(() => setSucesso(''), 4000);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="est-loading-screen">
        <div className="est-spinner" />
        Carregando configurações…
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════ */
  return (
    <div className="cfg-container">

      {/* Header */}
      <div className="cfg-header">
        <span className="cfg-header-titulo">⚙️ Configurações</span>
        <span className="cfg-header-sub">Dados do estabelecimento, logo e informações de contato</span>
      </div>

      {/* Conteúdo */}
      <form onSubmit={salvar} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="cfg-content">
          <div className="cfg-grid">

            {/* Coluna esquerda — dados */}
            <div>

              {/* Alertas */}
              {erro    && <div className="cfg-alert erro"    style={{ marginBottom: 16 }}>⚠️ {erro}</div>}
              {sucesso && <div className="cfg-alert sucesso" style={{ marginBottom: 16 }}>✓ {sucesso}</div>}

              {/* Identificação */}
              <div className="cfg-section">
                <span className="cfg-section-titulo">📋 Identificação</span>
                <div className="cfg-form-grid">
                  <div className="cfg-form-group cfg-form-full">
                    <label className="cfg-label">Nome Fantasia *</label>
                    <input
                      className="cfg-input"
                      name="nome_fantasia"
                      placeholder="Nome do estabelecimento"
                      value={form.nome_fantasia}
                      onChange={atualizar}
                      required
                      disabled={salvando}
                    />
                  </div>
                  <div className="cfg-form-group">
                    <label className="cfg-label">CNPJ</label>
                    <input
                      className="cfg-input"
                      name="cnpj"
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                      value={form.cnpj}
                      onChange={atualizar}
                      disabled={salvando}
                    />
                  </div>
                  <div className="cfg-form-group">
                    <label className="cfg-label">Telefone / WhatsApp</label>
                    <input
                      className="cfg-input"
                      name="telefone"
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                      value={form.telefone}
                      onChange={atualizar}
                      disabled={salvando}
                    />
                  </div>
                </div>
              </div>

              {/* Contato */}
              <div className="cfg-section">
                <span className="cfg-section-titulo">📞 Contato & Endereço</span>
                <div className="cfg-form-grid">
                  <div className="cfg-form-group cfg-form-full">
                    <label className="cfg-label">E-mail de contato</label>
                    <input
                      className="cfg-input"
                      name="email_contato"
                      type="email"
                      placeholder="contato@estabelecimento.com"
                      value={form.email_contato}
                      onChange={atualizar}
                      disabled={salvando}
                    />
                  </div>
                  <div className="cfg-form-group cfg-form-full">
                    <label className="cfg-label">Endereço completo</label>
                    <textarea
                      className="cfg-textarea"
                      name="endereco_completo"
                      placeholder="Rua, número, bairro, cidade — UF"
                      value={form.endereco_completo}
                      onChange={atualizar}
                      disabled={salvando}
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* Coluna direita — logo */}
            <div className="cfg-logo-section">
              <span className="cfg-logo-titulo">🖼 Logo</span>

              <div className="cfg-logo-preview">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo do estabelecimento" />
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
                disabled={uploading || salvando}
                onChange={handleUploadLogo}
              />

              <label
                className={`cfg-btn-upload${uploading ? ' uploading' : ''}`}
                onClick={() => !uploading && !salvando && fileInputRef.current?.click()}
              >
                {uploading ? '⏳ Enviando…' : '📸 Escolher imagem'}
              </label>

              <span className="cfg-logo-hint">
                PNG, JPG ou WEBP<br />
                Tamanho máximo: 2MB
              </span>
            </div>

          </div>
        </div>

        {/* Footer com botão salvar */}
        <div className="cfg-footer">
          {sucesso && (
            <span className="cfg-btn-salvar-status">✓ Salvo com sucesso</span>
          )}
          <button
            type="submit"
            className="cfg-btn-salvar"
            disabled={salvando || uploading}
          >
            {salvando ? '⏳ Salvando…' : '💾 Salvar alterações'}
          </button>
        </div>

      </form>

    </div>
  );
}