
import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

function renderBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <React.StrictMode>
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="w-full max-w-2xl rounded-3xl border border-rose-500/30 bg-white/5 p-8 shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
            Erro no bootstrap
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">
            A aplicacao falhou antes de renderizar.
          </h1>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-black/40 p-4 text-sm text-rose-200">
            {message}
          </pre>
        </div>
      </div>
    </React.StrictMode>
  );
}

async function bootstrap() {
  try {
    const { default: App } = await import('./App');
    root.render(
      <React.StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </React.StrictMode>
    );
  } catch (error) {
    console.error('Bootstrap import failed:', error);
    renderBootstrapError(error);
  }
}

bootstrap();
