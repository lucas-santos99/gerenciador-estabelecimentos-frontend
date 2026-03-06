import React, { useState } from 'react';

// ❗ NÃO usa mais BACKEND_BASE_URL fixo aqui
// Agora vem do App.jsx via props

const Auth = ({ supabaseProp, BACKEND_BASE_URL }) => {
    const supabase = supabaseProp;

    // --- ESTADOS ---
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [isSignUp, setIsSignUp] = useState(true);

    // Cadastro de estabelecimento
    const [userId, setUserId] = useState(null);
    const [showNomeFantasiaInput, setShowNomeFantasiaInput] = useState(false);
    const [nomeFantasia, setNomeFantasia] = useState('');

    // ---------------------------------------------------------
    // 1. LOGIN / SIGNUP COM SUPABASE
    // ---------------------------------------------------------
    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');

        if (!supabase || !supabase.auth) {
            setMessage('Erro crítico: Supabase não inicializado.');
            setLoading(false);
            return;
        }

        try {
            let result;

            if (isSignUp) {
                result = await supabase.auth.signUp({ email, password });
            } else {
                result = await supabase.auth.signInWithPassword({ email, password });
            }

            const { error, data } = result;

            if (error) {
                setMessage('Erro de Autenticação: ' + error.message);
            } else {
                if (isSignUp && data.user) {
                    setUserId(data.user.id);
                    setShowNomeFantasiaInput(true);
                    setMessage('Usuário criado! Agora informe o nome da mercearia.');

                    setEmail('');
                    setPassword('');
                } else if (!isSignUp && data.session) {
                    setMessage('Login efetuado com sucesso!');
                }
            }
        } catch (err) {
            console.error("Erro no handleAuth:", err);
            setMessage('Erro desconhecido na autenticação.');
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------
    // 2. REGISTRO DO ESTABELECIMENTO NO BACKEND NODE.JS
    // ---------------------------------------------------------
    const handleRegisterMercearia = async (e) => {
        e.preventDefault();
        setMessage('');

        if (!userId || !nomeFantasia.trim()) {
            setMessage('Informe o nome da mercearia.');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch(`${BACKEND_BASE_URL}/api/estabelecimentos/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    nomeFantasia: nomeFantasia.trim(),
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Erro ao registrar mercearia.');
            }

            // Sucesso
            setMessage('Mercearia registrada! Agora você pode fazer login.');
            setShowNomeFantasiaInput(false);
            setUserId(null);
            setIsSignUp(false);

        } catch (err) {
            console.error(err);
            setMessage(`Erro ao registrar mercearia: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------
    // 3. INTERFACE
    // ---------------------------------------------------------
    return (
        <div style={{
            padding: '20px',
            border: '1px solid #ccc',
            maxWidth: '400px',
            margin: '50px auto',
            borderRadius: '6px'
        }}>
            <h3>{isSignUp ? "CADASTRAR NOVA MERCEARIA" : "FAZER LOGIN"}</h3>

            {/* FORM LOGIN / SIGNUP */}
            {!showNomeFantasiaInput && (
                <form onSubmit={handleAuth}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        required
                        onChange={(e) => setEmail(e.target.value)}
                        style={{ width: '100%', margin: '10px 0', padding: '8px' }}
                    />

                    <input
                        type="password"
                        placeholder="Senha (min 6 caracteres)"
                        value={password}
                        required
                        onChange={(e) => setPassword(e.target.value)}
                        style={{ width: '100%', margin: '10px 0', padding: '8px' }}
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: isSignUp ? '#2ecc71' : '#2980b9',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        {loading ? 'Processando...' : isSignUp ? 'Cadastrar Usuário' : 'Entrar'}
                    </button>
                </form>
            )}

            {/* FORM NOME FANTASIA */}
            {showNomeFantasiaInput && (
                <div style={{ marginTop: '20px' }}>
                    <h4>Nome da Mercearia</h4>

                    <form onSubmit={handleRegisterMercearia}>
                        <input
                            type="text"
                            placeholder="Nome Fantasia"
                            value={nomeFantasia}
                            required
                            onChange={(e) => setNomeFantasia(e.target.value)}
                            style={{ width: '100%', margin: '10px 0', padding: '8px' }}
                        />

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: '#f1c40f',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            {loading ? 'Registrando...' : 'Concluir Cadastro'}
                        </button>
                    </form>
                </div>
            )}

            {/* MENSAGEM */}
            {message && (
                <p style={{
                    marginTop: '15px',
                    color: message.startsWith('Erro') ? 'red' : 'green'
                }}>
                    {message}
                </p>
            )}

            {/* BOTÃO TROCAR MODO */}
            {!showNomeFantasiaInput && (
                <button
                    onClick={() => {
                        setIsSignUp(!isSignUp);
                        setMessage('');
                    }}
                    style={{
                        marginTop: '15px',
                        background: 'none',
                        border: 'none',
                        color: 'blue',
                        cursor: 'pointer',
                    }}
                >
                    {isSignUp ? 'Já tenho conta → Login' : 'Criar nova conta'}
                </button>
            )}
        </div>
    );
};

export default Auth;
