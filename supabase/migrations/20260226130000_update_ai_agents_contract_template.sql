-- Update ai_agents contract template with richer content based on official proposal document.

UPDATE public.contract_templates
SET
  title   = 'Implementação e Operação de Agentes de Inteligência Artificial',
  content = $$
### 1. OBJETO DO SERVIÇO
1.1. O presente contrato tem como objeto a implementação de Agentes de Inteligência Artificial para atendimento, qualificação de leads e automação de processos operacionais e/ou comerciais da CONTRATANTE, utilizando tecnologias de Processamento de Linguagem Natural (NLP) e integração com sistemas e canais digitais (WhatsApp, Web e CRM).

### 2. ROADMAP E FASES DE ENTREGA
2.1. O projeto será executado nas seguintes fases:

   a) FASE 1 – Planejamento (até 2 semanas): reuniões de alinhamento inicial, coleta de informações, mapeamento dos fluxos de atendimento, definição dos critérios de qualificação, seleção de tecnologias e integrações necessárias;

   b) FASE 2 – Desenvolvimento (até 3 semanas): elaboração do Product Requirement Document (PRD), construção do modelo de NLP para interpretação e geração de respostas, desenvolvimento da interface de interação (WhatsApp e/ou Web) e integração com CRM ou planilha de acompanhamento;

   c) FASE 3 – Testes e Validação (até 1 semana): realização de testes de funcionalidade e desempenho, ajustes no modelo com base nos resultados e validação das automações;

   d) FASE 4 – Implantação (até 2 semanas): implementação em ambiente de produção, configuração de métricas de desempenho e handoff técnico à equipe da CONTRATANTE.

### 3. INFRAESTRUTURA E MANUTENÇÃO RECORRENTE
3.1. A mensalidade inclui os seguintes serviços de manutenção, gerenciamento e infraestrutura:
   a) VPS (Servidor Virtual Privado) – hospedagem dedicada da infraestrutura do agente;
   b) API OpenAI – uso incluído de até 2.000.000 (dois milhões) de tokens/mês;
   c) API WhatsApp – integração com o número de WhatsApp oficial da CONTRATANTE;
   d) Monitoramento e suporte técnico contínuo;
   e) Atualizações do modelo de IA para atender novas demandas de negócio;
   f) Relatórios periódicos de performance dos agentes.

3.2. Caso o volume de tokens processados ultrapasse o limite mensal incluído (2.000.000 tokens/mês), poderá ser necessário ajuste no valor da mensalidade, proporcional à demanda adicional, mediante comunicação prévia à CONTRATANTE.

### 4. RESPONSABILIDADES DA CONTRATADA
4.1. Realizar a implantação técnica inicial conforme escopo aprovado e roadmap definido.
4.2. Manter a infraestrutura do agente disponível e funcional durante a vigência do contrato.
4.3. Conduzir ajustes e otimizações recorrentes para melhoria contínua de performance.
4.4. Fornecer relatórios periódicos sobre evolução, volume de atendimentos e resultados dos agentes.

### 5. RESPONSABILIDADES DA CONTRATANTE
5.1. Disponibilizar, em até 5 (cinco) dias úteis após a solicitação, todas as informações de negócio, fluxos internos, acessos e materiais necessários para configuração do agente.
5.2. Validar os fluxos, scripts e aprovações estratégicas dentro dos prazos acordados, sob pena de impacto no cronograma de entrega.
5.3. Responsabilizar-se pelo uso final das respostas geradas pelo agente e pelas decisões operacionais apoiadas por ele.
5.4. Garantir que o conteúdo utilizado para treinamento e operação do agente respeite a legislação vigente, incluindo a LGPD (Lei nº 13.709/2018).
$$
WHERE service_id = 'ai_agents';
