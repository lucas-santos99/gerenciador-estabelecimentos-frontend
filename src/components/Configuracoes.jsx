// ===== src/components/Configuracoes.jsx (BACKEND CORRIGIDO) =====
import React, { useState, useEffect } from 'react';
import './Configuracoes.css';

// BACKEND AUTOMÁTICO (LOCALHOST ↔ PRODUÇÃO RENDER)
const BACKEND_BASE_URL =
    window.location.hostname === "localhost"
        ? "http://localhost:3001"
        : "https://estabelecimentos-api.onrender.com";

// --- Helpers de Máscara ---
const mascaraCNPJ = (valor) => {
    return valor
        .replace(/\D/g, '')
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substr(0, 18);
};

const mascaraTelefone = (valor) => {
    let r = valor.replace(/\D/g, "");
    r = r.replace(/^0/, "");
    if (r.length > 10) {
        r = r.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (r.length > 5) {
        r = r.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (r.length > 2) {
        r = r.replace(/^(\d\d)(\d{0,5}).*/, "($1) $2");
    } else {
        r = r.replace(/^(\d*)/, "($1");
    }
    return r;
};

const Configuracoes = ({ estabelecimentoId, supabaseProp, onLogoUpdated, logoUrl }) => {
    
    const [formData, setFormData] = useState({
        nome_fantasia: '',
        cnpj: '',
        telefone: '',
        email_contato: '',
        endereco_completo: '',
        logo_url: logoUrl || ''
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // ---- BUSCAR DADOS AO ABRIR ----
    useEffect(() => {
        const fetchDados = async () => {
            if (!estabelecimentoId) return;
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`${BACKEND_BASE_URL}/api/estabelecimentos/dados/${estabelecimentoId}`);
                if (!response.ok) throw new Error('Falha ao carregar dados da mercearia.');
                const data = await response.json();

                setFormData({
                    nome_fantasia: data.nome_fantasia || '',
                    cnpj: data.cnpj || '',
                    telefone: data.telefone || '',
                    email_contato: data.email_contato || '',
                    endereco_completo: data.endereco_completo || '',
                    logo_url: data.logo_url || ''
                });
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchDados();
    }, [estabelecimentoId]);

    // ---- MÁSCARAS ----
    const handleChange = (e) => {
        const { name, value } = e.target;
        let v = value;

        if (name === 'cnpj') v = mascaraCNPJ(value);
        if (name === 'telefone') v = mascaraTelefone(value);

        setFormData(prev => ({ ...prev, [name]: v }));
    };

    // ---- UPLOAD DE LOGO ----
    const handleUploadLogo = async (event) => {
        setError(null);
        setSuccess(null);

        if (!event.target.files || event.target.files.length === 0) return;
        if (!supabaseProp) {
            setError("Erro: Supabase não encontrado.");
            return;
        }

        const file = event.target.files[0];
        const MAX_FILE_SIZE = 2 * 1024 * 1024;

        if (file.size > MAX_FILE_SIZE) {
            setError("Arquivo muito pesado. Máx: 2MB.");
            event.target.value = null;
            return;
        }

        const fileExt = file.name.split('.').pop();
        const filePath = `public/${estabelecimentoId}.${fileExt}`;

        setUploading(true);
        try {
            const { error: uploadError } = await supabaseProp.storage
                .from("logos")
                .upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: publicData } = supabaseProp.storage
                .from("logos")
                .getPublicUrl(filePath);

            if (!publicData?.publicUrl) {
                throw new Error("Falha ao obter URL pública.");
            }

            const newLogo = publicData.publicUrl;

            setFormData(prev => ({ ...prev, logo_url: newLogo }));
            if (onLogoUpdated) onLogoUpdated(newLogo);

            setSuccess("Logo enviada! Clique em salvar.");
        } catch (err) {
            setError(`Erro no upload: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    // ---- SALVAR ALTERAÇÕES ----
    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/estabelecimentos/dados/${estabelecimentoId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Erro ao salvar.");

            if (onLogoUpdated) onLogoUpdated(result.logo_url);

            setSuccess("Dados atualizados com sucesso!");
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Carregando configurações...</div>;

    return (
        <div className="configuracoes-container">
            <h3>Dados da Mercearia</h3>
            <p>Estas informações aparecem nos recibos e relatórios.</p>

            <form className="configuracoes-form-grid" onSubmit={handleSubmit}>

                {/* --- COLUNA 1: DADOS --- */}
                <div className="form-coluna-dados">

                    <div className="form-group">
                        <label>Nome Fantasia *</label>
                        <input 
                            type="text"
                            name="nome_fantasia"
                            value={formData.nome_fantasia}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>CNPJ</label>
                            <input 
                                type="text"
                                name="cnpj"
                                maxLength={18}
                                value={formData.cnpj}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Telefone / WhatsApp</label>
                            <input 
                                type="text"
                                name="telefone"
                                maxLength={15}
                                value={formData.telefone}
                                onChange={handleChange}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Email de Contato</label>
                        <input 
                            type="email"
                            name="email_contato"
                            value={formData.email_contato}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="form-group">
                        <label>Endereço Completo</label>
                        <textarea
                            name="endereco_completo"
                            rows="3"
                            value={formData.endereco_completo}
                            onChange={handleChange}
                        />
                    </div>

                </div>

                {/* --- COLUNA 2: LOGO --- */}
                <div className="form-coluna-logo">
                    <label>Logo da Mercearia</label>

                    <div className="logo-preview">
                        {formData.logo_url ? (
                            <img src={formData.logo_url} alt="Logo" />
                        ) : (
                            <span>Sem Logo</span>
                        )}
                    </div>

                    <input 
                        type="file"
                        id="logo-upload"
                        accept="image/png,image/jpeg"
                        disabled={uploading}
                        onChange={handleUploadLogo}
                    />
                    <label htmlFor="logo-upload" className="btn-upload-logo">
                        {uploading ? "Enviando..." : "📸 Escolher Imagem"}
                    </label>

                    <small><b>Tamanho máximo: 2MB.</b></small>
                </div>

                {/* --- BOTÕES --- */}
                <div className="form-actions">
                    {error && <p className="config-error">{error}</p>}
                    {success && <p className="config-success">{success}</p>}

                    <button 
                        type="submit"
                        disabled={saving || uploading}
                        className="btn-salvar-config"
                    >
                        {saving ? "Salvando..." : "💾 Salvar Alterações"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default Configuracoes;
