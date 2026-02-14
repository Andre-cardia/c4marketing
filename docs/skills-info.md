# Configurações de Skills no Antigravity

Este documento resume onde encontrar e como gerenciar as configurações de **Skills** dentro do ambiente Antigravity.

## 1. Localização Global das Skills

As skills e seus arquivos de índice estão localizados no diretório do usuário:
`C:\Users\André Cardia\.agent\skills` (ou `$HOME\.agent\skills`)

### Arquivos de Configuração Central

* **`skills_index.json`**: O mapeamento mestre que vincula o `ID` de cada skill ao seu caminho (`path`), categoria e descrição. É o arquivo que o sistema consulta para saber quais skills carregar.
* **`CATALOG.md`**: Um índice organizado e legível por humanos de todas as skills instaladas.
* **Pasta `skills/`**: Contém os diretórios individuais de cada funcionalidade/especialidade.

## 2. Configuração Individual da Skill (`SKILL.md`)

Dentro de cada pasta de skill (ex: `...\skills\code-documentation-doc-generate\`), existe um arquivo **`SKILL.md`**.
Este arquivo define o comportamento da skill através de um cabeçalho **YAML**:

* `name`: O nome identificador.
* `description`: O prompt que instrui o agente sobre a finalidade da skill e os gatilhos para sua ativação.

## 3. Workflows do Projeto

Para automações específicas deste repositório, as configurações e sequências de comandos ficam em:
`./.agent/workflows/`

Arquivos `.md` nesta pasta podem ser chamados usando o comando `/` no chat (ex: `/deploy`).

## 4. Como Explorar

Para buscar uma skill específica via terminal:

```powershell
# Listar diretórios de skills
ls $HOME/.agent/skills/skills

# Ver o índice de skills
cat $HOME/.agent/skills/skills_index.json
```
