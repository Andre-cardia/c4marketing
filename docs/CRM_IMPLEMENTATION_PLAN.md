# Plano de Implementação do CRM

## Objetivo

Implementar um CRM dentro do sistema atual da C4 Marketing, seguindo boas práticas de mercado inspiradas em plataformas como HubSpot, mas respeitando a arquitetura já existente em React + Supabase.

Decisão arquitetural já alinhada neste planejamento:

- O kanban atual de tarefas de projeto continua separado do CRM.
- O CRM terá um quadro comercial próprio.
- `project_tasks` e `components/projects/KanbanBoardModal.tsx` não devem ser reutilizados como fonte de verdade do CRM.

## Contexto Atual do Sistema

- Frontend: React 19 + TypeScript + Vite.
- Backend: Supabase (Auth, PostgreSQL, Edge Functions).
- Perfis já existentes: `gestor`, `comercial`, `operacional`, `leitor`, `cliente`, `admin`.
- Já existem módulos comerciais para propostas e dashboard financeiro.
- Já existe um kanban operacional para execução de projetos, que deve permanecer isolado do funil comercial.

## Visão do Produto

O CRM deve se tornar o sistema operacional comercial da equipe, concentrando captura de leads, follow-up, evolução de proposta, conversa por WhatsApp e acompanhamento de performance.

Rotas sugeridas:

- `/crm` -> quadro do funil comercial
- `/crm/leads/:id` -> detalhe do lead
- `/crm/chat` -> dashboard de chat WhatsApp via Evolution API
- `/crm/performance` -> dashboard de desempenho por data e usuário
- `/crm/settings` -> configurações do pipeline, motivos, templates e integração

## Escopo Funcional por Fase

### Fase 1 - Pipeline Comercial do CRM

#### Objetivo

Criar um CRM comercial com quadro kanban próprio e rastreamento completo do ciclo de vida do lead.

#### Colunas do Pipeline

O quadro do CRM deve usar estas colunas fixas na primeira versão:

1. `Novo Lead`
2. `Contato Realizado`
3. `Reunião Agendada`
4. `Proposta Enviada`
5. `Proposta Aceita`
6. `Proposta Perdida`

#### Campos do Card de Lead

Campos obrigatórios solicitados:

- `Nome`
- `Empresa`
- `Whatsapp`
- `Email`
- `Endereço`
- `Observações`
- `Responsável pelo atendimento` (lista pull-down a partir de `app_users`)
- `Data de abertura do card` (automática)
- `Data de fechamento`

Campos adicionais recomendados para um CRM mais robusto:

- `Origem do lead` (`indicacao`, `trafego_pago`, `organico`, `prospeccao`, `site`, `evento`, `outro`)
- `Valor estimado`
- `Próximo follow-up`
- `Última interação`
- `Temperatura do lead` (`frio`, `morno`, `quente`)
- `Motivo de perda`
- `Link da proposta`
- `Tags`

#### Regras de Negócio

- `opened_at` é preenchido automaticamente no momento do cadastro.
- `closed_at` é preenchido automaticamente quando o lead entra em `Proposta Aceita` ou `Proposta Perdida`.
- Se o lead for reaberto, `closed_at` deve ser limpo e a reabertura precisa ser auditada.
- Ao mover para `Proposta Perdida`, o sistema deve exigir `motivo de perda`.
- Ao mover para `Proposta Aceita`, o sistema deve permitir vincular o lead a uma `proposal` e depois a uma `acceptance`.
- Todo movimento de card deve gerar histórico de estágio para auditoria e analytics.
- O CRM não deve criar nem mover registros em `project_tasks`.

#### Modelo de Dados Proposto

##### `crm_pipeline_stages`

Tabela estática com a definição e a ordenação do funil.

- `id uuid primary key`
- `key text unique` (`new_lead`, `contacted`, `meeting_scheduled`, `proposal_sent`, `proposal_won`, `proposal_lost`)
- `name text`
- `position integer`
- `is_closed boolean`
- `created_at timestamptz`

##### `crm_leads`

