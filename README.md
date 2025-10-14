# 🏢 Automação de Registro de Imóveis

Sistema automatizado para gerenciamento de atividades de registro de imóveis integrado ao Pipedrive.

![Status do Projeto](https://img.shields.io/badge/status-em%20desenvolvimento-green)
![Node Version](https://img.shields.io/badge/node-v22.23.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📋 Índice

- **[Recursos](#-recursos)**
- **[Requisitos](#-requisitos)**
- **[Instalação](#-instalação)**
- **[Configuração](#-configuração)**
- **[Uso](#-uso)**
- **[Arquitetura](#-arquitetura)**
- **[Contribuição](#-contribuição)**
- **[Notas de Versão](#-notas-de-versão)**
- **[Licença](#-licença)**
- **[Suporte](#-suporte)**

## 🚀 Recursos

- **Integração completa com Pipedrive API**
- **Criação automática de atividades baseada em datas**
- **Webhook para atualizações em tempo real**
- **Monitoramento de campos específicos**
- **Tratamento de notas devolutivas**
- **Controle de vencimentos de prenotação**
- **Configuração segura via variáveis de ambiente**

## 📋 Requisitos

- **Node.js**: v22.23.0 ou superior
- **NPM**: 10.9.3 ou superior
- **Pipedrive**: Conta com acesso à API
- **Permissões**: Habilitar e configurar webhooks

## 💻 Instalação

1. Clone o repositório:
```bash
git clone [url-do-repositorio]
cd Atividades-de-Registro
```

2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente (opcionalmente a partir de um exemplo):
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

## ⚙️ Configuração

1) Configure suas variáveis de ambiente no arquivo `.env`:

```env
PIPEDRIVE_TOKEN=seu_token_aqui
PIPEDRIVE_API=https://api.pipedrive.com/v1
CAMPO_DATA_CONTRATOS=id_do_campo
CAMPO_DATA_ITBI=id_do_campo
CAMPO_STATUS_REGISTRO=id_do_campo
CAMPO_DATA_VENCIMENTO=id_do_campo
DEAL_ID_TESTE=10931
TIPO_ATIVIDADE=Averbações
```

2) Garanta que os seguintes campos existam no Pipedrive:
- **Data Término Contratos**
- **Data Término ITBI**
- **Status Registro**
- **Data Vencimento Protocolo Registro**

## 🎯 Uso

### Executando localmente

1. Teste a configuração:
```bash
node main_node.js
```

2. Desenvolvimento com webhook:
- Faça o deploy do script como Web App no Google Apps Script
- Execute a função `registrarWebhookNoPipedrive()`
- Verifique o registro com `listarWebhooks()`

### Fluxo de trabalho

1) **Monitoramento de campos**
   - Data de Contratos e ITBI: cria atividades quando ambos estiverem preenchidos
   - Status de Registro: monitora notas devolutivas
   - Data de Vencimento: controla prazos de prenotação

2) **Criação de atividades**
   - Automática baseada em eventos
   - Evita duplicações
   - Priorização inteligente

## 🏗 Arquitetura

### Estrutura de arquivos

```
├── main_node.js     # Código principal e funções core
├── webhook.js       # Manipulador de webhooks do Pipedrive
├── .env             # Variáveis de ambiente (não versionado)
├── .env.example     # Exemplo de configuração
└── package.json     # Dependências e scripts
```

### Componentes principais

- **Main Node**: Funções core e utilitárias
- **Webhook**: Gerenciamento de eventos do Pipedrive
- **Config**: Variáveis de ambiente e constantes

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie sua feature branch (`git checkout -b feature/NomeDaFeature`)
3. Commit suas mudanças (`git commit -m "feat: adiciona NomeDaFeature"`)
4. Push para a branch (`git push origin feature/NomeDaFeature`)
5. Abra um Pull Request

## 📝 Notas de Versão

### v1.0.0
- Integração inicial com Pipedrive
- Sistema de webhook implementado
- Automação de atividades baseada em datas
- Controle de notas devolutivas

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙋‍♂️ Suporte

Para suporte e questões, por favor abra uma [issue](issues) no repositório.

---

Desenvolvido com ❤️ para otimizar o processo de registro de imóveis


