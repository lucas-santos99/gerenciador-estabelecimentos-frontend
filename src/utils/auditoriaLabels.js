// src/utils/auditoriaLabels.js (frontend)
//
// Labels amigáveis (com emoji) pra módulo/ação de auditoria — usado tanto
// na Auditoria do estabelecimento (Estabelecimento/Auditoria/Auditoria.jsx)
// quanto na Auditoria Geral do SuperAdmin
// (Administrador/SuperAdmins/AuditoriaAdmin.jsx), pra manter os dois
// lugares consistentes e não duplicar a mesma lista em dois arquivos.
//
// Sempre que uma rota nova passar a chamar registrar({ modulo, acao, ... })
// com um módulo/ação que ainda não existe aqui, adicione a entrada — sem
// entrada, cai no fallback (mostra o valor cru, tipo "produto_criado"),
// que continua funcional, só não fica tão bonito.

export const MODULO_LABEL = {
  pdv:            '🖥️ PDV',
  estoque:        '📦 Estoque',
  clientes:       '👥 Clientes',
  financeiro:     '💰 Financeiro',
  configuracoes:  '⚙️ Config',
  fornecedores:   '🚚 Fornecedores',
  inventario:     '📋 Inventário',
  operadores:     '🧑‍💼 Operadores',
  auth:           '🔑 Autenticação',
  estabelecimentos: '🏢 Estabelecimentos',
  superadmins:    '👑 SuperAdmins',
  assinatura:     '💳 Assinatura',
  whatsapp:       '💬 WhatsApp',
};

export const MODULO_COR = {
  pdv: 'teal', estoque: 'blue', clientes: 'purple',
  financeiro: 'green', configuracoes: 'gray',
  fornecedores: 'orange', inventario: 'cyan',
  operadores: 'pink', auth: 'blue',
  estabelecimentos: 'teal', superadmins: 'purple',
  assinatura: 'green', whatsapp: 'green',
};

