import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  MessageSquare,
  Phone,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  User,
  Wifi,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';

import { useUserRole } from '../lib/UserRoleContext';
import {
  CRMChatConversation,
  CRMChatConversationStatus,
  CRMChatDiagnostics,
  CRMChatInstance,
  CRMChatInstanceFormState,
  CRMChatLeadSummary,
  CRMChatMessage,
  CRMChatUser,
  EvolutionConnectMode,
  EvolutionOverview,
  connectEvolutionInstance,
  createEmptyChatInstanceForm,
  fetchCRMChatConversations,
  fetchCRMChatInstance,
  fetchCRMChatLeadOptions,
  fetchCRMChatMessages,
  fetchCRMChatUsers,
  formatChatDateTime,
  formatConversationClock,
  getConnectionBadgeClass,
  getConnectionLabel,
  getConversationTitle,
  getEvolutionOverview,
  getLeadDisplayLabel,
  getMessageBubbleClass,
  getUserDisplayLabel,
  mapInstanceToForm,
  normalizeConversationSearch,
  runCRMChatDiagnostics,
  saveEvolutionInstance,
  sendEvolutionText,
  syncEvolutionInstance,
  updateCRMConversation,
} from '../lib/crmChat';

const statusOptions: Array<{ value: CRMChatConversationStatus; label: string }> = [
  { value: 'open', label: 'Aberta' },
  { value: 'pending', label: 'Pendente' },
  { value: 'resolved', label: 'Resolvida' },
  { value: 'archived', label: 'Arquivada' },
];

const REAUTH_MESSAGE = 'Sua sessão expirou ou ficou inválida. Atualize a página ou faça login novamente para continuar usando o CRM Chat.';

function isReauthMessage(message?: string | null) {
  const normalized = (message || '').toLowerCase();
  return normalized.includes('sessão expirou')
    || normalized.includes('sessao expirou')
    || normalized.includes('sessão inválida')
    || normalized.includes('sessao invalida')
    || normalized.includes('sua sessão expirou ou ficou inválida');
}

