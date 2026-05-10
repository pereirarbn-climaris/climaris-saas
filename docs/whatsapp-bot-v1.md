# WhatsApp Bot V1 sem IA

Este documento registra o diagnóstico do sistema atual e o plano inicial para criar um bot de WhatsApp configurável por
tenant, sem IA. A IA fica reservada para a V2.

## Decisão de produto

- V1: bot determinístico com menus, gatilhos, respostas pré-programadas, variáveis e ações controladas.
- V2: IA/LLM para atendimento livre, interpretação de intenção e ferramentas avançadas.
- Cada empresa do SaaS deve poder montar seus fluxos conforme sua operação, sem regras globais fixas no código.

## Status da IA nesta branch

- Backend: `app/main.py` não monta rotas `/api/v1/ai`.
- Config: `AI_ASSISTANT_V2_ENABLED` nasce `False`.
- Frontend: `AiAssistantPage` permanece como código reservado, mas retorna uma tela de recurso desativado e não chama API de IA.
- Webhook WhatsApp: `consume_evolution_webhook` não chama `generate_ai_response` nem provedor LLM.

Observação: os arquivos `app/ai_assistant.py`, `app/routers/ai_settings.py`, `app/schemas_ai.py`,
`frontend/src/api/ai.ts` e `frontend/src/pages/integrations/AiAssistantPage.tsx` devem ser tratados como material de V2.

## Implementado nesta V1

- Migration `20260510_0058_whatsapp_bot_v1.py`.
- Modelos:
  - `WhatsappBotSettings`
  - `WhatsappBotFlow`
  - `WhatsappBotStep`
  - `WhatsappBotSession`
- Schemas em `app/schemas_whatsapp_bot.py`.
- Serviço determinístico em `app/whatsapp_bot.py`.
- Rotas autenticadas em `/api/v1/whatsapp/bot`.
- Integração com webhook Evolution depois da lógica existente de confirmação/remarcação de agenda.
- Gatilho `service_order_done` ao concluir OS.
- Frontend:
  - API `frontend/src/api/whatsappBot.ts`
  - página `/app/integrations/whatsapp-bot`
  - menu lateral e busca global.

## O que já existe no sistema

### WhatsApp / Evolution

- Conexão por tenant com instância Evolution:
  - `GET /api/v1/whatsapp/connection`
  - `POST /api/v1/whatsapp/connection/setup`
  - `POST /api/v1/whatsapp/connection/disconnect`
- Página pronta em `frontend/src/pages/integrations/WhatsappIntegrationPage.tsx`.
- Jobs e eventos de mensagens:
  - `WhatsappMessageJob`
  - `WhatsappMessageEvent`
- Envio de mensagens por template via `dispatch_template`.
- Envio de lembrete de agendamento via `dispatch_appointment_reminder`.
- Worker de lembretes em `app/whatsapp_scheduler.py`.
- Webhook Evolution em `POST /api/v1/whatsapp/webhook/evolution`.
- O webhook já:
  - ignora grupos e mensagens `fromMe` em ações de agenda;
  - evita reprocessamento por `incoming_message_processed`;
  - registra eventos recebidos;
  - interpreta confirmação/remarcação de agendamento.

### Agenda e lembretes

- `Schedule` já possui tenant, cliente, OS, data/hora, status e observações.
- `Tenant` já guarda:
  - template do lembrete de agendamento;
  - palavra de confirmação;
  - palavra de remarcação;
  - offsets de lembretes.
- Página de WhatsApp já permite editar template e regras de lembrete.

### Ordens de serviço

- `ServiceOrder` possui status `open`, `approved`, `scheduled`, `in_progress`, `done`, `cancelled`.
- O fechamento acontece em `PATCH /api/v1/service-orders/{order_id}`.
- Ao concluir, o sistema consome estoque e marca `closed_at`.
- Ainda não existe gatilho WhatsApp para OS concluída.

### Financeiro e pagamentos

