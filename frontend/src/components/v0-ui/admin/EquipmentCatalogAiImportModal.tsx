import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './EquipmentCatalogAiImportModal.module.css';
import {
  createEquipmentCatalogWithExistingManual,
  getManualAiExtraction,
  triggerManualAiExtraction,
  uploadStandaloneManual,
  type EquipmentManualExtractionCandidateOut,
  type EquipmentManualExtractionOut,
} from '../../../api/equipmentCatalog';
import { normalizeAcTechnicalData } from '../../../lib/acEquipmentFields';

/** Formato mínimo de categoria necessário aqui (evita import circular com AdminEquipmentCatalogView). */
export interface AiImportCategoryOption {
  id: string;
  name: string;
  iconKey?: string;
}

export interface EquipmentCatalogAiImportModalProps {
  isOpen: boolean;
  categoryOptions: AiImportCategoryOption[];
  onClose: () => void;
  /** Disparado após cadastrar ao menos um modelo com sucesso — o container deve recarregar a lista. */
  onImported: () => void;
}

type Step = 'upload' | 'processing' | 'review' | 'done';

interface CandidateDraft {
  key: string;
  selected: boolean;
  categoryId: string;
  marca: string;
  modelo: string;
  modelEvaporador: string;
  modelCondensadora: string;
  capacidade: string;
  fluidoRefrigerante: string;
  tensao: string;
  tecnologia: string;
  especificacoesTecnicas: Record<string, string | number | boolean>;
  confianca: string | null;
  status: 'pending' | 'saving' | 'saved' | 'updated' | 'unchanged' | 'duplicate' | 'error';
  errorMessage?: string;
}

const DONE_STATUSES = new Set<CandidateDraft['status']>(['saved', 'updated', 'unchanged']);

function isCandidateLocked(status: CandidateDraft['status']): boolean {
  return DONE_STATUSES.has(status);
}

const CATEGORY_ALIASES: Record<string, string[]> = {
  ar_condicionado: ['ar-condicionado', 'ar condicionado', 'split', 'ac'],
  climatizador: ['climatizador'],
  geladeira: ['geladeira', 'refrigerador', 'refrigeracao', 'refrigeração'],
  freezer: ['freezer'],
  camara_fria: ['camara fria', 'câmara fria', 'camara_fria', 'câmara_fria'],
};

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function guessCategoryId(categories: AiImportCategoryOption[], suggested: string | null): string {
  if (categories.length === 0) return '';
  if (!suggested) return categories[0].id;
  const norm = normalize(suggested);

  const iconMatch = categories.find((c) => normalize(c.iconKey || '') === norm);
  if (iconMatch) return iconMatch.id;

  const nameMatch = categories.find((c) => {
    const catName = normalize(c.name);
    return catName.includes(norm) || norm.includes(catName);
  });
  if (nameMatch) return nameMatch.id;

  for (const [key, words] of Object.entries(CATEGORY_ALIASES)) {
    if (key === norm || words.some((w) => norm.includes(w))) {
      const found = categories.find(
        (c) => normalize(c.iconKey || '') === key || words.some((w) => normalize(c.name).includes(w)),
      );
      if (found) return found.id;
    }
  }
  return categories[0].id;
}

function candidateFromExtraction(
  item: EquipmentManualExtractionCandidateOut,
  index: number,
  categories: AiImportCategoryOption[],
): CandidateDraft {
  // Quando a IA extrai o mesmo código para evaporadora e condensadora, é uma unidade única
  // (ex: high-wall) e não um split com peças vendidas separadamente — preenche "Modelo" também
  // para não deixar o campo em branco na revisão nem duplicar o código no cadastro final.
  const evap = (item.modelo_evaporadora || '').trim();
  const cond = (item.modelo_condensadora || '').trim();
  const modeloUnificado = item.modelo || (evap && evap.toLowerCase() === cond.toLowerCase() ? evap : '');
  return {
    key: `${index}-${item.marca || ''}-${item.modelo || item.modelo_evaporadora || ''}`,
    selected: true,
    categoryId: guessCategoryId(categories, item.categoria_sugerida),
    marca: item.marca || '',
    modelo: modeloUnificado,
    modelEvaporador: item.modelo_evaporadora || '',
    modelCondensadora: item.modelo_condensadora || '',
    capacidade: item.capacidade || '',
    fluidoRefrigerante: item.fluido_refrigerante || '',
    tensao: item.tensao || '',
    tecnologia: item.tecnologia || '',
    especificacoesTecnicas: item.especificacoes_tecnicas || {},
    confianca: item.confianca,
    status: 'pending',
  };
}

