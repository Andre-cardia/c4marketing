import React from 'react';

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('AppErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
          <div className="w-full max-w-2xl rounded-3xl border border-rose-500/30 bg-white/5 p-8 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
              Erro de inicialização
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">
              O sistema encontrou um erro ao carregar.
            </h1>
            <p className="mt-4 text-sm text-slate-300">
              Mensagem capturada:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-black/40 p-4 text-sm text-rose-200">
              {this.state.errorMessage || 'Erro desconhecido'}
            </pre>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 rounded-xl bg-brand-coral px-4 py-2 text-sm font-black text-white transition hover:bg-brand-coral/90"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
