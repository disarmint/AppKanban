import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, MessageSquare, UserPlus, CalendarClock } from "lucide-react";
import type { Notification, NotificationType } from "@shared/schema";

const ICONS: Record<NotificationType, typeof Bell> = {
  comment: MessageSquare,
  assignment: UserPlus,
  deadline: CalendarClock,
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} дн назад`;
  return new Date(ms).toLocaleDateString("ru-RU");
}

export function NotificationBell({ onOpenTask }: { onOpenTask?: (taskId: number) => void }) {
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const unread = notifications.filter((n) => !n.read).length;

  const readMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const readAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  function handleClick(n: Notification) {
    if (!n.read) readMutation.mutate(n.id);
    if (onOpenTask) onOpenTask(n.taskId);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Уведомления"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground"
              data-testid="notification-unread-count"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="popover-notifications">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Уведомления</span>
          {unread > 0 && (
            <button
              onClick={() => readAllMutation.mutate()}
              className="text-xs text-primary hover:underline"
              data-testid="button-read-all"
            >
              Прочитать все
            </button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
              Нет уведомлений
            </p>
          ) : (
            <ul>
              {notifications.map((n) => {
                const Icon = ICONS[n.type as NotificationType] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={`flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-0 hover-elevate ${
                        n.read ? "" : "bg-primary/5"
                      }`}
                      data-testid={`notification-${n.id}`}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs leading-snug ${n.read ? "" : "font-medium"}`}>
                          {n.message}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
