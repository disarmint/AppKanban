import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminNav } from "@/components/admin-nav";
import { ArrowLeft, Settings as SettingsIcon, Download, Loader2 } from "lucide-react";
import { STATUSES } from "@shared/schema";
import type { AppConfig } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const { data: config, isLoading } = useQuery<AppConfig>({ queryKey: ["/api/config"] });

  const [archiveDays, setArchiveDays] = useState("30");
  const [staleDays, setStaleDays] = useState("14");
  const [wip, setWip] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!config) return;
    setArchiveDays(String(config.archiveDays));
    setStaleDays(String(config.staleDays));
    const next: Record<string, string> = {};
    for (const s of STATUSES) {
      const v = config.wipLimits?.[s];
      next[s] = v === null || v === undefined ? "" : String(v);
    }
    setWip(next);
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const wipLimits: Record<string, number | null> = {};
      for (const s of STATUSES) {
        const raw = wip[s]?.trim();
        wipLimits[s] = raw ? Number(raw) : null;
      }
      const res = await apiRequest("PUT", "/api/config", {
        archiveDays: Number(archiveDays) || 0,
        staleDays: Number(staleDays) || 0,
        wipLimits,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      toast({ title: "Настройки сохранены" });
    },
    onError: () => toast({ title: "Не удалось сохранить настройки", variant: "destructive" }),
  });

  async function downloadBackup() {
    setDownloading(true);
    try {
      const res = await apiRequest("GET", "/api/backup");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kanban-backup-${new Date().toISOString().slice(0, 10)}.db`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Не удалось скачать резервную копию", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-3xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-settings-title">
                Настройки
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Автоархивация и лимиты колонок
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <AdminNav />
            <Link href="/">
              <Button variant="outline" data-testid="link-back-to-board">
                <ArrowLeft className="h-4 w-4" />
                К доске
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Автоархивация</h2>
              <p className="text-xs text-muted-foreground">
                Завершённые задачи автоматически уходят в архив спустя указанное число дней.
                Укажите 0, чтобы отключить.
              </p>
              <div className="flex items-end gap-2 max-w-xs">
                <div className="flex-1">
                  <FieldLabel htmlFor="archive-days" className="text-xs">
                    Дней до архивации
                  </FieldLabel>
                  <Input
                    id="archive-days"
                    type="number"
                    min={0}
                    value={archiveDays}
                    onChange={(e) => setArchiveDays(e.target.value)}
                    data-testid="input-archive-days"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Пометка зависших задач</h2>
              <p className="text-xs text-muted-foreground">
                Незавершённые задачи, у которых статус не менялся дольше указанного
                числа дней, помечаются на доске значком. Укажите 0, чтобы отключить.
              </p>
              <div className="flex items-end gap-2 max-w-xs">
                <div className="flex-1">
                  <FieldLabel htmlFor="stale-days" className="text-xs">
                    Дней до пометки как зависшей
                  </FieldLabel>
                  <Input
                    id="stale-days"
                    type="number"
                    min={0}
                    value={staleDays}
                    onChange={(e) => setStaleDays(e.target.value)}
                    data-testid="input-stale-days"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">WIP-лимиты колонок</h2>
              <p className="text-xs text-muted-foreground">
                Максимум задач в колонке. Пусто — без ограничения. Превышение подсвечивается на доске.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {STATUSES.map((s) => (
                  <div key={s}>
                    <FieldLabel htmlFor={`wip-${s}`} className="text-xs">
                      {s}
                    </FieldLabel>
                    <Input
                      id={`wip-${s}`}
                      type="number"
                      min={0}
                      placeholder="∞"
                      value={wip[s] ?? ""}
                      onChange={(e) => setWip((p) => ({ ...p, [s]: e.target.value }))}
                      data-testid={`input-wip-${s}`}
                    />
                  </div>
                ))}
              </div>
            </Card>

            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-settings"
            >
              Сохранить
            </Button>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold">Резервное копирование</h2>
              <p className="text-xs text-muted-foreground">
                Скачайте полную копию базы данных (файл SQLite) на свой компьютер.
                Автоматическое облачное копирование не настроено — сохраняйте копии
                самостоятельно и храните их в надёжном месте.
              </p>
              <Button
                variant="outline"
                onClick={downloadBackup}
                disabled={downloading}
                data-testid="button-download-backup"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Скачать резервную копию
              </Button>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
