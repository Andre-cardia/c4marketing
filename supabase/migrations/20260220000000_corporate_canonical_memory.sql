-- ============================================================
-- Camada Canônica Corporativa — C4 Marketing
-- Tier 1: Memória compartilhada, imutável, com controle por cargo.
-- tenant fixo: 'c4_corporate_identity'
-- authority_rank 100 = missão/visão/valores/endgame (política máxima)
-- authority_rank 90  = políticas de área (financial, commercial, operational)
-- Acesso por cargo via metadata.role_allowlist (jsonb array).
-- ============================================================

-- 1a. Constante de tenant corporativo global (UUID lógico fixo)
CREATE OR REPLACE FUNCTION public.c4_corporate_tenant_id()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'c4_corporate_identity'::text;
$$;

GRANT EXECUTE ON FUNCTION public.c4_corporate_tenant_id() TO authenticated, service_role;

-- 1b. Index para acelerar lookups no tenant canônico
CREATE INDEX IF NOT EXISTS idx_brain_documents_tenant_id
  ON brain.documents ((metadata->>'tenant_id'));

-- 1c. RPC de retrieval canônico
-- Ignora isolamento por tenant do usuário, filtra por role_allowlist.
-- SECURITY DEFINER: acessa brain.documents sem RLS do usuário.
CREATE OR REPLACE FUNCTION public.get_canonical_corporate_docs(
  query_embedding extensions.vector(1536),
  p_user_role     text    DEFAULT 'gestão',
  p_top_k         int     DEFAULT 10
)
RETURNS TABLE (
  id         uuid,
  content    text,
  metadata   jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, brain, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM brain.documents d
  WHERE
    d.metadata->>'tenant_id' = public.c4_corporate_tenant_id()
    AND coalesce(nullif(lower(d.metadata->>'status'),    ''), 'active') = 'active'
    AND coalesce(nullif(lower(d.metadata->>'is_current'),''), 'true')   = 'true'
    AND coalesce(nullif(lower(d.metadata->>'searchable'),''), 'true')   = 'true'
    AND d.embedding IS NOT NULL
    AND (
      -- gestão enxerga tudo
      lower(p_user_role) = 'gestão'
      -- outros: docs sem role_allowlist (visíveis a todos) OU cargo listado
      OR d.metadata->'role_allowlist' IS NULL
      OR d.metadata->'role_allowlist' @> to_jsonb(lower(p_user_role)::text)
    )
  ORDER BY similarity DESC
  LIMIT p_top_k;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_corporate_docs(
  extensions.vector, text, int
) TO authenticated, service_role;

-- ============================================================
-- 1d. Seed dos documentos canônicos
-- ⚠️  CONTEÚDO PLACEHOLDER — substituir com o conteúdo real da C4
--     antes de executar em produção.
-- Os embeddings ficam NULL até que embed-content seja executado
-- para cada document_key 'corporate_identity:*'.
-- ============================================================

-- 1. MISSÃO (visível a todos os cargos — sem role_allowlist)
SELECT public.publish_brain_document_version(
  p_content := E'[MISSÃO DA C4 MARKETING]\n\nAcelerar o crescimento de empresas brasileiras por meio de estratégias de marketing de performance e soluções de IA, integrando dados, criatividade e tecnologia para gerar tráfego qualificado, engajar, converter e fidelizar clientes. Atuamos de forma consultiva, colocando o cliente no centro e impulsionando resultados mensuráveis e sustentáveis.',
  p_metadata := jsonb_build_object(
    'document_key',  'corporate_identity:mission',
    'title',         'Missão Corporativa — C4 Marketing',
    'type',          'official_doc',
    'artifact_kind', 'policy',
    'authority_type','policy',
    'authority_rank', 100,
    'source_table',  'corporate_identity',
    'source_id',     'mission',
    'tenant_id',     'c4_corporate_identity',
    'status',        'active',
    'is_current',    true,
    'searchable',    true,
    'effective_from', now()::text,
    'created_by',    'seed_canonical'
  ),
  p_replace_current := true
);

-- 2. VISÃO (visível a todos)
SELECT public.publish_brain_document_version(
  p_content := E'[VISÃO DA C4 MARKETING]\n\nSer a agência de marketing de performance mais recomendada do Brasil até 2029, reconhecida por soluções inovadoras em IA, resiliência diante das mudanças e por multiplicar em dez vezes o faturamento de nossos clientes em até 36 meses. Após consolidar a liderança no Brasil, expandir para a América Latina com o mesmo padrão de excelência.',
  p_metadata := jsonb_build_object(
    'document_key',  'corporate_identity:vision',
    'title',         'Visão Corporativa — C4 Marketing',
    'type',          'official_doc',
    'artifact_kind', 'policy',
    'authority_type','policy',
    'authority_rank', 100,
    'source_table',  'corporate_identity',
    'source_id',     'vision',
    'tenant_id',     'c4_corporate_identity',
    'status',        'active',
    'is_current',    true,
    'searchable',    true,
    'effective_from', now()::text,
    'created_by',    'seed_canonical'
  ),
  p_replace_current := true
);

-- 3. VALORES (visível a todos)
SELECT public.publish_brain_document_version(
  p_content := E'[VALORES DA C4 MARKETING]\n\n• Foco no cliente: o cliente é o centro de todas as ações.\n• Resultados mensuráveis: estratégias orientadas por dados que maximizem ROI e reduzam o CAC.\n• Transparência e ética: comunicação clara e prática ética.\n• Inovação: adoção contínua de novas tecnologias, incluindo IA própria.\n• Resiliência: capacidade de adaptação e superação diante de desafios.\n• Colaboração e desenvolvimento humano: valorização do trabalho em equipe e da capacitação.\n• Responsabilidade social e sustentabilidade: compromisso com impactos positivos.',
  p_metadata := jsonb_build_object(
    'document_key',  'corporate_identity:values',
    'title',         'Valores Corporativos — C4 Marketing',
    'type',          'official_doc',
    'artifact_kind', 'policy',
    'authority_type','policy',
    'authority_rank', 100,
    'source_table',  'corporate_identity',
    'source_id',     'values',
    'tenant_id',     'c4_corporate_identity',
    'status',        'active',
    'is_current',    true,
    'searchable',    true,
    'effective_from', now()::text,
    'created_by',    'seed_canonical'
  ),
  p_replace_current := true
);

-- 4. ENDGAME / POSICIONAMENTO ESTRATÉGICO (visível a todos)
SELECT public.publish_brain_document_version(
  p_content := E'[ENDGAME ESTRATÉGICO DA C4 MARKETING]\n\nAté 2029, tornar a C4 Marketing a líder nacional em marketing de performance com IA, oferecendo um ecossistema de soluções próprias que permitam aos clientes brasileiros multiplicar seu faturamento em 10× em até três anos. Após consolidar a liderança no Brasil, expandir para pelo menos três países da América Latina, mantendo uma cultura de inovação, resiliência e foco absoluto no cliente.',
  p_metadata := jsonb_build_object(
    'document_key',  'corporate_identity:endgame',
    'title',         'Endgame Estratégico — C4 Marketing',
    'type',          'official_doc',
    'artifact_kind', 'policy',
    'authority_type','policy',
    'authority_rank', 100,
    'source_table',  'corporate_identity',
    'source_id',     'endgame',
    'tenant_id',     'c4_corporate_identity',
    'status',        'active',
    'is_current',    true,
    'searchable',    true,
    'effective_from', now()::text,
    'created_by',    'seed_canonical'
  ),
  p_replace_current := true
);

-- 5. POLÍTICA FINANCEIRA (gestão + financeiro apenas)
SELECT public.publish_brain_document_version(
  p_content := E'[POLÍTICA FINANCEIRA — C4 MARKETING]\n\n## Ticket Médio\nO ticket médio atual da C4 Marketing é de R$ 2.126,00 por cliente/mês.\n\n## Serviços e Modelo de Precificação\n• Gestão de Tráfego: mensalidade fixa. Sem cobrança de setup.\n• Hospedagem: mensalidade fixa.\n• Landing Page e Websites: pagamento único, podendo ser parcelado conforme negociação.\n• Agentes de IA (em implantação): cobrança de setup inicial + mensalidade recorrente.\n• Consultoria: modelo flexível — pode ser contratada por etapas, horas trabalhadas ou projeto fechado, conforme acordo com o cliente.\n\n## MRR e Metas 2026\nMRR atual: aproximadamente R$ 32.000,00.\nMeta para 2026: triplicar o MRR, atingindo R$ 96.000,00 de receita recorrente mensal.\n\n## Reajuste de Contratos\nO reajuste é negociado caso a caso, sem índice único aplicado a todos os contratos.\n\n## Condições de Pagamento\nPagamentos realizados via boleto bancário e/ou Pix. O vencimento é definido individualmente em cada contrato.\n\n## Política de Inadimplência\n1. Identificado o atraso, o financeiro realiza contato direto com o cliente via telefone ou WhatsApp.\n2. Com 30 dias de atraso, o serviço pode ser suspenso.\n3. Rescisão contratual por inadimplência não foi aplicada até o momento — a C4 prioriza negociação e acordo com o cliente.\n4. Regras contratuais variam por cliente: alguns contratos exigem aviso prévio de 30 dias para cancelamento; contratos com cláusula de fidelidade preveem multa de 50% sobre o valor do período restante.',
  p_metadata := jsonb_build_object(
    'document_key',   'corporate_identity:financial_policy',
    'title',          'Política Financeira — C4 Marketing',
    'type',           'official_doc',
    'artifact_kind',  'policy',
    'authority_type', 'policy',
    'authority_rank',  90,
    'source_table',   'corporate_identity',
    'source_id',      'financial_policy',
    'tenant_id',      'c4_corporate_identity',
    'role_allowlist', '["gestão","financeiro"]'::jsonb,
    'status',         'active',
    'is_current',     true,
    'searchable',     true,
    'effective_from',  now()::text,
    'created_by',     'seed_canonical'
  ),
  p_replace_current := true
);

-- 6. POLÍTICA COMERCIAL (gestão + comercial)
SELECT public.publish_brain_document_version(
  p_content := E'[POLÍTICA COMERCIAL — C4 MARKETING]\n\n## Geração de Leads\nOs leads chegam principalmente por dois canais:\n• Indicação de clientes e parceiros existentes.\n• Prospecção ativa realizada por consultor de negócios.\n\n## Processo de Vendas\n1. Contato inicial e qualificação do lead.\n2. Elaboração e envio da proposta comercial.\n3. O aceite da proposta pelo cliente já formaliza o início do contrato — não há etapa separada de assinatura.\n4. Tempo médio do primeiro contato ao fechamento: 15 a 30 dias.\n\n## Responsabilidades no Comercial\n• Fechamentos são conduzidos prioritariamente pelo CEO, André Cardia.\n• Pode ser delegado ao Gerente de Contas, Lucas, ou ao CTO, Celso Ferreira.\n\n## Propostas\n• Não há prazo de validade definido para as propostas enviadas.\n• A proposta aceita pelo cliente tem validade contratual imediata.\n\n## Metas Comerciais\n• Meta mínima: 4 novos clientes fechados por mês.\n• Essa meta está diretamente ligada ao objetivo de triplicar o MRR em 2026 (de R$ 32.000 para R$ 96.000).\n\n## Princípios Comerciais\n• Abordagem consultiva: entender o problema do cliente antes de propor solução.\n• Transparência total na proposta — sem taxas ocultas ou cobranças de setup em gestão de tráfego.\n• Foco em clientes com potencial de relacionamento de longo prazo.',
  p_metadata := jsonb_build_object(
    'document_key',   'corporate_identity:commercial_policy',
    'title',          'Política Comercial — C4 Marketing',
    'type',           'official_doc',
    'artifact_kind',  'policy',
    'authority_type', 'policy',
    'authority_rank',  90,
    'source_table',   'corporate_identity',
    'source_id',      'commercial_policy',
    'tenant_id',      'c4_corporate_identity',
    'role_allowlist', '["gestão","comercial"]'::jsonb,
    'status',         'active',
    'is_current',     true,
    'searchable',     true,
    'effective_from',  now()::text,
    'created_by',     'seed_canonical'
  ),
  p_replace_current := true
);

-- 7. POLÍTICA OPERACIONAL (gestão + operacional)
SELECT public.publish_brain_document_version(
  p_content := E'[POLÍTICA OPERACIONAL — C4 MARKETING]\n\n## Equipe Atual\n• CEO: André Cardia — liderança geral, fechamentos comerciais e visão estratégica.\n• CTO: Celso Ferreira — liderança técnica e desenvolvimento de soluções de IA.\n• Gerente de Contas / Gestor de Tráfego: Lucas — gestão de relacionamento com clientes e operação de tráfego.\n• Gestor de Tráfego: operação e otimização de campanhas de mídia paga.\n• Web Designer / Programador Júnior: desenvolvimento e manutenção de sites e landing pages.\n• Assistente Financeira: gestão financeira, cobranças e controle de pagamentos.\n• Consultora Comercial (part-time): apoio à prospecção e processo de vendas.\n• Agência Parceira de Design (terceirizada): 1 diretor de arte + 3 designers, responsáveis pela produção criativa.\n\n## Onboarding de Novos Clientes\n• Em até 24 horas após o fechamento, um membro do time entra em contato direto com o cliente para primeiras orientações e agendamento do onboarding formal.\n• O onboarding é conduzido pelo Gerente de Contas, Lucas.\n\n## Gestão de Projetos e Tarefas\n• A gestão operacional é centralizada no sistema interno da C4 (AI Studio), que integra projetos, tarefas, clientes e memória operacional.\n• O Gerente de Contas é o responsável pelo acompanhamento e entrega dos projetos.\n\n## Comunicação com Clientes\n• Serviços recorrentes: grupo no WhatsApp para comunicação ágil do dia a dia.\n• Reuniões periódicas de alinhamento conforme necessidade de cada cliente.\n• Relatórios mensais de performance entregues a todos os clientes ativos.\n\n## Tempo de Resposta\n• Não há SLA formalmente definido. A regra operacional é responder o cliente o mais breve possível, priorizando agilidade e qualidade no atendimento.\n\n## Princípios Operacionais\n• O cliente deve sentir presença ativa da C4 desde o primeiro dia após o fechamento.\n• Transparência nos relatórios: dados reais, sem maquiagem de resultados.\n• Problemas são comunicados proativamente ao cliente — nunca escondidos.\n• A operação é continuamente otimizada pelo uso do próprio sistema de IA da C4.',
  p_metadata := jsonb_build_object(
    'document_key',   'corporate_identity:operational_policy',
    'title',          'Política Operacional — C4 Marketing',
    'type',           'official_doc',
    'artifact_kind',  'policy',
    'authority_type', 'policy',
    'authority_rank',  90,
    'source_table',   'corporate_identity',
    'source_id',      'operational_policy',
    'tenant_id',      'c4_corporate_identity',
    'role_allowlist', '["gestão","operacional"]'::jsonb,
    'status',         'active',
    'is_current',     true,
    'searchable',     true,
    'effective_from',  now()::text,
    'created_by',     'seed_canonical'
  ),
  p_replace_current := true
);

-- ============================================================
-- NOTA PÓS-MIGRATION:
-- Os embeddings serão NULL após este INSERT.
-- Execute embed-content (ou script Node/Python) para cada
-- document_key 'corporate_identity:*' antes de ativar a flag.
-- ============================================================
