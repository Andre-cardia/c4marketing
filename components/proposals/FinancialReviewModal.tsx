import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Trash2, X } from 'lucide-react';

export type FinancialReviewMode = 'no_non_recurring' | 'single_payment' | 'installments';

export interface FinancialReviewInstallment {
    id?: number;
    label?: string | null;
    amount: number;
    expected_date: string;
}

export interface FinancialReviewInstallmentInput {
    label: string;
    amount: string;
    expected_date: string;
}

export interface FinancialReviewAcceptanceSummary {
    id: number;
    companyDisplayName: string;
    acceptedAt: string;
    billingStartDate?: string | null;
    monthlyFee: number;
    nonRecurringTotal: number;
    financialReviewMode?: string | null;
    installments: FinancialReviewInstallment[];
}

interface FinancialReviewModalProps {
    isOpen: boolean;
    acceptance: FinancialReviewAcceptanceSummary | null;
    isSaving: boolean;
    onClose: () => void;
    onSave: (
        mode: FinancialReviewMode,
        installments: FinancialReviewInstallmentInput[],
        billingStartDate: string,
        monthlyFee: number,
        nonRecurringTotal: number
    ) => Promise<void> | void;
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const toAmountInputValue = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return '';
    return value.toFixed(2);
};

const buildDefaultSinglePayment = (acceptedAt: string, total: number): FinancialReviewInstallmentInput[] => [
    {
        label: 'Pagamento unico',
        amount: toAmountInputValue(total),
        expected_date: acceptedAt ? acceptedAt.split('T')[0] : '',
    },
];

const buildDefaultSplitInstallments = (total: number): FinancialReviewInstallmentInput[] => {
    const firstHalf = Math.round((total / 2) * 100) / 100;
    const secondHalf = Math.round((total - firstHalf) * 100) / 100;

    return [
        { label: '', amount: toAmountInputValue(firstHalf), expected_date: '' },
        { label: '', amount: toAmountInputValue(secondHalf), expected_date: '' },
    ];
};

const mapExistingInstallments = (
    installments: FinancialReviewInstallment[]
): FinancialReviewInstallmentInput[] => installments.map((installment) => ({
    label: installment.label || '',
    amount: toAmountInputValue(Number(installment.amount) || 0),
    expected_date: installment.expected_date || '',
}));

