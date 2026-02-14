# Stack Tecnológica

A stack tecnológica utilizada para criar esta aplicação é moderna e focada em performance e escalabilidade. Abaixo está o detalhamento do Front-end e Back-end:

## Front-end
*   **Framework Principal:** [React 19](https://react.dev/) - A versão mais recente do React para construção da interface.
*   **Linguagem:** [TypeScript](https://www.typescriptlang.org/) - Para garantir tipagem estática e maior segurança no desenvolvimento.
*   **Ferramenta de Build:** [Vite 6](https://vitejs.dev/) - Utilizado para o desenvolvimento rápido e empacotamento (build) eficiente da aplicação.
*   **Roteamento:** [React Router Dom 7](https://reactrouter.com/) - Gerencia a navegação entre as diferentes páginas do sistema.
*   **Estilização:** **Vanilla CSS** - A aplicação utiliza CSS puro para garantir flexibilidade e controle total sobre o design premium.
*   **Ícones:** [Lucide React](https://lucide.dev/) - Biblioteca de ícones moderna e leve.
*   **Integrações:**
    *   **Cal.com SDK:** Utilizado para a integração de agendamentos e calendários.
    *   **jsPDF & html2canvas:** Para geração dinâmica de documentos PDF e relatórios.
    *   **React Markdown:** Para renderização de conteúdos em formato Markdown.

## Back-end & Infraestrutura
A aplicação utiliza o modelo **BaaS (Backend as a Service)**, eliminando a necessidade de um servidor Node.js/Python tradicional:

*   **Plataforma de Backend:** [Supabase](https://supabase.com/)
    *   **Banco de Dados:** **PostgreSQL** (Relacional).
    *   **Autenticação:** Gerenciamento de usuários e sessões via Supabase Auth.
    *   **Storage:** Armazenamento de arquivos e documentos.
*   **Hospedagem / Deployment:** [Vercel](https://vercel.com/) - Plataforma onde o código está publicado e rodando.

## Resumo
É uma stack **React + TypeScript + Supabase**, que permite um desenvolvimento ágil (Serverless) com um banco de dados relacional robusto e uma interface extremamente performática.
