// Carregar variáveis de ambiente
require('dotenv').config();

// CONFIGURAÇÕES
const CONFIG = {
  PIPEDRIVE_TOKEN: process.env.PIPEDRIVE_TOKEN,
  PIPEDRIVE_API: process.env.PIPEDRIVE_API || 'https://api.pipedrive.com/v1',
  CAMPO_DATA_INICIO_REGISTRO: process.env.CAMPO_DATA_INICIO_REGISTRO,
  CAMPO_STATUS_REGISTRO: process.env.CAMPO_STATUS_REGISTRO,
  CAMPO_DATA_TERMINO_CONTRATOS: process.env.CAMPO_DATA_TERMINO_CONTRATOS,
  CAMPO_DATA_TERMINO_ITBI: process.env.CAMPO_DATA_TERMINO_ITBI,
  CAMPO_DATA_VENCIMENTO: process.env.CAMPO_DATA_VENCIMENTO,
  DEAL_ID_TESTE: parseInt(process.env.DEAL_ID_TESTE),
  TIPO_ATIVIDADE: process.env.TIPO_ATIVIDADE || 'Averbações',
  HORARIO_PADRAO: process.env.HORARIO_PADRAO || '09:00',
  OPTION_ID_FINALIZADO: parseInt(process.env.OPTION_ID_FINALIZADO),
  OPTION_ID_INICIAR: parseInt(process.env.OPTION_ID_INICIAR)
};

// === CACHE DE PRIORIDADES ===
let PRIORITY_IDS_CACHE = null;

async function getPriorityIds() {
  if (PRIORITY_IDS_CACHE) return PRIORITY_IDS_CACHE;
  
  try {
    const resp = await chamarAPI('/activityFields', 'GET');
    if (resp?.data) {
      const priorityField = resp.data.find(f => f.key === 'priority');
      if (priorityField?.options) {
        const options = {};
        priorityField.options.forEach(opt => {
          const label = String(opt.label || '').toLowerCase();
          if (label.includes('high') || label.includes('alta')) options.HIGH = opt.id;
          else if (label.includes('medium') || label.includes('médi')) options.MEDIUM = opt.id;
          else if (label.includes('low') || label.includes('baixa')) options.LOW = opt.id;
        });
        PRIORITY_IDS_CACHE = options;
        return options;
      }
    }
  } catch (err) {
    logger.erro('Erro ao buscar prioridades:', err);
  }
  
  PRIORITY_IDS_CACHE = { HIGH: 2, MEDIUM: 1, LOW: 0 };
  return PRIORITY_IDS_CACHE;
}

async function getPriorityValue(priority) {
  const ids = await getPriorityIds();
  switch(priority) {
    case 'high': return ids.HIGH || 2;
    case 'medium': return ids.MEDIUM || 1;
    case 'low': return ids.LOW || 0;
    default: return ids.MEDIUM || 1;
  }
}

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

function calcularDiasDesde(dataInicio) {
  const hoje = obterDataBrasil();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(dataInicio);
  inicio.setHours(0, 0, 0, 0);
  return Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24));
}

function formatarAnotacao(anotacaoBruta) {
  return (anotacaoBruta || '')
    .split('\n')
    .map(l => l.replace(/^\s*[-*•]\s?/, '').trim())
    .filter(Boolean)
    .join('<br>');
}

// === VALIDAÇÕES DE STATUS ===
function normalizarTexto(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isFinalizadoValue(v) {
  if (typeof v === 'number') return v === CONFIG.OPTION_ID_FINALIZADO;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+$/.test(s)) return Number(s) === CONFIG.OPTION_ID_FINALIZADO;
    return /^(?:\d+\.\s*)?finalizado$/i.test(normalizarTexto(s));
  }
  if (v?.id) return Number(v.id) === CONFIG.OPTION_ID_FINALIZADO;
  return false;
}

