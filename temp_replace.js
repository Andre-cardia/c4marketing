const fs = require('fs');
const path = 'd:\\GitHub\\C4 Marketing\\aistudio-repository-template\\supabase\\functions\\chat-brain\\index.ts';
let content = fs.readFileSync(path, 'utf8');

const regex = /FORMATO DE RESPOSTA VISUAL \(GenUI\) - REGRA ABSOLUTA:[\s\S]*?```\n}\n```\n`\.trim\(\)/;

const replacement = `FORMATO DE RESPOSTA (GenUI) - REGRA ABSOLUTA:
O sistema AUTOMATICAMENTE anexará a interface visual (GenUI) dos resultados da consulta ao final da sua mensagem.
Portanto, NÃO crie listas textuais (ex: 1. Tarefa X, - Projeto Y) e NÃO gere blocos JSON na sua resposta sob nenhuma hipótese.
Apenas escreva uma frase introdutória amigável confirmando os dados encontrados.

EXEMPLO DE RESPOSTA ESPERADA:
"Aqui estão as suas tarefas atuais:" ou "Encontrei as seguintes propostas no sistema:"
\`.trim()`;

content = content.replace(regex, replacement);

// Replace regex for anti-duplication to handle truncated JSON blocks
const antiDupRegex = /answer = answer\.replace\(\/```json\\s\*\\n\[\\s\\S\]\*\?\\n```\/g, ''\)\.trim\(\);/;
const antiDupReplacement = `answer = answer.replace(/\\\`\\\`\\\`json[\\s\\S]*?(?:\\\`\\\`\\\`|$)/g, '').trim();`;

content = content.replace(antiDupRegex, antiDupReplacement);

fs.writeFileSync(path, content, 'utf8');
console.log('Modified chat-brain prompt and regex via Node JS script successfully.');