Entidade principal do CRM comercial.

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `company_name text not null`
- `whatsapp text not null`
- `whatsapp_normalized text`
- `email text`
- `email_normalized text`
- `address text`
- `notes text`
- `owner_user_id uuid references app_users(id)`
- `stage_id uuid references crm_pipeline_stages(id)`
- `opened_at timestamptz default now()`
- `closed_at timestamptz null`
- `next_follow_up_at timestamptz null`
- `last_interaction_at timestamptz null`
- `source text null`
- `lead_temperature text null`
- `estimated_value numeric(12,2) null`
- `loss_reason text null`
- `proposal_id bigint null references proposals(id)`
- `acceptance_id bigint null references acceptances(id)`
- `created_by uuid references app_users(id)`
- `updated_by uuid references app_users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `archived_at timestamptz null`

##### `crm_lead_stage_history`

Trilha de auditoria para cada mudança de estágio.

- `id uuid primary key default gen_random_uuid()`
- `lead_id uuid references crm_leads(id) on delete cascade`
- `from_stage_id uuid references crm_pipeline_stages(id)`
- `to_stage_id uuid references crm_pipeline_stages(id)`
- `moved_by uuid references app_users(id)`
- `moved_at timestamptz default now()`
- `note text`

##### `crm_lead_activities`

Timeline de interações e anotações.

- `id uuid primary key default gen_random_uuid()`
- `lead_id uuid references crm_leads(id) on delete cascade`
- `activity_type text` (`note`, `call`, `email`, `whatsapp_in`, `whatsapp_out`, `meeting`, `system`)
- `summary text not null`
- `content text null`
- `metadata jsonb default '{}'::jsonb`
- `created_by uuid references app_users(id)`
- `created_at timestamptz default now()`

##### `crm_followups`

Lembretes comerciais sem misturar com tarefas operacionais.

- `id uuid primary key default gen_random_uuid()`
- `lead_id uuid references crm_leads(id) on delete cascade`
- `owner_user_id uuid references app_users(id)`
- `title text not null`
- `due_at timestamptz not null`
- `completed_at timestamptz null`
- `status text default 'pending'`
- `created_by uuid references app_users(id)`
- `created_at timestamptz default now()`

#### Entregas de Frontend

- Nova página `pages/CRM.tsx` com o board comercial.
- Modal de criação e edição do lead com validação e alerta de duplicidade.
- Painel lateral ou página de detalhe com:
  - dados do lead
  - timeline de atividades
  - lista de follow-ups
  - vínculo com proposta
  - responsável atual
- Filtros por:
  - estágio
  - responsável
  - período
  - origem
  - temperatura
  - busca por nome, empresa, WhatsApp ou email
- Ações rápidas:
  - mover card
  - agendar follow-up
  - registrar contato
  - abrir proposta vinculada

#### Modelo de Acesso

- `gestor`: CRUD completo, relatórios, reabertura de leads fechados, configurações.
- `comercial`: CRUD completo dentro do CRM, exceto configurações globais.
- `leitor`: acesso de leitura caso a diretoria queira visibilidade.
- `operacional`: sem acesso ao CRM por padrão.

#### Boas Práticas Obrigatórias na Fase 1

- Detecção de duplicidade por WhatsApp e email normalizados.
- Auditoria obrigatória para mudança de estágio e mudança de responsável.
- Estados vazios e estados de carregamento em todas as colunas.
- UI otimista apenas quando houver rollback seguro.
- RLS por perfil autenticado de staff.
- Seed fixo dos estágios para manter a ordem estável.
- Atualização automática de `last_interaction_at` ao registrar atividades.
- Exigência de `loss_reason` ao fechar como perdido.

### Fase 2 - Dashboard de Chat WhatsApp com Evolution API

#### Objetivo

Criar um dashboard de chat no estilo WhatsApp Web, conectado à Evolution API, mas acoplado ao CRM e protegido por infraestrutura de backend.

#### Princípio Arquitetural

O frontend não deve falar diretamente com a Evolution API usando a chave mestre.

Toda a comunicação deve passar por Supabase Edge Functions, porque esse já é o padrão de backend do projeto e o local correto para segredos de integração.

#### Componentes de Backend Propostos

##### Edge Functions

- `supabase/functions/evolution-proxy/index.ts`
  - chamadas autenticadas de saída para a Evolution API
  - envio de mensagem
  - consulta de status da conexão
  - busca de QR Code ou pairing code
  - marcação como lida
  - administração opcional da instância

- `supabase/functions/evolution-webhook/index.ts`
  - recebimento dos eventos de webhook
  - validação de segredo ou assinatura
  - persistência do evento bruto
  - normalização de mensagens, contatos e conversas
  - upsert dos registros de chat do CRM

- `supabase/functions/evolution-admin/index.ts`
  - restrita a `gestor`
  - configuração do webhook
  - reconexão da instância
  - sincronização de saúde da integração

##### Secrets no Supabase

- `EVOLUTION_API_BASE_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`
- `EVOLUTION_WEBHOOK_SECRET`
- `SITE_URL`

Opcionais:

- `EVOLUTION_INSTANCE_TOKEN`
- `EVOLUTION_DEFAULT_COUNTRY_CODE`
- `EVOLUTION_ALLOWED_IPS`

#### Fluxo Proposto de Webhook e Integração

1. O gestor configura uma instância na área de integrações do CRM.
2. O sistema armazena os metadados da conexão no banco.
3. O backend configura o webhook da Evolution apontando para:
   - `https://<SUPABASE_PROJECT>.supabase.co/functions/v1/evolution-webhook`