- `FinanceEntry` possui valor, status, vencimento, método/provedor, WhatsApp do destinatário e IDs de gateway.
- Existe integração Asaas para gateway/webhook.
- Já existe envio resiliente de WhatsApp quando uma entrada muda para pago ou vencido.
- Ainda falta transformar isso em fluxo configurável pelo tenant com link de pagamento, Pix, boleto e instruções.

### Orçamentos, produtos e serviços

- Serviços e preços já existem no cadastro do tenant.
- Orçamentos já existem e há envio manual por `wa.me` no frontend.
- Isso permite uma V1 de "consulta de valores" baseada em serviços cadastrados ou respostas manuais configuradas.

### Marketplace / planos

- O backend já valida o módulo WhatsApp em rotas críticas com `_require_whatsapp_module`.
- A UI de Mercado Livre tem exemplo de bloqueio por entitlement; a página do WhatsApp ainda não replica o mesmo padrão.

## Lacunas para o bot V1

1. Integração configurável entre bot, financeiro, links de pagamento e solicitação de NF.
2. Editor visual de fluxos com múltiplos passos avançados.
3. Campanhas, recuperação de orçamento e reativação de clientes.
4. Métricas/relatórios específicos de conversas do bot.
5. Emissão fiscal automática por provedor fiscal.

## Modelagem inicial recomendada

### `whatsapp_bot_settings`

Configuração geral por tenant.

- `id`
- `tenant_id`
- `enabled`
- `welcome_message`
- `fallback_message`
- `handoff_message`
- `handoff_keywords_json`
- `handoff_pause_minutes`
- `business_hours_json`
- `created_at`
- `updated_at`

### `whatsapp_bot_flows`

Fluxos configuráveis por tenant.

- `id`
- `tenant_id`
- `slug`
- `name`
- `description`
- `enabled`
- `trigger_type`: `menu_option`, `keyword`, `system_event`, `manual`
- `trigger_keywords_json`
- `system_event`: exemplo `appointment_reminder`, `service_order_done`, `finance_due`, `budget_quote`
- `priority`
- `created_at`
- `updated_at`

### `whatsapp_bot_steps`

Passos de cada fluxo.

- `id`
- `flow_id`
- `step_key`
- `kind`: `message`, `question`, `menu`, `action`, `handoff`, `end`
- `message_template`
- `options_json`
- `validation_json`
- `actions_json`
- `next_step_key`
- `sort_order`

### `whatsapp_bot_sessions`

Estado da conversa por cliente.

- `id`
- `tenant_id`
- `client_whatsapp`
- `current_flow_id`
- `current_step_key`
- `context_json`
- `paused_until`
- `last_incoming_at`
- `last_outgoing_at`
- `created_at`
- `updated_at`

### Eventos

Reutilizar `WhatsappMessageEvent` para auditoria inicial. Se a necessidade crescer, criar `whatsapp_bot_session_events`.

## Variáveis de template V1

Começar com variáveis simples e seguras:

- `{empresa}`
- `{nome_cliente}`
- `{telefone_cliente}`
- `{data_hora}`
- `{numero_os}`
- `{titulo_os}`
- `{valor_total}`
- `{descricao_servico}`
- `{link_pagamento}`
- `{pix_copia_cola}`
- `{status_orcamento}`
- `{status_pagamento}`

Cada fluxo deve declarar quais variáveis aceita. Variáveis ausentes devem falhar no teste da configuração antes de ativar.

## Funcionalidades prioritárias

### 1. Menu inicial configurável

- Saudação por tenant.
- Opções com número/texto.
- Palavras-chave para abrir fluxos.
- Fallback quando o cliente digita algo inválido.
- Handoff para humano e pausa do bot por conversa.

### 2. Lembretes de agendamento

Reaproveitar o que já existe:

- template;
- offsets;
- confirmar;
- remarcar;
- histórico de jobs.

Evolução V1:

- permitir que o fluxo de lembrete seja editado no Bot WhatsApp;
- preservar a lógica atual de confirmar/remarcar no webhook;
- definir prioridade: respostas de confirmação/remarcação têm precedência sobre menu genérico.

