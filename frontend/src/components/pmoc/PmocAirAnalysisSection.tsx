import { ExternalLink, Loader2, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  listPmocAirAnalyses,
  uploadPmocAirAnalysisSemestral,
  type PmocAirQualityAnalysisOut,
} from "../../api/pmoc";
import { formatDateShortPt } from "../../lib/pmocAirAnalysisUtils";
import { toast } from "../../lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import "./pmoc-air-analysis.tailwind.css";

export type PmocAirAnalysisSectionProps = {
  pmocId: number;
  canUpload?: boolean;
  onAnalysesChange?: (rows: PmocAirQualityAnalysisOut[]) => void;
};

export function PmocAirAnalysisSection({
  pmocId,
  canUpload = true,
  onAnalysesChange,
}: PmocAirAnalysisSectionProps) {
  const dialogTitleId = useId();
  const dialogDescId = useId();

  const [rows, setRows] = useState<PmocAirQualityAnalysisOut[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [analiseDate, setAnaliseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const onAnalysesChangeRef = useRef(onAnalysesChange);
  onAnalysesChangeRef.current = onAnalysesChange;

  const hasFetchedRef = useRef(false);
  const fetchedPmocIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(pmocId)) {
      setRows([]);
      setIsInitialLoading(false);
      hasFetchedRef.current = false;
      fetchedPmocIdRef.current = null;
      return;
    }

    if (hasFetchedRef.current && fetchedPmocIdRef.current === pmocId) {
      return;
    }

    let cancelled = false;
    setIsInitialLoading(true);

    void (async () => {
      try {
        const data = await listPmocAirAnalyses(pmocId);
        if (cancelled) return;
        setRows(data);
        onAnalysesChangeRef.current?.(data);
        hasFetchedRef.current = true;
        fetchedPmocIdRef.current = pmocId;
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Não foi possível carregar análises de ar.");
        setRows([]);
      } finally {
        if (!cancelled) setIsInitialLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pmocId]);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo PDF.");
      return;
    }
    if (!analiseDate) {
      toast.error("Informe a data da coleta/análise.");
      return;
    }
    setIsUploading(true);
    try {
      const created = await uploadPmocAirAnalysisSemestral(pmocId, selectedFile, analiseDate);
      setRows((prev) => {
        const next = [created, ...prev.filter((row) => row.id !== created.id)];
        onAnalysesChangeRef.current?.(next);
        return next;
      });
      toast.success("Análise de ar enviada com sucesso.");
      setModalOpen(false);
      setSelectedFile(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar análise de ar.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <Card className="rounded-xl border border-[#e2e8f0] bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle
              className="text-lg text-[#0f172a]"
              style={{ fontFamily: "Poppins, Inter, sans-serif" }}
            >
              Análises de Qualidade do Ar (Semestral)
            </CardTitle>
            <p className="mt-1 text-sm text-[#64748b]">
              Histórico de laudos laboratoriais em PDF — obrigatório para instalações acima de 60.000 BTUs.
            </p>
          </div>
          {canUpload ? (
            <Button
              variant="outline"
              style={{
                padding: "10px 14px",
                fontWeight: 600,
                color: "#006FEE",
                borderColor: "#006FEE",
                borderRadius: "0.75rem",
              }}
              onClick={() => setModalOpen(true)}
              disabled={isInitialLoading}
            >
              <Upload className="h-4 w-4" aria-hidden />
              Enviar Nova Análise de Ar
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {isInitialLoading ? (
            <p className="flex items-center gap-2 text-sm text-[#64748b]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando histórico…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#64748b]">
              Nenhuma análise semestral registrada. Envie o laudo PDF do laboratório para iniciar o histórico.
            </p>
          ) : (
            <ul className="divide-y divide-[#e2e8f0] rounded-xl border border-[#e2e8f0]">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-[#0f172a]">
                      Coleta / laudo: {formatDateShortPt(row.analysis_date)}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      Próximo vencimento:{" "}
                      {row.next_due_date ? formatDateShortPt(row.next_due_date) : "—"}
                    </p>
                  </div>
                  {row.file_url ? (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#006FEE] hover:underline"
                    >
                      Visualizar Laudo do Ar
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-xs text-[#94a3b8]">PDF pendente</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={modalOpen} onOpenChange={(open) => !isUploading && setModalOpen(open)}>
        <AlertDialogContent wide labelledBy={dialogTitleId} describedBy={dialogDescId}>
          <AlertDialogHeader>
            <AlertDialogTitle id={dialogTitleId}>Nova Análise de Ar</AlertDialogTitle>
            <AlertDialogDescription id={dialogDescId}>
              Envie o laudo em PDF e informe a data da coleta ou emissão do laudo laboratorial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-[#475569]">
                Data da Coleta / Análise
                <input
                  type="date"
                  value={analiseDate}
                  disabled={isUploading}
                  onChange={(e) => setAnaliseDate(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-[#e2e8f0] px-3 text-sm text-[#0f172a] focus:border-[#006FEE] focus:outline-none focus:ring-2 focus:ring-[#006FEE]/20"
                />
              </label>
              <label className="block text-sm font-medium text-[#475569]">
                Laudo PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={isUploading}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full text-sm text-[#64748b] file:mr-3 file:rounded-lg file:border-0 file:bg-[#006FEE]/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#006FEE]"
                />
              </label>
              {selectedFile ? (
                <p className="text-xs text-[#64748b]">
                  Arquivo selecionado: <strong>{selectedFile.name}</strong>
                </p>
              ) : null}
              {isUploading ? (
                <p className="flex items-center gap-2 text-sm text-[#006FEE]">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Enviando laudo para o servidor…
                </p>
              ) : null}
            </div>
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUploading} onClick={() => setModalOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction disabled={isUploading || !selectedFile} onClick={() => void handleUpload()}>
              {isUploading ? "Enviando…" : "Enviar Laudo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