function isIniciarValue(v) {
  if (typeof v === 'number') return v === CONFIG.OPTION_ID_INICIAR;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d+$/.test(s)) return Number(s) === CONFIG.OPTION_ID_INICIAR;
    return /^(?:\d+\.\s*)?iniciar$/i.test(normalizarTexto(s));
  }
  if (v?.id) return Number(v.id) === CONFIG.OPTION_ID_INICIAR;
  return false;
}

async function verificarSeEstaFinalizado(dealId, negocioCacheado = null) {
  const negocio = negocioCacheado || await obterDetalhesNegocio(dealId);
  return negocio ? isFinalizadoValue(negocio[CONFIG.CAMPO_STATUS_REGISTRO]) : false;
}

function areTerminosFilled(negocio) {
  return Boolean(negocio[CONFIG.CAMPO_DATA_TERMINO_CONTRATOS]) && 
         Boolean(negocio[CONFIG.CAMPO_DATA_TERMINO_ITBI]);
}

// === CACHE DE ATIVIDADES ===
const atividadesCache = new Map();
const negociosCache = new Map();

function obterAtividadesCacheadas(dealId) {
  const cached = atividadesCache.get(dealId);
  if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 min
    return cached.data;
  }
  return null;
}

function salvarAtividadesCache(dealId, atividades) {
  atividadesCache.set(dealId, {
    data: atividades,
    timestamp: Date.now()
  });
}

function invalidarCacheDeal(dealId) {
  atividadesCache.delete(dealId);
  negociosCache.delete(dealId);
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
  const cached = negociosCache.get(dealId);
  if (cached && (Date.now() - cached.timestamp) < 60000) { // 1 min
    return cached.data;
  }
  
  const resultado = await chamarAPI(`/deals/${dealId}`, 'GET');
  const negocio = resultado?.success ? resultado.data : null;
  
  if (negocio) {
    negociosCache.set(dealId, {
      data: negocio,
      timestamp: Date.now()
    });
  }
  
  return negocio;
}

async function verificarSeAtividadeExiste(dealId, tituloAtividade) {
  try {
    const resultado = await chamarAPI(`/deals/${dealId}/activities`, 'GET');
    return resultado?.success && resultado.data?.some(a => a.subject === tituloAtividade);
  } catch (e) {
    return false;
  }
}

async function obterAtividadesCriadas(dealId) {
  const cached = obterAtividadesCacheadas(dealId);
  if (cached) return cached;
  
  try {
    const resultado = await chamarAPI(`/deals/${dealId}/activities`, 'GET');
    if (resultado?.success && resultado.data) {
      const atividades = resultado.data.map(a => a.subject).filter(Boolean);
      salvarAtividadesCache(dealId, atividades);
      return atividades;
    }
  } catch (e) {
    logger.erro('Erro ao obter atividades:', e);
  }
  return [];
}

