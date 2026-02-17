# Guia de Deploy via Linha de Comando (Projeto C4 Marketing)

Este guia contém os comandos exatos para este repositório e para o projeto Supabase **`xffdrdoaysxfkpebhywl`**.

## 1. Configuração Inicial

Certifique-se de estar na raiz do projeto:
`d:\GitHub\C4 Marketing\aistudio-repository-template`

1. **Login no Supabase**:

    ```powershell
    npx supabase login
    ```

2. **Vincular ao Projeto C4 Marketing**:

    ```powershell
    npx supabase link --project-ref xffdrdoaysxfkpebhywl
    ```

    *(Se pedir password, insira a senha do banco de dados deste projeto)*

## 2. Deploy do Banco de Dados

Para enviar as atualizações de tabelas e funções RPC (como `match_brain_documents`):

```powershell
npx supabase db push
```

## 3. Deploy da Função de Chat (`chat-brain`)

Para enviar a nova lógica do "Segundo Cérebro" (Router + Agentes):

```powershell
npx supabase functions deploy chat-brain --no-verify-jwt
```

> **Nota**: A flag `--no-verify-jwt` permite que nossa função gerencie internamente a autenticação, suportando tanto usuários logados quanto públicos (se configurado).

## 4. Variáveis de Ambiente (Secrets)

Se precisar atualizar a chave da OpenAI:

```powershell
npx supabase secrets set OPENAI_API_KEY=sk-...
```

## Resumo Rápido (Comandos do Dia a Dia)

Se você já fez o link, só precisa rodar estes dois comandos para atualizar tudo:

```powershell
npx supabase db push
npx supabase functions deploy chat-brain --no-verify-jwt
```
