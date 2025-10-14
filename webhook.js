/**
 * Função chamada quando o webhook recebe uma requisição POST
 * Pipedrive envia notificações de mudanças de campos aqui
 */
function doPost(e) {
  logarInfo('=== WEBHOOK ACIONADO ===', {});
  
  try {
    const conteudo = e.postData.contents;
    const dados = JSON.parse(conteudo);
    
    logarInfo('Payload recebido do webhook', dados);
    
    // Validar estrutura do payload
    if (!validarPayload(dados)) {
      return responderErro('Payload inválido', 400);
    }
    
    // Extrair informações do evento
    const evento = dados.event;
    const dealId = dados.deal?.id || dados.object?.id;
    const objeto = dados.object;
    
    logarInfo('Evento capturado', {
      tipo: evento,
      dealId,
      objeto
    });
    
    // Verificar se está finalizado (não criar atividades)
    if (verificarSeEstaFinalizado(dealId)) {
      logarInfo('Status é "Finalizado". Nenhuma atividade será criada.', { dealId });
      return responderSucesso('Registro finalizado - sem ações');
    }
    
    // Processar eventos
    switch (evento) {
      case 'updated.deal.field':
        return tratarAtualizacaoCampo(dealId, objeto);
      
      case 'added.deal':
        logarInfo('Novo negócio adicionado (sem ação)', { dealId });
        break;
      
      default:
        logarInfo(`Evento não monitorado: ${evento}`, {});
    }
    
    return responderSucesso('Webhook processado');
    
  } catch (erro) {
    logarErro('Erro ao processar webhook', erro);
    return responderErro(`Erro ao processar: ${erro.message}`, 500);
  }
}

/**
 * Valida a estrutura básica do payload
 */
function validarPayload(dados) {
  return dados && 
         dados.event && 
         (dados.deal?.id || dados.object?.id);
}

/**
 * Verifica se o negócio está com status "Finalizado"
 */
function verificarSeEstaFinalizado(dealId) {
  try {
    const negocio = chamarAPI(`/deals/${dealId}`, 'GET');
    if (negocio?.success && negocio.data) {
      const statusRegistro = negocio.data[CONFIG.CAMPO_STATUS_REGISTRO];
      return statusRegistro === 'Finalizado';
    }
  } catch (erro) {
    logarErro('Erro ao verificar status finalizado', erro);
  }
  return false;
}

/**
 * Trata atualização de campos específicos
 */
function tratarAtualizacaoCampo(dealId, objeto) {
  const idCampo = objeto?.field_key;
  const valorCampo = objeto?.value;
  
  logarInfo('Campo atualizado', {
    dealId,
    campo: idCampo,
    valor: valorCampo
  });
  
  // Campo: Data Término Contratos
  if (idCampo === CONFIG.CAMPO_DATA_CONTRATOS) {
    return procesarDataContratosOuITBI(dealId, 'contratos');
  }
  
  // Campo: Data Término ITBI
  if (idCampo === CONFIG.CAMPO_DATA_ITBI) {
    return procesarDataContratosOuITBI(dealId, 'itbi');
  }
  
  // Campo: Status Registro - Nota Devolutiva
  if (idCampo === CONFIG.CAMPO_STATUS_REGISTRO) {
    if (valorCampo === '06. Atendendo Nota Devolutiva') {
      processarAtividadeCondicional(dealId, 'NOTA_DEVOLUTIVA', null);
      return responderSucesso('Atividade de Nota Devolutiva criada');
    }
  }
  
  // Campo: Data Vencimento Protocolo Registro
  if (idCampo === CONFIG.CAMPO_DATA_VENCIMENTO) {
    if (valorCampo) {
      processarAtividadeCondicional(dealId, 'VENCIMENTO_PRENOTACAO', valorCampo);
      return responderSucesso('Atividade de Vencimento da Prenotação criada');
    }
  }
  
  return responderSucesso('Campo monitorado mas sem ação específica');
}

/**
 * Processa atualização dos campos de Data Contratos ou ITBI
 * Cria atividades escala apenas quando AMBOS estão preenchidos
 */