// === DADOS DAS ATIVIDADES ===
const ATIVIDADES_ESCALA = [
  { dias: 1, titulo: 'REGISTRO - 1 DIA - INICIAR', 
    anotacao: '- Conferir se todos os documentos para protocolo estão na pasta "Documentos Registro"; se faltar, providenciar\n- Validar consulta ao Mapa de Circunscrição para protocolar no cartório correto\n- Realizar/cobrar a abertura do protocolo se tudo estiver pronto', 
    prioridade: 'high' },
  { dias: 3, titulo: 'REGISTRO - 3 DIAS - VERIFICAR PROTOCOLO', 
    anotacao: '- Checar se o protocolo foi aberto e lançar em "Nº Protocolo em Andamento"\n- Se não houver protocolo: confirmar pendências/documentos faltantes e sinalizar com urgência\n- Se em andamento: verificar status e data de vencimento da prenotação para preencher no Pipe', 
    prioridade: 'medium' },
  { dias: 5, titulo: 'REGISTRO - 5 DIAS - VERIFICAR PROTOCOLO', 
    anotacao: '- Acompanhar junto ao cartório se o protocolo segue em análise\n- Se ainda não iniciado: providenciar abertura com urgência', 
    prioridade: 'medium' },
  { dias: 7, titulo: 'REGISTRO - 7 DIAS - STATUS DO ANDAMENTO', 
    anotacao: '- Acompanhar junto ao cartório se o protocolo segue em análise\n- Se ainda não iniciado: providenciar abertura com urgência', 
    prioridade: 'medium' },
  { dias: 10, titulo: 'REGISTRO - 10 DIAS - ALERTA: VERIFICAR DEVOLUTIVA', 
    anotacao: '- Confirmar se houve emissão de Nota Devolutiva\n- Se sim: criar atividade "(¡¡N/D) Nota Devolutiva)" conforme vencimento da prenotação; salvar nota na pasta "Notas Devolutivas"; destrinchar e enviar ao cliente com mensagens padrão\n- Se não: ligar no cartório e cobrar o andamento do protocolo', 
    prioridade: 'high' },
  { dias: 12, titulo: 'REGISTRO - 12 DIAS - ALERTA: VERIFICAR PAGAMENTOS', 
    anotacao: '- Confirmar liberação de custos cartorários e enviar ao cliente\n- Se estiver em análise após devolutiva: verificar status\n- Se atrasado (1ª análise ainda): cobrar retorno e abrir ouvidoria no TJ do estado', 
    prioridade: 'medium' },
  { dias: 14, titulo: 'REGISTRO - 14 DIAS - ALERTA: ACOMPANHAR CARTÓRIO', 
    anotacao: '- Sem retorno do cartório: reforçar contato e abrir nova ouvidoria no TJ se a anterior estiver finalizada\n- Se houver devolutivas pendentes: comunicar responsáveis e cliente com resumo e pendências\n- Se devolutiva respondida: acompanhar andamento', 
    prioridade: 'high' },
  { dias: 16, titulo: 'REGISTRO - 16 DIAS - ALERTA: PRAZO PRÓXIMO DE VENCIMENTO', 
    anotacao: '- Verificar se emolumentos foram liberados e pagos\n- Confirmar com o cartório se o pagamento foi identificado\n- Ligar e confirmar o status exato do protocolo', 
    prioridade: 'high' },
  { dias: 18, titulo: 'REGISTRO - 18 DIAS - SINAL DE RISCO: PRAZO ESTOURANDO', 
    anotacao: '- Verificar prazo de vencimento da prenotação e status do protocolo\n- Resolver pendências em aberto imediatamente\n- Cobrar efetivamente o cartório\n- Verificar possibilidade de dilação da prenotação', 
    prioridade: 'high' },
  { dias: 20, titulo: 'REGISTRO - 20 DIAS - ALERTA DE DESCUMPRIMENTO', 
    anotacao: '- Se não concluiu: avaliar como crítico e verificar prorrogação/novo protocolo\n- Avisar cliente sobre descumprimento do prazo\n- Acompanhar até finalização se em etapa final\n- Garantir "Data Término: Registro" e envio de matrícula atualizada', 
    prioridade: 'high' },
  { dias: 25, titulo: 'REGISTRO - 25 DIAS - DESCUMPRIMENTO TOTAL DE PRAZO', 
    anotacao: '- Verificar se a prenotação foi cancelada por decurso de prazo\n- Checar devolutivas não respondidas\n- Se houver: solicitar documentos e abrir novo protocolo\n- Comunicar cliente sobre o descumprimento', 
    prioridade: 'high' },
  { dias: 30, titulo: 'REGISTRO - 30 DIAS - PRAZO FINAL / CRÍTICO', 
    anotacao: '- Se não concluído: confirmar cancelamento definitivo da prenotação\n- Cobrança formal junto ao cartório; abrir nova ouvidoria no TJ se cabível\n- Comunicar cliente com novo plano de ação', 
    prioridade: 'high' }
];

