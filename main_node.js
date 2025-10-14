// Carregar variáveis de ambiente
require('dotenv').config();

// CONFIGURAÇÕES
const CONFIG = {
  PIPEDRIVE_TOKEN: process.env.PIPEDRIVE_TOKEN,
  PIPEDRIVE_API: process.env.PIPEDRIVE_API,
  CAMPO_DATA_CONTRATOS: process.env.CAMPO_DATA_CONTRATOS,
  CAMPO_DATA_ITBI: process.env.CAMPO_DATA_ITBI,
  CAMPO_STATUS_REGISTRO: process.env.CAMPO_STATUS_REGISTRO,
  CAMPO_DATA_VENCIMENTO: process.env.CAMPO_DATA_VENCIMENTO,
  DEAL_ID_TESTE: parseInt(process.env.DEAL_ID_TESTE),
  TIPO_ATIVIDADE: process.env.TIPO_ATIVIDADE
};

// Funções utilitárias
const logger = {
  info: (mensagem, dados = {}) => {
    console.log(`[INFO] ${new Date().toLocaleString('pt-BR')} - ${mensagem}`, dados);
  },
  erro: (mensagem, erro) => {
    console.error(`[ERRO] ${new Date().toLocaleString('pt-BR')} - ${mensagem}`, erro);
  }
};

function obterDataBrasil() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function adicionarDias(data, dias) {
  const resultado = new Date(data);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

function formatarDataISO(data) {
  return data.toISOString().split('T')[0];
}

// Funções de API
async function chamarAPI(endpoint, metodo = 'GET', payload = null) {
  const url = `${CONFIG.PIPEDRIVE_API}${endpoint}?api_token=${CONFIG.PIPEDRIVE_TOKEN}`;
  const opcoes = {
    method: metodo,
    headers: {}
  };
  
  if (payload) {
    opcoes.headers['Content-Type'] = 'application/json';
    opcoes.body = JSON.stringify(payload);
  }
  
  try {
    const resposta = await fetch(url, opcoes);
    const codigoStatus = resposta.status;
    const texto = await resposta.text();
    
    if (codigoStatus >= 200 && codigoStatus < 300) {
      return texto ? JSON.parse(texto) : { success: true };
    } else {
      logger.erro(`API Error ${codigoStatus} - ${endpoint}`, texto);
      return null;
    }
  } catch (erro) {
    logger.erro(`Exceção ao chamar API - ${endpoint}`, erro);
    return null;
  }
}

async function obterDetalhesNegocio(dealId) {
  const resultado = await chamarAPI(`/deals/${dealId}`, 'GET');
  return resultado?.success ? resultado.data : null;
}

async function obterProprietarioImavel(dealId) {
  const negocio = await obterDetalhesNegocio(dealId);
  return negocio?.user_id || null;
}

async function criarAtividade(dealId, titulo, anotacao, prioridade, dataVencimento) {
  const payload = {
    deal_id: dealId,
    type: CONFIG.TIPO_ATIVIDADE,
    subject: titulo,
    note: anotacao,
    priority: prioridade,
    due_date: formatarDataISO(dataVencimento)
  };
  
  const resultado = await chamarAPI('/activities', 'POST', payload);
  return resultado?.success ? resultado.data : null;
}

// Função de teste
async function testarNegocio(dealId = CONFIG.DEAL_ID_TESTE) {
  logger.info('=== INICIANDO TESTE DE AUTOMAÇÃO ===', { dealId });
  
  const negocio = await obterDetalhesNegocio(dealId);
  if (!negocio) {
    logger.erro(`Negócio não encontrado: ${dealId}`, {});
    return;
  }
  
  const dataHoje = obterDataBrasil();
  const dataVencimento = adicionarDias(dataHoje, 1);
  
  await criarAtividade(
    dealId,
    'TESTE - Atividade Node.js',
    'Teste de criação via Node.js',
    'high',
    dataVencimento
  );
  
  logger.info('✓ Atividade de teste criada com sucesso', {
    dataVencimento: formatarDataISO(dataVencimento)
  });
  
  logger.info('=== TESTE FINALIZADO ===', {});
}

// Executar teste
if (require.main === module) {
  testarNegocio().catch(erro => console.error('Erro:', erro));
}