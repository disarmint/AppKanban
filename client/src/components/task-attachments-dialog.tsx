import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getErrorMessage } from "@/lib/queryClient";
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
import { Loader2, Trash2, Download, Paperclip, Upload } from "lucide-react";
import type { TaskAttachment, TaskWithDepartment } from "@shared/schema";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

export function TaskAttachmentsDialog({
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const taskId = task?.id;

  const { data: attachments = [], isLoading } = useQuery<TaskAttachment[]>({
    queryKey: ["/api/tasks", taskId, "attachments"],
    enabled: open && taskId !== undefined,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "attachments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  };

  async function handleUpload(file: File) {
    if (taskId === undefined) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await apiRequest("POST", `/api/tasks/${taskId}/attachments`, form);
      invalidate();
    } catch (err) {
      toast({ title: getErrorMessage(err) ?? "Не удалось загрузить файл", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/attachments/${id}`);
    },
    onSuccess: invalidate,
    onError: () => toast({ title: "Не удалось удалить вложение", variant: "destructive" }),
  });

  async function handleDownload(a: TaskAttachment) {
    try {
      const res = await apiRequest("GET", `/api/attachments/${a.id}/download`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Не удалось скачать файл", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-attachments">
        <DialogHeader>
          <DialogTitle>Вложения</DialogTitle>
          <DialogDescription className="truncate">{task?.title}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {!isLoading && attachments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Пока нет вложений</p>
          )}
          {attachments.map((a) => {
            const canDelete = user?.role === "admin" || a.uploadedBy === user?.id;
            return (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-md border p-2"
                data-testid={`attachment-${a.id}`}
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate" title={a.originalName}>
                    {a.originalName}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{formatSize(a.size)}</p>
                </div>
                <button
                  onClick={() => handleDownload(a)}
                  className="p-1 rounded hover-elevate"
                  aria-label="Скачать"
                  data-testid={`button-download-${a.id}`}
                >
                  <Download className="h-4 w-4" />
                </button>
                {canDelete && (
                  <button
                    onClick={() => deleteMutation.mutate(a.id)}
                    className="p-1 rounded hover-elevate text-destructive"
                    aria-label="Удалить вложение"
                    data-testid={`button-delete-attachment-${a.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          data-testid="input-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
        <Button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full"
          data-testid="button-upload"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Загрузить файл (макс. 10 МБ)
        </Button>
      </DialogContent>
    </Dialog>
  );
}
