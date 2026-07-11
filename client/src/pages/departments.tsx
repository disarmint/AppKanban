import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { DepartmentDialog, type DepartmentFormValues } from "@/components/department-dialog";
import { AdminNav } from "@/components/admin-nav";
import { ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Building2 } from "lucide-react";
import type { Department, TaskWithDepartment, UserPublic } from "@shared/schema";

export default function Departments() {
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: tasks = [] } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: users = [] } = useQuery<UserPublic[]>({
    queryKey: ["/api/users"],
  });

  const sorted = useMemo(
    () => [...departments].sort((a, b) => a.orderIndex - b.orderIndex),
    [departments]
  );

  const taskCount = (id: number) => tasks.filter((t) => t.departmentId === id).length;
  const memberCount = (id: number) => users.filter((u) => u.departmentId === id).length;

  const createMutation = useMutation({
    mutationFn: async (values: DepartmentFormValues) => {
      const res = await apiRequest("POST", "/api/departments", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setDialogOpen(false);
      toast({ title: "Отдел создан" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось создать отдел", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: DepartmentFormValues }) => {
      const res = await apiRequest("PATCH", `/api/departments/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setDialogOpen(false);
      setEditingDepartment(null);
      toast({ title: "Изменения сохранены" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось сохранить изменения", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setDeleteTarget(null);
      toast({ title: "Отдел удалён" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось удалить отдел", variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({
      aId,
      aOrder,
      bId,
      bOrder,
    }: {
      aId: number;
      aOrder: number;
      bId: number;
      bOrder: number;
    }) => {
      await apiRequest("PATCH", `/api/departments/${aId}`, { orderIndex: bOrder });
      await apiRequest("PATCH", `/api/departments/${bId}`, { orderIndex: aOrder });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось изменить порядок", variant: "destructive" });
    },
  });

  function moveUp(index: number) {
    if (index <= 0) return;
    const a = sorted[index];
    const b = sorted[index - 1];
    reorderMutation.mutate({ aId: a.id, aOrder: a.orderIndex, bId: b.id, bOrder: b.orderIndex });
  }

  function moveDown(index: number) {
    if (index >= sorted.length - 1) return;
    const a = sorted[index];
    const b = sorted[index + 1];
    reorderMutation.mutate({ aId: a.id, aOrder: a.orderIndex, bId: b.id, bOrder: b.orderIndex });
  }

  function openCreate() {
    setEditingDepartment(null);
    setDialogOpen(true);
  }

  function openEdit(department: Department) {
    setEditingDepartment(department);
    setDialogOpen(true);
  }

  function handleSubmit(values: DepartmentFormValues) {
    if (editingDepartment) {
      updateMutation.mutate({ id: editingDepartment.id, values });
    } else {
      createMutation.mutate(values);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-departments-title">
                Отделы
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                {departments.length} отделов
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

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={openCreate} data-testid="button-add-department">
            <Plus className="h-4 w-4" />
            Новый отдел
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((d, index) => (
              <Card
                key={d.id}
                className="p-3 flex items-center gap-3"
                data-testid={`row-department-${d.id}`}
              >
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-0.5 rounded hover-elevate disabled:opacity-30 disabled:pointer-events-none"
                    aria-label="Выше"
                    data-testid={`button-move-up-${d.id}`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === sorted.length - 1}
                    className="p-0.5 rounded hover-elevate disabled:opacity-30 disabled:pointer-events-none"
                    aria-label="Ниже"
                    data-testid={`button-move-down-${d.id}`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-department-name-${d.id}`}>
                    {d.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.roadmapPeriod} · {d.roadmapStatus}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {taskCount(d.id)} задач
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {memberCount(d.id)} сотрудников
                  </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(d)}
                    className="p-2 rounded hover-elevate"
                    aria-label="Редактировать"
                    data-testid={`button-edit-department-${d.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(d)}
                    className="p-2 rounded hover-elevate text-destructive"
                    aria-label="Удалить"
                    data-testid={`button-delete-department-${d.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <DepartmentDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingDepartment(null);
        }}
        editingDepartment={editingDepartment}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-delete-department-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить отдел?</AlertDialogTitle>
            <AlertDialogDescription>
              Отдел «{deleteTarget?.name}» будет удалён без возможности восстановления. Удаление
              невозможно, если в отделе есть задачи или сотрудники.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-department">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-department"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
