import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getErrorMessage } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
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
import { UserDialog, type UserFormValues } from "@/components/user-dialog";
import { ArrowLeft, Plus, Pencil, Trash2, Users as UsersIcon } from "lucide-react";
import type { Department, UserPublic } from "@shared/schema";

export default function Users() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserPublic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserPublic | null>(null);

  const { data: users = [], isLoading: loadingUsers } = useQuery<UserPublic[]>({
    queryKey: ["/api/users"],
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const departmentName = (id: number | null) =>
    departments.find((d) => d.id === id)?.name ?? "—";

  const createMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      const res = await apiRequest("POST", "/api/users", {
        username: values.username,
        password: values.password,
        role: values.role,
        departmentId: values.role === "member" ? Number(values.departmentId) : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDialogOpen(false);
      toast({ title: "Пользователь создан" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось создать пользователя", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: UserFormValues }) => {
      const payload: Record<string, unknown> = {
        role: values.role,
        departmentId: values.role === "member" ? Number(values.departmentId) : null,
      };
      if (values.password) payload.password = values.password;
      const res = await apiRequest("PATCH", `/api/users/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDialogOpen(false);
      setEditingUser(null);
      toast({ title: "Изменения сохранены" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось сохранить изменения", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteTarget(null);
      toast({ title: "Пользователь удалён" });
    },
    onError: (e: unknown) => {
      toast({ title: getErrorMessage(e) || "Не удалось удалить пользователя", variant: "destructive" });
      setDeleteTarget(null);
    },
  });

  function openCreate() {
    setEditingUser(null);
    setDialogOpen(true);
  }

  function openEdit(user: UserPublic) {
    setEditingUser(user);
    setDialogOpen(true);
  }

  function handleSubmit(values: UserFormValues) {
    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, values });
    } else {
      createMutation.mutate(values);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <UsersIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold leading-tight truncate" data-testid="text-users-title">
                Пользователи
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                {users.length} учётных записей
              </p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="link-back-to-board">
              <ArrowLeft className="h-4 w-4" />
              К доске
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={openCreate} data-testid="button-add-user">
            <Plus className="h-4 w-4" />
            Новый пользователь
          </Button>
        </div>

        {loadingUsers ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <Card
                key={u.id}
                className="p-3 flex items-center justify-between gap-3"
                data-testid={`row-user-${u.id}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" data-testid={`text-username-${u.id}`}>
                      {u.username}
                    </p>
                    {u.id === currentUser?.id && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        вы
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {u.role === "admin" ? "Администратор" : `Сотрудник · ${departmentName(u.departmentId)}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(u)}
                    className="p-2 rounded hover-elevate"
                    aria-label="Редактировать"
                    data-testid={`button-edit-user-${u.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(u)}
                    className="p-2 rounded hover-elevate text-destructive"
                    aria-label="Удалить"
                    data-testid={`button-delete-user-${u.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <UserDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingUser(null);
        }}
        departments={departments}
        editingUser={editingUser}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent data-testid="dialog-delete-user-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить пользователя?</AlertDialogTitle>
            <AlertDialogDescription>
              Учётная запись «{deleteTarget?.username}» будет удалена без возможности восстановления.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-user"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
