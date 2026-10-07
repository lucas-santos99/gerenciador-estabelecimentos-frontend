// Botão opcional "Validar" ao lado do campo CPF/CNPJ (telas do SuperAdmin).
// Só informa se o número existe de verdade (dígito verificador). Salvar
// NUNCA depende dele, então dá para cadastrar dados inventados em testes.
//   <ValidarDocumento valor={form.cnpj} tipo={tipoCpfCnpj} />
import React, { useEffect, useState } from 'react';
import { verificarDocumento } from '../../utils/documento';
import Dica from '../Notificacoes/Dica';

export default function ValidarDocumento({ valor, tipo }) {
  const [resultado, setResultado] = useState(null);

  // Mudou o número ou o tipo: o resultado anterior deixa de valer.
  useEffect(() => { setResultado(null); }, [valor, tipo]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      <button
        type="button"
        className="est-btn est-btn-ghost"
        onClick={() => setResultado(verificarDocumento(valor, tipo))}
      >
        ✓ Validar {tipo === 'cnpj' ? 'CNPJ' : 'CPF'}
      </button>
      <Dica texto="Confere se o número existe de verdade (dígitos verificadores). É opcional: salvar não depende disso, então dá para cadastrar dados de teste. Use para conferir estabelecimentos reais." />
      {resultado && (
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: resultado.ok ? '#16a34a' : '#d97706' }}>
          {resultado.ok ? '✅' : '⚠️'} {resultado.mensagem}
        </span>
      )}
    </div>
  );
}
