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
import { Loader2 } from "lucide-react";
import type { Department } from "@shared/schema";

const departmentFormSchema = z.object({
  name: z.string().min(1, "Введите название"),
  color: z.string().min(1, "Выберите цвет"),
  roadmapPeriod: z.string().min(1, "Укажите период"),
  roadmapStatus: z.string().min(1, "Укажите статус"),
});

export type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

export function DepartmentDialog({
  open,
  onOpenChange,
  editingDepartment,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingDepartment: Department | null;
  onSubmit: (values: DepartmentFormValues) => void;
  isSubmitting: boolean;
}) {
  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: "", color: "#0b6a63", roadmapPeriod: "", roadmapStatus: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        editingDepartment
          ? {
              name: editingDepartment.name,
              color: editingDepartment.color,
              roadmapPeriod: editingDepartment.roadmapPeriod,
              roadmapStatus: editingDepartment.roadmapStatus,
            }
          : { name: "", color: "#0b6a63", roadmapPeriod: "", roadmapStatus: "Запланировано" }
      );
    }
  }, [open, editingDepartment, form]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-department">
        <DialogHeader>
          <DialogTitle>{editingDepartment ? "Редактировать отдел" : "Новый отдел"}</DialogTitle>
          <DialogDescription>
            {editingDepartment
              ? "Измените название, цвет или данные дорожной карты"
              : "Добавьте новый отдел в канбан-доску"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название</FormLabel>
                  <FormControl>
                    <Input data-testid="input-department-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Цвет</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-12 rounded border cursor-pointer bg-transparent"
                        data-testid="input-department-color"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                      <Input
                        className="flex-1"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        data-testid="input-department-color-hex"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roadmapPeriod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Период дорожной карты</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Июль – Август 2026"
                      data-testid="input-department-period"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roadmapStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Статус дорожной карты</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Запланировано"
                      data-testid="input-department-status"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Отображается в верхней информационной полосе доски
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-department"
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isSubmitting} data-testid="button-save-department">
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
