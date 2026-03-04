# Simulacao de Incidente de Memoria - 2026-03-02

ID: `SIM-MEM-2026-03-02-01`  
Projeto: `xffdrdoaysxfkpebhywl`  
Runbook base: `docs/runbook_memory_incidents.md`

## 1. Objetivo

Validar que o runbook de memoria pode ser executado de ponta a ponta:

- triagem;
- diagnostico;
- mitigacao;
- validacao de recuperacao;
- comunicacao.

## 2. Cenario exercitado

Cenario: indisponibilidade parcial por erro de integracao OpenAI (`401 Incorrect API key provided`) com fallback no `chat-brain`.

## 3. Participantes

- Andre Cardia (owner / operacao manual)
- Codex (execucao tecnica assistida)

## 4. Execucao da simulacao

Janela da simulacao: 2026-03-02, 18:00-18:07 BRT.

### 4.1 Triagem

- Sintoma validado: fallback com erro de integracao OpenAI na resposta do `chat-brain`.
- Classificacao aplicada: `SEV2` (degradacao parcial com resposta fallback).

### 4.2 Diagnostico

- `OPENAI_API_KEY` existia no Supabase, mas a chave anterior estava invalida.
- Evidencia da fase de diagnostico:
  - resposta bruta continha `meta.error` com `401 Incorrect API key provided`.

### 4.3 Mitigacao

- Rotacao do secret `OPENAI_API_KEY` no projeto `xffdrdoaysxfkpebhywl`.
- Confirmacao de update em secret list:
  - `OPENAI_API_KEY.updated_at = 2026-03-02T18:52:05.670Z`.

### 4.4 Validacao de recuperacao

1) Smoke funcional `chat-brain`:

- `http=200`
- `fallback_error=0`
- `has_log_id=1`

2) Canary completo:

- `Resultado: 5/5 testes passaram`
- `Falhas criticas: 0`
- `Session ID: baf321fa-6c1d-4732-a54c-8065047dd0d9`

3) SLO de memoria:

- `Recall hit-rate: 100.00% (target >= 95%)`
- `Canary critical failures: 0 (max=0)`
- `Overall: ok`
- `Last canary: 2026-03-02T21:06:53.734591+00:00`

### 4.5 Comunicacao

Mensagem operacional utilizada (formato runbook):

```text
[ENCERRADO][INCIDENTE MEMORIA]
Inicio: 2026-03-02 18:00 BRT
Fim: 2026-03-02 18:07 BRT
Causa raiz: OPENAI_API_KEY invalida no provider
Correcao aplicada: rotacao do secret OPENAI_API_KEY no Supabase
Validacao: canario=PASS (5/5), slo=OK
Acoes preventivas: manter rotina de simulacao mensal e rotacao controlada de secrets
```

## 5. Resultado

Status da simulacao: `APROVADA`.

Conclusao:

- runbook executavel de ponta a ponta;
- evidencia tecnica registrada;
- criterio do P1.3 ("runbook usado em simulacao") atendido.

## 6. Observacoes

- Foi identificado aviso nao bloqueante no cleanup do canario:
  - `[WARN] Canary marker cleanup failed: Invalid schema: brain`
- O aviso nao afetou disponibilidade nem consistencia da validacao do incidente.
