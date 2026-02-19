# Migrations Legacy

Esta pasta guarda migrations antigas que tinham `version` duplicada no prefixo do arquivo.

## Por que foram movidas
- O Supabase usa `version` como chave única em `supabase_migrations.schema_migrations`.
- Arquivos com o mesmo prefixo (ex.: `20260216_*`) quebravam `supabase db push`.
- Para restaurar o fluxo de deploy, os duplicados foram retirados de `supabase/migrations`.

## Importante
- Esses arquivos **não** são mais executados automaticamente pelo CLI.
- Eles permanecem no repositório apenas para auditoria/histórico.
- O passo recomendado de longo prazo é criar um **baseline único** da schema atual de produção.