export const ACAO_LABEL = {
  // PDV / vendas
  venda_realizada:  '🛒 Venda',
  venda_cancelada:  '❌ Cancelamento',

  // Estoque — produto
  produto_criado:   '➕ Produto criado',
  produto_editado:  '✏️ Produto editado',
  produto_excluido: '🗑️ Produto excluído',
  produto_bloqueado_palavra: '🚫 Nome/marca bloqueado (palavra proibida)',

  // Clientes / fiado
  cliente_criado:   '👤 Cliente criado',
  cliente_editado:  '✏️ Cliente editado',
  cliente_excluido: '🗑️ Cliente excluído',
  fiado_recebido:   '💰 Fiado recebido',

  // Configurações (estabelecimento e globais)
  config_atualizada:      '⚙️ Config atualizada',
  editar_config_global:   '⚙️ Config global editada',
  editar_tela_bloqueio:   '🔒 Tela de bloqueio editada',
  editar_config_cobranca: '💳 Config de cobrança editada',
  editar_identidade_relatorios: '🧾 Identidade dos relatórios editada',

  // Operadores (tanto ação do merchant no próprio estabelecimento quanto
  // ação do SuperAdmin sobre operadores de qualquer estabelecimento)
  criar_operador:              '➕ Operador criado',
  editar_operador:              '✏️ Operador editado',
  excluir_operador:             '🗑️ Operador excluído',
  restaurar_operador:           '♻️ Operador restaurado',
  alterar_status_operador:      '🔁 Status do operador alterado',
  ativar_operador:              '✅ Operador ativado',
  inativar_operador:            '⛔ Operador inativado',
  editar_permissoes_operador:   '🔐 Permissões do operador editadas',
  reset_senha_operador:         '🔑 Senha do operador redefinida',
  resetar_senha_operador:       '🔑 Senha do operador redefinida',

  // Fornecedores e compras
  criar_fornecedor:  '➕ Fornecedor criado',
  editar_fornecedor: '✏️ Fornecedor editado',
  excluir_fornecedor: '🗑️ Fornecedor excluído',
  lancar_compra:     '📥 Compra lançada',
  cancelar_compra:   '❌ Compra cancelada',

  // Inventário
  inventario_iniciado:   '📋 Inventário iniciado',
  inventario_finalizado: '✅ Inventário finalizado',
  inventario_cancelado:  '❌ Inventário cancelado',
  ajuste_estoque:        '🔧 Ajuste de estoque',

  // Autenticação
  login: '🔑 Login',

  // Solicitações de alteração (estabelecimento → SuperAdmin)
  solicitacao_alteracao_enviada: '📨 Solicitação de alteração enviada',
  solicitacao_atendida:          '✅ Solicitação atendida',
  solicitacao_recusada:          '❌ Solicitação recusada',

  // Painel admin — estabelecimentos
  criar_estabelecimento:              '➕ Estabelecimento criado',
  editar_estabelecimento:             '✏️ Estabelecimento editado',
  excluir_estabelecimento:            '🗑️ Estabelecimento excluído',
  restaurar_estabelecimento:          '♻️ Estabelecimento restaurado',
  apagar_definitivo_estabelecimento:  '💥 Estabelecimento apagado definitivamente',
  bloquear_acesso:                    '🔒 Acesso bloqueado',
  liberar_acesso:                     '🔓 Acesso liberado',
  cobranca_manual_enviada:            '💌 Cobrança manual enviada',
  cobranca_manual_desfeita:           '↩️ Cobrança manual desfeita',
  editar_limite_operadores:           '✏️ Limite de operadores editado',
  atualizar_logo:                     '🖼️ Logo atualizada',
  remover_logo:                       '🗑️ Logo removida',

  // Painel admin — SuperAdmins
  criar_superadmin:         '➕ SuperAdmin criado',
  excluir_superadmin:       '🗑️ SuperAdmin excluído',
  ativar_superadmin:        '✅ SuperAdmin ativado',
  desativar_superadmin:     '⛔ SuperAdmin desativado',
  alterar_senha_superadmin: '🔑 Senha do SuperAdmin alterada',
  tornar_master:            '👑 Definido como master',

  // Assinatura (pagamento da licença — webhooks Asaas/Efí)
  licenca_renovada_cartao:     '💳 Licença renovada (cartão)',
  licenca_renovada_pix:        '📱 Licença renovada (Pix)',
  licenca_pagamento_estornado: '↩️ Pagamento estornado',
  licenca_pagamento_alerta:    '⚠️ Pagamento para revisar',

  // WhatsApp (planos, números, assistente — 24 a 30/09/2026)
  whatsapp_plano_solicitado:      '💬 Plano de WhatsApp solicitado',
  whatsapp_troca_solicitada:      '🔁 Troca de plano de WhatsApp solicitada',
  whatsapp_solicitacao_desistiu:  '↩️ Solicitação de WhatsApp cancelada',
  whatsapp_cancelamento_agendado: '📅 Cancelamento do WhatsApp agendado',
  whatsapp_cancelamento_desfeito: '↩️ Cancelamento do WhatsApp desfeito',
  whatsapp_pacote_solicitado:     '➕ Pacote extra pedido',
  whatsapp_pacote_desistiu:       '↩️ Pacote extra cancelado',
  whatsapp_pacote_aprovado:       '✅ Pacote extra aprovado',
  whatsapp_pacote_recusado:       '❌ Pacote extra recusado',
  whatsapp_numero_cadastrado:     '📱 Número de WhatsApp cadastrado',
  whatsapp_numero_confirmado:     '✅ Número de WhatsApp confirmado',
  whatsapp_numero_pessoa:         '👤 Pessoa do número alterada',
  whatsapp_numero_removido:       '🗑️ Número de WhatsApp removido',
  whatsapp_plano_ativado_loja:    '✅ Plano de WhatsApp ativado',
  whatsapp_plano_recusado_loja:   '❌ Plano de WhatsApp recusado',
  whatsapp_plano_encerrado_loja:  '⏹️ Plano de WhatsApp encerrado',
  whatsapp_creditos_ajuste:       '🧮 Créditos de WhatsApp ajustados',
  whatsapp_teto_aviso:            '⚠️ WhatsApp passou do aviso de custo',
  whatsapp_teto_pausado:          '⏸️ Assistente pausado pelo teto de custo',
  whatsapp_teto_retomado:         '▶️ Assistente retomado',
  whatsapp_plano_criado:          '➕ Plano de WhatsApp criado',
  whatsapp_plano_editado:         '✏️ Plano de WhatsApp editado',
  whatsapp_plano_excluido:        '🗑️ Plano de WhatsApp excluído',
  whatsapp_plano_ativado:         '✅ Plano de WhatsApp disponível para venda',
  whatsapp_plano_desativado:      '⏸️ Plano de WhatsApp tirado de venda',
  whatsapp_parametros:            '⚙️ Parâmetros do WhatsApp editados',
  whatsapp_liberado:              '🔌 WhatsApp liberado/pausado para as lojas',
  whatsapp_webhook_assinado:      '🔌 Avisos do WhatsApp ligados',
  whatsapp_teste:                 '🧪 Mensagem de teste',
};
