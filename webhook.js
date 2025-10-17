const express = require('express');
const {
  CONFIG,
  logger,
  obterDetalhesNegocio,
  verificarSeEstaFinalizado,
  invalidarCacheDeal,
  validarEProcessar,
  processarAtividadeCondicional
} = require('./main_node.js');

const app = express();
app.use(express.json());

// === CONFIGURAÇÃO DE CACHE E RATE LIMITING ===
const CACHE_CONFIG = {
  TEMPO_CACHE_ATIVIDADES: 300,
  TEMPO_DEBOUNCE: 60,
  MAX_REQUISICOES_POR_MINUTO: 30,
  TEMPO_CACHE_HASH: 120,
  TEMPO_BLOQUEIO_ERRO: 180
};

// Cache em memória (em produção, use Redis)
const memoryCache = new Map();

// === ANTI-FLOOD ===
function calcularHashPayload(dados) {
  try {
    const dealId = extrairDealId(dados);
    const timestampArredondado = Math.floor(Date.now() / 10000);
    return `${dealId}_${timestampArredondado}`;
  } catch (e) {
    return Date.now().toString();
  }
}

function verificarPayloadDuplicado(hash) {
  const chave = `payload_hash_${hash}`;
  if (memoryCache.has(chave)) return true;
  
  memoryCache.set(chave, 'processado');
  setTimeout(() => memoryCache.delete(chave), CACHE_CONFIG.TEMPO_CACHE_HASH * 1000);
  return false;
}

function verificarDebounce(dealId) {
  const chave = `debounce_${dealId}`;
  const ultimo = memoryCache.get(chave);
  
  if (ultimo) {
    const tempoDecorrido = (Date.now() - ultimo) / 1000;
    if (tempoDecorrido < CACHE_CONFIG.TEMPO_DEBOUNCE) return false;
  }
  
  memoryCache.set(chave, Date.now());
  setTimeout(() => memoryCache.delete(chave), (CACHE_CONFIG.TEMPO_DEBOUNCE + 10) * 1000);
  return true;
}

function verificarRateLimit() {
  const chave = 'rate_limit_count';
  const chaveTimestamp = 'rate_limit_timestamp';
  
  const agora = Date.now();
  const timestamp = memoryCache.get(chaveTimestamp);
  
  if (!timestamp || (agora - timestamp) > 60000) {
    memoryCache.set(chaveTimestamp, agora);
    memoryCache.set(chave, 1);
    setTimeout(() => {
      memoryCache.delete(chaveTimestamp);
      memoryCache.delete(chave);
    }, 60000);
    return true;
  }
  
  const count = memoryCache.get(chave) || 0;
  
  if (count >= CACHE_CONFIG.MAX_REQUISICOES_POR_MINUTO) return false;
  
  memoryCache.set(chave, count + 1);
  return true;
}

function extrairDealId(dados) {
  let dealId = null;
  
  if (dados.data?.id) dealId = dados.data.id;
  else if (dados.current?.id) dealId = dados.current.id;
  else if (dados.meta?.entity_id) dealId = dados.meta.entity_id;
  else if (dados.deal?.id) dealId = dados.deal.id;
  else if (dados.object?.id) dealId = dados.object.id;
  
  return dealId ? (typeof dealId === 'string' ? parseInt(dealId) : dealId) : null;
}

// === WEBHOOK HANDLER ===
app.post('/webhook', async (req, res) => {
  let dealId = null;
  
  try {
    const dados = req.body;
    dealId = extrairDealId(dados);
    
    if (!dealId) {
      return responderErro(res, 'DealID não encontrado', 400);
    }
    
    // Anti-flood
    const hashPayload = calcularHashPayload(dados);
    if (verificarPayloadDuplicado(hashPayload)) {
      return responderSucesso(res, 'Duplicado');
    }
    
    // Debounce
    if (!verificarDebounce(dealId)) {
      return responderSucesso(res, 'Debounce ativo');
    }
    
    // Rate limit
    if (!verificarRateLimit()) {
      return responderErro(res, 'Rate limit excedido', 429);
    }
    
    // Validação
    if (!validarPayload(dados)) {
      registrarErroWebhook(dealId, 'Payload inválido', '', JSON.stringify(dados));
      return responderErro(res, 'Payload inválido', 400);
    }

    const negocio = await obterDetalhesNegocio(dealId);
    if (!negocio) {
      registrarErroWebhook(dealId, 'Negócio não encontrado na API', '', '');
      return responderErro(res, 'Negócio não encontrado', 404);
    }

    const dealTitle = negocio.title || 'Sem título';

    // Verifica se finalizado
    if (await verificarSeEstaFinalizado(dealId, negocio)) {
      const chaveLogFinalizado = `log_finalizado_${dealId}`;
      if (!memoryCache.has(chaveLogFinalizado)) {
        registrarLogWebhook(dealId, dealTitle, 'Finalizado - sem ações', [], 'Status = Finalizado');
        memoryCache.set(chaveLogFinalizado, 'logged');
        setTimeout(() => memoryCache.delete(chaveLogFinalizado), 86400000); // 24h
      }
      return responderSucesso(res, 'Finalizado');
    }

    const tipoEvento = dados.meta?.action || dados.event;
    
    switch (tipoEvento) {
      case 'updated':
      case 'change':
      case 'updated.deal':
        return await tratarAtualizacaoDeal(res, dealId, dados, negocio, dealTitle);
      case 'added':
      case 'added.deal':
        registrarLogWebhook(dealId, dealTitle, 'Negócio adicionado', [], 'Deal criado');
        return responderSucesso(res, 'OK');
      default:
        return responderSucesso(res, 'OK');
    }
  } catch (erro) {
    logger.erro('Erro ao processar webhook:', erro);
    registrarErroWebhook(dealId, erro.message, erro.stack || '', '');
    return responderErro(res, `Erro: ${erro.message}`, 500);
  }
});

