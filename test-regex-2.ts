const content = `Aqui estão as suas tarefas atuais:

\`\`\`json
{
  "type": "task_list",
  "items": [
    {
      "title": "Atualizar Politicas de Privacidade",
      "subtitle": "Cliente: Pulsemind | Status: Backlog | Prioridade: Média | Vencimento: 25/02/2026",
      "status": "backlog"
    }
  ]
}
\`\`\`

\`\`\`json
{"type":"task_list","items":[{"id":"7fb915ae-48f4-4ed0-ab2d-a47cc1c7709e"}]}
\`\`\``;

const renderMarkdownPattern = /(?:\n|^)\s*```json\s*(\{[\s\S]*?\})\s*```/gi;

let match;
const parts = [];
let lastIndex = 0;

while ((match = renderMarkdownPattern.exec(content)) !== null) {
    console.log("MATCH FOUND:");
    console.log("Matched block:", match[0]);
    console.log("Captured JSON:", match[1]);
    try {
        JSON.parse(match[1]);
        console.log("JSON PARSED SUCCESS");
    } catch (e) {
        console.log("JSON PARSE ERROR", e);
    }
}
console.log("DONE");
