UPDATE public.contract_templates
SET
  title = 'Desenvolvimento de Website Institucional',
  content = $$
### 1. DO OBJETO
1.1. O presente contrato tem como objeto o desenvolvimento de um Website Institucional.
1.2. O projeto contempla:
    a) Design responsivo (mobile-friendly);
    b) Páginas: Home, Sobre, Serviços, Contato e Blog;
    c) Painel administrativo para gestão de conteúdo;
    d) Otimização básica de SEO on-page.

### 2. DOS PRAZOS E REVISOES
2.1. O prazo estimado para desenvolvimento e entrega do website será de 30 dias úteis após o envio completo dos materiais pela CONTRATANTE.
2.2. O projeto inclui até 3 (três) rodadas de ajustes e revisões no layout.

### 3. DA PROPRIEDADE INTELECTUAL
3.1. Após a quitação integral dos valores pactuados, a CONTRATADA cede ao CLIENTE todos os direitos patrimoniais sobre o layout e código-fonte desenvolvido especificamente para este projeto.
3.2. O CLIENTE garante possuir os direitos de uso de todas as imagens e textos fornecidos para o site.
$$
WHERE service_id = 'website';