4. Os eventos recebidos são persistidos primeiro em uma tabela bruta para observabilidade.
5. Os eventos são normalizados em conversas e mensagens.
6. As conversas são vinculadas a um lead pelo número de WhatsApp normalizado.
7. Se não existir lead correspondente, o sistema pode manter a conversa apenas na inbox ou sugerir a criação do lead.

#### Modelo de Dados do Chat

##### `crm_chat_connections`

- `id uuid primary key`
- `instance_name text unique`
- `phone_number text`
- `status text`
- `last_seen_at timestamptz`
- `last_qr_payload text null`
- `metadata jsonb`
- `created_at timestamptz`
- `updated_at timestamptz`

##### `crm_chat_conversations`

- `id uuid primary key`
- `lead_id uuid null references crm_leads(id)`
- `connection_id uuid references crm_chat_connections(id)`
- `contact_name text`
- `contact_phone text not null`
- `contact_phone_normalized text not null`
- `last_message_at timestamptz`
- `last_message_preview text`
- `unread_count integer default 0`
- `status text default 'open'`
- `created_at timestamptz`
- `updated_at timestamptz`

##### `crm_chat_messages`

- `id uuid primary key`
- `conversation_id uuid references crm_chat_conversations(id) on delete cascade`
- `external_message_id text unique`
- `direction text` (`inbound`, `outbound`)
- `message_type text`
- `body text`
- `media_url text null`
- `media_mime_type text null`
- `status text`
- `sent_at timestamptz`
- `delivered_at timestamptz null`
- `read_at timestamptz null`
- `raw_payload jsonb`
- `created_at timestamptz default now()`

##### `crm_chat_webhook_events`

- `id uuid primary key`
- `event_name text`
- `instance_name text`
- `external_event_id text null`
- `payload jsonb not null`
- `processed_at timestamptz null`
- `processing_status text default 'pending'`
- `error_message text null`
- `created_at timestamptz default now()`

#### Entregas de UI para o Chat

- Lista de conversas à esquerda.
- Chat ativo ao centro.
- Drawer lateral com dados do lead à direita.
- Indicador de status da conexão.
- Fluxo de QR Code ou pairing para conectar o número de WhatsApp.
- Busca por contato, empresa, telefone e responsável.
- Badge de não lidas e atualização em tempo real.
- Composer de mensagem de texto na v1.
- Suporte a mídia em incremento posterior.

#### Regras de Segurança

- A chave mestre da Evolution deve ficar apenas nos secrets do Supabase.
- O endpoint de webhook deve validar cabeçalho secreto quando suportado pela instalação da Evolution.
- O payload bruto do webhook deve ser persistido antes do processamento para debug e replay.
- A idempotência deve usar os IDs externos de mensagem.
- Apenas `gestor` e `comercial` devem acessar o chat do CRM.
- As Edge Functions devem aplicar estratégia de retry e rate limit.

#### Pontos da Evolution API Confirmados para Este Planejamento

Este planejamento foi alinhado com a documentação pública da Evolution API consultada em 6 de março de 2026:

- O webhook da instância pode ser configurado via `/webhook/instance`.
- Eventos comuns incluem `QRCODE_UPDATED`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `MESSAGES_DELETE`, `SEND_MESSAGE` e `CONNECTION_UPDATE`.
- As requisições usam o header `apikey`.
- A conexão da instância pode ser consultada em `/instance/connect/{instance}`.
- O envio de texto simples pode ser feito em `/message/sendText/{instance}`.

Como o comportamento da Evolution API pode variar por versão e modo de hospedagem, a implementação final deve validar o payload exato contra o servidor realmente em uso antes do go-live.

### Fase 3 - Dashboard de Desempenho do CRM

#### Objetivo

Criar um dashboard de acompanhamento do desempenho dos usuários no CRM com filtros por data e usuário.

#### Filtros Obrigatórios

- Intervalo de datas
- Usuário

#### KPIs Recomendados

- Leads criados
- Leads contatados
- Reuniões agendadas
- Propostas enviadas
- Negócios ganhos
- Negócios perdidos
- Taxa de ganho
- Taxa de perda
- Tempo médio até o primeiro contato
- Tempo médio de ciclo entre abertura e fechamento do lead
- Tempo médio por estágio
- Quantidade de follow-ups vencidos
- Valor estimado em pipeline por responsável
- Valor ganho por período

