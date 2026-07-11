import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
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
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import type { Label, TaskWithDepartment } from "@shared/schema";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function TaskLabelsPanel({ task }: { task: TaskWithDepartment | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const taskId = task?.id;
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const { data: labels = [], isLoading } = useQuery<Label[]>({
    queryKey: ["/api/labels"],
  });

  const assignedIds = new Set((task?.labels ?? []).map((l) => l.id));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/labels"] });
  };

  const toggleMutation = useMutation({
    mutationFn: async ({ labelId, assigned }: { labelId: number; assigned: boolean }) => {
      if (assigned) {
        await apiRequest("DELETE", `/api/tasks/${taskId}/labels/${labelId}`);
      } else {
        await apiRequest("POST", `/api/tasks/${taskId}/labels`, { labelId });
      }
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось изменить метки", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/labels", { name: newName, color: newColor });
    },
    onSuccess: () => {
      setNewName("");
      invalidate();
    },
    onError: () => toast({ title: "Не удалось создать метку", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/labels/${id}`);
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось удалить метку", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="max-h-[45vh] overflow-y-auto space-y-1.5 pr-1">
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {!isLoading && labels.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Меток пока нет{isAdmin ? " — создайте ниже" : ""}
          </p>
        )}
        {labels.map((label) => {
          const assigned = assignedIds.has(label.id);
          return (
            <div key={label.id} className="flex items-center gap-2" data-testid={`label-row-${label.id}`}>
              <button
                onClick={() => toggleMutation.mutate({ labelId: label.id, assigned })}
                className="flex flex-1 items-center gap-2 rounded-md border px-2 py-1.5 hover-elevate"
                data-testid={`toggle-label-${label.id}`}
              >
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                <span className="flex-1 text-left text-sm">{label.name}</span>
                {assigned && <Check className="h-4 w-4 text-primary" />}
              </button>
              {isAdmin && (
                <button
                  onClick={() => deleteMutation.mutate(label.id)}
                  className="text-destructive p-1 rounded hover-elevate"
                  aria-label="Удалить метку"
                  data-testid={`button-delete-label-${label.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate();
          }}
          className="space-y-2 border-t pt-3"
        >
          <div className="flex gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`h-6 w-6 rounded-full ${newColor === c ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
                style={{ backgroundColor: c }}
                aria-label={`Цвет ${c}`}
                data-testid={`color-${c}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Новая метка..."
              data-testid="input-label-name"
            />
            <Button
              type="submit"
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-create-label"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function TaskLabelsDialog({
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
      <DialogContent className="sm:max-w-md" data-testid="dialog-labels">
        <DialogHeader>
          <DialogTitle>Метки</DialogTitle>
          <DialogDescription className="truncate">{task?.title}</DialogDescription>
        </DialogHeader>
        {open && <TaskLabelsPanel task={task} />}
      </DialogContent>
    </Dialog>
  );
}
