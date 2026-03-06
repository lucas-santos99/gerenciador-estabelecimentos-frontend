// ===== TelaBloqueio.jsx (VERSÃO OTIMIZADA) =====
import React, { useEffect, useRef } from 'react';
import './TelaBloqueio.css'; // Arquivo opcional (posso gerar se quiser)

const TelaBloqueio = ({ onLogout, nomeFantasia }) => {
    
    const btnRef = useRef(null);

    // Foca automaticamente no botão para acessibilidade
    useEffect(() => {
        btnRef.current?.focus();
    }, []);

    // Permitir sair com Enter ou Esc
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault();
            onLogout();
        }
    };

    return (
        <div className="bloqueio-container" onKeyDown={handleKeyDown} tabIndex={0}>
            
            <h2>Acesso Bloqueado</h2>

            <p className="bloqueio-msg">
                A assinatura do estabelecimento <strong>{nomeFantasia || "do usuário"}</strong> 
                expirou ou não foi paga.
            </p>

            <p className="bloqueio-info">
                Entre em contato para regularizar sua situação.
            </p>

            {/* Exibir contato fixo OU configurável futuramente */}
            <p className="bloqueio-contato">
                <strong>WhatsApp: (00) 00000-0000</strong>
            </p>

            <button 
                ref={btnRef}
                className="bloqueio-btn"
                onClick={onLogout}
            >
                Sair da Conta
            </button>
        </div>
    );
};

export default TelaBloqueio;
