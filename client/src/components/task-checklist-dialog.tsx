import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Trash2, Plus } from "lucide-react";
import type { ChecklistItem, TaskWithDepartment } from "@shared/schema";

export function TaskChecklistPanel({ task }: { task: TaskWithDepartment | null }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const taskId = task?.id;

  const { data: items = [], isLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/tasks", taskId, "checklist"],
    enabled: taskId !== undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "checklist"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/checklist`, { text });
      return res.json();
    },
    onSuccess: () => {
      setText("");
      invalidate();
    },
    onError: () => toast({ title: "Не удалось добавить пункт", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, done }: { id: number; done: boolean }) => {
      await apiRequest("PATCH", `/api/checklist/${id}`, { done });
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось обновить пункт", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/checklist/${id}`);
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось удалить пункт", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pr-1">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Пунктов пока нет</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-md border p-2"
            data-testid={`checklist-item-${item.id}`}
          >
            <Checkbox
              checked={item.done}
              onCheckedChange={(checked) =>
                toggleMutation.mutate({ id: item.id, done: checked === true })
              }
              data-testid={`checkbox-${item.id}`}
            />
            <span
              className={`flex-1 text-sm ${item.done ? "line-through text-muted-foreground" : ""}`}
            >
              {item.text}
            </span>
            <button
              onClick={() => deleteMutation.mutate(item.id)}
              className="text-destructive p-0.5 rounded hover-elevate"
              aria-label="Удалить пункт"
              data-testid={`button-delete-checklist-${item.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) addMutation.mutate();
        }}
        className="flex gap-2"
      >
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Новый пункт..."
          data-testid="input-checklist"
        />
        <Button
          type="submit"
          disabled={!text.trim() || addMutation.isPending}
          data-testid="button-add-checklist"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function TaskChecklistDialog({
  task,
  open,
  onOpenChange,
}: {
  task: TaskWithDepartment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-checklist">
        <DialogHeader>
          <DialogTitle>Чек-лист</DialogTitle>
          <DialogDescription className="truncate">{task?.title}</DialogDescription>
        </DialogHeader>
        {open && <TaskChecklistPanel task={task} />}
      </DialogContent>
    </Dialog>
  );
}
