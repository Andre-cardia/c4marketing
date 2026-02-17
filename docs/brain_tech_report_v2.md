# Relatório Técnico v2: Arquitetura Agentic RAG e Automação ETL

**Sistema "Segundo Cérebro" da C4 Marketing**

Este documento detalha a arquitetura final implementada, marcando a evolução de um chat simples para um **Sistema Agentic RAG (Retrieval-Augmented Generation)** autônomo, seguro e especializado.

---

## 1. Visão Geral da Arquitetura

O sistema agora opera em três camadas distintas:

1. **Camada de Roteamento (Córtex Frontal)**: Decide *quem* deve responder e *quais* dados são necessários, antes mesmo de chamar uma IA cara.
2. **Camada de Especialistas (Lóbulos)**: Agentes dedicados com prompts e ferramentas específicas para cada domínio (Jurídico, Projetos, Segurança, etc.).
3. **Camada de Dados Autônoma (Hipocampo)**: Um pipeline ETL (Extract, Transform, Load) que mantém a memória do cérebro sincronizada em tempo real com o uso do aplicativo, sem intervenção humana.

---

## 2. O Router Híbrido (`router.ts`)

Para resolver problemas de alucinação e custo, implementamos um roteador em três estágios:

### 2.1 Hard Gates (Regras de Segurança)

Bloqueios baseados em Regex e palavras-chave críticas que ignoram qualquer outra decisão.

* **Contratos/Jurídico**: Se detectar "cláusula", "vigência", "multa", força o uso do `Agent_Contracts` e aplica o filtro `artifact_kind='contract'`. Isso impede que o sistema use conversas informais como base para respostas legais.
* **Segurança/RLS**: Se detectar "burlar", "sql injection", "senha", força o `Agent_GovernanceSecurity` que responde com negativas padrão.

### 2.2 Heurística (Alta Velocidade)

Para perguntas operacionais comuns.

* **Status de Projeto**: "Qual o status do site X?" -> Roteia direto para `Agent_Projects`.
* **Brain Ops**: "Sincronizar memória" -> Roteia direto para `Agent_BrainOps`.
* **Custo**: Zero (não chama LLM). Latência: <10ms.

### 2.3 LLM Fallback (GPT-4o)

Apenas se nenhuma regra acima for satisfeita, um modelo leve classifica a intenção do usuário para escolher o melhor agente.

---

## 3. Agentes Especialistas (`specialists.ts`)

Cada agente possui:

1. **System Prompt Único**: Instruções de personalidade e formato.
2. **Permissões de Ferramentas**: Quais funções ele pode chamar (ex: `rag_search`, `db_read`).
3. **Políticas de Recuperação (`RetrievalPolicy`)**:
    * `STRICT_DOCS_ONLY`: Só vê documentos oficiais (Contratos).
    * `DOCS_PLUS_RECENT_CHAT`: Vê documentos + chat recente (Projetos).
    * `OPS_ONLY`: Vê apenas logs de sistema (Ops).

Isso resolveu o "Efeito Eco", onde a IA se confundia com suas próprias respostas anteriores.

---

## 4. Pipeline de Automação ETL (Sincronização)

A maior inovação da v2 é a **autonomia de dados**. O sistema não depende mais de scripts manuais.

### 4.1 Arquitetura "Outbox" com Triggers

Sempre que uma tabela de negócio é alterada, o Cérebro é notificado automaticamente.

1. **Trigger (`brain.handle_project_change`)**: Escuta `INSERT/UPDATE` nas tabelas `website_projects`, `landing_page_projects`, `traffic_campaigns`.
2. **Fila de Sincronização (`brain.sync_queue`)**: A trigger insere um pedido de atualização nesta tabela.
    * *Exemplo*: `source_table: 'website_projects', source_id: 'uuid-123', status: 'pending'`.

### 4.2 Worker (`brain-sync`)

Uma Edge Function dedicada que processa a fila.

1. Lê itens `pending` da fila.
2. Busca os dados completos da origem (fazendo JOINs necessários).
3. **Formatação Rica**: Transforma o JSON técnico em um texto legível para a IA (ex: "Status: Em Aprovação, Etapa Atual: Design").
4. **Embedding**: Gera o vetor do texto atualizado.
5. **Upsert**: Atualiza a tabela `brain.documents`, substituindo a versão antiga.

### 4.3 Agendamento (Cron Job)

Configuramos o `pg_cron` no banco de dados para invocar a função `brain-sync` a cada **5 minutos**.

---

## 5. Especificações de Dados (`brain.documents`)

O esquema de metadados foi padronizado para suportar filtros facetados:

```json
{
  "type": "official_doc",        // official_doc | chat_log | system_note
  "artifact_kind": "project",    // contract | project | proposal | client
  "source_table": "website_projects",
  "source_id": "uuid...",
  "status": "active",
  "title": "Projeto Site Beiramar",
  "tenant_id": "..."
}
```

---

## 6. Conclusão

A versão 2 do "Segundo Cérebro" transforma a ferramenta de um "Chatbot com Memória" para um **Agente de Gestão de Conhecimento**.

* **Segurança**: Garantida por Hard Gates e RLS.
* **Precisão**: Garantida por Agentes que só veem o que precisam.
* **Atualidade**: Garantida pelo ETL automático em tempo real.

O sistema agora está pronto para escalar com novos módulos (Mídia, CRM, Financeiro) bastando apenas adicionar novos Triggers para alimentar o mesmo Cérebro.