function validarPayload(d) { 
  const temEvento = d && (d.event || d.meta);
  const temDeal = d && (d.data || d.current || d.meta?.entity_id || d.deal || d.object);
  return temEvento && temDeal;
}

async function tratarAtualizacaoDeal(res, dealId, dados, negocioCacheado, dealTitle) {
  const previous = dados.previous || {};
  const current = dados.data || dados.current || {};
  const camposAlterados = [];
  
  if (previous.custom_fields && current.custom_fields) {
    const prevFields = previous.custom_fields || {};
    const currFields = current.custom_fields || {};
    
    const camposGatilho = [
      CONFIG.CAMPO_STATUS_REGISTRO,
      CONFIG.CAMPO_DATA_INICIO_REGISTRO,
      CONFIG.CAMPO_DATA_TERMINO_CONTRATOS,
      CONFIG.CAMPO_DATA_TERMINO_ITBI
    ];
    
    camposGatilho.forEach(campo => {
      const valorAnterior = prevFields[campo];
      const valorAtual = currFields[campo];
      if (JSON.stringify(valorAnterior) !== JSON.stringify(valorAtual)) {
        camposAlterados.push({ campo, anterior: valorAnterior, atual: valorAtual });
      }
    });
  }
  
  if (camposAlterados.length > 0) {
    invalidarCacheDeal(dealId);
    const resultado = await validarEProcessar(dealId, negocioCacheado);
    
    if (resultado.sucesso) {
      const atividadesFormatadas = formatarAtividadesCriadas(resultado.atividadesCriadas);
      registrarLogWebhook(dealId, dealTitle, 'Processamento incremental', atividadesFormatadas, `${resultado.atividadesCriadas.length} criada(s)`);
      return responderSucesso(res, resultado.mensagem);
    } else {
      const chaveErro = `ultimo_erro_${dealId}`;
      const ultimoErro = memoryCache.get(chaveErro);
      
      if (ultimoErro !== resultado.mensagem) {
        registrarLogWebhook(dealId, dealTitle, 'Requisitos não atendidos', [], resultado.mensagem);
        memoryCache.set(chaveErro, resultado.mensagem);
        setTimeout(() => memoryCache.delete(chaveErro), CACHE_CONFIG.TEMPO_BLOQUEIO_ERRO * 1000);
      }
      
      return responderSucesso(res, `Aguardando: ${resultado.mensagem}`);
    }
  }
  
  return responderSucesso(res, 'Sem alterações relevantes');
}

// === RESPOSTAS HTTP ===
function responderSucesso(res, msg) {
  const resposta = {
    sucesso: true, 
    mensagem: msg, 
    timestamp: new Date().toLocaleString('pt-BR')
  };
  res.json(resposta);
}

function responderErro(res, msg, status = 400) {
  const resposta = {
    sucesso: false, 
    mensagem: msg, 
    codigoStatus: status, 
    timestamp: new Date().toLocaleString('pt-BR')
  };
  res.status(status).json(resposta);
}

// === SISTEMA DE LOGS ===
// Em ambiente Node.js, você pode implementar logs em arquivo ou banco de dados
// Por simplicidade, vamos usar console.log com estrutura organizada

function registrarLogWebhook(dealId, title, action, atividadesCriadas = [], detalhes = '') {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const atividadesTexto = atividadesCriadas.length > 0 
    ? atividadesCriadas.map(a => `✓ ${a}`).join('\n')
    : 'Nenhuma';
  
  logger.info('WEBHOOK LOG', {
    timestamp,
    dealId,
    title: title || 'N/A',
    action,
    atividades: atividadesTexto,
    detalhes
  });
  
  // Em produção, você pode salvar em banco de dados ou arquivo
  // Exemplo: await salvarLogBanco({ timestamp, dealId, title, action, atividades, detalhes });
}

function registrarErroWebhook(dealId, erro, stackTrace = '', payload = '') {
  const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  
  logger.erro('WEBHOOK ERROR', {
    timestamp,
    dealId: dealId || 'N/A',
    erro,
    stackTrace,
    payload: payload.length > 1000 ? payload.substring(0, 1000) + '...[truncado]' : payload
  });
  
  // Em produção, você pode salvar em banco de dados ou arquivo
  // Exemplo: await salvarErroBanco({ timestamp, dealId, erro, stackTrace, payload });
}

function formatarAtividadesCriadas(atividades) {
  if (!atividades || atividades.length === 0) return [];
  return atividades.map(titulo => {
    const match = titulo.match(/REGISTRO - (\d+) DIA/);
    return match ? `DIA ${match[1]}` : titulo;
  });
}

// === ROTAS ADICIONAIS ===
app.get('/status', (req, res) => {
  res.json({
    status: 'ativo',
    timestamp: new Date().toLocaleString('pt-BR'),
    versao: '2.0.0'
  });
});

app.get('/test/:dealId', async (req, res) => {
  try {
    const dealId = parseInt(req.params.dealId);
    const { testarNegocio } = require('./main_node.js');
    const resultado = await testarNegocio(dealId);
    res.json(resultado);
  } catch (erro) {
    logger.erro('Erro no teste:', erro);
    res.status(500).json({ erro: erro.message });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Servidor webhook iniciado na porta ${PORT}`);
  logger.info(`📍 Endpoint: http://localhost:${PORT}/webhook`);
  logger.info(`🔍 Status: http://localhost:${PORT}/status`);
});