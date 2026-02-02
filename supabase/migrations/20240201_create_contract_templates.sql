-- Create contract_templates table
CREATE TABLE IF NOT EXISTS contract_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

-- Create Policy: Allow public read access (or authenticated only, depending on needs)
CREATE POLICY "Allow public read access to contract templates"
ON contract_templates FOR SELECT
TO public
USING (true);

-- Insert Traffic Management Template
INSERT INTO contract_templates (service_id, title, content) VALUES 
('traffic_management', 'Gestão de Tráfego Pago', '
### 1. DO OBJETO
1.1. O presente contrato tem como objeto a prestação de serviços de GESTÃO DE TRÁFEGO PAGO nas plataformas Google Ads e Meta Ads (Facebook/Instagram).
1.2. Os serviços incluem:
    a) Planejamento estratégico das campanhas;
    b) Criação e configuração de públicos e anúncios;
    c) Otimização contínua de lances e orçamentos;
    d) Monitoramento diário de performance;
    e) Relatório mensal de resultados.

### 2. DOS INVESTIMENTOS
2.1. O CLIENTE é o único responsável pelo pagamento dos valores investidos diretamente nas plataformas de anúncio (Google/Meta), devendo manter métodos de pagamento válidos e saldo disponível.
2.2. A CONTRATADA não se responsabiliza por pausas nas campanhas decorrentes de falta de pagamento às plataformas.

### 3. DO ACESSO E AUTORIZAÇÕES
3.1. O CLIENTE compromete-se a fornecer os acessos necessários (Gerenciador de Negócios, Contas de Anúncio, Google Analytics) para a execução dos serviços.
');

-- Insert Website Development Template
INSERT INTO contract_templates (service_id, title, content) VALUES 
('website', 'Desenvolvimento de Website Institucional', '
### 1. DO OBJETO
1.1. O presente contrato tem como objeto o desenvolvimento de um Website Institucional.
1.2. O projeto contempla:
    a) Design responsivo (mobile-friendly);
    b) Páginas: Home, Sobre, Serviços, Contato e Blog;
    c) Painel administrativo para gestão de conteúdo;
    d) Otimização básica de SEO on-page.

### 2. DA PROPRIEDADE INTELECTUAL
2.1. Após a quitação integral dos valores pactuados, a CONTRATADA cede ao CLIENTE todos os direitos patrimoniais sobre o layout e código-fonte desenvolvido especificamente para este projeto.
2.2. O CLIENTE garante possuir os direitos de uso de todas as imagens e textos fornecidos para o site.
');

-- Insert Hosting Template
INSERT INTO contract_templates (service_id, title, content) VALUES 
('hosting', 'Hospedagem e Manutenção', '
### 1. DO OBJETO
1.1. O presente contrato tem como objeto a hospedagem do website e manutenção técnica mensal.
1.2. Estão inclusos:
    a) Armazenamento em servidor seguro (SSL);
    b) Backups semanais;
    c) Atualizações de plugins e sistema;
    d) Suporte técnico para estabilidade do site.

### 2. DAS RESPONSABILIDADES
2.1. A CONTRATADA envidará os melhores esforços para manter o site online 99,9% do tempo (SLA), exceto em casos de força maior ou manutenções programadas.
');

-- Insert Consulting Template
INSERT INTO contract_templates (service_id, title, content) VALUES 
('consulting', 'Consultoria de Marketing', '
### 1. DO OBJETO
1.1. O presente contrato tem como objeto a prestação de Consultoria de Marketing e Vendas.
1.2. O escopo inclui reuniões estratégicas quinzenais, análise de funil de vendas e treinamento da equipe comercial.

### 2. DA CONFIDENCIALIDADE
2.1. Ambas as partes comprometem-se a manter sigilo absoluto sobre informações estratégicas, dados financeiros e lista de clientes trocados durante a vigência deste contrato.
');
