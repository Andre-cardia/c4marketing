INSERT INTO public.contract_templates (service_id, title, content)
SELECT
  'ai_agents',
  'Implementação e Operação de Agentes de IA',
  $$
### 1. OBJETO DO SERVIÇO
1.1. O presente contrato tem como objeto a implementação de Agentes de IA para atendimento, qualificação e automações operacionais da CONTRATANTE.

### 2. FASES DE ENTREGA
2.1. O serviço será executado em duas frentes:
   a) Setup Inicial: mapeamento de fluxos, definição de escopo, implantação técnica e configuração dos agentes;
   b) Operação Recorrente: monitoramento, ajustes de desempenho, melhorias contínuas e suporte evolutivo.

### 3. RESPONSABILIDADES DA CONTRATADA
3.1. Realizar a implantação técnica inicial conforme escopo aprovado.
3.2. Conduzir ajustes e otimizações recorrentes para melhoria de performance.
3.3. Fornecer acompanhamento periódico sobre evolução e resultados do agente.

### 4. RESPONSABILIDADES DA CONTRATANTE
4.1. Disponibilizar informações de negócio, fluxos internos e acessos necessários para configuração.
4.2. Validar os fluxos e aprovar ajustes estratégicos dentro dos prazos acordados.
4.3. Responsabilizar-se pelo uso final das respostas e decisões operacionais apoiadas pelos agentes.
$$
WHERE NOT EXISTS (
  SELECT 1
  FROM public.contract_templates
  WHERE service_id = 'ai_agents'
);
