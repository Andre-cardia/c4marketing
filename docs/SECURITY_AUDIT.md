# Backend Security Audit - C4 Marketing

Este documento detalha as vulnerabilidades de segurança encontradas no backend do projeto e as recomendações para mitigação.

## Sumário Executivo

O projeto utiliza Supabase como BaaS, o que torna a configuração de **Row Level Security (RLS)** o componente mais crítico de segurança. A auditoria revelou diversas políticas "permissivas demais" que permitem o acesso e modificação não autorizada de dados.

## Vulnerabilidades Críticas

### 1. Insegurança nas Tabelas de Projetos (`traffic`, `landing_page`, `website`)

**Arquivo:** `20260205_fix_survey_rls_public.sql`

- **Problema**: As tabelas possuem políticas `FOR ALL TO anon USING (true)`.
- **Risco**: Qualquer usuário não autenticado pode ler, modificar ou **DELETAR** todos os projetos do sistema.
- **Recomendação**: Restringir o acesso público apenas a operações de `UPDATE` (para preenchimento de formulários externos) e validar o acesso via um identificador único (ID) no `USING`. Negar `SELECT` ou `DELETE` público.

### 2. Vazamento de Dados na Tabela `proposals`

**Arquivo:** `20260202_enable_public_read_proposals.sql`

- **Problema**: `TO public USING (true)` permite que qualquer pessoa liste todas as propostas comerciais.
- **Risco**: Exposição de orçamentos, estratégias e dados de clientes de toda a empresa através da API.
- **Recomendação**: Permitir o acesso público apenas para uma proposta específica se o usuário souber o `slug` correto: `USING (slug = current_setting('request.jwt.claims', true)::json->>'slug')` ou abordagem similar de verificação de parâmetro.

### 3. Falta de Isolamento em `project_tasks`

**Arquivo:** `20260205214500_create_project_tasks.sql`

- **Problema**: `FOR ALL USING (true)` para usuários autenticados.
- **Risco**: Um cliente logado pode ver e modificar tarefas de projetos de outros clientes.
- **Recomendação**: Vincular as tarefas ao `auth.uid()` do usuário ou ao projeto ao qual ele tem acesso.

### 4. Gestão de Avatares Insegura

**Arquivo:** `20260205_update_app_users_profile.sql`

- **Problema**: Políticas de Storage permitem que qualquer pessoa faça upload ou sobrescreva arquivos no bucket `avatars`.
- **Risco**: Sobrescrita de fotos de outros usuários e consumo excessivo de armazenamento por ataques de negação de serviço (DoS).
- **Recomendação**: Restringir `INSERT` e `UPDATE` para que o caminho do arquivo no bucket coincida com o `auth.uid()` do usuário logado.

### 5. RLS Desativado em Tabelas Públicas (`acceptances`, `contract_templates`)

**Relatório de Erros Supabase:** `policy_exists_rls_disabled`, `rls_disabled_in_public`

- **Problema**: As tabelas `acceptances` e `contract_templates` existem no esquema `public`, mas o RLS não estava habilitado na tabela, embora existissem políticas (no caso de `acceptances`).
- **Risco**: As políticas de segurança são ignoradas se o RLS não estiver habilitado na tabela, permitindo acesso irrestrito.
- **Recomendação**: Executar `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` para ambas as tabelas.

## Próximos Passos de Remediação

1. **Corrigir RLS de Projetos**: Criar uma nova migration que revogue as políticas atuais e implemente verificações baseadas em ID. (Concluído em `20260214_security_hardening.sql`)
2. **Privacidade de Propostas**: Ajustar a política de leitura para que não seja possível listar (listar todas requer autorização de admin). (Concluído em `20260214_security_hardening.sql`)
3. **Segurança de Storage**: Implementar validação de proprietário nos caminhos dos arquivos. (Concluído em `20260214_security_hardening.sql`)
4. **Habilitar RLS em Tabelas Críticas**: Executar migration para ativar RLS em `acceptances` e `contract_templates`. (Concluído em `20260214_enable_rls_critical.sql`)