const ATIVIDADES_CONDICIONAIS = [
  { nome: 'VENCIMENTO_PRENOTACAO', titulo: 'REGISTRO - VENCIMENTO DA PRENOTAÇÃO', 
    anotacao: '- Solicitar dilação de prazo no cartório se não finalizado\n- Verificar situação do protocolo\n- Informar o cliente caso haja vencimento', 
    prioridade: 'high' }
];

async function criarAtividade(dealId, titulo, anotacao, prioridade, dataVencimento, negocioCacheado = null) {
  if (await verificarSeEstaFinalizado(dealId, negocioCacheado)) return null;
  if (await verificarSeAtividadeExiste(dealId, titulo)) return null;
  
  // SEMPRE busca o negócio atualizado da API (não usa cache)
  const negocio = await obterDetalhesNegocio(dealId);
  if (!negocio) {
    logger.erro('Negócio não encontrado ao criar atividade', { dealId });
    return null;
  }
  
  // EXTRAÇÃO CORRETA DO OWNER ID ATUAL
  let ownerId = null;
  
  // Tenta extrair do user_id primeiro (formato que está vindo)
  if (negocio.user_id) {
    const userData = negocio.user_id;
    
    if (typeof userData === 'object') {
      // Objeto completo: { id: 123, name: '...', value: 123 }
      ownerId = userData.id || userData.value;
    } else if (typeof userData === 'number') {
      ownerId = userData;
    } else if (typeof userData === 'string' && /^\d+$/.test(userData)) {
      ownerId = parseInt(userData);
    }
  }
  
  // Fallback: tenta owner_id
  if (!ownerId && negocio.owner_id) {
    const ownerData = negocio.owner_id;
    
    if (typeof ownerData === 'object') {
      ownerId = ownerData.id || ownerData.value;
    } else if (typeof ownerData === 'number') {
      ownerId = ownerData;
    } else if (typeof ownerData === 'string' && /^\d+$/.test(ownerData)) {
      ownerId = parseInt(ownerData);
    }
  }
  
  // Converte para número e valida
  if (ownerId) {
    ownerId = Number(ownerId);
  }
  
  const payload = {
    deal_id: dealId,
    type: CONFIG.TIPO_ATIVIDADE,
    subject: titulo,
    note: formatarAnotacao(anotacao),
    due_date: formatarDataISO(dataVencimento),
    due_time: CONFIG.HORARIO_PADRAO,
    priority: await getPriorityValue(prioridade)
  };
  
  // Adiciona owner apenas se for número válido
  if (ownerId && !isNaN(ownerId) && ownerId > 0) {
    payload.user_id = ownerId;
    logger.info(`✓ Owner definido: ${ownerId} (${negocio.owner_name || negocio.user_id?.name || 'N/A'})`);
  } else {
    logger.erro(`✗ Owner inválido`, { 
      ownerId, 
      owner_id: negocio.owner_id,
      user_id: negocio.user_id,
      owner_name: negocio.owner_name
    });
    // Mesmo sem owner, tenta criar (Pipedrive pode usar default)
  }
  
  const resultado = await chamarAPI('/activities', 'POST', payload);
  if (resultado?.success) {
    invalidarCacheDeal(dealId);
    logger.info(`✓ Atividade criada: ${titulo} - Owner: ${ownerId || 'padrão'}`);
    return resultado.data;
  }
  
  logger.erro(`✗ Falha ao criar: ${titulo}`, resultado);
  return null;
}

