import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Department, UserPublic } from "@shared/schema";

const userFormSchema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().optional(),
  role: z.enum(["admin", "member"]),
  departmentId: z.string(),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export function UserDialog({
  open,
  onOpenChange,
  departments,
  editingUser,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  editingUser: UserPublic | null;
  onSubmit: (values: UserFormValues) => void;
  isSubmitting: boolean;
}) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { username: "", password: "", role: "member", departmentId: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        editingUser
          ? {
              username: editingUser.username,
              password: "",
              role: editingUser.role as "admin" | "member",
              departmentId: editingUser.departmentId ? String(editingUser.departmentId) : "",
            }
          : {
              username: "",
              password: "",
              role: "member",
              departmentId: departments[0] ? String(departments[0].id) : "",
            }
      );
    }
  }, [open, editingUser, departments, form]);

  const role = form.watch("role");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-user">
        <DialogHeader>
          <DialogTitle>{editingUser ? "Редактировать пользователя" : "Новый пользователь"}</DialogTitle>
          <DialogDescription>
            {editingUser
              ? "Измените роль, отдел или сбросьте пароль"
              : "Создайте логин и пароль для сотрудника"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Логин</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-user-username"
                      disabled={!!editingUser}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Пароль</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={editingUser ? "Оставьте пустым, чтобы не менять" : ""}
                      data-testid="input-user-password"
                      {...field}
                    />
                  </FormControl>
                  {!editingUser && (
                    <FormDescription>Минимум 4 символа</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Роль</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Администратор</SelectItem>
                      <SelectItem value="member">Сотрудник</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {role === "member" && (
              <FormField
                control={form.control}
                name="departmentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Отдел</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user-department">
                          <SelectValue placeholder="Выберите отдел" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Сотрудник увидит и сможет менять только задачи этого отдела
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-user"
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-save-user">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
