import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { toIsoDate } from "@shared/ru-date";
import type { TaskWithDepartment } from "@shared/schema";

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// Monday-first weekday index for a Date (JS getDay is Sunday-first).
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export default function CalendarPage() {
  const [, navigate] = useLocation();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-based

  const { data: tasks = [], isLoading } = useQuery<TaskWithDepartment[]>({
    queryKey: ["/api/tasks"],
  });

  // Map ISO date "YYYY-MM-DD" -> tasks whose deadline lands that day.
  const tasksByDay = useMemo(() => {
    const map = new Map<string, TaskWithDepartment[]>();
    for (const t of tasks) {
      if (!t.deadlineDate) continue;
      const arr = map.get(t.deadlineDate) ?? [];
      arr.push(t);
      map.set(t.deadlineDate, arr);
    }
    return map;
  }, [tasks]);

  // Build the grid: leading blanks for the first week, then each day of month.
  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = mondayIndex(first);
    const result: (number | null)[] = [];
    for (let i = 0; i < lead; i++) result.push(null);
    for (let d = 1; d <= daysInMonth; d++) result.push(d);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month]);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  function openTask(t: TaskWithDepartment) {
    navigate(`/tasks/${t.id}`);
  }

  const isoFor = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const todayIso = toIsoDate(today);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0">
              <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold leading-tight truncate" data-testid="text-calendar-title">
                Календарь
              </h1>
              <p className="text-xs text-muted-foreground leading-tight hidden sm:block">
                Задачи по дедлайнам
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

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-4">
        <div className="flex items-center justify-center gap-3">
          <Button variant="ghost" size="icon" onClick={prevMonth} aria-label="Предыдущий месяц" data-testid="button-prev-month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[160px] text-center" data-testid="text-current-month">
            {MONTHS[month]} {year}
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth} aria-label="Следующий месяц" data-testid="button-next-month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/40">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const iso = day ? isoFor(day) : "";
                const dayTasks = day ? tasksByDay.get(iso) ?? [] : [];
                const isToday = iso === todayIso;
                return (
                  <div
                    key={i}
                    className={`min-h-[92px] border-b border-r p-1 ${day ? "" : "bg-muted/20"}`}
                    data-testid={day ? `calendar-day-${iso}` : undefined}
                  >
                    {day && (
                      <>
                        <div
                          className={`text-xs mb-1 px-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full ${
                            isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
                          }`}
                        >
                          {day}
                        </div>
                        <div className="space-y-0.5">
                          {dayTasks.slice(0, 3).map((t) => (
                            <TaskChip key={t.id} task={t} onClick={() => openTask(t)} />
                          ))}
                          {dayTasks.length > 3 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className="w-full text-left text-[10px] text-muted-foreground px-1 hover-elevate rounded"
                                  data-testid={`calendar-more-${iso}`}
                                >
                                  +{dayTasks.length - 3} ещё
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="start" className="w-56 p-1 space-y-0.5">
                                {dayTasks.map((t) => (
                                  <TaskChip key={t.id} task={t} onClick={() => openTask(t)} />
                                ))}
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TaskChip({ task, onClick }: { task: TaskWithDepartment; onClick: () => void }) {
  const color = task.department?.color;
  return (
    <button
      onClick={onClick}
      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium hover-elevate"
      style={{ backgroundColor: color ? `${color}22` : undefined, color }}
      title={task.title}
      data-testid={`calendar-chip-${task.id}`}
    >
      {task.title}
    </button>
  );
}
