import { useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Form } from "@/components/ui/form";
import {
  TaskFields,
  makeTaskSchema,
  UNASSIGNED,
  type TaskFormValues,
} from "@/components/task-dialog";
import { TaskCommentsPanel } from "@/components/task-comments-dialog";
import { TaskChecklistPanel } from "@/components/task-checklist-dialog";
import { TaskLabelsPanel } from "@/components/task-labels-dialog";
import { TaskAttachmentsPanel } from "@/components/task-attachments-dialog";
import { ArrowLeft, Loader2, AlertTriangle, Clock } from "lucide-react";
import { toIsoDate, formatRuDate, parseIsoDate, daysOverdueFromIso } from "@shared/ru-date";
import type { Department, TaskWithDepartment, UserPublic, Priority } from "@shared/schema";

const PRIORITY_META: Record<Priority, { dot: string; className: string }> = {
  Низкий: { dot: "#788c5d", className: "bg-[#788c5d]/15 text-[#5c6f45] dark:text-[#a3b585]" },
  Средний: { dot: "#6a9bcc", className: "bg-[#6a9bcc]/15 text-[#3f6d9e] dark:text-[#93bbdf]" },
  Высокий: { dot: "#d97757", className: "bg-[#d97757]/15 text-[#b3532f] dark:text-[#e59a7d]" },
  Критический: { dot: "#a83a24", className: "bg-[#a83a24]/20 text-[#a83a24] dark:text-[#e08a72]" },
};

export default function TaskPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const taskId = Number(params.id);

  const { data: tasks, isLoading: loadingTasks } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });
  const { data: assignableUsers = [] } = useQuery<UserPublic[]>({
    queryKey: ["/api/assignable-users"],
  });

  const task = useMemo(
    () => (tasks ?? []).find((t) => t.id === taskId) ?? null,
    [tasks, taskId]
  );

  const overdueDays = task ? daysOverdueFromIso(task.deadlineDate) : null;
  const taskOverdue =
    !!task &&
    overdueDays !== null &&
    overdueDays > 0 &&
    task.status !== "Завершено" &&
    !task.archived;
  const staleFor =
    task && task.status !== "Завершено" && !task.archived && task.statusChangedAt
      ? Math.floor((Date.now() - task.statusChangedAt) / 86_400_000)
      : 0;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(makeTaskSchema(false)),
    defaultValues: {
      departmentId: "",
      title: "",
      goal: "",
      week: "",
      deadlineDate: undefined,
      assigneeId: UNASSIGNED,
      status: "Запланировано",
      priority: "Средний",
    },
  });

  useEffect(() => {
    if (task) {
      form.reset({
        departmentId: String(task.departmentId),
        title: task.title,
        goal: task.goal,
        week: task.week,
        deadlineDate: parseIsoDate(task.deadlineDate) ?? undefined,
        assigneeId: task.assigneeId ? String(task.assigneeId) : UNASSIGNED,
        status: task.status,
        priority: task.priority as Priority,
      });
    }
  }, [task, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const payload: Record<string, unknown> = {
        title: values.title,
        goal: values.goal,
        week: values.week,
        status: values.status,
        priority: values.priority,
        departmentId: Number(values.departmentId),
        deadline: formatRuDate(values.deadlineDate),
        deadlineDate: toIsoDate(values.deadlineDate),
        assigneeId: values.assigneeId === UNASSIGNED ? null : Number(values.assigneeId),
      };
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Задача сохранена" });
    },
    onError: () => toast({ title: "Не удалось обновить задачу", variant: "destructive" }),
  });

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else navigate("/");
  }

  const departmentOptions = isAdmin
    ? departments
    : departments.filter((d) => d.id === user?.departmentId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={goBack} data-testid="link-back-to-board">
            <ArrowLeft className="h-4 w-4" />
            Назад к доске
          </Button>
          <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-task-page-title">
            {task ? task.title : "Задача"}
          </h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        {loadingTasks ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : !task ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            data-testid="task-not-found"
          >
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold">Задача не найдена</p>
              <p className="text-sm text-muted-foreground mt-1">
                Возможно, она была удалена или у вас нет к ней доступа.
              </p>
            </div>
            <Button onClick={() => navigate("/")} data-testid="button-back-board">
              <ArrowLeft className="h-4 w-4" />
              Вернуться к доске
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main column: fields + comments */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-4 md:p-6 space-y-4" data-testid="card-task-fields">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className="font-mono"
                    style={{ borderColor: task.department?.color, color: task.department?.color }}
                    data-testid="badge-task-department"
                  >
                    {task.department?.name}
                  </Badge>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium font-mono ${PRIORITY_META[task.priority as Priority]?.className ?? ""}`}
                    data-testid="badge-task-priority"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: PRIORITY_META[task.priority as Priority]?.dot }}
                    />
                    {task.priority}
                  </span>
                  {taskOverdue && (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground"
                      data-testid="badge-task-overdue"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Просрочено на {overdueDays} дн.
                    </span>
                  )}
                  {staleFor > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                      data-testid="badge-task-stale"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Не менялась {staleFor} дн.
                    </span>
                  )}
                </div>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
                    className="space-y-4"
                  >
                    <TaskFields
                      form={form}
                      departments={departmentOptions}
                      assignableUsers={assignableUsers}
                      lockDepartment={!isAdmin}
                      isCreate={false}
                      taskOverdue={taskOverdue}
                      overdueDays={overdueDays}
                    />
                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={updateMutation.isPending}
                        data-testid="button-save-task"
                      >
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Сохранить
                      </Button>
                    </div>
                  </form>
                </Form>
              </Card>

              <Card className="p-4 md:p-6 space-y-3" data-testid="card-task-comments">
                <h2 className="text-sm font-semibold">Комментарии</h2>
                <TaskCommentsPanel task={task} />
              </Card>
            </div>

            {/* Side column: labels, checklist, attachments */}
            <div className="space-y-6">
              <Card className="p-4 md:p-6 space-y-3" data-testid="card-task-labels">
                <h2 className="text-sm font-semibold">Метки</h2>
                <TaskLabelsPanel task={task} />
              </Card>
              <Card className="p-4 md:p-6 space-y-3" data-testid="card-task-checklist">
                <h2 className="text-sm font-semibold">Чек-лист</h2>
                <TaskChecklistPanel task={task} />
              </Card>
              <Card className="p-4 md:p-6 space-y-3" data-testid="card-task-attachments">
                <h2 className="text-sm font-semibold">Вложения</h2>
                <TaskAttachmentsPanel task={task} />
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