#### Camada de Backend Sugerida

- Views SQL ou RPCs analíticas:
  - `crm_query_pipeline_summary`
  - `crm_query_stage_conversion`
  - `crm_query_owner_performance`
  - `crm_query_followup_sla`
- Materialized views podem ser consideradas depois, se o volume crescer.

#### Entregas de Frontend

- Nova página `pages/CRMPerformance.tsx`
- Cards de resumo
- Gráfico de conversão do funil
- Gráfico temporal por período
- Ranking por usuário
- Tabela de aging por estágio
- Tabela de follow-ups vencidos

## Ordem Recomendada de Implementação

### Sprint 0 - Fundação

- Criar schema e RLS das tabelas do CRM.
- Criar seed dos estágios do pipeline.
- Adicionar item de menu do CRM na sidebar.
- Definir tipos TypeScript compartilhados.
- Criar migration para normalização de telefone e email.

### Sprint 1 - CRM MVP

- Entregar board, modal do lead, painel de detalhe, movimentação, histórico e follow-ups.
- Adicionar checagem de duplicidade.
- Adicionar vínculo com propostas.
- Adicionar filtros e busca.

### Sprint 2 - Endurecimento do CRM

- Melhorar validações, auditoria, notificações e regras de reabertura.
- Adicionar indicadores de SLA e destaque de follow-ups vencidos.
- Preparar ganchos de importação e exportação, se necessário.

### Sprint 3 - Integração WhatsApp

- Criar Edge Functions.
- Configurar secrets.
- Adicionar tela de configuração da conexão.
- Entregar inbox de chat e vínculo com leads.
- Adicionar ingestão de webhook e persistência idempotente de mensagens.

### Sprint 4 - Dashboard de Performance

- Criar RPCs analíticas.
- Construir a página de dashboard.
- Validar as métricas com a operação comercial.

## Boas Práticas de CRM a Incluir

- Separar pipeline comercial do fluxo de entrega.
- Garantir um responsável principal por lead, com histórico de reatribuição.
- Todo lead deve ter próximo passo definido ou estado fechado explícito.
- Evitar operação baseada apenas em texto livre; usar campos estruturados para origem, motivo e resultado.
- Armazenar todas as interações relevantes na timeline.
- Evidenciar leads parados e follow-ups vencidos.
- Vincular proposta e aceite ao lead para visão completa de funil.
- Basear relatórios em histórico imutável de eventos, não apenas no estágio atual.
- Aplicar RBAC e auditoria desde a primeira versão.

## Riscos e Mitigações

### Risco: Misturar CRM com execução de projeto

Mitigação:

- Manter rotas, tabelas, componentes e permissões separados.
- Não reutilizar `project_tasks` para follow-up comercial.

### Risco: Payloads diferentes entre versões da Evolution API

Mitigação:

- Salvar eventos brutos de webhook.
- Normalizar em uma camada dedicada.
- Validar a integração contra a versão efetivamente implantada antes da produção.

### Risco: Leads duplicados

Mitigação:

- Normalizar telefone e email.
- Adicionar alerta de duplicidade e política de merge.

### Risco: Perda de confiança nos relatórios

Mitigação:

- Registrar histórico de estágio e timestamps de atividade desde o início.
- Não calcular KPI apenas com base em snapshot de estágio atual.

## Resumo de Critérios de Aceite

### Fase 1

- O board do CRM existe de forma independente do kanban de projetos.
- Leads podem ser criados, editados, movidos, filtrados e atribuídos.
- Mudanças de estágio são auditadas.
- Estágios fechados preenchem `closed_at`.
- Ganhos e perdas de proposta ficam mensuráveis.

### Fase 2

- Um número de WhatsApp pode ser conectado via Evolution API.
- O webhook recebe e armazena eventos de entrada.
- Mensagens podem ser enviadas do CRM por endpoints seguros de backend.
- Conversas podem ser vinculadas a leads.

### Fase 3

- O dashboard filtra por data e usuário.
- Os KPIs são calculados a partir dos dados do CRM e do histórico de estágios.
- A liderança consegue enxergar conversão, responsividade e produção por usuário.

## Referências

- [Evolution API Webhooks](https://doc.evolution-api.com/v2/en/configuration/webhooks)
- [Evolution API Instance Connect](https://doc.evolution-api.com/v2/api-reference/instance-controller/instance-connect)
- [Evolution API Send Plain Text](https://doc.evolution-api.com/v2/api-reference/message-controller/send-text)
- [Evolution API Evolution Channel](https://doc.evolution-api.com/v2/en/integrations/evolution-channel)
