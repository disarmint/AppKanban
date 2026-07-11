import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TaskDialog, type TaskFormValues } from "@/components/task-dialog";
import {
  LayoutGrid,
  LogOut,
  Moon,
  Sun,
  Plus,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { STATUSES } from "@shared/schema";
import type { Department, TaskWithDepartment } from "@shared/schema";

const STATUS_COLUMNS: { status: (typeof STATUSES)[number]; label: string }[] = [
  { status: "Запланировано", label: "Запланировано" },
  { status: "В процессе", label: "В процессе" },
  { status: "Завершено", label: "Завершено" },
];

export default function Board() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [activeDepartments, setActiveDepartments] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithDepartment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithDepartment | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const { data: departments = [], isLoading: loadingDepartments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });

  const createMutation = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const res = await apiRequest("POST", "/api/tasks", {
        departmentId: Number(values.departmentId),
        title: values.title,
        goal: values.goal,
        week: values.week,
        deadline: values.deadline,
        status: values.status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setDialogOpen(false);
      toast({ title: "Задача создана" });
    },
    onError: () => toast({ title: "Не удалось создать задачу", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<TaskFormValues> }) => {
      const payload: Record<string, unknown> = { ...values };
      if (values.departmentId !== undefined) {
        payload.departmentId = Number(values.departmentId);
      }
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setDialogOpen(false);
      setEditingTask(null);
    },
    onError: () => toast({ title: "Не удалось обновить задачу", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setDeleteTarget(null);
      toast({ title: "Задача удалена" });
    },
    onError: () => toast({ title: "Не удалось удалить задачу", variant: "destructive" }),
  });

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (activeDepartments.size > 0 && !activeDepartments.has(t.departmentId)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.goal.toLowerCase().includes(q) ||
        t.department?.name.toLowerCase().includes(q)
      );
    });
  }, [tasks, activeDepartments, search]);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "Завершено").length;
    const inProgress = tasks.filter((t) => t.status === "В процессе").length;
    const planned = tasks.filter((t) => t.status === "Запланировано").length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, inProgress, planned, pct };
  }, [tasks]);

  function toggleDepartment(id: number) {
    setActiveDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDrop(status: string, e: React.DragEvent) {
    e.preventDefault();
    setDragOverStatus(null);
    const idStr = e.dataTransfer.getData("text/task-id");
    if (!idStr) return;
    const id = Number(idStr);
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    updateMutation.mutate({ id, values: { status } });
  }

  function openCreate() {
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEdit(task: TaskWithDepartment) {
    setEditingTask(task);
    setDialogOpen(true);
  }

  function handleSubmit(values: TaskFormValues) {
    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, values });
    } else {
      createMutation.mutate(values);
    }
  }

  const isLoading = loadingDepartments || loadingTasks;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate" data-testid="text-app-title">
                Отделы — канбан
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                {user?.username}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
              aria-label="Переключить тему"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={logout} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Roadmap strip */}
        {!loadingDepartments && departments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="roadmap-strip">
            {departments.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shrink-0"
                data-testid={`roadmap-item-${d.id}`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <div className="leading-tight">
                  <p className="text-xs font-medium whitespace-nowrap">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {d.roadmapPeriod} · {d.roadmapStatus}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Всего задач" value={stats.total} />
          <StatCard label="Запланировано" value={stats.planned} tone="muted" />
          <StatCard label="В процессе" value={stats.inProgress} tone="amber" />
          <StatCard label="Завершено" value={stats.done} tone="green" suffix={`${stats.pct}%`} />
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск задач..."
              className="pl-8"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto flex-1">
            {departments.map((d) => {
              const active = activeDepartments.has(d.id);
              return (
                <button
                  key={d.id}
                  onClick={() => toggleDepartment(d.id)}
                  data-testid={`chip-department-${d.id}`}
                  className={`toggle-elevate shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "toggle-elevated" : ""
                  }`}
                  style={{
                    borderColor: active ? d.color : "var(--border)",
                    color: active ? d.color : undefined,
                  }}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
          <Button onClick={openCreate} data-testid="button-add-task">
            <Plus className="h-4 w-4" />
            Новая задача
          </Button>
        </div>

        {/* Kanban columns */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUS_COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.status);
              return (
                <div
                  key={col.status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStatus(col.status);
                  }}
                  onDragLeave={() => setDragOverStatus(null)}
                  onDrop={(e) => handleDrop(col.status, e)}
                  className={`rounded-lg border bg-muted/40 p-3 flex flex-col gap-3 min-h-[200px] transition-colors ${
                    dragOverStatus === col.status ? "ring-2 ring-primary" : ""
                  }`}
                  data-testid={`column-${col.status}`}
                >
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <Badge variant="secondary" data-testid={`count-${col.status}`}>
                      {colTasks.length}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto pr-0.5">
                    {colTasks.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-4 text-center">
                        Нет задач
                      </p>
                    )}
                    {colTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        onEdit={() => openEdit(task)}
                        onDelete={() => setDeleteTarget(task)}
                        onStatusChange={(status) =>
                          updateMutation.mutate({ id: task.id, values: { status } })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        departments={departments}
        task={editingTask}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить задачу?</AlertDialogTitle>
            <AlertDialogDescription>
              Задача «{deleteTarget?.title}» будет удалена без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  tone?: "muted" | "amber" | "green";
  suffix?: string;
}) {
  const toneClass =
    tone === "green"
      ? "text-[hsl(var(--chart-1))]"
      : tone === "amber"
        ? "text-[hsl(var(--chart-4))]"
        : "text-foreground";
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

function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: TaskWithDepartment;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  return (
    <Card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", String(task.id));
      }}
      className="group p-3 cursor-grab active:cursor-grabbing border-l-[3px]"
      style={{ borderLeftColor: task.department?.color }}
      data-testid={`card-task-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0"
          style={{ borderColor: task.department?.color, color: task.department?.color }}
          data-testid={`badge-department-${task.id}`}
        >
          {task.department?.name}
        </Badge>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 rounded hover-elevate"
            aria-label="Редактировать"
            data-testid={`button-edit-${task.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover-elevate text-destructive"
            aria-label="Удалить"
            data-testid={`button-delete-${task.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm font-medium mt-2 leading-snug" data-testid={`text-title-${task.id}`}>
        {task.title}
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-snug">{task.goal}</p>
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {task.week}
          </Badge>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {task.deadline}
          </Badge>
        </div>
      </div>
      <Select value={task.status} onValueChange={onStatusChange}>
        <SelectTrigger
          className="mt-2 h-7 text-xs"
          data-testid={`select-status-${task.id}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}