function confidenceClass(confianca: string | null): string {
  const norm = (confianca || '').toLowerCase();
  if (norm === 'alta') return styles.confidenceAlta;
  if (norm === 'baixa') return styles.confidenceBaixa;
  return styles.confidenceMedia;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200; // ~10 minutos (extração pode incluir buscas em sites oficiais)

export const EquipmentCatalogAiImportModal: React.FC<EquipmentCatalogAiImportModalProps> = ({
  isOpen,
  categoryOptions,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [manualId, setManualId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [processingLabel, setProcessingLabel] = useState('Enviando manual...');
  const [extraction, setExtraction] = useState<EquipmentManualExtractionOut | null>(null);
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptDroppedFile = useCallback((dropped: File | null | undefined) => {
    if (!dropped) return;
    const isPdf = dropped.type === 'application/pdf' || dropped.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Selecione um arquivo PDF do manual.');
      return;
    }
    setError('');
    setFile(dropped);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      acceptDroppedFile(e.dataTransfer.files?.[0]);
    },
    [acceptDroppedFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const reset = useCallback(() => {
    setStep('upload');
    setTitle('');
    setFile(null);
    setManualId(null);
    setError('');
    setExtraction(null);
    setCandidates([]);
    setSaving(false);
    setIsDragging(false);
    pollAttemptsRef.current = 0;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const pollExtraction = useCallback(
    (id: string) => {
      const check = async () => {
        pollAttemptsRef.current += 1;
        try {
          const result = await getManualAiExtraction(id);
          if (result.extraction_status === 'ready') {
            setExtraction(result);
            setCandidates(result.equipamentos.map((item, idx) => candidateFromExtraction(item, idx, categoryOptions)));
            setStep('review');
            return;
          }
          if (result.extraction_status === 'failed') {
            setError(result.extraction_error || 'A IA não conseguiu ler este manual.');
            setStep('upload');
            return;
          }
          if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
            setError('A leitura do manual está demorando mais que o esperado. Tente novamente em instantes.');
            setStep('upload');
            return;
          }
          setProcessingLabel(
            pollAttemptsRef.current > 15
              ? 'A IA está pesquisando nomenclatura e especificações completas nos sites oficiais dos fabricantes...'
              : 'A IA está lendo o manual e identificando os equipamentos...',
          );
          pollTimerRef.current = setTimeout(() => void check(), POLL_INTERVAL_MS);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Falha ao consultar o progresso da extração.');
          setStep('upload');
        }
      };
      void check();
    },
    [categoryOptions],
  );

  const handleStartExtraction = useCallback(async () => {
    if (!file) {
      setError('Selecione um arquivo PDF do manual.');
      return;
    }
    setError('');
    setStep('processing');
    setProcessingLabel('Enviando manual para o armazenamento...');
    try {
      const uploaded = await uploadStandaloneManual(file, title);
      setManualId(uploaded.id);
      setProcessingLabel('A IA está lendo o manual e identificando os equipamentos...');
      await triggerManualAiExtraction(uploaded.id);
      pollAttemptsRef.current = 0;
      pollExtraction(uploaded.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível processar o manual.');
      setStep('upload');
    }
  }, [file, title, pollExtraction]);

  const updateCandidate = (key: string, patch: Partial<CandidateDraft>) => {
    setCandidates((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const handleConfirmSelected = useCallback(async () => {
    if (!manualId) return;
    const toSave = candidates.filter((c) => c.selected && c.status !== 'saved');
    if (toSave.length === 0) {
      setError('Selecione ao menos um equipamento para cadastrar.');
      return;
    }
    setSaving(true);
    setError('');
    let anySaved = false;
    const finalStatus = new Map<string, CandidateDraft['status']>();

    for (const candidate of toSave) {
      if (!candidate.categoryId) {
        updateCandidate(candidate.key, { status: 'error', errorMessage: 'Selecione uma categoria.' });
        finalStatus.set(candidate.key, 'error');
        continue;
      }
      if (!candidate.marca.trim()) {
        updateCandidate(candidate.key, { status: 'error', errorMessage: 'Informe a marca.' });
        finalStatus.set(candidate.key, 'error');
        continue;
      }
      updateCandidate(candidate.key, { status: 'saving' });

      const rawSpecs: Record<string, string> = {};
      for (const [k, v] of Object.entries(candidate.especificacoesTecnicas || {})) {
        if (v === null || v === undefined) continue;
        const text = String(v).trim();
        if (text) rawSpecs[k] = text;
      }
      const technicalData: Record<string, string | number | boolean> = {
        ...normalizeAcTechnicalData(rawSpecs),
      };
      if (candidate.capacidade.trim()) technicalData.capacity = candidate.capacidade.trim();
      if (candidate.fluidoRefrigerante.trim()) technicalData.fluid_type = candidate.fluidoRefrigerante.trim();
      if (candidate.tensao.trim()) technicalData.voltage = candidate.tensao.trim();
      if (candidate.tecnologia.trim()) technicalData.tecnologia = candidate.tecnologia.trim();
      // Algumas categorias (ex: Ar-Condicionado) têm o campo customizado obrigatório
      // "Modelo do Equipamento" (key: modelo_do_equipamento) que esta tela não coleta
      // separadamente — preenche com o identificador de modelo já capturado para não
      // bloquear o cadastro com um erro de campo obrigatório que não aparece aqui.
      if (!technicalData.modelo_do_equipamento) {
        const modelIdentifier =
          candidate.modelo.trim() ||
          [candidate.modelEvaporador.trim(), candidate.modelCondensadora.trim()].filter(Boolean).join(' + ');
        if (modelIdentifier) technicalData.modelo_do_equipamento = modelIdentifier;
      }

      const form = new FormData();
      form.set('category_id', candidate.categoryId);
      form.set('brand', candidate.marca.trim());
      form.set('manual_id', manualId);
      // Se o modelo já existir, preenche só o que estiver faltando (não sobrescreve).
      form.set('merge_if_exists', 'true');
      if (candidate.modelo.trim()) form.set('model', candidate.modelo.trim());
      if (candidate.modelEvaporador.trim()) form.set('model_evaporator', candidate.modelEvaporador.trim());
      if (candidate.modelCondensadora.trim()) form.set('model_condenser', candidate.modelCondensadora.trim());
      if (Object.keys(technicalData).length > 0) form.set('technical_data', JSON.stringify(technicalData));

      try {
        const result = await createEquipmentCatalogWithExistingManual(form);
        const status =
          result.action === 'updated'
            ? 'updated'
            : result.action === 'unchanged'
              ? 'unchanged'
              : 'saved';
        const filledHint =
          result.filledFields.length > 0
            ? `Campos preenchidos: ${result.filledFields.slice(0, 8).join(', ')}${
                result.filledFields.length > 8 ? '…' : ''
              }`
            : undefined;
        updateCandidate(candidate.key, {
          status,
          errorMessage:
            status === 'unchanged'
              ? 'Já existia no catálogo e não faltava informação para completar.'
              : status === 'updated'
                ? filledHint
                : undefined,
        });
        finalStatus.set(candidate.key, status);
        anySaved = true;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Falha ao cadastrar este equipamento.';
        const isDuplicate = message.toLowerCase().includes('já está cadastrado') || message.toLowerCase().includes('já existe');
        const status = isDuplicate ? 'duplicate' : 'error';
        updateCandidate(candidate.key, { status, errorMessage: message });
        finalStatus.set(candidate.key, status);
      }
    }

    setSaving(false);
    if (anySaved) onImported();

    // Se todo item selecionado terminou ok (criado/atualizado/já completo),
    // avança para a tela de conclusão em vez de deixar o admin preso na revisão.
    const allSelectedSaved = candidates.every((c) => {
      if (!c.selected) return true;
      const status = finalStatus.get(c.key) ?? c.status;
      return DONE_STATUSES.has(status);
    });
    if (allSelectedSaved) {
      setStep('done');
    }
  }, [candidates, manualId, onImported]);

  if (!isOpen) return null;

  const readyCount = candidates.filter((c) => isCandidateLocked(c.status)).length;
  const totalSelected = candidates.filter((c) => c.selected).length;

  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={saving ? undefined : onClose} aria-hidden />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.headerTitle}>Cadastrar equipamentos via manual (IA)</h2>
            <p className={styles.headerSubtitle}>
              Envie o PDF do manual — a IA lê o documento, sugere marca/modelo/especificações de cada
              equipamento encontrado e extrai a tabela de códigos de erro para a Iris.
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar" disabled={saving}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {error ? <p className={`${styles.banner} ${styles.bannerError}`}>{error}</p> : null}

          {step === 'upload' ? (
            <>
              <div>
                <label className={styles.fieldLabel}>Título do manual (opcional)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Manual unificado — Springer Midea 9000-18000 BTUs"
                />
              </div>
              <div>
                <label className={styles.fieldLabel}>Arquivo PDF do manual *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => acceptDroppedFile(e.target.files?.[0] ?? null)}
                />
                <div
                  className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {file ? (
                    <span>{file.name}</span>
                  ) : (
                    <>
                      <span>Clique para escolher ou arraste o PDF do manual aqui</span>
                      <span style={{ fontSize: '0.75rem' }}>O arquivo será salvo no S3 (pasta manuais/)</span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {step === 'processing' ? (
            <div className={styles.progressWrap}>
              <div className={styles.spinner} aria-hidden />
              <p>{processingLabel}</p>
              <p style={{ fontSize: '0.75rem' }}>
                Manuais grandes ou escaneados (só imagem) podem levar alguns minutos — o sistema usa OCR
                automaticamente quando o PDF não tem texto selecionável. Aguarde aqui.
              </p>
            </div>
          ) : null}

          {step === 'done' ? (
            <div className={styles.progressWrap}>
              <div style={{ fontSize: '2.5rem', lineHeight: 1 }} aria-hidden>
                ✅
              </div>
              <p>
                <strong>
                  {readyCount} equipamento{readyCount === 1 ? '' : 's'} cadastrado{readyCount === 1 ? '' : 's'} no
                  catálogo com sucesso.
                </strong>
              </p>
              {extraction && extraction.error_codes.length > 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  {extraction.error_codes.length} código(s) de erro salvos — a Iris já pode usá-los para ajudar
                  técnicos em campo.
                </p>
              ) : null}
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                O manual em PDF está salvo no S3 e disponível para download pelos técnicos.
              </p>
            </div>
          ) : null}

          {step === 'review' && extraction ? (
            <>
              {extraction.avisos.length > 0 ? (
                <div className={`${styles.banner} ${styles.bannerWarning}`}>
                  {extraction.avisos.map((a, i) => (
                    <div key={i}>{a}</div>
                  ))}
                </div>
              ) : null}

              <div className={styles.summaryRow}>
                <strong>
                  {candidates.length} equipamento{candidates.length === 1 ? '' : 's'} identificado
                  {candidates.length === 1 ? '' : 's'} — revise antes de cadastrar
                </strong>
                <div>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setCandidates((prev) => prev.map((c) => ({ ...c, selected: true })))}
                  >
                    Selecionar todos
                  </button>
                  {' · '}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => setCandidates((prev) => prev.map((c) => ({ ...c, selected: false })))}
                  >
                    Desmarcar todos
                  </button>
                </div>
              </div>

              <div className={styles.candidateList}>
                {candidates.map((candidate) => {
                  const specEntries = Object.entries(candidate.especificacoesTecnicas || {});
                  return (
                    <div
                      key={candidate.key}
                      className={`${styles.candidateCard} ${!candidate.selected ? styles.candidateCardDisabled : ''}`}
                    >
                      <div className={styles.candidateHeader}>
                        <div className={styles.candidateHeaderLeft}>
                          <input
                            type="checkbox"
                            checked={candidate.selected}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { selected: e.target.checked })}
                          />
                          <strong>
                            {candidate.marca || 'Marca não identificada'} · {candidate.modelo || candidate.modelEvaporador || '—'}
                          </strong>
                          {candidate.confianca ? (
                            <span className={`${styles.confidenceBadge} ${confidenceClass(candidate.confianca)}`}>
                              confiança {candidate.confianca}
                            </span>
                          ) : null}
                        </div>
                        {candidate.status === 'saved' ? (
                          <span className={`${styles.statusChip} ${styles.statusSaved}`}>Cadastrado</span>
                        ) : candidate.status === 'updated' ? (
                          <span className={`${styles.statusChip} ${styles.statusSaved}`}>Atualizado (completou dados)</span>
                        ) : candidate.status === 'unchanged' ? (
                          <span className={`${styles.statusChip} ${styles.statusDuplicate}`}>Já completo no catálogo</span>
                        ) : candidate.status === 'duplicate' ? (
                          <span className={`${styles.statusChip} ${styles.statusDuplicate}`}>Já existe no catálogo</span>
                        ) : candidate.status === 'error' ? (
                          <span className={`${styles.statusChip} ${styles.statusError}`}>Erro</span>
                        ) : null}
                      </div>

                      {candidate.errorMessage ? (
                        <p
                          className={`${styles.banner} ${
                            candidate.status === 'error'
                              ? styles.bannerError
                              : candidate.status === 'updated'
                                ? styles.banner
                                : styles.bannerWarning
                          }`}
                        >
                          {candidate.errorMessage}
                        </p>
                      ) : null}

                      <div className={styles.fieldsGrid}>
                        <div>
                          <label className={styles.fieldLabel}>Categoria</label>
                          <select
                            className={styles.select}
                            value={candidate.categoryId}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { categoryId: e.target.value })}
                          >
                            <option value="">Selecione...</option>
                            {categoryOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Marca</label>
                          <input
                            className={styles.input}
                            value={candidate.marca}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { marca: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Modelo</label>
                          <input
                            className={styles.input}
                            value={candidate.modelo}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { modelo: e.target.value })}
                            placeholder="Quando não for split (evap/cond)"
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Modelo evaporadora</label>
                          <input
                            className={styles.input}
                            value={candidate.modelEvaporador}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { modelEvaporador: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Modelo condensadora</label>
                          <input
                            className={styles.input}
                            value={candidate.modelCondensadora}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { modelCondensadora: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Capacidade</label>
                          <input
                            className={styles.input}
                            value={candidate.capacidade}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { capacidade: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Fluido refrigerante</label>
                          <input
                            className={styles.input}
                            value={candidate.fluidoRefrigerante}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { fluidoRefrigerante: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className={styles.fieldLabel}>Tensão</label>
                          <input
                            className={styles.input}
                            value={candidate.tensao}
                            disabled={isCandidateLocked(candidate.status)}
                            onChange={(e) => updateCandidate(candidate.key, { tensao: e.target.value })}
                          />
                        </div>
                      </div>

                      {specEntries.length > 0 ? (
                        <details className={styles.specsDetails}>
                          <summary>Ver {specEntries.length} especificações adicionais extraídas do manual</summary>
                          <ul className={styles.specsList}>
                            {specEntries.map(([k, v]) => (
                              <li key={k} className={styles.specChip}>
                                {k.replace(/_/g, ' ')}:{' '}
                                {typeof v === 'string' && /^https?:\/\//.test(v) ? (
                                  <a href={v} target="_blank" rel="noreferrer">
                                    {v}
                                  </a>
                                ) : (
                                  String(v)
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {extraction.error_codes.length > 0 ? (
                <div className={styles.errorCodesBox}>
                  <strong>{extraction.error_codes.length} código(s) de erro extraído(s)</strong>{' '}
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    (já salvos — a Iris usará esta tabela para responder técnicos em campo)
                  </span>
                  <details>
                    <summary className={styles.linkBtn} style={{ marginTop: '0.4rem' }}>
                      Ver códigos extraídos
                    </summary>
                    <table className={styles.errorCodesTable}>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Título</th>
                          <th>Causa provável</th>
                          <th>Ação recomendada</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extraction.error_codes.map((ec) => (
                          <tr key={ec.id}>
                            <td>{ec.codigo}</td>
                            <td>{ec.titulo}</td>
                            <td>{ec.causa_provavel || '—'}</td>
                            <td>{ec.acao_recomendada || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className={styles.footer}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {step === 'review' && readyCount > 0 ? `${readyCount} equipamento(s) já cadastrado(s) nesta sessão.` : ''}
          </span>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={`${styles.btn} ${step === 'done' ? styles.btnPrimary : styles.btnSecondary}`}
              onClick={onClose}
              disabled={saving}
            >
              {readyCount > 0 ? 'Concluir' : 'Cancelar'}
            </button>
            {step === 'upload' ? (
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void handleStartExtraction()} disabled={!file}>
                Ler manual com IA
              </button>
            ) : null}
            {step === 'review' ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => void handleConfirmSelected()}
                disabled={saving || totalSelected === 0}
              >
                {saving ? 'Cadastrando...' : `Cadastrar ${totalSelected} selecionado(s)`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentCatalogAiImportModal;
