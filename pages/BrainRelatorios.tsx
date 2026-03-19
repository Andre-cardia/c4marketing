import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserRole } from '../lib/UserRoleContext'
import { supabase } from '../lib/supabase'
import {
    FileText, Download, Clock, CheckCircle2, AlertCircle,
    Plus, Loader2, Calendar, ChevronDown, ChevronUp, X, RefreshCw,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReportType = 'ops_daily' | 'proposal_pipeline' | 'contract_pulse' | 'client_health' | 'custom'
type ReportStatus = 'draft' | 'scheduled' | 'delivered'

interface Report {
    id: string
    title: string
    report_type: ReportType
    status: ReportStatus
    deliver_at: string | null
    delivered_at: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    content?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
    ops_daily:          'Operacional Diário',
    proposal_pipeline:  'Pipeline de Propostas',
    contract_pulse:     'Pulso de Contratos',
    client_health:      'Saúde de Clientes',
    custom:             'Personalizado',
}

const REPORT_TYPE_COLORS: Record<ReportType, string> = {
    ops_daily:          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    proposal_pipeline:  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    contract_pulse:     'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    client_health:      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    custom:             'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
}

const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string; icon: React.ElementType }> = {
    draft:     { label: 'Rascunho',  color: 'text-neutral-500 dark:text-neutral-400',             icon: FileText     },
    scheduled: { label: 'Agendado',  color: 'text-amber-600 dark:text-amber-400',                 icon: Clock        },
    delivered: { label: 'Entregue',  color: 'text-emerald-600 dark:text-emerald-400',             icon: CheckCircle2 },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

function downloadMd(title: string, content: string) {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
    a.click()
    URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function GenerateModal({
    onClose,
    onGenerate,
}: {
    onClose: () => void
    onGenerate: (type: ReportType, params: Record<string, any>) => Promise<void>
}) {
    const [type, setType] = useState<ReportType>('ops_daily')
    const [customTitle, setCustomTitle] = useState('')
    const [customContent, setCustomContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async () => {
        setError(null)
        if (type === 'custom' && (!customTitle.trim() || !customContent.trim())) {
            setError('Título e conteúdo são obrigatórios para relatórios personalizados.')
            return
        }
        setLoading(true)
        try {
            const params = type === 'custom'
                ? { title: customTitle, content: customContent }
                : {}
            await onGenerate(type, params)
            onClose()
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao gerar relatório.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Gerar Relatório</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    {/* Tipo */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                            Tipo de Relatório
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                            {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setType(t)}
                                    className={`text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                                        type === t
                                            ? 'border-brand-coral bg-brand-coral/10 text-brand-coral font-medium'
                                            : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-brand-coral/50'
                                    }`}
                                >
                                    {REPORT_TYPE_LABELS[t]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Custom fields */}
                    {type === 'custom' && (
                        <div className="space-y-3">
                            <input
                                value={customTitle}
                                onChange={e => setCustomTitle(e.target.value)}
                                placeholder="Título do relatório"
                                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/50"
                            />
                            <textarea
                                value={customContent}
                                onChange={e => setCustomContent(e.target.value)}
                                placeholder="Conteúdo do relatório (Markdown)"
                                rows={6}
                                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-coral/50 resize-none"
                            />
                        </div>
                    )}

                    {type !== 'custom' && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-3">
                            O agente coletará os dados necessários do sistema e gerará o relatório automaticamente usando IA.
                        </p>
                    )}

                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 bg-brand-coral text-white text-sm font-medium rounded-xl hover:bg-brand-coral/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {loading ? 'Gerando...' : 'Gerar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ScheduleModal({
    report,
    onClose,
    onSchedule,
}: {
    report: Report
    onClose: () => void
    onSchedule: (reportId: string, deliverAt: string) => Promise<void>
}) {
    const [deliverAt, setDeliverAt] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async () => {
        if (!deliverAt) { setError('Selecione uma data/hora.'); return }
        setLoading(true)
        try {
            await onSchedule(report.id, new Date(deliverAt).toISOString())
            onClose()
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao agendar.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-sm border border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Agendar Entrega</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        Agendar entrega de: <strong className="text-neutral-800 dark:text-neutral-200">{report.title}</strong>
                    </p>
                    <input
                        type="datetime-local"
                        value={deliverAt}
                        onChange={e => setDeliverAt(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-coral/50"
                    />
                    {error && (
                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    )}
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">Cancelar</button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 bg-brand-coral text-white text-sm font-medium rounded-xl hover:bg-brand-coral/90 disabled:opacity-50 transition-colors"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
                        Agendar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BrainRelatorios() {
    const navigate = useNavigate()
    const { userRole, loading: roleLoading } = useUserRole()

    const [reports, setReports] = useState<Report[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [expandedContent, setExpandedContent] = useState<string | null>(null)
    const [loadingContent, setLoadingContent] = useState(false)
    const [showGenerate, setShowGenerate] = useState(false)
    const [scheduleTarget, setScheduleTarget] = useState<Report | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    // --- Auth guard ---
    useEffect(() => {
        if (!roleLoading && userRole !== 'gestor') navigate('/dashboard')
    }, [userRole, roleLoading, navigate])

    // --- API call helper ---
    const callApi = useCallback(async (body: Record<string, any>) => {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token ?? ''
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string

        const res = await fetch(`${supabaseUrl}/functions/v1/brain-reports`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        return data
    }, [])

    // --- Fetch list ---
    const fetchReports = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await callApi({ action: 'list' })
            setReports(data.reports ?? [])
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao carregar relatórios.')
        } finally {
            setLoading(false)
        }
    }, [callApi])

    useEffect(() => {
        if (userRole === 'gestor') fetchReports()
    }, [userRole, fetchReports])

    // --- Toggle expand (loads content) ---
    const toggleExpand = async (report: Report) => {
        if (expandedId === report.id) {
            setExpandedId(null)
            setExpandedContent(null)
            return
        }
        setExpandedId(report.id)
        setLoadingContent(true)
        try {
            const data = await callApi({ action: 'get', report_id: report.id })
            setExpandedContent(data.report?.content ?? '(sem conteúdo)')
        } catch {
            setExpandedContent('(erro ao carregar conteúdo)')
        } finally {
            setLoadingContent(false)
        }
    }

    // --- Generate ---
    const handleGenerate = async (type: string, params: Record<string, any>) => {
        const data = await callApi({ action: 'generate', report_type: type, params })
        await fetchReports()
        if (data.report) {
            setExpandedId(data.report.id)
            setExpandedContent(data.report.content ?? '(gerando...)')
        }
    }

    // --- Schedule ---
    const handleSchedule = async (reportId: string, deliverAt: string) => {
        await callApi({ action: 'schedule', report_id: reportId, deliver_at: deliverAt })
        await fetchReports()
    }

    // --- Deliver ---
    const handleDeliver = async (reportId: string) => {
        setActionLoading(reportId)
        try {
            await callApi({ action: 'deliver', report_id: reportId })
            await fetchReports()
        } finally {
            setActionLoading(null)
        }
    }

    // --- Download ---
    const handleDownload = async (report: Report) => {
        let content = report.id === expandedId ? expandedContent : null
        if (!content) {
            const data = await callApi({ action: 'get', report_id: report.id })
            content = data.report?.content ?? ''
        }
        downloadMd(report.title, content ?? '')
    }

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (roleLoading || (loading && reports.length === 0)) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin text-brand-coral" size={32} />
                <span className="ml-3 text-neutral-500 dark:text-neutral-400">Carregando relatórios...</span>
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Relatórios IA</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Relatórios gerados pelo Agente Autônomo
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchReports}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white border border-neutral-200 dark:border-neutral-700 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Atualizar
                    </button>
                    <button
                        onClick={() => setShowGenerate(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-coral text-white text-sm font-medium rounded-xl hover:bg-brand-coral/90 transition-colors"
                    >
                        <Plus size={16} />
                        Gerar Relatório
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && reports.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <FileText size={48} className="text-neutral-300 dark:text-neutral-600 mb-4" />
                    <h3 className="text-lg font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                        Nenhum relatório ainda
                    </h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
                        Gere o primeiro relatório do Agente Autônomo.
                    </p>
                    <button
                        onClick={() => setShowGenerate(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand-coral text-white text-sm font-medium rounded-xl hover:bg-brand-coral/90 transition-colors"
                    >
                        <Plus size={16} />
                        Gerar primeiro relatório
                    </button>
                </div>
            )}

            {/* Reports list */}
            {reports.length > 0 && (
                <div className="space-y-3">
                    {reports.map(report => {
                        const status = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.draft
                        const StatusIcon = status.icon
                        const isExpanded = expandedId === report.id

                        return (
                            <div
                                key={report.id}
                                className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden transition-all"
                            >
                                {/* Row */}
                                <div className="flex items-center gap-4 px-5 py-4">
                                    {/* Type badge */}
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-lg whitespace-nowrap ${REPORT_TYPE_COLORS[report.report_type] ?? REPORT_TYPE_COLORS.custom}`}>
                                        {REPORT_TYPE_LABELS[report.report_type] ?? report.report_type}
                                    </span>

                                    {/* Title */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                                            {report.title}
                                        </p>
                                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
                                            {fmtDate(report.created_at)}
                                            {report.deliver_at ? ` · Agendado: ${fmtDate(report.deliver_at)}` : ''}
                                        </p>
                                    </div>

                                    {/* Status */}
                                    <div className={`flex items-center gap-1.5 text-xs font-medium ${status.color}`}>
                                        <StatusIcon size={13} />
                                        {status.label}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => handleDownload(report)}
                                            title="Download Markdown"
                                            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                        >
                                            <Download size={15} />
                                        </button>

                                        {report.status === 'draft' && (
                                            <button
                                                onClick={() => setScheduleTarget(report)}
                                                title="Agendar entrega"
                                                className="p-1.5 text-neutral-400 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                            >
                                                <Calendar size={15} />
                                            </button>
                                        )}

                                        {report.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleDeliver(report.id)}
                                                disabled={actionLoading === report.id}
                                                title="Marcar como entregue"
                                                className="p-1.5 text-neutral-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                                            >
                                                {actionLoading === report.id
                                                    ? <Loader2 size={15} className="animate-spin" />
                                                    : <CheckCircle2 size={15} />}
                                            </button>
                                        )}

                                        <button
                                            onClick={() => toggleExpand(report)}
                                            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                        >
                                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                    <div className="border-t border-neutral-100 dark:border-neutral-800 px-5 py-4 bg-neutral-50 dark:bg-neutral-800/30">
                                        {loadingContent ? (
                                            <div className="flex items-center gap-2 text-sm text-neutral-400">
                                                <Loader2 size={14} className="animate-spin" />
                                                Carregando conteúdo...
                                            </div>
                                        ) : (
                                            <pre className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                                                {expandedContent}
                                            </pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Modals */}
            {showGenerate && (
                <GenerateModal
                    onClose={() => setShowGenerate(false)}
                    onGenerate={handleGenerate}
                />
            )}
            {scheduleTarget && (
                <ScheduleModal
                    report={scheduleTarget}
                    onClose={() => setScheduleTarget(null)}
                    onSchedule={handleSchedule}
                />
            )}
        </div>
    )
}
