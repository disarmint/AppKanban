import { useEffect, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon, Loader2 } from "lucide-react";
import { STATUSES, PRIORITIES } from "@shared/schema";
import { formatRuDate, parseIsoDate } from "@shared/ru-date";
import type { Department, TaskWithDepartment, UserPublic, Priority } from "@shared/schema";

const UNASSIGNED = "none";

const taskFormSchema = z.object({
  departmentId: z.string().min(1, "Выберите отдел"),
  title: z.string().min(1, "Введите задачу"),
  goal: z.string().min(1, "Введите цель"),
  week: z.string().min(1, "Введите неделю"),
  deadlineDate: z.date({ required_error: "Укажите срок" }),
  assigneeId: z.string(),
  status: z.string().min(1),
  priority: z.enum(PRIORITIES),
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

// On task CREATE, assignee and deadline are mandatory (Block B). On edit we keep
// the looser rules so pre-existing tasks (some without an assignee) stay
// editable.
function makeTaskSchema(isCreate: boolean) {
  return taskFormSchema.superRefine((val, ctx) => {
    if (isCreate && (!val.assigneeId || val.assigneeId === UNASSIGNED)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assigneeId"],
        message: "Выберите ответственного",
      });
    }
  });
}

const STATUS_OPTIONS = STATUSES;

export function TaskDialog({
  open,
  onOpenChange,
  departments,
  assignableUsers,
  lockDepartment,
  task,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  assignableUsers: UserPublic[];
  lockDepartment?: boolean;
  task: TaskWithDepartment | null;
  onSubmit: (values: TaskFormValues) => void;
  isSubmitting: boolean;
}) {
  const isCreate = !task;
  const resolver = useMemo(() => zodResolver(makeTaskSchema(isCreate)), [isCreate]);
  const form = useForm<TaskFormValues>({
    resolver,
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
    if (open) {
      form.reset(
        task
          ? {
              departmentId: String(task.departmentId),
              title: task.title,
              goal: task.goal,
              week: task.week,
              deadlineDate:
                parseIsoDate(task.deadlineDate) ?? undefined,
              assigneeId: task.assigneeId ? String(task.assigneeId) : UNASSIGNED,
              status: task.status,
              priority: task.priority as Priority,
            }
          : {
              departmentId: departments[0] ? String(departments[0].id) : "",
              title: "",
              goal: "",
              week: "",
              deadlineDate: undefined,
              assigneeId: "",
              status: "Запланировано",
              priority: "Средний",
            }
      );
    }
  }, [open, task, departments, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-task">
        <DialogHeader>
          <DialogTitle>{task ? "Редактировать задачу" : "Новая задача"}</DialogTitle>
          <DialogDescription>
            {task ? "Измените данные задачи" : "Заполните данные новой задачи"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="departmentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Отдел</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={lockDepartment}>
                    <FormControl>
                      <SelectTrigger data-testid="select-department">
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Задача</FormLabel>
                  <FormControl>
                    <Input data-testid="input-title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Цель</FormLabel>
                  <FormControl>
                    <Textarea rows={2} data-testid="input-goal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="week"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Неделя</FormLabel>
                    <FormControl>
                      <Input data-testid="input-week" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deadlineDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Дедлайн</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "justify-start text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            data-testid="input-deadline"
                          >
                            <CalendarIcon className="h-4 w-4" />
                            {field.value ? formatRuDate(field.value) : "Выберите дату"}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Исполнитель</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-assignee">
                        <SelectValue placeholder="Выберите ответственного" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {!isCreate && <SelectItem value={UNASSIGNED}>Не назначен</SelectItem>}
                      {assignableUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Статус</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Приоритет</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-task"
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-save-task">
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
