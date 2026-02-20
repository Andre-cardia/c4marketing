# 🧠 Plano de Evolução: Agentes Autônomos C4 Marketing

Este documento detalha o planejamento estratégico para a evolução do **Segundo Cérebro** da C4 Marketing de um sistema "Reativo/Roteado" para um sistema de **Agentes Autônomos de Múltiplos Passos (Agentic Loops)**.

---

## 1. Visão Geral do Problema vs. Solução
*   **Estado Atual:** O sistema usa um roteador semântico que decide, em um único passo, quais ferramentas (RPCs/RAG) chamar. Ele é "um disparo, uma resposta".
*   **Estado Desejado:** Um sistema onde o Agente recebe um objetivo (ex: "Analise por que a margem deste cliente caiu") e realiza uma sequência de reflexões e consultas (Loop ReAct: *Reason + Act*) até chegar a uma conclusão fundamentada.

---

## 2. Mudança Arquitetural: O Ciclo de Raciocínio (Agentic Loop)
Propomos a transição do fluxo linear para um ciclo recursivo dentro da Edge Function \chat-brain\:

1.  **Entrada:** Pergunta do usuário + Objetivo.
2.  **Planejamento:** O Agente de Orquestração gera um plano de ação inicial (lista de passos).
3.  **Execução (O Loop):**
    *   **Pensamento:** "O que eu sei até agora e o que falta?"
    *   **Ação:** Executa uma Skill (SQL, RAG ou consulta a outro Especialista).
    *   **Observação:** Analisa o resultado da execução.
    *   **Reflexão:** Decide se o objetivo foi atingido ou se precisa de uma nova ação.
4.  **Saída Final:** Resposta consolidada com o "rastro de pensamento".

---

## 3. Componentes a serem Criados/Modificados

### A. Novo \Agent_Orchestrator\
Um novo agente mestre responsável por coordenar os especialistas definidos em \specialists.ts\.
*   **Função:** Atuar como o "Cérebro" que delega tarefas aos agentes de Contratos, Propostas ou Projetos.
*   **Habilidade:** Manter o estado do plano de execução global.

### B. Sistema de "Mensageria entre Agentes"
Permitir que um agente "chame" outro.
*   **Exemplo:** O \Agent_Client360\ percebe que há um problema contratual e envia uma mensagem para o \Agent_Contracts\ pedindo uma análise de cláusula de rescisão, recebendo o resultado de volta para compor sua análise final.

### C. Persistência de "Passos de Raciocínio"
Salvar os pensamentos intermediários (o "Internal Monologue") na tabela \rain.documents\ com o tipo \gent_reasoning\.
*   **Benefício:** Auditoria e transparência. O usuário poderá ver *como* o agente chegou àquela conclusão.

---

## 4. Novas Ferramentas (Skills) para Autonomia
Para que os agentes sejam autônomos, eles precisam de novas capacidades:
1.  **\search_across_specialists\**: Capacidade de consultar o \systemPrompt\ e o conhecimento de outros agentes.
2.  **\evaluate_progress\**: Uma função para o agente auto-avaliar se a resposta atual satisfaz o pedido do usuário.
3.  **\web_lookup\ (Opcional)**: Se permitido, consultar fontes externas de mercado para comparar com dados internos.

---

## 5. Fases de Implementação (Proposta)

### Fase 1: O Loop de Raciocínio (Curto Prazo)
*   Modificar o \chat-brain\ para permitir até 3 iterações de "Pensamento-Ação-Observação" antes de responder.
*   Implementar o "Internal Monologue" (o agente descreve o que vai fazer antes de fazer).

### Fase 2: Especialistas como Ferramentas (Médio Prazo)
*   Transformar os agentes de \specialists.ts\ em ferramentas que o Roteador pode "contratar" dinamicamente.

### Fase 3: Agentes de Longa Duração (Longo Prazo)
*   Implementar agentes que rodam via **Cron Job** (Supabase Edge Cron).
*   Exemplo: Um "Agente Sentinela" que analisa diariamente novos contratos e avisa o time de vendas se uma cláusula de renovação automática está chegando.

---

## 6. Guardrails (Segurança e Custo)
*   **Limite de Iterações:** Máximo de 5 passos para evitar loops infinitos e consumo excessivo de tokens.
*   **Custo Máximo por Pergunta:** Trava de segurança financeira por interação.
*   **Human-in-the-loop:** Para ações críticas (como disparar um e-mail para um cliente), o agente deve "pedir permissão" no chat antes de prosseguir.

---
**Data de Criação:** 19 de Fevereiro de 2026
**Autor:** Gemini CLI
