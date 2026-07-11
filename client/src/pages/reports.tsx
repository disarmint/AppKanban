import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminNav } from "@/components/admin-nav";
import { formatRuDate } from "@shared/ru-date";
import { ArrowLeft, FileSpreadsheet, Download } from "lucide-react";

type CompletedRow = {
  id: number;
  title: string;
  goal: string;
  department: string;
  assignee: string | null;
  completedAt: number | null;
  deadline: string;
};

export default function Reports() {
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const rangeQs = new URLSearchParams();
  if (from) rangeQs.set("from", from);
  if (to) rangeQs.set("to", to);
  const qs = rangeQs.toString();

  const { data: rows = [], isLoading } = useQuery<CompletedRow[]>({
    queryKey: ["/api/reports/completed", from, to],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/reports/completed${qs ? `?${qs}` : ""}`);
      return res.json();
    },
  });

  async function exportXlsx() {
    setExporting(true);
    try {
      const res = await apiRequest("GET", `/api/reports/completed.xlsx${qs ? `?${qs}` : ""}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "completed-tasks.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Не удалось выгрузить отчёт", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <FileSpreadsheet className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-reports-title">
                Отчёты
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Завершённые задачи за период
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <AdminNav />
            <Link href="/">
              <Button variant="outline" data-testid="link-back-to-board">
                <ArrowLeft className="h-4 w-4" />
                К доске
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <Card className="p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <FieldLabel htmlFor="from" className="text-xs">
              С даты
            </FieldLabel>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-from" />
          </div>
          <div className="flex-1">
            <FieldLabel htmlFor="to" className="text-xs">
              По дату
            </FieldLabel>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-to" />
          </div>
          <Button onClick={exportXlsx} disabled={exporting || rows.length === 0} data-testid="button-export-xlsx">
            <Download className="h-4 w-4" />
            Экспорт в Excel
          </Button>
        </Card>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-completed">
            Нет завершённых задач за выбранный период
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Задача</th>
                  <th className="p-3 font-medium">Отдел</th>
                  <th className="p-3 font-medium">Ответственный</th>
                  <th className="p-3 font-medium">Завершена</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0" data-testid={`row-report-${r.id}`}>
                    <td className="p-3">{r.title}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {r.department}
                      </Badge>
                    </td>
                    <td className="p-3">{r.assignee ?? "—"}</td>
                    <td className="p-3 tabular-nums">
                      {r.completedAt ? formatRuDate(new Date(r.completedAt)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </div>
  );
}
