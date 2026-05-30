import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, ChevronLeft } from 'lucide-react';
import { ToastHost } from '../../components/ToastHost';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { getFinanceDREReport } from '../../api/finance';
import { DREStackedBarChart } from '../../features/finance/components/DREStackedBarChart';
import {
  downloadDRECsv,
  mapMonthlyDREFromApi,
  type FinanceDREReportApi,
} from '../../features/finance/dreReportUtils';
import styles from './DREDashboardPage.module.css';

function money(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
}

const MONTH_OPTIONS = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export function DREDashboardPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finance', 'dre', month, year],
    queryFn: () => getFinanceDREReport({ month, year, history_months: 6 }),
  });

  const current = useMemo(
    () => (data ? mapMonthlyDREFromApi(data.current) : null),
    [data],
  );

  const history = useMemo(
    () => (data?.history ?? []).map(mapMonthlyDREFromApi),
    [data],
  );

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  function handleDownloadCsv() {
    if (!data) return;
    downloadDRECsv(data as FinanceDREReportApi);
  }

  return (
    <div className={styles.page}>
      <ToastHost />
      <header className={styles.header}>
        <div>
          <Link to="/app/finance/dashboard" className={styles.backLink}>
            <ChevronLeft size={18} aria-hidden />
            Financeiro
          </Link>
          <h1 className={styles.title}>DRE mensal</h1>
          <p className={styles.subtitle}>
            Demonstrativo com receitas de OS concluídas e custos pagos (variáveis e fixos).
          </p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.periodField}>
            Mês
            <select
              className={styles.select}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.periodField}>
            Ano
            <select
              className={styles.select}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={!data}
            onClick={handleDownloadCsv}
            title="Baixar CSV do histórico"
          >
            <Download size={16} aria-hidden />
            CSV
          </Button>
        </div>
      </header>

      {isLoading ? (
        <p className={styles.muted}>Carregando DRE…</p>
      ) : isError ? (
        <div className={styles.alert} role="alert">
          <p>{error instanceof Error ? error.message : 'Erro ao carregar DRE.'}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : current ? (
        <>
          <div className={styles.cards}>
            <Card>
              <CardHeader className={styles.cardHeader}>
                <CardTitle className={styles.cardTitle}>Receita bruta</CardTitle>
                <CardDescription>OS concluídas · recebimentos pagos</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={styles.cardValue}>{money(current.receitaBruta)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={styles.cardHeader}>
                <CardTitle className={styles.cardTitle}>Margem de contribuição</CardTitle>
                <CardDescription>Receita − custos variáveis</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className={`${styles.cardValue} ${
                    current.margemContribuicao < 0 ? styles.negative : ''
                  }`}
                >
                  {money(current.margemContribuicao)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={styles.cardHeader}>
                <CardTitle className={styles.cardTitle}>Custos fixos</CardTitle>
                <CardDescription>Despesas pagas sem vínculo com OS</CardDescription>
              </CardHeader>
              <CardContent>
                <p className={styles.cardValue}>{money(current.custosFixos)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={styles.cardHeader}>
                <CardTitle className={styles.cardTitle}>Lucro líquido</CardTitle>
                <CardDescription>Margem de contribuição − custos fixos</CardDescription>
              </CardHeader>
              <CardContent>
                <p
                  className={`${styles.cardValue} ${
                    current.lucroLiquido < 0 ? styles.negative : ''
                  }`}
                >
                  {money(current.lucroLiquido)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className={styles.chartCard}>
            <CardHeader>
              <CardTitle>Evolução (6 meses)</CardTitle>
              <CardDescription>Receita, custo variável e custo fixo por período</CardDescription>
            </CardHeader>
            <CardContent>
              <DREStackedBarChart history={history} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
