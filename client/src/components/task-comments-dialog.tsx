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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2 } from "lucide-react";
import type { CommentWithAuthor, TaskWithDepartment } from "@shared/schema";

export function TaskCommentsDialog({
  task,
  open,
  onOpenChange,
}: {
  task: TaskWithDepartment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const taskId = task?.id;

  const { data: comments = [], isLoading } = useQuery<CommentWithAuthor[]>({
    queryKey: ["/api/tasks", taskId, "comments"],
    enabled: open && taskId !== undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/comments`, { body });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      invalidate();
    },
    onError: () => toast({ title: "Не удалось добавить комментарий", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось удалить комментарий", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-comments">
        <DialogHeader>
          <DialogTitle>Комментарии</DialogTitle>
          <DialogDescription className="truncate">{task?.title}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] overflow-y-auto space-y-3 pr-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!isLoading && comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Пока нет комментариев</p>
          )}
          {comments.map((c) => {
            const canDelete = user?.role === "admin" || c.userId === user?.id;
            return (
              <div key={c.id} className="rounded-md border p-2" data-testid={`comment-${c.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{c.author?.username ?? "—"}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString("ru-RU")}
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => deleteMutation.mutate(c.id)}
                        className="text-destructive p-0.5 rounded hover-elevate"
                        aria-label="Удалить комментарий"
                        data-testid={`button-delete-comment-${c.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) addMutation.mutate();
          }}
          className="space-y-2"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Написать комментарий..."
            rows={2}
            data-testid="input-comment"
          />
          <Button
            type="submit"
            disabled={!body.trim() || addMutation.isPending}
            className="w-full"
            data-testid="button-add-comment"
          >
            {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Добавить
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