const SettingsToggle: React.FC<{
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`flex items-center justify-between gap-3 rounded-c4 border px-3 py-2 text-xs font-semibold transition-colors ${
      value
        ? 'border-brand-coral/40 bg-brand-coral/10 text-brand-coral'
        : 'border-slate-200 bg-white text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400'
    }`}
  >
    <span>{label}</span>
    <span
      className={`inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
        value ? 'bg-brand-coral' : 'bg-slate-300 dark:bg-neutral-700'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full bg-white transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </span>
  </button>
);

const CRMChat: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, loading: roleLoading } = useUserRole();
  const isReadOnly = false;

  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingInstance, setSavingInstance] = useState(false);
  const [syncingInstance, setSyncingInstance] = useState(false);
  const [connectingInstance, setConnectingInstance] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authExpired, setAuthExpired] = useState(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CRMChatDiagnostics | null>(null);
  const [generatedQrPreview, setGeneratedQrPreview] = useState<string | null>(null);
  const [overview, setOverview] = useState<EvolutionOverview | null>(null);
  const [instance, setInstance] = useState<CRMChatInstance | null>(null);
  const [instanceForm, setInstanceForm] = useState<CRMChatInstanceFormState>(createEmptyChatInstanceForm());
  const [conversations, setConversations] = useState<CRMChatConversation[]>([]);
  const [messages, setMessages] = useState<CRMChatMessage[]>([]);
  const [leads, setLeads] = useState<CRMChatLeadSummary[]>([]);
  const [users, setUsers] = useState<CRMChatUser[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationSearch, setConversationSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [leadDraft, setLeadDraft] = useState('');
  const [assignedUserDraft, setAssignedUserDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<CRMChatConversationStatus>('open');

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === (leadDraft || selectedConversation?.lead_id || '')) || null,
    [leadDraft, leads, selectedConversation]
  );
  const canSendMessages = !isReadOnly && !!selectedConversation && !!instance?.id && instance.status === 'connected';

  const handleReauthRequired = (message?: string | null) => {
    setAuthExpired(true);
    setNotice(null);
    setPageError(message || REAUTH_MESSAGE);
    setLoading(false);
    setRefreshing(false);
    setLoadingMessages(false);
    setSavingInstance(false);
    setSyncingInstance(false);
    setConnectingInstance(false);
    setSavingContext(false);
    setSendingMessage(false);
  };

  const handleRunDiagnostics = async () => {
    setRunningDiagnostics(true);
    try {
      const result = await runCRMChatDiagnostics();
      setDiagnostics(result);
    } catch (error: any) {
      setDiagnostics({
        timestamp: new Date().toISOString(),
        supabaseUrl: null,
        hasAnonKey: false,
        session: {
          hasSession: false,
          email: null,
          expiresAt: null,
          tokenLooksValid: false,
        },
        getUser: {
          ok: false,
          error: error?.message || 'Falha ao executar diagnóstico.',
          email: null,
        },
        refreshSession: {
          ok: false,
          error: null,
          hasSession: false,
        },
        evolutionManager: {
          ok: false,
          status: null,
          body: null,
          error: null,
        },
      });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  const qrPreviewSrc = useMemo(() => {
    const raw = instance?.qr_code || '';
    if (!raw) return null;
    if (raw.startsWith('data:image')) return raw;
    if (raw.startsWith('iVBOR') || raw.startsWith('/9j/') || raw.startsWith('R0lGOD')) {
      return `data:image/png;base64,${raw}`;
    }
    return generatedQrPreview;
  }, [generatedQrPreview, instance]);

  useEffect(() => {
    const raw = instance?.qr_code || '';

    if (!raw) {
      setGeneratedQrPreview(null);
      return;
    }

    if (raw.startsWith('data:image') || raw.startsWith('iVBOR') || raw.startsWith('/9j/') || raw.startsWith('R0lGOD')) {
      setGeneratedQrPreview(null);
      return;
    }

    let cancelled = false;

    QRCode.toDataURL(raw, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 260,
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setGeneratedQrPreview(dataUrl);
        }
      })
      .catch((error) => {
        console.warn('Falha ao gerar QR visual a partir do payload textual:', error);
        if (!cancelled) {
          setGeneratedQrPreview(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [instance?.qr_code]);

  const filteredConversations = useMemo(() => {
    const term = normalizeConversationSearch(conversationSearch);
    if (!term) return conversations;

    return conversations.filter((conversation) => {
      const contact = conversation.contact;
      const lead = conversation.lead;
      const haystack = normalizeConversationSearch(
        [
          getConversationTitle(conversation),
          contact?.phone_number || '',
          contact?.whatsapp_jid || '',
          lead?.name || '',
          lead?.company_name || '',
          conversation.last_message_preview || '',
        ].join(' ')
      );

      return haystack.includes(term);
    });
  }, [conversationSearch, conversations]);

  useEffect(() => {
    if (!roleLoading) {
      loadDashboard();
    }
  }, [roleLoading, authExpired]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversation) return;

    setLeadDraft(selectedConversation.lead_id || '');
    setAssignedUserDraft(selectedConversation.assigned_user_id || '');
    setStatusDraft(selectedConversation.status);

    if (selectedConversation.unread_count > 0 && !isReadOnly) {
      updateCRMConversation(selectedConversation.id, { unread_count: 0 })
        .then(() => {
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === selectedConversation.id
                ? { ...conversation, unread_count: 0 }
                : conversation
            )
          );
        })
        .catch((error) => {
          console.warn('Falha ao zerar unread_count da conversa:', error);
        });
    }
  }, [isReadOnly, selectedConversation]);

  useEffect(() => {
    if (!instance) {
      setInstanceForm(createEmptyChatInstanceForm());
      return;
    }

    setInstanceForm(mapInstanceToForm(instance));
  }, [instance]);

  useEffect(() => {
    if (authExpired) return;
    const interval = window.setInterval(() => {
      loadDashboard({ silent: true, preserveSelection: true });
      if (selectedConversationId) {
        loadMessages(selectedConversationId, true);
      }
    }, 15000);

    return () => window.clearInterval(interval);
  }, [selectedConversationId, authExpired]);

  const loadDashboard = async (options?: { silent?: boolean; preserveSelection?: boolean }) => {
    if (authExpired) return;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setPageError(null);

    try {
      const [fetchedInstance, fetchedConversations, fetchedLeads, fetchedUsers] = await Promise.all([
        fetchCRMChatInstance(),
        fetchCRMChatConversations(),
        fetchCRMChatLeadOptions(),
        fetchCRMChatUsers(),
      ]);

      setInstance(fetchedInstance);
      setConversations(fetchedConversations);
      setLeads(fetchedLeads);
      setUsers(fetchedUsers);

      setSelectedConversationId((current) => {
        if (options?.preserveSelection && current && fetchedConversations.some((conversation) => conversation.id === current)) {
          return current;
        }
        return fetchedConversations[0]?.id || null;
      });

      const nextOverview = await getEvolutionOverview(fetchedInstance?.id);
      setOverview(nextOverview);
      setInstance(nextOverview.instance || fetchedInstance);
    } catch (error: any) {
      console.error('Erro ao carregar central de conversas:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível carregar a central de conversas.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMessages = async (conversationId: string, silent = false) => {
    if (authExpired) return;
    if (!silent) setLoadingMessages(true);

    try {
      const data = await fetchCRMChatMessages(conversationId);
      setMessages(data);
    } catch (error: any) {
      console.error('Erro ao carregar mensagens:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else if (!silent) {
        setPageError(error.message || 'Não foi possível carregar as mensagens.');
      }
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  const handleSaveInstance = async () => {
    if (authExpired) return;
    setSavingInstance(true);
    setPageError(null);
    setNotice(null);

    try {
      const response = await saveEvolutionInstance({
        instanceId: instance?.id || null,
        ensureRemote: true,
        ...instanceForm,
      });

      setInstance(response.instance);
      setOverview((current) => ({
        config: current?.config || {
          isConfigured: false,
          hasApiBaseUrl: false,
          hasApiKey: false,
          hasWebhookToken: false,
          webhookUrl: null,
        },
        instance: response.instance,
        remote: response.remote || null,
        stats: current?.stats,
      }));
      setNotice('Instância salva e provisionada na Evolution API.');
      await loadDashboard({ silent: true, preserveSelection: true });
    } catch (error: any) {
      console.error('Erro ao salvar instância:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível salvar a instância.');
      }
    } finally {
      setSavingInstance(false);
    }
  };

  const handleSyncInstance = async () => {
    if (!instance?.id || authExpired) return;
    setSyncingInstance(true);
    setPageError(null);
    setNotice(null);

    try {
      const response = await syncEvolutionInstance(instance.id);
      setInstance(response.instance);
      setOverview((current) => current ? { ...current, instance: response.instance, remote: response.remote || null } : current);
      setNotice('Status da instância sincronizado.');
    } catch (error: any) {
      console.error('Erro ao sincronizar instância:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível sincronizar a instância.');
      }
    } finally {
      setSyncingInstance(false);
    }
  };

  const handleConnectInstance = async (connectMode: EvolutionConnectMode) => {
    if (!instance?.id || authExpired) return;
    setConnectingInstance(true);
    setPageError(null);
    setNotice(null);

    try {
      const response = await connectEvolutionInstance(instance.id, {
        connectMode,
        number: connectMode === 'pairing' ? instanceForm.owner_number : null,
      });
      setInstance(response.instance);
      setOverview((current) => current ? { ...current, instance: response.instance } : current);
      const connectPayload = response.connect || {};
      const qrCode = response.instance.qr_code || connectPayload.code || connectPayload.qrcode?.base64 || connectPayload.qrcode;
      const pairingCode = response.instance.settings?.last_pairing_code || connectPayload.pairingCode || connectPayload.response?.pairingCode;

      if (qrCode) {
        setNotice('QR code recebido da Evolution API e exibido na lateral.');
      } else if (pairingCode) {
        setNotice('Pairing code recebido da Evolution API e exibido na lateral.');
      } else {
        setNotice(
          connectMode === 'pairing'
            ? 'A Evolution aceitou a solicitacao de pairing, mas ainda nao devolveu codigo. Atualize o status em alguns segundos.'
            : 'A Evolution aceitou a solicitacao de QR, mas ainda nao devolveu imagem ou codigo. Atualize o status em alguns segundos.'
        );
      }
    } catch (error: any) {
      console.error('Erro ao conectar instância:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível iniciar a conexão da instância.');
      }
    } finally {
      setConnectingInstance(false);
    }
  };

  const handleSaveConversationContext = async () => {
    if (!selectedConversation || authExpired) return;
    setSavingContext(true);
    setPageError(null);
    setNotice(null);

    try {
      await updateCRMConversation(selectedConversation.id, {
        lead_id: leadDraft || null,
        assigned_user_id: assignedUserDraft || null,
        status: statusDraft,
      });

      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                lead_id: leadDraft || null,
                assigned_user_id: assignedUserDraft || null,
                status: statusDraft,
                lead: leads.find((lead) => lead.id === leadDraft) || null,
                assigned_user: users.find((user) => user.id === assignedUserDraft) || null,
              }
            : conversation
        )
      );
      setNotice('Contexto da conversa atualizado.');
    } catch (error: any) {
      console.error('Erro ao salvar contexto da conversa:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível salvar o contexto da conversa.');
      }
    } finally {
      setSavingContext(false);
    }
  };

  const handleSendMessage = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!selectedConversation || !instance?.id || instance.status !== 'connected' || !composer.trim() || sendingMessage || isReadOnly || authExpired) return;

    setSendingMessage(true);
    setPageError(null);

    try {
      await sendEvolutionText({
        conversationId: selectedConversation.id,
        instanceId: instance.id,
        text: composer.trim(),
        leadId: leadDraft || selectedConversation.lead_id || null,
      });

      setComposer('');
      await Promise.all([
        loadMessages(selectedConversation.id, true),
        loadDashboard({ silent: true, preserveSelection: true }),
      ]);
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      if (isReauthMessage(error.message)) {
        handleReauthRequired(error.message);
      } else {
        setPageError(error.message || 'Não foi possível enviar a mensagem.');
      }
    } finally {
      setSendingMessage(false);
    }
  };

  if (!roleLoading && !['gestor', 'comercial'].includes(userRole || '')) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-c4 border border-slate-200 bg-white text-slate-500 dark:border-neutral-800 dark:bg-black/30 dark:text-neutral-400">
        <p>Acesso restrito a gestores e comercial.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-900 dark:text-neutral-100">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400 dark:text-neutral-600">
            CRM Chat
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
            Central de conversas
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-neutral-400">
            Inbox comercial estilo WhatsApp Web para operar a Evolution API, vincular conversas a leads do CRM e registrar histórico no funil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadDashboard({ preserveSelection: true })}
            className="inline-flex items-center gap-2 rounded-c4 border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-700"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={handleSyncInstance}
            disabled={!instance?.id || syncingInstance}
            className="inline-flex items-center gap-2 rounded-c4 border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-700"
          >
            {syncingInstance ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}
            Sincronizar status
          </button>
          <button
            onClick={() => handleConnectInstance('qrcode')}
            disabled={!instance?.id || connectingInstance || isReadOnly}
            className="inline-flex items-center gap-2 rounded-c4 bg-brand-coral px-4 py-2 text-sm font-black text-white transition hover:bg-brand-coral/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connectingInstance ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
            Gerar QR
          </button>
          <button
            onClick={() => handleConnectInstance('pairing')}
            disabled={!instance?.id || connectingInstance || isReadOnly || !instanceForm.owner_number.trim()}
            className="inline-flex items-center gap-2 rounded-c4 border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-700"
          >
            {connectingInstance ? <Loader2 size={16} className="animate-spin" /> : <Phone size={16} />}
            Gerar pairing
          </button>
        </div>
      </div>

      {(pageError || notice) && (
        <div
          className={`rounded-c4 border px-4 py-3 text-sm ${
            pageError
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
          }`}
        >
          {pageError || notice}
        </div>
      )}

      {authExpired && (
        <div className="rounded-c4 border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">
              Diagnóstico objetivo da sessão e da Edge Function.
            </p>
            <button
              type="button"
              onClick={handleRunDiagnostics}
              disabled={runningDiagnostics}
              className="rounded-c4 border border-amber-300 px-3 py-1.5 text-xs font-semibold transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:hover:bg-amber-900/30"
            >
              {runningDiagnostics ? 'Executando...' : 'Executar diagnóstico'}
            </button>
          </div>
          {diagnostics && (
            <pre className="mt-3 overflow-x-auto rounded-c4 border border-amber-200 bg-white/70 p-3 text-xs leading-5 dark:border-amber-900/50 dark:bg-black/30">
{JSON.stringify(diagnostics, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="overflow-hidden rounded-c4 border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-black/40">
          <div className="border-b border-slate-200 p-4 dark:border-neutral-800">
            <div className="flex items-center gap-2 rounded-c4 border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
              <Search size={15} className="text-slate-400 dark:text-neutral-500" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa, lead ou número"
                className="w-full border-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-neutral-100 dark:placeholder:text-neutral-600"
              />
            </div>
          </div>

          <div className="max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center px-4 py-12 text-sm text-slate-400 dark:text-neutral-500">
                <Loader2 size={18} className="mr-2 animate-spin" /> Carregando conversas...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-400 dark:text-neutral-500">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const selected = conversation.id === selectedConversationId;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 dark:border-neutral-900 ${
                      selected
                        ? 'bg-brand-coral/8'
                        : 'hover:bg-slate-50 dark:hover:bg-neutral-950/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {getConversationTitle(conversation)}
                          </p>
                          {conversation.unread_count > 0 && (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-coral px-1.5 py-0.5 text-[10px] font-black text-white">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-neutral-500">
                          {conversation.last_message_preview || 'Sem mensagens registradas.'}
                        </p>
                        {conversation.lead && (
                          <p className="mt-1 truncate text-[11px] font-semibold text-slate-400 dark:text-neutral-600">
                            {conversation.lead.company_name}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-neutral-600">
                        {formatConversationClock(conversation.last_message_at)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-[640px] flex-col overflow-hidden rounded-c4 border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-black/40">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
            {selectedConversation ? (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">
                      {getConversationTitle(selectedConversation)}
                    </h2>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getConnectionBadgeClass(instance?.status)}`}>
                      {getConnectionLabel(instance?.status)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-neutral-500">
                    {selectedConversation.contact?.phone_number || selectedConversation.contact?.whatsapp_jid || 'Sem número identificado'}
                  </p>
                </div>
                <button
                  onClick={() => loadMessages(selectedConversation.id)}
                  className="inline-flex items-center gap-2 rounded-c4 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:text-white"
                >
                  <RefreshCw size={14} className={loadingMessages ? 'animate-spin' : ''} />
                  Atualizar chat
                </button>
              </>
            ) : (
              <div>
                <h2 className="text-lg font-black text-slate-950 dark:text-white">Selecione uma conversa</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-500">
                  Escolha um contato para visualizar o histórico e responder.
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50/70 px-5 py-5 dark:bg-neutral-950/50">
            {!selectedConversation ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 dark:text-neutral-500">
                <MessageSquare size={36} className="mb-3 opacity-40" />
                <p className="text-sm font-semibold">Nenhuma conversa selecionada.</p>
              </div>
            ) : loadingMessages ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-neutral-500">
                <Loader2 size={18} className="mr-2 animate-spin" /> Carregando mensagens...
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-slate-400 dark:text-neutral-500">
                <Clock size={34} className="mb-3 opacity-40" />
                <p className="text-sm font-semibold">Ainda não há mensagens persistidas.</p>
                <p className="mt-1 text-xs">As conversas começam a aparecer aqui quando o webhook da Evolution API estiver ativo.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${getMessageBubbleClass(message.direction)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] opacity-75">
                        {message.direction === 'outbound' ? 'Saída' : message.direction === 'system' ? 'Sistema' : 'Entrada'}
                      </span>
                      <span className="text-[11px] font-semibold opacity-70">
                        {formatConversationClock(message.sent_at)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                      {message.body || `[${message.message_type}]`}
                    </p>
                    <p className="mt-2 text-[11px] font-semibold opacity-70">
                      {message.status}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="border-t border-slate-200 p-4 dark:border-neutral-800">
            <div className="flex flex-col gap-3">
              <textarea
                value={composer}
                onChange={(event) => setComposer(event.target.value)}
                rows={3}
                placeholder={
                  isReadOnly
                    ? 'Perfil leitor não pode enviar mensagens.'
                    : !instance?.id
                    ? 'Configure a instância para começar a enviar.'
                    : instance.status !== 'connected'
                    ? 'Conecte o WhatsApp antes de enviar mensagens.'
                    : 'Digite a resposta para o contato.'
                }
                disabled={!canSendMessages}
                className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 dark:text-neutral-600">
                  As mensagens enviadas aqui também registram atividade no lead vinculado.
                </p>
                <button
                  type="submit"
                  disabled={
                    sendingMessage
                    || !canSendMessages
                    || !composer.trim()
                  }
                  className="inline-flex items-center gap-2 rounded-c4 bg-brand-coral px-4 py-2 text-sm font-black text-white transition hover:bg-brand-coral/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendingMessage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Enviar
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="space-y-4 overflow-y-auto custom-scrollbar">
          <section className="rounded-c4 border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-black/40">
            <div className="flex items-center gap-2">
              <Wifi size={16} className="text-brand-coral" />
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500">
                Instância Evolution
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Status</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {instance?.label || 'Instância não configurada'}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${getConnectionBadgeClass(instance?.status)}`}>
                  {getConnectionLabel(instance?.status)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-semibold">
                <div className={`rounded-c4 border px-2 py-3 ${overview?.config.hasApiBaseUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300'}`}>
                  Base URL
                </div>
                <div className={`rounded-c4 border px-2 py-3 ${overview?.config.hasApiKey ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300'}`}>
                  API Key
                </div>
                <div className={`rounded-c4 border px-2 py-3 ${overview?.config.hasWebhookToken ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300'}`}>
                  Webhook
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Número</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{instance?.connected_number || 'Não conectado'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Webhook</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{instance?.webhook_configured ? 'Ativo' : 'Pendente'}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-c4 border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-black/40">
            <div className="flex items-center gap-2">
              <Settings2 size={16} className="text-brand-coral" />
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500">
                Configuração
              </h3>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                  Nome interno
                </label>
                <input
                  value={instanceForm.label}
                  onChange={(event) => setInstanceForm((current) => ({ ...current, label: event.target.value }))}
                  placeholder="Ex: WhatsApp Comercial"
                  className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                  Nome da instância
                </label>
                <input
                  value={instanceForm.evolution_instance_name}
                  onChange={(event) => setInstanceForm((current) => ({ ...current, evolution_instance_name: event.target.value }))}
                  placeholder="Ex: c4-comercial"
                  className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                  Número para pairing (opcional)
                </label>
                <input
                  value={instanceForm.owner_number}
                  onChange={(event) => setInstanceForm((current) => ({ ...current, owner_number: event.target.value }))}
                  placeholder="5511999999999"
                  className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                />
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-neutral-400">
                  Deixe em branco para tentar QR na tela. Preencha apenas se quiser pareamento por numero.
                </p>
              </div>

              <div className="grid gap-2">
                <SettingsToggle
                  label="Sempre online"
                  value={instanceForm.always_online}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, always_online: value }))}
                />
                <SettingsToggle
                  label="Ler mensagens"
                  value={instanceForm.read_messages}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, read_messages: value }))}
                />
                <SettingsToggle
                  label="Ler status"
                  value={instanceForm.read_status}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, read_status: value }))}
                />
                <SettingsToggle
                  label="Sincronizar histórico"
                  value={instanceForm.sync_full_history}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, sync_full_history: value }))}
                />
                <SettingsToggle
                  label="Rejeitar chamadas"
                  value={instanceForm.reject_call}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, reject_call: value }))}
                />
                <SettingsToggle
                  label="Ignorar grupos"
                  value={instanceForm.groups_ignore}
                  onChange={(value) => setInstanceForm((current) => ({ ...current, groups_ignore: value }))}
                />
              </div>

              <button
                onClick={handleSaveInstance}
                disabled={savingInstance || isReadOnly}
                className="inline-flex w-full items-center justify-center gap-2 rounded-c4 bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {savingInstance ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Salvar e provisionar
              </button>

              {overview?.config.webhookUrl && (
                <div className="rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                  <p className="font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Webhook configurado</p>
                  <p className="mt-2 break-all leading-5">{overview.config.webhookUrl}</p>
                </div>
              )}
            </div>
          </section>

          {instance?.qr_code && (
            <section className="rounded-c4 border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-black/40">
              <div className="flex items-center gap-2">
                <QrCode size={16} className="text-brand-coral" />
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500">
                  Pairing / QR
                </h3>
              </div>

              <div className="mt-4 space-y-3">
                {qrPreviewSrc ? (
                  <div className="rounded-c4 border border-slate-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
                    <img src={qrPreviewSrc} alt="QR code da Evolution API" className="mx-auto w-full max-w-[220px] rounded-xl" />
                  </div>
                ) : (
                  <div className="rounded-c4 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    O provider retornou um código textual. Copie-o abaixo para pareamento manual, se necessário.
                  </div>
                )}

                <div className="rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Código bruto</p>
                  <p className="mt-2 break-all font-mono text-xs text-slate-600 dark:text-neutral-300">
                    {instance.qr_code}
                  </p>
                </div>

                {instance.settings?.last_pairing_code && (
                  <div className="rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Pairing code</p>
                    <p className="mt-2 font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {instance.settings.last_pairing_code}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="rounded-c4 border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-black/40">
            <div className="flex items-center gap-2">
              <Link2 size={16} className="text-brand-coral" />
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 dark:text-neutral-500">
                Contexto da conversa
              </h3>
            </div>

            {!selectedConversation ? (
              <div className="mt-4 rounded-c4 border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-400 dark:border-neutral-800 dark:text-neutral-500">
                Selecione uma conversa para vincular lead e responsável.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex items-start gap-3">
                    <Phone size={15} className="mt-0.5 text-slate-400 dark:text-neutral-600" />
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Contato</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{getConversationTitle(selectedConversation)}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-neutral-500">
                        {selectedConversation.contact?.phone_number || selectedConversation.contact?.whatsapp_jid || 'Sem número'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                    Lead vinculado
                  </label>
                  <select
                    value={leadDraft}
                    onChange={(event) => setLeadDraft(event.target.value)}
                    className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    <option value="">Sem vínculo</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.name} • {lead.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                    Responsável
                  </label>
                  <select
                    value={assignedUserDraft}
                    onChange={(event) => setAssignedUserDraft(event.target.value)}
                    className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    <option value="">Não atribuído</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {getUserDisplayLabel(user)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">
                    Status da conversa
                  </label>
                  <select
                    value={statusDraft}
                    onChange={(event) => setStatusDraft(event.target.value as CRMChatConversationStatus)}
                    className="w-full rounded-c4 border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-coral dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSaveConversationContext}
                  disabled={savingContext || isReadOnly}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-c4 border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-900 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:hover:border-neutral-700"
                >
                  {savingContext ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Salvar contexto
                </button>

                <div className="grid gap-3 rounded-c4 border border-slate-200 bg-slate-50 px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex items-start gap-3">
                    <Building2 size={15} className="mt-0.5 text-slate-400 dark:text-neutral-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Lead atual</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {getLeadDisplayLabel(selectedLead || selectedConversation.lead)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <User size={15} className="mt-0.5 text-slate-400 dark:text-neutral-600" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-neutral-600">Responsável</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                        {getUserDisplayLabel(users.find((user) => user.id === assignedUserDraft) || selectedConversation.assigned_user)}
                      </p>
                    </div>
                  </div>
                </div>

                {(selectedLead || selectedConversation.lead) && (
                  <button
                    onClick={() => navigate('/crm')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-c4 border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    <CheckCircle2 size={16} />
                    Abrir CRM
                  </button>
                )}
              </div>
            )}
          </section>

          {!overview?.config.isConfigured && (
            <section className="rounded-c4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className="mt-0.5" />
                <div>
                  <p className="font-black">Integração incompleta</p>
                  <p className="mt-1 leading-6">
                    Defina `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_TOKEN` nas Edge Functions para ativar conexão, envio e webhooks.
                  </p>
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default CRMChat;
