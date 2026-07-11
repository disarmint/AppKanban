import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
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
import { TaskCommentsDialog } from "@/components/task-comments-dialog";
import { TaskAttachmentsDialog } from "@/components/task-attachments-dialog";
import { TaskChecklistDialog } from "@/components/task-checklist-dialog";
import { TaskLabelsDialog } from "@/components/task-labels-dialog";
import { AdminNav } from "@/components/admin-nav";
import { NotificationBell } from "@/components/notification-bell";
import {
  LayoutGrid,
  LogOut,
  Moon,
  Sun,
  Plus,
  Pencil,
  Trash2,
  Search,
  MessageSquare,
  ListChecks,
  Tag,
  Archive,
  AlertTriangle,
  Paperclip,
  Clock,
  CalendarDays,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import { STATUSES, PRIORITIES } from "@shared/schema";
import { toIsoDate, daysOverdueFromIso, formatRuDate, parseIsoDate } from "@shared/ru-date";
import type { Department, TaskWithDepartment, UserPublic, Label, AppConfig, Priority } from "@shared/schema";

const STATUS_COLUMNS: { status: (typeof STATUSES)[number]; label: string }[] = [
  { status: "Запланировано", label: "Запланировано" },
  { status: "В процессе", label: "В процессе" },
  { status: "Завершено", label: "Завершено" },
];

// Priority pill/chip colors. Низкий=grey, Средний=blue, Высокий=orange,
// Критический=red.
const PRIORITY_META: Record<Priority, { dot: string; className: string }> = {
  Низкий: { dot: "#6b7280", className: "bg-muted text-muted-foreground" },
  Средний: { dot: "#3b82f6", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  Высокий: { dot: "#f97316", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  Критический: { dot: "#ef4444", className: "bg-destructive/15 text-destructive" },
};

export default function Board() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [activeDepartments, setActiveDepartments] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithDepartment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskWithDepartment | null>(null);
  const [commentsTask, setCommentsTask] = useState<TaskWithDepartment | null>(null);
  const [attachmentsTask, setAttachmentsTask] = useState<TaskWithDepartment | null>(null);
  const [checklistTask, setChecklistTask] = useState<TaskWithDepartment | null>(null);
  const [labelsTask, setLabelsTask] = useState<TaskWithDepartment | null>(null);
  const [activeLabels, setActiveLabels] = useState<Set<number>>(new Set());
  const [activePriorities, setActivePriorities] = useState<Set<Priority>>(new Set());
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const isAdmin = user?.role === "admin";

  // Pointer/touch drag only kicks in after a small movement so taps on the
  // card's buttons and status dropdown still work (accessible alternative).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const { data: departments = [], isLoading: loadingDepartments } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: tasks = [], isLoading: loadingTasks } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: assignableUsers = [] } = useQuery<UserPublic[]>({
    queryKey: ["/api/assignable-users"],
  });

  const { data: labels = [] } = useQuery<Label[]>({
    queryKey: ["/api/labels"],
  });

  const { data: config } = useQuery<AppConfig>({
    queryKey: ["/api/config"],
  });

  const createMutation = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const res = await apiRequest("POST", "/api/tasks", {
        departmentId: Number(values.departmentId),
        title: values.title,
        goal: values.goal,
        week: values.week,
        deadline: formatRuDate(values.deadlineDate),
        deadlineDate: toIsoDate(values.deadlineDate),
        assigneeId: values.assigneeId === "none" ? null : Number(values.assigneeId),
        status: values.status,
        priority: values.priority,
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
      if (values.deadlineDate !== undefined) {
        payload.deadlineDate = toIsoDate(values.deadlineDate);
      }
      if (values.assigneeId !== undefined) {
        payload.assigneeId = values.assigneeId === "none" ? null : Number(values.assigneeId);
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
      if (activeLabels.size > 0 && !t.labels.some((l) => activeLabels.has(l.id))) return false;
      if (activePriorities.size > 0 && !activePriorities.has(t.priority as Priority)) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.goal.toLowerCase().includes(q) ||
        t.department?.name.toLowerCase().includes(q)
      );
    });
  }, [tasks, activeDepartments, activeLabels, activePriorities, search]);

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

  function toggleLabel(id: number) {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePriority(p: Priority) {
    setActivePriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const status = e.over?.id;
    if (typeof status !== "string") return;
    const id = Number(e.active.id);
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    updateMutation.mutate({ id, values: { status } });
  }

  const activeDragTask = activeDragId !== null ? tasks.find((t) => t.id === activeDragId) ?? null : null;

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
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-app-title">
                Отделы — канбан
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block truncate">
                {user?.username} · {isAdmin ? "администратор" : departments.find((d) => d.id === user?.departmentId)?.name ?? "сотрудник"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isAdmin && <AdminNav />}
            <NotificationBell
              onOpenTask={(taskId) => {
                const t = tasks.find((x) => x.id === taskId);
                if (t) openEdit(t);
              }}
            />
            <Link href="/calendar">
              <Button variant="ghost" size="icon" aria-label="Календарь" data-testid="link-calendar">
                <CalendarDays className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/archive">
              <Button variant="ghost" size="icon" aria-label="Архив" data-testid="link-archive">
                <Archive className="h-4 w-4" />
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
              aria-label="Переключить тему"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="icon" className="sm:hidden" onClick={logout} data-testid="button-logout" aria-label="Выйти">
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="hidden sm:inline-flex" onClick={logout} data-testid="button-logout-full">
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
          {isAdmin && (
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
          )}
          <Button onClick={openCreate} data-testid="button-add-task">
            <Plus className="h-4 w-4" />
            Новая задача
          </Button>
        </div>

        {labels.length > 0 && (
          <div className="flex gap-2 overflow-x-auto" data-testid="label-filter">
            {labels.map((l) => {
              const active = activeLabels.has(l.id);
              return (
                <button
                  key={l.id}
                  onClick={() => toggleLabel(l.id)}
                  data-testid={`chip-label-${l.id}`}
                  className={`toggle-elevate shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active ? "toggle-elevated" : ""
                  }`}
                  style={{ borderColor: active ? l.color : "var(--border)", color: active ? l.color : undefined }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto" data-testid="priority-filter">
          {PRIORITIES.map((p) => {
            const active = activePriorities.has(p);
            const meta = PRIORITY_META[p];
            return (
              <button
                key={p}
                onClick={() => togglePriority(p)}
                data-testid={`chip-priority-${p}`}
                className={`toggle-elevate shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active ? "toggle-elevated" : ""
                }`}
                style={{ borderColor: active ? meta.dot : "var(--border)", color: active ? meta.dot : undefined }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.dot }} />
                {p}
              </button>
            );
          })}
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
          <DndContext
            sensors={sensors}
            onDragStart={(e: DragStartEvent) => setActiveDragId(Number(e.active.id))}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveDragId(null)}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STATUS_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.status);
                const limit = config?.wipLimits?.[col.status] ?? null;
                const overLimit = limit !== null && limit > 0 && colTasks.length > limit;
                return (
                  <BoardColumn key={col.status} status={col.status} overLimit={overLimit}>
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold flex items-center gap-1.5">
                        {col.label}
                        {overLimit && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-destructive"
                            data-testid={`wip-warning-${col.status}`}
                          />
                        )}
                      </h2>
                      <Badge
                        variant={overLimit ? "destructive" : "secondary"}
                        data-testid={`count-${col.status}`}
                      >
                        {limit !== null && limit > 0 ? `${colTasks.length}/${limit}` : colTasks.length}
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
                          staleDays={config?.staleDays ?? 0}
                          onEdit={() => openEdit(task)}
                          onDelete={() => setDeleteTarget(task)}
                          onComments={() => setCommentsTask(task)}
                          onAttachments={() => setAttachmentsTask(task)}
                          onChecklist={() => setChecklistTask(task)}
                          onLabels={() => setLabelsTask(task)}
                          onStatusChange={(status) =>
                            updateMutation.mutate({ id: task.id, values: { status } })
                          }
                        />
                      ))}
                    </div>
                  </BoardColumn>
                );
              })}
            </div>
            <DragOverlay>
              {activeDragTask ? (
                <TaskCardView task={activeDragTask} staleDays={0} {...NOOP_HANDLERS} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        departments={isAdmin ? departments : departments.filter((d) => d.id === user?.departmentId)}
        assignableUsers={assignableUsers}
        lockDepartment={!isAdmin}
        task={editingTask}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <TaskCommentsDialog
        task={commentsTask}
        open={!!commentsTask}
        onOpenChange={(open) => !open && setCommentsTask(null)}
      />

      <TaskAttachmentsDialog
        task={attachmentsTask}
        open={!!attachmentsTask}
        onOpenChange={(open) => !open && setAttachmentsTask(null)}
      />

      <TaskChecklistDialog
        task={checklistTask}
        open={!!checklistTask}
        onOpenChange={(open) => !open && setChecklistTask(null)}
      />

      <TaskLabelsDialog
        task={labelsTask ? tasks.find((t) => t.id === labelsTask.id) ?? labelsTask : null}
        open={!!labelsTask}
        onOpenChange={(open) => !open && setLabelsTask(null)}
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function DeadlineBadge({ task }: { task: TaskWithDepartment }) {
  const iso = task.deadlineDate;
  const overdue = daysOverdueFromIso(iso);
  const parsed = parseIsoDate(iso);
  const label = parsed ? formatRuDate(parsed) : task.deadline;

  // grey = normal / unknown, amber = due within 2 days, red = overdue.
  let tone = "bg-muted text-muted-foreground";
  if (overdue !== null) {
    if (overdue > 0) tone = "bg-destructive/15 text-destructive";
    else if (overdue >= -2) tone = "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0 text-[10px] font-medium ${tone}`}
      data-testid={`deadline-${task.id}`}
    >
      {label}
    </span>
  );
}

function BoardColumn({
  status,
  overLimit,
  children,
}: {
  status: string;
  overLimit: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border bg-muted/40 p-3 flex flex-col gap-3 min-h-[200px] transition-colors ${
        isOver ? "ring-2 ring-primary" : overLimit ? "ring-2 ring-destructive" : ""
      }`}
      data-testid={`column-${status}`}
    >
      {children}
    </div>
  );
}

type TaskCardHandlers = {
  onEdit: () => void;
  onDelete: () => void;
  onComments: () => void;
  onAttachments: () => void;
  onChecklist: () => void;
  onLabels: () => void;
  onStatusChange: (status: string) => void;
};

const NOOP_HANDLERS: TaskCardHandlers = {
  onEdit: () => {},
  onDelete: () => {},
  onComments: () => {},
  onAttachments: () => {},
  onChecklist: () => {},
  onLabels: () => {},
  onStatusChange: () => {},
};

function TaskCard(props: { task: TaskWithDepartment; staleDays: number } & TaskCardHandlers) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.task.id,
  });
  return (
    <TaskCardView
      {...props}
      dragRef={setNodeRef}
      dragProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
    />
  );
}

function TaskCardView({
  task,
  staleDays,
  onEdit,
  onDelete,
  onComments,
  onAttachments,
  onChecklist,
  onLabels,
  onStatusChange,
  dragRef,
  dragProps,
  isDragging,
}: {
  task: TaskWithDepartment;
  staleDays: number;
  dragRef?: (el: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
  isDragging?: boolean;
} & TaskCardHandlers) {
  // Interactive controls stop pointer propagation so tapping them never starts
  // a drag — the status dropdown stays a keyboard/click-accessible alternative.
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  // A non-final task whose status hasn't moved in longer than the configured
  // threshold is flagged as "stale".
  const staleFor =
    staleDays > 0 && task.status !== "Завершено" && !task.archived && task.statusChangedAt
      ? Math.floor((Date.now() - task.statusChangedAt) / 86_400_000)
      : 0;
  const isStale = staleDays > 0 && staleFor > staleDays;
  return (
    <Card
      ref={dragRef}
      {...(dragProps ?? {})}
      className={`group p-3 cursor-grab active:cursor-grabbing border-l-[3px] touch-none ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{ borderLeftColor: task.department?.color }}
      data-testid={`card-task-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
            style={{ borderColor: task.department?.color, color: task.department?.color }}
            data-testid={`badge-department-${task.id}`}
          >
            {task.department?.name}
          </Badge>
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0 text-[10px] font-medium ${PRIORITY_META[task.priority as Priority]?.className ?? ""}`}
            data-testid={`badge-priority-${task.id}`}
            title={`Приоритет: ${task.priority}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: PRIORITY_META[task.priority as Priority]?.dot }}
            />
            {task.priority}
          </span>
          {isStale && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    {...stop}
                    className="inline-flex items-center text-amber-600 dark:text-amber-400"
                    data-testid={`stale-indicator-${task.id}`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Не менялась {staleFor} дн.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-0.5" {...stop}>
          <button
            onClick={onComments}
            className="relative p-1 rounded hover-elevate"
            aria-label="Комментарии"
            data-testid={`button-comments-${task.id}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {task.commentCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                data-testid={`comment-count-${task.id}`}
              >
                {task.commentCount}
              </span>
            )}
          </button>
          <button
            onClick={onAttachments}
            className="relative p-1 rounded hover-elevate"
            aria-label="Вложения"
            data-testid={`button-attachments-${task.id}`}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {task.attachmentCount > 0 && (
              <span
                className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground"
                data-testid={`attachment-count-${task.id}`}
              >
                {task.attachmentCount}
              </span>
            )}
          </button>
          <button
            onClick={onLabels}
            className="p-1 rounded hover-elevate"
            aria-label="Метки"
            data-testid={`button-labels-${task.id}`}
          >
            <Tag className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="p-1 rounded hover-elevate opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Редактировать"
            data-testid={`button-edit-${task.id}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover-elevate text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
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
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2" data-testid={`labels-${task.id}`}>
          {task.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0 text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}22`, color: l.color }}
              data-testid={`label-chip-${task.id}-${l.id}`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {task.week}
          </Badge>
          <DeadlineBadge task={task} />
          <button
            onClick={onChecklist}
            {...stop}
            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground hover-elevate"
            data-testid={`checklist-count-${task.id}`}
          >
            <ListChecks className="h-3 w-3" />
            {task.checklistTotal > 0 ? `${task.checklistDone}/${task.checklistTotal}` : "+"}
          </button>
        </div>
        {task.assignee && (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
            title={task.assignee.username}
            data-testid={`assignee-${task.id}`}
          >
            {initials(task.assignee.username)}
          </span>
        )}
      </div>
      <Select value={task.status} onValueChange={onStatusChange}>
        <SelectTrigger
          {...stop}
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
