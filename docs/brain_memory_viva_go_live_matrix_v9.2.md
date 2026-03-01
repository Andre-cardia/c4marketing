# Matriz de Go-Live — Memória Cognitiva Corporativa Viva (v9.2)

**Projeto:** Segundo Cérebro C4 Marketing  
**Data:** 1 de março de 2026  
**Escopo:** avaliar se o conceito de "memória cognitiva corporativa viva" está pronto para operação plena.

## 1. Critério de decisão

Classificação:

- `Pronto`: implementado, validado e com evidência técnica.
- `Em risco`: implementado parcialmente ou dependente de regularização operacional.
- `Faltando`: ainda não implementado como capacidade formal.

## 2. Matriz objetiva

| # | Capacidade | Critério de aceite | Status | Evidência técnica | Risco residual | Ação de fechamento |
|---|------------|--------------------|--------|-------------------|----------------|--------------------|
| 1 | Controle de acesso por perfil | Segundo Cérebro acessível apenas por `gestor` | Pronto | Guardrail backend + bloqueio UI | Baixo | Manter teste de regressão de role em CI |
| 2 | Persistência de memória explícita | Salvar fato explícito com metadados estruturados (`tenant/session/source`) | Pronto | Fluxo `memory_saved=true` e metadados | Baixo | Adicionar auditoria semanal de amostras |
| 3 | Recuperação imediata de memória | Pergunta "o que acabei de pedir para salvar?" deve retornar fato correto | Pronto | Canário final 5/5 com teste de recall imediato | Baixo | Manter canário diário |
| 4 | Rastreabilidade de origem do recall | Resposta deve informar `scope/source/candidates` | Pronto | Metas `memory_recall_*` e `memory_write_events` | Baixo | Padronizar painel de observabilidade |
| 5 | Robustez de consultas compostas | Perguntas multi-domínio devem executar RPCs necessárias | Pronto | Normalização e reforço de cobertura multi-RPC | Médio | Incluir suíte de perguntas compostas no canário |
| 6 | RPC determinística de fatos recentes | `get_recent_explicit_user_facts` aplicada no ambiente-alvo | Em risco | Migration criada, aplicação ainda depende de saneamento | Médio | Regularizar histórico de migrations e aplicar |
| 7 | Higiene de migrations remotas | Sem backlog/mismatch entre local e remoto | Em risco | Detectado uso de `--include-all` para lote pendente | Alto | Executar plano de saneamento em janela controlada |
| 8 | Gestão segura de cron por ambiente | Sem URL/chave hardcoded, com rotação segura | Em risco | Migration de cron management criada | Médio | Aplicar migration e validar schedule em produção |
| 9 | Memória de longo prazo (dias/semanas) | Testes automatizados para continuidade entre sessões longas | Faltando | Hoje foco em canário curto (imediato) | Alto | Criar suíte T+1/T+7/T+30 com asserts |
|10 | Teste de carga e concorrência | Recall consistente com múltiplas sessões simultâneas | Faltando | Não há teste formal de estresse de memória | Médio | Rodar carga com 20/50/100 sessões simultâneas |
|11 | SLO/Alertas específicos de memória | Alertar queda de hit-rate/consistência de recall | Faltando | Sem SLO dedicado de memória cognitiva | Médio | Definir SLO e alertas (ex.: hit-rate < 95%) |
|12 | Runbook operacional de incidentes | Procedimento claro para falhas de memória, migração e rollback | Faltando | Conhecimento ainda concentrado no time técnico | Médio | Publicar runbook e treinar time de operação |

## 3. Veredito executivo

**Estado atual:** `Aprovado condicional (produção controlada)`  

Interpretação:

- Já é correto afirmar que existe um **Segundo Cérebro funcional com memória cognitiva viva no fluxo principal**.
- Ainda **não** é correto afirmar que o conceito está **totalmente maduro** para todos os cenários corporativos (principalmente longo prazo e operação com backlog de migration).

## 4. Plano de fechamento para "memória viva total"

Prioridade P0 (imediato):

1. Saneamento de migrations (resolver mismatch remoto/local).
2. Aplicar migrations do RPC determinístico e cron parametrizado em ambiente-alvo.
3. Revalidar canário completo após aplicação.

Prioridade P1 (curto prazo):

1. Criar suíte de regressão de memória T+1/T+7/T+30.
2. Implementar SLO e alertas de consistência de recall.
3. Publicar runbook de incidente de memória.

Prioridade P2 (maturidade):

1. Testes de carga/concorrência.
2. Auditoria de qualidade de memória por amostragem.
3. Governança contínua de custo x qualidade da recuperação.

## 5. Critério final para declarar "totalmente maduro"

Declarar "memória cognitiva corporativa viva totalmente madura" somente quando:

1. Itens `6`, `7` e `8` estiverem em `Pronto`.
2. Itens `9`, `10`, `11` e `12` estiverem ao menos em `Em risco baixo` com evidência operacional.
3. Canário + suíte de longo prazo passarem de forma estável por pelo menos 14 dias consecutivos.
