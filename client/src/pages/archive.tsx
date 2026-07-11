import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Archive as ArchiveIcon, RotateCcw } from "lucide-react";
import type { TaskWithDepartment } from "@shared/schema";

export default function Archive() {
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks", "archived"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/tasks?archived=1");
      return res.json();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/tasks/${id}/archive`, { archived: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Задача восстановлена" });
    },
    onError: () => toast({ title: "Не удалось восстановить задачу", variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <ArchiveIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-archive-title">
                Архив
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Заархивированные задачи
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

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-3">
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)
        ) : tasks.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground" data-testid="text-no-archived">
            В архиве нет задач
          </Card>
        ) : (
          tasks.map((task) => (
            <Card
              key={task.id}
              className="p-3 flex items-center justify-between gap-3 border-l-[3px]"
              style={{ borderLeftColor: task.department?.color }}
              data-testid={`row-archived-task-${task.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                    style={{ borderColor: task.department?.color, color: task.department?.color }}
                  >
                    {task.department?.name}
                  </Badge>
                  <p className="text-sm font-medium truncate">{task.title}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.goal}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => restoreMutation.mutate(task.id)}
                disabled={restoreMutation.isPending}
                data-testid={`button-restore-${task.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Восстановить
              </Button>
            </Card>
          ))
        )}
      </main>
    </div>
  );
}
