# Matriz de Go-Live — Memória Cognitiva Corporativa Viva (v9.2)

**Projeto:** Segundo Cérebro C4 Marketing  
**Data:** 3 de março de 2026  
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
| 6 | RPC determinística de fatos recentes | `get_recent_explicit_user_facts` aplicada no ambiente-alvo | Pronto | Migration aplicada + canário pós-migration verde | Baixo | Manter validação de recall determinístico no canário |
| 7 | Higiene de migrations remotas | Sem backlog/mismatch entre local e remoto | Pronto | Saneamento executado e `supabase db push --linked --include-all --yes` concluído | Baixo | Rodar `db push --dry-run` antes de cada janela de mudança |
| 8 | Gestão segura de cron por ambiente | Sem URL/chave hardcoded, com rotação segura | Pronto | `schedule_brain_sync_job` aplicado e job `invoke-brain-sync-every-5min` ativo | Baixo | Revisar schedule/chaves em rotina mensal |
| 9 | Memória de longo prazo (dias/semanas) | Testes automatizados para continuidade entre sessões longas | Em risco | Suíte T+1/T+7/T+30 criada + CI diária; streak automático iniciado em `1/14` | Médio | Acumular janela real e fechar 14 dias estáveis |
|10 | Teste de carga e concorrência | Recall consistente com múltiplas sessões simultâneas | Em risco | Teste 20/50/100 executado; 20 PASS, 50/100 com degradação e 503 | Médio | Tratar capacidade para elevar teto operacional acima de 20 sessões |
|11 | SLO/Alertas específicos de memória | Alertar queda de hit-rate/consistência de recall | Em risco | RPC/painel de SLO implantados + rota de escalacao; relatório mensal marcou `ALERT` | Médio | Recuperar hit-rate para >=95% e zerar falhas críticas sustentadas |
|12 | Runbook operacional de incidentes | Procedimento claro para falhas de memória, migração e rollback | Pronto | `docs/runbook_memory_incidents.md` + simulação registrada | Baixo | Repetir simulação trimestral |

## 3. Veredito executivo

**Estado atual:** `Aprovado condicional (produção controlada)`  

Interpretação:

- Já é correto afirmar que existe um **Segundo Cérebro funcional com memória cognitiva viva no fluxo principal**.
- Os itens estruturais de base (`6`, `7`, `8`) foram concluídos e regularizados em ambiente-alvo.
- Ainda **não** é correto afirmar que o conceito está **totalmente maduro** para todos os cenários corporativos, porque a estabilidade de longo prazo e as metas de SLO/capacidade ainda exigem fechamento operacional.

## 4. Plano de fechamento para "memória viva total"

Status de execução:

1. `P0` concluído.
2. `P1` implementado com pendência de estabilidade temporal (14 dias).
3. `P2` concluído com monitoramento contínuo já operacional.

Próximo ciclo (foco operacional):

1. Fechar o critério de 14 dias consecutivos de canário + suíte T+1/T+7/T+30 sem falha.
2. Recuperar `recall_hit_rate` para a meta (`>=95%`) e reduzir custo por interação para o limite definido.
3. Endurecer capacidade para além do patamar atual de 20 sessões simultâneas sem degradação.

## 5. Critério final para declarar "totalmente maduro"

Declarar "memória cognitiva corporativa viva totalmente madura" somente quando:

1. Itens `6`, `7` e `8` estiverem em `Pronto`.
2. Itens `9`, `10`, `11` e `12` estiverem ao menos em `Em risco baixo` com evidência operacional.
3. Canário + suíte de longo prazo passarem de forma estável por pelo menos 14 dias consecutivos.