const FinancialReviewModal: React.FC<FinancialReviewModalProps> = ({
    isOpen,
    acceptance,
    isSaving,
    onClose,
    onSave,
}) => {
    const [mode, setMode] = useState<FinancialReviewMode>('no_non_recurring');
    const [installments, setInstallments] = useState<FinancialReviewInstallmentInput[]>([]);
    const [billingStartDate, setBillingStartDate] = useState('');
    const [monthlyFeeInput, setMonthlyFeeInput] = useState('');
    const [nonRecurringTotalInput, setNonRecurringTotalInput] = useState('');

    useEffect(() => {
        if (!isOpen || !acceptance) return;

        setMonthlyFeeInput(toAmountInputValue(acceptance.monthlyFee));
        setNonRecurringTotalInput(toAmountInputValue(acceptance.nonRecurringTotal));

        const hasNonRecurring = acceptance.nonRecurringTotal > 0.01;
        const nextMode = hasNonRecurring
            ? ((acceptance.financialReviewMode as FinancialReviewMode | null) || 'single_payment')
            : 'no_non_recurring';

        setMode(nextMode);

        if (nextMode === 'no_non_recurring') {
            setInstallments([]);
            return;
        }

        if (acceptance.installments.length > 0) {
            setInstallments(mapExistingInstallments(acceptance.installments));
            return;
        }

        setInstallments(
            nextMode === 'single_payment'
                ? buildDefaultSinglePayment(acceptance.acceptedAt, acceptance.nonRecurringTotal)
                : buildDefaultSplitInstallments(acceptance.nonRecurringTotal)
        );
    }, [acceptance, isOpen]);

    useEffect(() => {
        if (!isOpen || !acceptance) return;
        const fallbackBillingStart = acceptance.acceptedAt ? acceptance.acceptedAt.split('T')[0] : '';
        setBillingStartDate(acceptance.billingStartDate || fallbackBillingStart);
    }, [acceptance, isOpen]);

    const reviewedMonthlyFee = useMemo(() => Number(monthlyFeeInput) || 0, [monthlyFeeInput]);
    const reviewedNonRecurringTotal = useMemo(() => Number(nonRecurringTotalInput) || 0, [nonRecurringTotalInput]);

    useEffect(() => {
        if (mode !== 'no_non_recurring' && reviewedNonRecurringTotal <= 0.01) {
            setMode('no_non_recurring');
            setInstallments([]);
        }
    }, [mode, reviewedNonRecurringTotal]);

    useEffect(() => {
        if (!acceptance || mode !== 'single_payment') return;

        setInstallments((current) => {
            const currentInstallment = current[0];
            return [{
                label: currentInstallment?.label || 'Pagamento unico',
                amount: toAmountInputValue(reviewedNonRecurringTotal),
                expected_date: currentInstallment?.expected_date || (acceptance.acceptedAt ? acceptance.acceptedAt.split('T')[0] : ''),
            }];
        });
    }, [acceptance, mode, reviewedNonRecurringTotal]);

    const allocatedTotal = useMemo(() => (
        installments.reduce((sum, installment) => sum + (Number(installment.amount) || 0), 0)
    ), [installments]);
    const singlePaymentAmount = Number(installments[0]?.amount) || 0;
    const singlePaymentRemaining = Math.max(0, reviewedNonRecurringTotal - singlePaymentAmount);

    const validationMessage = useMemo(() => {
        if (!acceptance) return 'Nenhum aceite selecionado.';

        const hasNonRecurring = reviewedNonRecurringTotal > 0.01;
        const hasRecurringMonthly = reviewedMonthlyFee > 0.01;

        if (hasRecurringMonthly && !billingStartDate) {
            return 'Informe a data de inicio da cobranca recorrente.';
        }

        if (mode === 'no_non_recurring') {
            return null;
        }

        if (!hasNonRecurring) {
            return 'Este contrato nao possui componente nao recorrente.';
        }

        if (mode === 'single_payment' && installments.length !== 1) {
            return 'Pagamento unico exige exatamente 1 parcela.';
        }

        if (mode === 'installments' && installments.length < 2) {
            return 'Parcelado exige pelo menos 2 parcelas.';
        }

        if (installments.some((installment) => !installment.expected_date)) {
            return 'Todas as parcelas precisam de data prevista.';
        }

        if (installments.some((installment) => (Number(installment.amount) || 0) <= 0)) {
            return 'Todas as parcelas precisam ter valor maior que zero.';
        }

        if (Math.abs(allocatedTotal - reviewedNonRecurringTotal) > 0.01) {
            return 'A soma das parcelas precisa fechar exatamente o valor nao recorrente.';
        }

        return null;
    }, [acceptance, allocatedTotal, billingStartDate, installments, mode, reviewedMonthlyFee, reviewedNonRecurringTotal]);

    const canSave = !validationMessage && !isSaving;
    const disableRecurringModes = reviewedNonRecurringTotal <= 0.01;
    const hasDetectedNonRecurring = reviewedNonRecurringTotal > 0.01;

    if (!isOpen || !acceptance) return null;

    const applyMode = (nextMode: FinancialReviewMode) => {
        setMode(nextMode);

        if (nextMode === 'no_non_recurring') {
            setInstallments([]);
            return;
        }

        if (nextMode === 'single_payment') {
            setInstallments(buildDefaultSinglePayment(acceptance.acceptedAt, reviewedNonRecurringTotal));
            return;
        }

        setInstallments(buildDefaultSplitInstallments(reviewedNonRecurringTotal));
    };

    const updateInstallment = (index: number, field: keyof FinancialReviewInstallmentInput, value: string) => {
        setInstallments((current) => current.map((installment, currentIndex) => (
            currentIndex === index
                ? { ...installment, [field]: value }
                : installment
        )));
    };

    const addInstallment = () => {
        setInstallments((current) => [...current, { label: '', amount: '', expected_date: '' }]);
    };

    const convertSinglePaymentToTwoInstallments = () => {
        const firstInstallment = installments[0];
        const firstAmount = Number(firstInstallment?.amount) || 0;
        const remainingAmount = Math.max(0, reviewedNonRecurringTotal - firstAmount);

        setMode('installments');
        setInstallments([
            {
                label: firstInstallment?.label || 'Parcela 1',
                amount: toAmountInputValue(firstAmount),
                expected_date: firstInstallment?.expected_date || (acceptance.acceptedAt ? acceptance.acceptedAt.split('T')[0] : ''),
            },
            {
                label: 'Parcela 2',
                amount: toAmountInputValue(remainingAmount),
                expected_date: '',
            },
        ]);
    };

    const removeInstallment = (index: number) => {
        setInstallments((current) => current.filter((_, currentIndex) => currentIndex !== index));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!canSave) return;
        await onSave(mode, installments, billingStartDate, reviewedMonthlyFee, reviewedNonRecurringTotal);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-4xl bg-white dark:bg-neutral-900 rounded-c4 shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
                    <div>
                        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Revisao Financeira</h2>
                        <p className="text-sm text-neutral-500 dark:text-neutral-400">
                            Ajuste os valores do contrato, o inicio da recorrencia e o cronograma de cobranca.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                    >
                        <X size={22} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Empresa</span>
                            <p className="mt-2 text-base font-bold text-neutral-900 dark:text-white">{acceptance.companyDisplayName}</p>
                        </div>
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Recorrente mensal</span>
                            <p className="mt-2 text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(reviewedMonthlyFee)}</p>
                        </div>
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Valor pontual detectado</span>
                            <p className="mt-2 text-base font-bold text-blue-600 dark:text-blue-400">{formatCurrency(reviewedNonRecurringTotal)}</p>
                            <div className="mt-2 flex items-center gap-1 text-[11px] text-neutral-400">
                                <Calendar size={12} />
                                <span>Aceite em {new Date(acceptance.acceptedAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <p className="text-sm font-bold text-neutral-900 dark:text-white">Mensalidade recorrente</p>
                            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                Ajuste o valor mensal que deve entrar no MRR.
                            </p>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={monthlyFeeInput}
                                onChange={(event) => setMonthlyFeeInput(event.target.value)}
                                placeholder="0,00"
                                className="mt-3 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                            />
                        </div>
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <p className="text-sm font-bold text-neutral-900 dark:text-white">Valor pontual total</p>
                            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                Informe o total que deve ser cobrado fora da recorrencia.
                            </p>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={nonRecurringTotalInput}
                                onChange={(event) => setNonRecurringTotalInput(event.target.value)}
                                placeholder="0,00"
                                className="mt-3 w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                            />
                        </div>
                    </div>

                    {reviewedMonthlyFee > 0.01 && (
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                <div>
                                    <p className="text-sm font-bold text-neutral-900 dark:text-white">Inicio da cobranca recorrente</p>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                        Defina a primeira competencia de cobranca. Ex.: assinou em fevereiro, mas comeca a pagar em abril.
                                    </p>
                                </div>
                                <div className="w-full md:w-64">
                                    <input
                                        type="date"
                                        value={billingStartDate}
                                        onChange={(event) => setBillingStartDate(event.target.value)}
                                        className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => applyMode('no_non_recurring')}
                            className={`rounded-c4 border px-4 py-4 text-left transition-all ${mode === 'no_non_recurring'
                                ? 'border-brand-coral bg-red-50 dark:bg-red-950/20 shadow-sm'
                                : 'border-neutral-200 dark:border-neutral-800 hover:border-brand-coral/50'
                                }`}
                        >
                            <span className="block text-sm font-bold text-neutral-900 dark:text-white">Somente mensalidade recorrente</span>
                            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                                Use quando nao houver valor pontual ou quando o setup detectado estiver incorreto.
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => applyMode('single_payment')}
                            disabled={disableRecurringModes}
                            className={`rounded-c4 border px-4 py-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'single_payment'
                                ? 'border-brand-coral bg-red-50 dark:bg-red-950/20 shadow-sm'
                                : 'border-neutral-200 dark:border-neutral-800 hover:border-brand-coral/50'
                                }`}
                        >
                            <span className="block text-sm font-bold text-neutral-900 dark:text-white">Valor pontual em 1 parcela</span>
                            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                                Lance o valor pontual inteiro em uma data definida pelo gestor.
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => applyMode('installments')}
                            disabled={disableRecurringModes}
                            className={`rounded-c4 border px-4 py-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mode === 'installments'
                                ? 'border-brand-coral bg-red-50 dark:bg-red-950/20 shadow-sm'
                                : 'border-neutral-200 dark:border-neutral-800 hover:border-brand-coral/50'
                                }`}
                        >
                            <span className="block text-sm font-bold text-neutral-900 dark:text-white">Valor pontual parcelado</span>
                            <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                                Cadastre valor e data exata de cada recebimento.
                            </span>
                        </button>
                    </div>

                    {disableRecurringModes && (
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                            Informe um valor pontual maior que zero para liberar pagamento unico ou parcelado.
                        </div>
                    )}

                    {mode === 'no_non_recurring' && hasDetectedNonRecurring && (
                        <div className="rounded-c4 border border-amber-300/40 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                            Ao salvar, esse contrato sera tratado como somente recorrente. O valor pontual detectado acima sera ignorado na projecao.
                        </div>
                    )}

                    {mode !== 'no_non_recurring' && (
                        <div className="rounded-c4 border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
                                <div>
                                    <p className="text-sm font-bold text-neutral-900 dark:text-white">
                                        {mode === 'single_payment' ? 'Recebimento unico' : 'Cronograma de recebimento'}
                                    </p>
                                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                        O total do valor pontual precisa fechar em {formatCurrency(reviewedNonRecurringTotal)}.
                                    </p>
                                </div>
                                {mode === 'installments' && (
                                    <button
                                        type="button"
                                        onClick={addInstallment}
                                        className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs font-bold text-neutral-700 dark:text-neutral-200 hover:border-brand-coral hover:text-brand-coral transition-colors"
                                    >
                                        <Plus size={14} />
                                        Adicionar parcela
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 p-4">
                                {installments.map((installment, index) => (
                                    <div key={`${mode}-${index}`} className="grid gap-3 md:grid-cols-[1.4fr_0.9fr_0.9fr_auto]">
                                        <input
                                            type="text"
                                            value={installment.label}
                                            onChange={(event) => updateInstallment(index, 'label', event.target.value)}
                                            placeholder={mode === 'single_payment' ? 'Recebimento unico' : `Parcela ${index + 1}`}
                                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                        />
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={installment.amount}
                                            onChange={(event) => updateInstallment(index, 'amount', event.target.value)}
                                            placeholder="0,00"
                                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                        />
                                        <input
                                            type="date"
                                            value={installment.expected_date}
                                            onChange={(event) => updateInstallment(index, 'expected_date', event.target.value)}
                                            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white outline-none focus:border-brand-coral transition-colors"
                                        />
                                        {mode === 'installments' ? (
                                            <button
                                                type="button"
                                                onClick={() => removeInstallment(index)}
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-400 hover:text-red-500 hover:border-red-300 transition-colors"
                                                title="Remover parcela"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        ) : (
                                            <div />
                                        )}
                                    </div>
                                ))}

                                {mode === 'single_payment' && singlePaymentAmount > 0.01 && singlePaymentRemaining > 0.01 && (
                                    <div className="flex flex-col gap-3 rounded-xl border border-amber-300/40 bg-amber-50/70 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                                        <p className="text-amber-800 dark:text-amber-200">
                                            Ainda faltam {formatCurrency(singlePaymentRemaining)} para fechar o total. Se o cliente vai pagar em mais de uma vez, transforme este lancamento em parcelas.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={convertSinglePaymentToTwoInstallments}
                                            className="inline-flex items-center justify-center rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-800 transition-colors hover:border-brand-coral hover:text-brand-coral dark:text-amber-200"
                                        >
                                            Transformar em 2 parcelas
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 rounded-c4 border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-neutral-600 dark:text-neutral-300">Total do cronograma</span>
                            <span className="font-bold text-neutral-900 dark:text-white">{formatCurrency(allocatedTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold text-neutral-600 dark:text-neutral-300">Valor pontual considerado</span>
                            <span className="font-bold text-neutral-900 dark:text-white">{formatCurrency(reviewedNonRecurringTotal)}</span>
                        </div>
                        {validationMessage ? (
                            <p className="text-xs font-semibold text-red-500">{validationMessage}</p>
                        ) : (
                            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                Validacao pronta. A mensalidade recorrente segue no MRR normalmente.
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-c4 bg-neutral-100 dark:bg-neutral-800 px-4 py-3 font-bold text-neutral-600 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!canSave}
                            className="flex-1 rounded-c4 bg-brand-coral px-4 py-3 font-bold text-white shadow-lg shadow-brand-coral/20 hover:bg-brand-coral/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Salvando...' : 'Salvar revisao'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default FinancialReviewModal;