### 3. Fechamento de OS

Novo gatilho:

- quando OS muda para `done`, se fluxo `service_order_done` estiver ativo, enviar mensagem.

Exemplo de fluxo:

1. "Sua OS #{numero_os} foi finalizada. Valor: R$ {valor_total}."
2. "Escolha: 1 - formas de pagamento, 2 - solicitar NF, 3 - falar com atendente."
3. Enviar instruções configuradas ou link de pagamento quando disponível.

### 4. Orçamento / pergunta de valores

Fluxo determinístico para serviços:

- gatilhos: "valor", "preço", "limpeza", "instalação", etc.
- opções baseadas nos serviços cadastrados ou em opções manuais do tenant;
- coleta de cidade/bairro, quantidade, tipo de equipamento e urgência;
- opcional: criar lead/orçamento em etapa posterior.

### 5. Financeiro e pagamentos

- Consultar pendências por telefone do cliente.
- Enviar segunda via/link quando houver gateway.
- Enviar mensagens de pago/vencido por templates configuráveis.
- Encaminhar para humano quando não houver dado suficiente.

### 6. NF

Para V1, tratar como solicitação/coleta de dados, não emissão automática:

- perguntar CPF/CNPJ, razão social, e-mail;
- registrar solicitação na OS/observação;
- enviar mensagem de handoff para financeiro.

Emissão fiscal automática deve ser outro módulo, depois de escolher provedor fiscal.

## API inicial

Prefixo sugerido: `/api/v1/whatsapp/bot`.

- `GET /settings`
- `PATCH /settings`
- `GET /flows`
- `POST /flows`
- `GET /flows/{flow_id}`
- `PATCH /flows/{flow_id}`
- `DELETE /flows/{flow_id}`
- `POST /flows/{flow_id}/steps`
- `PATCH /flows/{flow_id}/steps/{step_id}`
- `DELETE /flows/{flow_id}/steps/{step_id}`
- `POST /test`

O endpoint `/test` deve receber mensagem e contexto simulado e devolver:

- fluxo escolhido;
- step atual;
- resposta renderizada;
- próxima ação;
- erros de variável/configuração.

## Frontend inicial

Criar rota:

```txt
/app/integrations/whatsapp-bot
```

Adicionar no menu "Integrações":

```txt
WhatsApp
Bot WhatsApp
```

Página com abas:

1. Geral
2. Menu inicial
3. Lembretes de agendamento
4. Fechamento de OS
5. Orçamentos / valores
6. Financeiro / NF
7. Testar bot

Reusar o padrão visual de `WhatsappIntegrationPage.module.css`.

## Ordem técnica de implementação

1. Criar migrations e modelos do bot.
2. Criar schemas Pydantic.
3. Criar serviço `app/whatsapp_bot.py` com:
   - carregamento de settings/flows;
   - roteamento de mensagem;
   - renderização de templates;
   - gerenciamento de sessão;
   - handoff/pause.
4. Criar router `app/routers/whatsapp_bot.py`.
5. Integrar o roteador determinístico no final de `consume_evolution_webhook`, depois da lógica de agenda.
6. Criar gatilho no fechamento de OS.
7. Criar página frontend de Bot WhatsApp.
8. Adicionar testes backend para roteamento, sessão, fallback, handoff e template.
9. Adicionar build/check frontend.
10. Só depois avaliar integrações avançadas: pagamento real, NF, campanhas e editor visual.

## Critérios de aceite da primeira entrega funcional

- Admin consegue ativar/desativar o bot por tenant.
- Admin configura mensagem inicial, fallback, handoff e opções do menu.
- Cliente envia mensagem no WhatsApp e recebe resposta do fluxo configurado.
- Cliente escolhe uma opção e recebe a próxima resposta.
- "Atendente"/"humano" pausa o bot para aquele número por tempo configurado.
- Lembretes de agendamento continuam funcionando como hoje.
- Nenhum endpoint ou chamada de IA é usado na V1.