function procesarDataContratosOuITBI(dealId, tipo) {
  logarInfo(`Processando Data ${tipo.toUpperCase()}`, { dealId });
  
  const negocio = obterDetalhesNegocio(dealId);
  if (!negocio) {
    return responderErro('Negócio não encontrado', 404);
  }
  
  const dataContratos = negocio[CONFIG.CAMPO_DATA_CONTRATOS];
  const dataITBI = negocio[CONFIG.CAMPO_DATA_ITBI];
  
  logarInfo('Verificando preenchimento de campos', {
    dataContratos: dataContratos || 'vazio',
    dataITBI: dataITBI || 'vazio'
  });
  
  // Ambos campos preenchidos - criar atividades
  if (dataContratos && dataITBI) {
    // Usar a data mais recente como data de início
    const data1 = new Date(dataContratos);
    const data2 = new Date(dataITBI);
    const dataInicio = data1 > data2 ? data1 : data2;
    
    logarInfo('✓ Ambos campos preenchidos. Criando atividades escala.', {
      dealId,
      dataInicio: formatarDataISO(dataInicio)
    });
    
    // Verificar se atividades já foram criadas (evitar duplicatas)
    if (!verificarAtividadesJaCriadas(dealId)) {
      processarAtividadesEscala(dealId, dataInicio);
      return responderSucesso('Atividades escala criadas com sucesso');
    } else {
      logarInfo('Atividades já foram criadas para este negócio', { dealId });
      return responderSucesso('Atividades já existentes - sem ações');
    }
  } else {
    logarInfo('Campos ainda não estão ambos preenchidos', {
      dealId,
      tipo,
      statusContratos: dataContratos ? 'preenchido' : 'vazio',
      statusITBI: dataITBI ? 'preenchido' : 'vazio'
    });
    return responderSucesso('Aguardando preenchimento de ambos campos');
  }
}

/**
 * Verifica se as atividades de escala já foram criadas
 * para evitar duplicatas
 */
function verificarAtividadesJaCriadas(dealId) {
  try {
    const resultado = chamarAPI(`/deals/${dealId}/activities`, 'GET');
    if (resultado?.success && resultado.data) {
      const atividades = resultado.data;
      // Verificar se existe atividade de "1 DIA - INICIAR"
      return atividades.some(a => 
        a.subject && a.subject.includes('1 DIA - INICIAR')
      );
    }
  } catch (erro) {
    logarErro('Erro ao verificar atividades criadas', erro);
  }
  return false;
}

/**
 * Formata resposta de sucesso do webhook
 */
function responderSucesso(mensagem) {
  const resposta = {
    sucesso: true,
    mensagem: mensagem,
    timestamp: new Date().toLocaleString('pt-BR')
  };
  logarInfo(mensagem, resposta);
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Formata resposta de erro do webhook
 */
function responderErro(mensagem, codigoStatus = 400) {
  const resposta = {
    sucesso: false,
    mensagem: mensagem,
    codigoStatus: codigoStatus,
    timestamp: new Date().toLocaleString('pt-BR')
  };
  logarErro(mensagem, resposta);
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Função para registrar o webhook no Pipedrive
 * Execute esta função uma única vez para configurar
 */
function registrarWebhookNoPipedrive() {
  logarInfo('=== REGISTRANDO WEBHOOK ===', {});
  
  // Obter URL do script (usar URL de deploy)
  const scriptId = ScriptApp.getScriptId();
  const urlWebhook = `https://script.google.com/macros/d/${scriptId}/usercontent`;
  
  logarInfo('URL do webhook', { url: urlWebhook });
  
  // Eventos que queremos monitorar
  const eventos = [
    'updated.deal.field',  // Quando campo é atualizado
    'added.deal'           // Quando negócio é criado
  ];
  
  eventos.forEach(evento => {
    const payload = {
      subscription_url: urlWebhook,
      event_action: evento,
      event_object: 'deal'
    };
    
    const resultado = chamarAPI('/webhooks', 'POST', payload);
    
    if (resultado?.success) {
      logarInfo(`✓ Webhook registrado para evento: ${evento}`, {
        webhookId: resultado.data?.id
      });
    } else {
      logarErro(`Erro ao registrar webhook para ${evento}`, resultado);
    }
  });
  
  logarInfo('=== REGISTRO DE WEBHOOK FINALIZADO ===', {});
}

/**
 * Função para listar webhooks cadastrados
 * Use para verificar quais webhooks estão ativos
 */
function listarWebhooks() {
  logarInfo('=== LISTANDO WEBHOOKS ===', {});
  const resultado = chamarAPI('/webhooks', 'GET');
  
  if (resultado?.success && resultado.data) {
    console.log('Webhooks ativos:', JSON.stringify(resultado.data, null, 2));
  } else {
    console.log('Nenhum webhook encontrado ou erro na consulta');
  }
}

// INSTRUÇÕES DE USO:
// 1. Execute testarNegocio(10931) para validar configurações
// 2. Deploy este script como Web App (Deploy > New Deployment > Web app)
// 3. Execute registrarWebhookNoPipedrive() para ativar o webhook
// 4. Use listarWebhooks() para confirmar a configuração