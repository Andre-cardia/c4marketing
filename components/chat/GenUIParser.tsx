import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';

interface GenUIParserProps {
    content: string;
}

export const GenUIParser: React.FC<GenUIParserProps> = ({ content }) => {
    if (!content || typeof content !== 'string') return null;

    // Procura por blocos de código markdown contendo json
    // Ex: ```json
    // { "type": "task_list", "items": [...] }
    // ```
    const renderMarkdownPattern = /(?:\n|^)```json\s*(\{[\s\S]*?\})\s*```/gi;

    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = renderMarkdownPattern.exec(content)) !== null) {
        // Texto comum antes do JSON
        if (match.index > lastIndex) {
            parts.push({
                type: 'text',
                content: content.slice(lastIndex, match.index)
            });
        }

        // Tentar parsear o JSON para Componentes App-Specíficos
        try {
            const jsonStr = match[1];
            const parsedData = JSON.parse(jsonStr);

            parts.push({
                type: 'gen_ui',
                data: parsedData
            });
        } catch (e) {
            // Se falhar o parse, renderizamos como texto do markdown de codeblock normal
            parts.push({
                type: 'text',
                content: match[0]
            });
        }

        lastIndex = renderMarkdownPattern.lastIndex;
    }

    // Pega qualquer resto de texto do final da resposta
    if (lastIndex < content.length) {
        parts.push({
            type: 'text',
            content: content.slice(lastIndex)
        });
    }

    return (
        <div className="flex flex-col gap-4">
            {parts.map((part, index) => {
                if (part.type === 'text') {
                    // Texto comum passa pelo Markdown nativo
                    return (
                        <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>
                                {part.content}
                            </ReactMarkdown>
                        </div>
                    );
                }

                if (part.type === 'gen_ui') {
                    // Aqui vamos plugar os componentes de UI dinamica!
                    const data = part.data;

                    if (data.type === 'task_list') {
                        return (
                            <div key={index} className="bg-white/5 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm my-2">
                                <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                                    <span className="text-indigo-500">📋</span> Lista de Tarefas
                                </h4>
                                <pre className="text-xs text-slate-500 overflow-x-auto">
                                    {JSON.stringify(data, null, 2)}
                                </pre>
                            </div>
                        );
                    }

                    // Se não for um tipo conhecido ainda, desenha o Raw Data JSON pra debug por enquanto
                    return (
                        <div key={index} className="bg-slate-800 border border-slate-700 p-4 rounded-xl my-2 text-xs overflow-auto">
                            <span className="text-slate-400 mb-2 block font-mono">Componente não reconhecido: {data.type}</span>
                            <pre className="text-green-400">{JSON.stringify(data, null, 2)}</pre>
                        </div>
                    );
                }

                return null;
            })}
        </div>
    );
};
