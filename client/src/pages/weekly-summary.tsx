import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminNav } from "@/components/admin-nav";
import { formatRuDate, parseIsoDate, toIsoDate } from "@shared/ru-date";
import { ArrowLeft, ClipboardList, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";

type WeeklySummary = {
  weekStart: string;
  weekEnd: string;
  overloadThreshold: number;
  completedCount: number;
  completedByDepartment: { departmentName: string; count: number }[];
  overdueList: {
    taskId: number;
    title: string;
    departmentName: string;
    assigneeName: string | null;
    deadlineDate: string | null;
    daysOverdue: number;
  }[];
  workloadByAssignee: {
    userId: number;
    username: string;
    activeTaskCount: number;
    overdueTaskCount: number;
  }[];
};

function currentMonday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toIsoDate(d);
}

function addDays(iso: string, n: number): string {
  const d = parseIsoDate(iso) ?? new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

function rangeLabel(startIso: string, endIso: string): string {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  return `${s ? formatRuDate(s) : startIso} — ${e ? formatRuDate(e) : endIso}`;
}

export default function WeeklySummary() {
  const [weekStart, setWeekStart] = useState(currentMonday());

  const { data, isLoading } = useQuery<WeeklySummary>({
    queryKey: ["/api/weekly-summary", weekStart],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/weekly-summary?weekStart=${weekStart}`);
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <ClipboardList className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-weekly-title">
                Еженедельная сводка
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Итоги команды за неделю
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

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Week navigation */}
        <Card className="p-4 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            data-testid="button-prev-week"
          >
            <ChevronLeft className="h-4 w-4" />
            Предыдущая неделя
          </Button>
          <div className="text-sm font-medium text-center" data-testid="text-week-range">
            {data ? rangeLabel(data.weekStart, data.weekEnd) : rangeLabel(weekStart, addDays(weekStart, 6))}
          </div>
          <Button
            variant="outline"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            data-testid="button-next-week"
          >
            Следующая неделя
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Card>

        {isLoading || !data ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            {/* Completed this week */}
            <Card className="p-4 space-y-3" data-testid="block-completed">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Завершено за неделю</h2>
                <Badge variant="secondary" data-testid="text-completed-total">
                  Всего: {data.completedCount}
                </Badge>
              </div>
              {data.completedByDepartment.length === 0 ? (
                <p className="text-sm text-muted-foreground">За эту неделю задач не завершено.</p>
              ) : (
                <ul className="space-y-1">
                  {data.completedByDepartment.map((d) => (
                    <li
                      key={d.departmentName}
                      className="flex items-center justify-between text-sm"
                      data-testid={`completed-dept-${d.departmentName}`}
                    >
                      <span>{d.departmentName}</span>
                      <span className="tabular-nums font-medium">{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Overdue tasks */}
            <Card className="p-4 space-y-3" data-testid="block-overdue">
              <h2 className="text-sm font-semibold">Просроченные задачи</h2>
              {data.overdueList.length === 0 ? (
                <p
                  className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400"
                  data-testid="text-no-overdue"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Просроченных задач нет
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="p-2 font-medium">Задача</th>
                        <th className="p-2 font-medium">Отдел</th>
                        <th className="p-2 font-medium">Ответственный</th>
                        <th className="p-2 font-medium">Дедлайн</th>
                        <th className="p-2 font-medium">Просрочено</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.overdueList.map((o) => {
                        const d = parseIsoDate(o.deadlineDate);
                        return (
                          <tr key={o.taskId} className="border-b last:border-0" data-testid={`row-overdue-${o.taskId}`}>
                            <td className="p-2">{o.title}</td>
                            <td className="p-2">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {o.departmentName}
                              </Badge>
                            </td>
                            <td className="p-2">{o.assigneeName ?? "не назначен"}</td>
                            <td className="p-2 tabular-nums">{d ? formatRuDate(d) : o.deadlineDate ?? "—"}</td>
                            <td className="p-2 tabular-nums text-destructive font-medium">
                              {o.daysOverdue} дн.
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Workload by assignee */}
            <Card className="p-4 space-y-3" data-testid="block-workload">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Загрузка по сотрудникам</h2>
                <span className="text-xs text-muted-foreground">
                  Порог перегрузки: {data.overloadThreshold}
                </span>
              </div>
              {data.workloadByAssignee.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет сотрудников с активными задачами.</p>
              ) : (
                <ul className="space-y-2">
                  {data.workloadByAssignee.map((w) => {
                    const overloaded = w.activeTaskCount > data.overloadThreshold;
                    return (
                      <li
                        key={w.userId}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                          overloaded ? "border-destructive" : ""
                        }`}
                        data-testid={`workload-${w.userId}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{w.username}</span>
                          {overloaded && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`overloaded-${w.userId}`}>
                              <AlertTriangle className="h-3 w-3" />
                              Перегружен
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                          <span>активных: {w.activeTaskCount}</span>
                          <span className={w.overdueTaskCount > 0 ? "text-destructive" : "text-muted-foreground"}>
                            просрочено: {w.overdueTaskCount}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
