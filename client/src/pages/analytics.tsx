import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminNav } from "@/components/admin-nav";
import { daysOverdue } from "@/lib/ru-date";
import { ArrowLeft, BarChart3, AlertTriangle } from "lucide-react";
import type { Department, TaskWithDepartment, UserPublic } from "@shared/schema";

export default function Analytics() {
  const { data: departments = [], isLoading: loadingDepartments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });
  const { data: tasks = [], isLoading: loadingTasks } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery<UserPublic[]>({
    queryKey: ["/api/users"],
  });

  const isLoading = loadingDepartments || loadingTasks || loadingUsers;

  const overdueTasks = useMemo(() => {
    return tasks
      .map((t) => ({ task: t, days: daysOverdue(t.deadline) }))
      .filter((x): x is { task: TaskWithDepartment; days: number } =>
        x.days !== null && x.days > 0 && x.task.status !== "Завершено"
      )
      .sort((a, b) => b.days - a.days);
  }, [tasks]);

  const overdueByDepartment = useMemo(() => {
    const map = new Map<number, number>();
    for (const { task } of overdueTasks) {
      map.set(task.departmentId, (map.get(task.departmentId) ?? 0) + 1);
    }
    return map;
  }, [overdueTasks]);

  const deptStats = useMemo(() => {
    return [...departments]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((d) => {
        const deptTasks = tasks.filter((t) => t.departmentId === d.id);
        const done = deptTasks.filter((t) => t.status === "Завершено").length;
        const inProgress = deptTasks.filter((t) => t.status === "В процессе").length;
        const planned = deptTasks.filter((t) => t.status === "Запланировано").length;
        const members = users.filter((u) => u.departmentId === d.id).length;
        const pct = deptTasks.length > 0 ? Math.round((done / deptTasks.length) * 100) : 0;
        return {
          department: d,
          total: deptTasks.length,
          done,
          inProgress,
          planned,
          members,
          pct,
          overdue: overdueByDepartment.get(d.id) ?? 0,
        };
      });
  }, [departments, tasks, users, overdueByDepartment]);

  const totals = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Завершено").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const members = users.filter((u) => u.role === "member").length;
    return { total, done, pct, departments: departments.length, members, overdue: overdueTasks.length };
  }, [tasks, users, departments, overdueTasks]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-analytics-title">
                Аналитика
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Сводка по всем отделам
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <AdminNav />
            <Link href="/">
              <Button variant="outline" size="icon" className="sm:hidden" data-testid="link-back-to-board" aria-label="К доске">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="hidden sm:inline-flex" data-testid="link-back-to-board-full">
                <ArrowLeft className="h-4 w-4" />
                К доске
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Всего задач" value={totals.total} />
              <StatCard label="Завершено" value={totals.done} suffix={`${totals.pct}%`} tone="green" />
              <StatCard label="Отделов" value={totals.departments} />
              <StatCard label="Сотрудников" value={totals.members} />
              <StatCard label="Просрочено" value={totals.overdue} tone={totals.overdue > 0 ? "red" : undefined} />
            </div>

            {/* Per-department breakdown */}
            <div>
              <h2 className="text-sm font-semibold mb-3">По отделам</h2>
              <div className="space-y-2">
                {deptStats.map((s) => (
                  <Card
                    key={s.department.id}
                    className="p-3 flex flex-col md:flex-row md:items-center gap-3"
                    data-testid={`row-analytics-department-${s.department.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 md:w-48 shrink-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: s.department.color }}
                      />
                      <p className="text-sm font-medium truncate">{s.department.name}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                          <span>{s.total} задач</span>
                          <span>·</span>
                          <span>{s.planned} запланировано</span>
                          <span>·</span>
                          <span>{s.inProgress} в процессе</span>
                          <span>·</span>
                          <span>{s.done} завершено</span>
                        </div>
                        <span className="text-xs font-medium tabular-nums shrink-0 ml-2">{s.pct}%</span>
                      </div>
                      <Progress value={s.pct} className="h-1.5" />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s.members} сотрудников
                      </Badge>
                      {s.overdue > 0 && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0" data-testid={`badge-overdue-${s.department.id}`}>
                          {s.overdue} просрочено
                        </Badge>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Overdue tasks */}
            <div>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Просроченные задачи
              </h2>
              {overdueTasks.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-overdue">
                  Нет просроченных задач
                </Card>
              ) : (
                <div className="space-y-2">
                  {overdueTasks.map(({ task, days }) => (
                    <Card
                      key={task.id}
                      className="p-3 flex items-center justify-between gap-3 border-l-[3px]"
                      style={{ borderLeftColor: task.department?.color }}
                      data-testid={`row-overdue-task-${task.id}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                            style={{ borderColor: task.department?.color, color: task.department?.color }}
                          >
                            {task.department?.name}
                          </Badge>
                          <p className="text-sm font-medium truncate">{task.title}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">Дедлайн: {task.deadline}</p>
                      </div>
                      <Badge variant="destructive" className="shrink-0" data-testid={`badge-days-overdue-${task.id}`}>
                        {days} {days === 1 ? "день" : days < 5 ? "дня" : "дней"}
                      </Badge>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  tone?: "green" | "red";
  suffix?: string;
}) {
  const toneClass =
    tone === "green" ? "text-[hsl(var(--chart-1))]" : tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4" data-testid={`stat-card-${label}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-xl font-semibold tabular-nums ${toneClass}`}>{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </Card>
  );
}
