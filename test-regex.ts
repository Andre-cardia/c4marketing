const content = `Aqui estão as suas tarefas atuais, André:

1. **Integração do Sistema com Microsoft**  

\`\`\`json
{"type":"task_list","items":[{"id":"1", "name": "A"}]}
\`\`\``;

const renderMarkdownPattern = /(?:\n|^)```json\s*(\{[\s\S]*?\})\s*```/gi;

let match;
while ((match = renderMarkdownPattern.exec(content)) !== null) {
    console.log("MATCH FOUND:");
    console.log(match[1]);
    try {
        JSON.parse(match[1]);
        console.log("JSON PARSED SUCCESS");
    } catch (e) {
        console.log("JSON PARSE ERROR", e);
    }
}
console.log("DONE");