// === PROCESSAMENTO ===
async function processarProximasAtividades(dealId, negocioCacheado = null) {
  const atividadesCriadas = [];
  const negocio = negocioCacheado || await obterDetalhesNegocio(dealId);
  
  if (!negocio || await verificarSeEstaFinalizado(dealId, negocio)) return atividadesCriadas;
  
  const dataInicioVal = negocio[CONFIG.CAMPO_DATA_INICIO_REGISTRO];
  if (!dataInicioVal) return atividadesCriadas;
  
  const diasDesdeInicio = calcularDiasDesde(dataInicioVal);
  const atividadesJaCriadas = await obterAtividadesCriadas(dealId);
  
  for (const atividade of ATIVIDADES_ESCALA) {
    if (diasDesdeInicio >= atividade.dias && !atividadesJaCriadas.includes(atividade.titulo)) {
      const dataVencimento = adicionarDias(new Date(dataInicioVal), atividade.dias);
      const criada = await criarAtividade(dealId, atividade.titulo, atividade.anotacao, atividade.prioridade, dataVencimento, negocio);
      if (criada) atividadesCriadas.push(atividade.titulo);
    }
  }
  
  return atividadesCriadas;
}

async function processarAtividadeCondicional(dealId, tipoCondicional, valorCampo, negocioCacheado = null) {
  const atividade = ATIVIDADES_CONDICIONAIS.find(a => a.nome === tipoCondicional);
  if (!atividade) return null;
  
  const dataVencimento = new Date(valorCampo);
  const criada = await criarAtividade(dealId, atividade.titulo, atividade.anotacao, atividade.prioridade, dataVencimento, negocioCacheado);
  return criada ? atividade.titulo : null;
}

async function validarEProcessar(dealId, negocioCacheado = null) {
  const negocio = negocioCacheado || await obterDetalhesNegocio(dealId);
  if (!negocio) return { sucesso: false, mensagem: 'Negócio não encontrado', atividadesCriadas: [] };
  
  const statusOk = isIniciarValue(negocio[CONFIG.CAMPO_STATUS_REGISTRO]);
  const terminosOk = areTerminosFilled(negocio);
  const dataInicioOk = Boolean(negocio[CONFIG.CAMPO_DATA_INICIO_REGISTRO]);
  
  if (!statusOk) return { sucesso: false, mensagem: 'Status ≠ "01. Iniciar"', atividadesCriadas: [] };
  if (!terminosOk) return { sucesso: false, mensagem: 'Términos não preenchidos', atividadesCriadas: [] };
  if (!dataInicioOk) return { sucesso: false, mensagem: 'Data início não preenchida', atividadesCriadas: [] };
  
  const atividadesCriadas = await processarProximasAtividades(dealId, negocio);
  return { 
    sucesso: true, 
    mensagem: 'Processado com sucesso', 
    atividadesCriadas,
    dealTitle: negocio.title || 'N/A'
  };
}

// Função de teste
async function testarNegocio(dealId = CONFIG.DEAL_ID_TESTE) {
  logger.info('=== INICIANDO TESTE DE AUTOMAÇÃO ===', { dealId });
  
  const resultado = await validarEProcessar(dealId);
  logger.info(`Resultado: ${resultado.sucesso ? '✓' : '✗'} ${resultado.mensagem}`);
  logger.info(`Atividades criadas: ${resultado.atividadesCriadas.length}`);
  
  if (resultado.atividadesCriadas.length > 0) {
    logger.info('Atividades:', resultado.atividadesCriadas);
  }
  
  logger.info('=== TESTE FINALIZADO ===', {});
  return resultado;
}

// Executar teste se executado diretamente
if (require.main === module) {
  testarNegocio().catch(erro => logger.erro('Erro no teste:', erro));
}

// Exportações para uso no webhook
module.exports = {
  CONFIG,
  logger,
  obterDataBrasil,
  adicionarDias,
  formatarDataISO,
  calcularDiasDesde,
  formatarAnotacao,
  normalizarTexto,
  isFinalizadoValue,
  isIniciarValue,
  verificarSeEstaFinalizado,
  areTerminosFilled,
  invalidarCacheDeal,
  chamarAPI,
  obterDetalhesNegocio,
  verificarSeAtividadeExiste,
  obterAtividadesCriadas,
  criarAtividade,
  processarProximasAtividades,
  processarAtividadeCondicional,
  validarEProcessar,
  testarNegocio
};