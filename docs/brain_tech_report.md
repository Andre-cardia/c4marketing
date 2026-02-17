# Relatório Técnico Expandido: O "Segundo Cérebro" da C4 Marketing

Este documento fornece uma análise técnica profunda e minuciosa sobre a arquitetura, desenvolvimento e operação do sistema de Inteligência Artificial Generativa ("Segundo Cérebro") implementado na plataforma da C4 Marketing.

---

## 1. Visão Geral e Filosofia

O "Segundo Cérebro" foi projetado para ser mais do que um chatbot; é um **Sistema de Recuperação de Informação Corporativa (RAG)**. Ele não apenas responde com linguagem natural, mas fundamenta suas respostas em dados de produção em tempo real (contratos, propostas, projetos), garantindo precisão e reduzindo alucinações.

---

## 2. Arquitetura de Dados e Armazenamento Híbrido

Uma das inovações centrais deste projeto é a utilização de uma arquitetura de armazenamento híbrida para o histórico de conversas. Percebemos que tratar "memória visual" (UI) e "memória cognitiva" (IA) como a mesma coisa gerava problemas. Por isso, separamos:

### 2.1 Memória Visual (Relacional)

Para a interface do usuário (barra lateral, balões de chat), usamos tabelas relacionais clássicas.

* **Tabelas**: `brain.chat_sessions` e `brain.chat_messages`.
* **Objetivo**: Performance de UI. Carregar o histórico do chat rapidamente, ordenado por data via ID da sessão.
* **Lógica**: Quando você abre o chat, o frontend lê daqui. A IA *não* lê daqui para gerar respostas.

### 2.2 Memória Cognitiva (Vetorial)

Para que a IA possa *lembrar* do que foi dito, duplicamos cada interação (pergunta do usuário + resposta da IA) no banco de dados vetorial.

* **Tabela**: `brain.documents`.
* **Metadados**: `type: 'chat_log'`, `session_id`, `role` ('user' ou 'assistant').
* **Processo de Ingestão**:
    1. O usuário envia uma mensagem.
    2. O sistema salva na tabela relacional (para a UI).
    3. O sistema *também* gera um embedding (vetor) dessa mensagem e salva em `brain.documents` (para a Memória).

---

## 3. O Desafio do "Efeito Eco" e a Solução de Recuperação

Durante o desenvolvimento, enfrentamos um problema crítico de **auto-referência recursiva** (o "Efeito Eco").

### O Problema

Ao perguntar *"Qual a validade do contrato Amplexo?"*, o sistema buscava no banco vetorial.

1. Ele encontrava o contrato oficial (Similaridade: 85%).
2. Mas ele também encontrava **pela própria pergunta anterior** do usuário, feita 10 minutos antes, que tinha o texto *idêntico* (Similaridade: 100%).
3. Resultado: A IA lia sua própria pergunta antiga (ou uma resposta antiga de "não sei") e a usava como fonte de verdade, ignorando o contrato real.

### A Solução Atual (Filtro de Alucinação)

Implementamos uma barreira lógica na função de recuperação (`match_brain_documents`).

* **A Regra**: "Ao buscar respostas para uma pergunta factual, IGNORE documentos que sejam apenas logs de chat".
* **Implementação SQL**:

    ```sql
    WHERE (metadata->>'type' IS NULL OR metadata->>'type' != 'chat_log')
    ```

* **Efeito**: Isso força a IA a olhar "através" da conversa e focar nos **Documentos Oficiais** (Contratos, Propostas, Usuários). Hoje, a memória de curto prazo (chat logs) é gravada, mas silenciada na recuperação para garantir precisão factual.

### Estratégia Futura: Memória Inteligente

O armazenamento dos logs (que mantivemos ativo) é a base para o próximo nível de inteligência:

* **Recuperação Temporal**: Em vez de buscar por similaridade pura, buscaremos "O que o usuário falou *nesta* sessão nos últimos 10 minutos?".
* **Resumos Periódicos**: Uma rotina noturna que lê os logs do dia, gera um resumo ("O André estava preocupado com a data da Amplexo") e salva esse *resumo* como um fato novo. Assim, a IA aprende com a experiência sem confundir conversa com contrato.

---

## 4. Pipeline de Ingestão de Dados (ETL)

A inteligência do sistema depende da qualidade dos dados que ele consome. Criamos uma rotina de sincronização (`BrainManager.tsx`) que transforma SQL em Conhecimento.

### 4.1 Formatação Semântica

Transformamos registros frios de banco de dados em **Documentos Ricos em Contexto**.

* *De*: `{id: 8, client: 'Amplexo', date: '2026-02-03'}`
* *Para*:

    ```markdown
    === TÍTULO: Contrato Amplexo Diesel ===
    === FONTE: Tabela acceptances ===
    [DETALHES]
    Cliente: Amplexo Diesel
    Data de Início: 03/02/2026
    Status: Ativo
    ```

    Isso "ensina" ao modelo de embedding o significado do dado, aumentando drasticamente a precisão da busca.

### 4.2 Upsert e Anti-Duplicidade

Para evitar poluição:

1. Antes de inserir, verificamos se já existe um documento com o mesmo `source_id` (ID do contrato).
2. Se existir, ele é **removido**.
3. O novo é inserido.
Isso garante que o Cérebro nunca tenha informações contraditórias (ex: um contrato antigo e um novo ao mesmo tempo).

---

## 5. Especificações Técnicas

* **Modelo de Geração**: GPT-4o (OpenAI).
* **Modelo de Embedding**: `text-embedding-3-small` (1536 dimensões).
* **Banco de Dados**: PostgreSQL com `pgvector`.
* **Índice Vetorial**: HNSW (Hierarchical Navigable Small World) com distância de cosseno.
* **Infraestrutura**: Supabase Edge Functions (Deno).

## 6. Segurança

* **Nível de Aplicação**: Acesso à gestão do cérebro restrito a usuários com role `gestor`.
* **Nível de Banco de Dados**: Políticas RLS (Row Level Security) impedem leitura direta das tabelas por usuários não autorizados.
* **Auditoria**: Todo acesso e interação gera log na tabela `access_logs`, com throttling de 15 minutos para evitar ruído.

---

## Conclusão

O sistema entrega uma base sólida para IA Corporativa. A arquitetura de separação entre **Memória Visual** e **Memória Cognitiva**, aliada aos filtros anti-alucinação, permite que a C4 Marketing tenha um assistente que conhece profundamente seus dados, mas que não se confunde com suas próprias palavras.
