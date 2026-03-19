/**
 * Evaluator Agent — LLM-as-a-judge com Self-Reflection Loop
 *
 * Responsabilidade:
 *   1. Avaliar a qualidade da resposta produzida pelo Controller (runEvaluator)
 *   2. Sugerir melhoria se score < 0.70 (refineAnswer — máx 1 chamada, sem loop)
 *
 * Modelo: gpt-5.4-mini-2026-03-17 (temperature: 0)
 */

import { OpenAI } from 'https://esm.sh/openai@4'
import type { EvaluationInput, EvaluationResult, Observation } from '../brain-types.ts'

const EVALUATOR_MODEL = 'gpt-5.4-mini-2026-03-17'
const PASS_THRESHOLD = 0.70

// Preços gpt-5.4-mini (USD por token)
const MINI_PRICES = { input: 0.00000075, output: 0.0000045 }

const EVALUATOR_SYSTEM_PROMPT = `Você é um avaliador de qualidade de respostas de IA (LLM-as-a-judge).
Sua função é avaliar se a resposta de um agente atende à pergunta do usuário com base nas evidências coletadas.

Critérios de avaliação (peso igual):
1. COMPLETUDE — A resposta endereça TODOS os aspectos da pergunta do usuário?
2. FUNDAMENTAÇÃO — Cada afirmação factual é suportada pelos dados observados (observations)?
3. AUSÊNCIA DE ALUCINAÇÃO — Há afirmações sem base nas evidências? (penaliza severamente)
4. CLAREZA — A resposta é bem estruturada e compreensível?

Retorne APENAS um objeto JSON válido (sem markdown, sem texto extra) no formato:
{
  "score": <número 0.0 a 1.0>,
  "pass": <true se score >= ${PASS_THRESHOLD}, false caso contrário>,
  "issues": ["<descrição do problema 1>", "..."],
  "suggestion": "<como melhorar a resposta — deixe vazio se pass=true>"
}

Regras:
- score = média dos 4 critérios (cada um de 0.0 a 1.0)
- Se houver alucinação clara, score máximo = 0.5
- Se a resposta for "não tenho dados" mas as observations mostram dados, score = 0.3
- Se issues = [], suggestion deve ser ""
- Seja rigoroso mas justo — uma resposta parcialmente correta vale mais que 0.0`

/**
 * Avalia a qualidade da resposta produzida pelo Controller.
 * Retorna EvaluationResult com score, pass, issues e suggestion.
 */
export async function runEvaluator(
    input: EvaluationInput,
    deps: { openai: OpenAI }
): Promise<EvaluationResult> {
    const startedAt = Date.now()

    const observationsSummary = input.observations.length > 0
        ? input.observations.map((obs, i) =>
            `[Iteração ${obs.iteration}] Tool: ${obs.toolName} | Sucesso: ${obs.success}\nDados:\n${obs.output.slice(0, 800)}${obs.output.length > 800 ? '\n...(truncado)' : ''}`
        ).join('\n\n')
        : '(nenhuma observação — resposta gerada sem dados do banco)'

    const userContent = `PERGUNTA DO USUÁRIO:
${input.query}

AGENTE RESPONDENTE: ${input.agentName}

EVIDÊNCIAS COLETADAS (observações das tools executadas):
${observationsSummary}

RESPOSTA DO AGENTE A AVALIAR:
${input.answer}

Avalie a resposta com base nas evidências acima e retorne o JSON de avaliação.`

    let raw = ''
    let promptTokens = 0
    let completionTokens = 0

    try {
        const completion = await deps.openai.chat.completions.create({
            model: EVALUATOR_MODEL,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
                { role: 'user', content: userContent },
            ],
        })

        raw = completion.choices[0]?.message?.content ?? '{}'
        promptTokens = completion.usage?.prompt_tokens ?? 0
        completionTokens = completion.usage?.completion_tokens ?? 0
    } catch (err: any) {
        console.warn('[Evaluator] LLM call failed:', err?.message)
        // Falha silenciosa — retorna pass=true com score baixo para não bloquear
        return {
            score: 0.5,
            pass: true,
            issues: ['Evaluator falhou ao conectar ao LLM — avaliação ignorada'],
            suggestion: '',
            model: EVALUATOR_MODEL,
            latency_ms: Date.now() - startedAt,
            cost_est: 0,
        }
    }

    let parsed: { score?: number; pass?: boolean; issues?: string[]; suggestion?: string } = {}
    try {
        parsed = JSON.parse(raw)
    } catch {
        console.warn('[Evaluator] JSON parse failed, raw:', raw.slice(0, 200))
    }

    const score = typeof parsed.score === 'number'
        ? Math.max(0, Math.min(1, parsed.score))
        : 0.5
    const pass = score >= PASS_THRESHOLD
    const issues = Array.isArray(parsed.issues) ? parsed.issues : []
    const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion : ''
    const costEst = (promptTokens * MINI_PRICES.input) + (completionTokens * MINI_PRICES.output)

    console.log(`[Evaluator] score=${score.toFixed(2)} pass=${pass} issues=${issues.length} model=${EVALUATOR_MODEL}`)

    return {
        score,
        pass,
        issues,
        suggestion,
        model: EVALUATOR_MODEL,
        latency_ms: Date.now() - startedAt,
        cost_est: costEst,
    }
}

/**
 * Refina a resposta quando score < threshold.
 * Chamado no máximo 1 vez (sem loop adicional).
 */
export async function refineAnswer(
    originalAnswer: string,
    query: string,
    evaluation: EvaluationResult,
    observations: Observation[],
    deps: { openai: OpenAI }
): Promise<string> {
    const observationsSummary = observations.map((obs) =>
        `[${obs.toolName}]: ${obs.output.slice(0, 600)}${obs.output.length > 600 ? '...' : ''}`
    ).join('\n\n')

    const issuesList = evaluation.issues.join('\n- ')
    const refinementPrompt = `Você é um assistente da C4 Marketing. Reescreva a resposta abaixo corrigindo os problemas identificados.

PERGUNTA DO USUÁRIO:
${query}

DADOS DISPONÍVEIS (evidências):
${observationsSummary}

RESPOSTA ORIGINAL (com problemas):
${originalAnswer}

PROBLEMAS IDENTIFICADOS:
- ${issuesList}

SUGESTÃO DE MELHORIA:
${evaluation.suggestion}

Reescreva a resposta corrigindo os problemas listados. Use apenas os dados disponíveis. Seja claro, completo e fundamentado.`

    try {
        const completion = await deps.openai.chat.completions.create({
            model: EVALUATOR_MODEL,
            temperature: 0.1,
            messages: [
                { role: 'user', content: refinementPrompt },
            ],
        })

        const refined = completion.choices[0]?.message?.content
        if (refined && refined.trim().length > 0) {
            console.log('[Evaluator] refineAnswer — resposta refinada com sucesso')
            return refined
        }
    } catch (err: any) {
        console.warn('[Evaluator] refineAnswer failed:', err?.message)
    }

    // Se o refinamento falhar, retorna resposta original
    return originalAnswer
}
