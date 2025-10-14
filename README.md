# 🏢 Automação de Registro de Imóveis

Sistema automatizado para gerenciamento de atividades de registro de imóveis integrado com o Pipedrive.

![Status do Projeto](https://img.shields.io/badge/status-em%20desenvolvimento-green)
![Node Version](https://img.shields.io/badge/node-v22.23.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📋 Índice

- [Recursos](#-recursos)
- [Requisitos](#-requisitos)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Uso](#-uso)
- [Arquitetura](#-arquitetura)
- [Contribuição](#-contribuição)

## 🚀 Recursos

- ✨ Integração completa com Pipedrive API
- 📅 Criação automática de atividades baseada em datas
- 🔄 Webhook para atualizações em tempo real
- 📝 Monitoramento de campos específicos
- 🎯 Tratamento de notas devolutivas
- ⏰ Controle de vencimentos de prenotação
- 🔒 Configuração segura via variáveis de ambiente

## 📋 Requisitos

- Node.js v22.23.0 ou superior
- NPM 10.9.3 ou superior
- Conta no Pipedrive com acesso à API
- Permissões para configurar webhooks

## 💻 Instalação

1. Clone o repositório:
\`\`\`bash
git clone [url-do-repositorio]
cd Atividades-de-Registro
\`\`\`

2. Instale as dependências:
\`\`\`bash
npm install
\`\`\`

3. Configure as variáveis de ambiente:
\`\`\`bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
\`\`\`

## ⚙️ Configuração

1. Configure suas variáveis de ambiente no arquivo \`.env\`:

\`\`\`env
PIPEDRIVE_TOKEN=seu_token_aqui
PIPEDRIVE_API=https://api.pipedrive.com/v1
CAMPO_DATA_CONTRATOS=id_do_campo
CAMPO_DATA_ITBI=id_do_campo
CAMPO_STATUS_REGISTRO=id_do_campo
CAMPO_DATA_VENCIMENTO=id_do_campo
DEAL_ID_TESTE=10931
TIPO_ATIVIDADE=Averbações
\`\`\`

2. Campos necessários no Pipedrive:
- Data Término Contratos
- Data Término ITBI
- Status Registro
- Data Vencimento Protocolo Registro

## 🎯 Uso

### Executando Localmente

1. Teste a configuração:
\`\`\`bash
node main_node.js
\`\`\`

2. Para desenvolvimento com webhook:
- Deploy o script como Web App no Google Apps Script
- Execute a função \`registrarWebhookNoPipedrive()\`
- Verifique o registro com \`listarWebhooks()\`

### Fluxo de Trabalho

1. **Monitoramento de Campos**:
   - Data Contratos e ITBI: Cria atividades quando ambos preenchidos
   - Status Registro: Monitora notas devolutivas
   - Data Vencimento: Controla prazos de prenotação

2. **Criação de Atividades**:
   - Automática baseada em eventos
   - Evita duplicação
   - Priorização inteligente

## 🏗 Arquitetura

### Estrutura de Arquivos

\`\`\`
├── main_node.js     # Código principal e funções core
├── webhook.js       # Manipulador de webhooks do Pipedrive
├── .env            # Variáveis de ambiente (não versionado)
├── .env.example    # Exemplo de configuração
└── package.json    # Dependências e scripts
\`\`\`

### Componentes Principais

- **Main Node**: Funções core e utilitárias
- **Webhook**: Gerenciamento de eventos do Pipedrive
- **Config**: Variáveis de ambiente e constantes

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie sua feature branch (\`git checkout -b feature/AmazingFeature\`)
3. Commit suas mudanças (\`git commit -m 'Add some AmazingFeature'\`)
4. Push para a branch (\`git push origin feature/AmazingFeature\`)
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