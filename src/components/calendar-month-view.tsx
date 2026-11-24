"use client";

import { useMemo, useState } from "react";

import type { Assignment } from "@/features/pacepal/model";

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const eventColors = [
  { background: "#eef2ff", border: "#c7d2fe", dot: "#6366f1", text: "#3730a3" },
  { background: "#f3e8ff", border: "#e9d5ff", dot: "#9333ea", text: "#6b21a8" },
  { background: "#ecfdf5", border: "#a7f3d0", dot: "#10b981", text: "#065f46" },
  { background: "#fff7ed", border: "#fed7aa", dot: "#f97316", text: "#9a3412" },
  { background: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6", text: "#1e40af" },
  { background: "#fff1f2", border: "#fecdd3", dot: "#f43f5e", text: "#9f1239" },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfCalendarGrid(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);
  return start;
}

function assignmentColorIndex(assignmentId: string) {
  let hash = 0;
  for (const character of assignmentId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % eventColors.length;
}

export function CalendarMonthView({
  assignments,
  onSelectAssignment,
}: {
  assignments: Assignment[];
  onSelectAssignment: (assignmentId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const entriesByDate = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{
        assignmentId: string;
        assignmentTitle: string;
        block: Assignment["schedule"][number];
        colorIndex: number;
        status: Assignment["subtasks"][number]["status"];
        subtaskTitle: string;
      }>
    >();

    for (const assignment of assignments) {
      const subtasks = new Map(
        assignment.subtasks.map((subtask) => [subtask.id, subtask]),
      );
      const colorIndex = assignmentColorIndex(assignment.id);

      for (const block of assignment.schedule) {
        const subtask = subtasks.get(block.subtaskId);
        if (!subtask) continue;
        const dateEntries = grouped.get(block.date) ?? [];
        dateEntries.push({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          block,
          colorIndex,
          status: subtask.status,
          subtaskTitle: subtask.title,
        });
        grouped.set(block.date, dateEntries);
      }
    }

    for (const entries of grouped.values()) {
      entries.sort(
        (left, right) =>
          left.block.startTime.localeCompare(right.block.startTime) ||
          left.subtaskTitle.localeCompare(right.subtaskTitle, "zh-CN"),
      );
    }

    return grouped;
  }, [assignments]);

  const calendarDays = useMemo(() => {
    const start = startOfCalendarGrid(visibleMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  const monthTitle = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);
  const todayKey = dateKey(today);

  function changeMonth(offset: number) {
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  return (
    <section
      aria-label={`${monthTitle}日历`}
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_35px_rgba(39,39,76,0.06)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">
          {monthTitle}
        </h2>
        <div className="flex items-center gap-2">
          <button
            aria-label="上个月"
            className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
            onClick={() => changeMonth(-1)}
            type="button"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            className="min-h-9 rounded-full bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
            onClick={() =>
              setVisibleMonth(
                new Date(today.getFullYear(), today.getMonth(), 1),
              )
            }
            type="button"
          >
            今天
          </button>
          <button
            aria-label="下个月"
            className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700 transition hover:bg-slate-200 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
            onClick={() => changeMonth(1)}
            type="button"
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
            {weekdayLabels.map((label, index) => (
              <div
                className={`px-3 py-2.5 text-center text-sm font-semibold ${
                  index > 4 ? "text-slate-400" : "text-slate-600"
                }`}
                key={label}
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-200/80">
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const entries = entriesByDate.get(key) ?? [];
              const isCurrentMonth =
                date.getMonth() === visibleMonth.getMonth() &&
                date.getFullYear() === visibleMonth.getFullYear();
              const isToday = key === todayKey;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              const visibleEntries = entries.slice(0, 3);

              return (
                <div
                  className={`min-h-[132px] p-2.5 ${
                    isWeekend ? "bg-slate-50/90" : "bg-white"
                  } ${isCurrentMonth ? "" : "opacity-45"}`}
                  data-date={key}
                  key={key}
                >
                  <div className="mb-2 flex justify-end">
                    <time
                      className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday
                          ? "bg-[#5b55df] text-white"
                          : isWeekend
                            ? "text-slate-400"
                            : "text-slate-700"
                      }`}
                      dateTime={key}
                    >
                      {date.getDate()}
                    </time>
                  </div>

                  <div className="space-y-1.5">
                    {visibleEntries.map((entry) => {
                      const colors = eventColors[entry.colorIndex];
                      const completed = entry.status === "completed";
                      return (
                        <button
                          aria-label={`${entry.block.startTime} ${entry.subtaskTitle}，属于${entry.assignmentTitle}`}
                          className={`block w-full overflow-hidden rounded-md border px-2 py-1.5 text-left transition hover:brightness-95 focus:ring-2 focus:ring-violet-500/30 focus:outline-none ${
                            completed ? "opacity-55" : ""
                          }`}
                          key={`${entry.assignmentId}-${entry.block.id}`}
                          onClick={() => onSelectAssignment(entry.assignmentId)}
                          style={{
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                            color: colors.text,
                          }}
                          title={`${entry.subtaskTitle} · ${entry.assignmentTitle} · ${entry.block.durationMinutes} 分钟`}
                          type="button"
                        >
                          <span
                            className={`block truncate text-xs font-semibold ${
                              completed ? "line-through" : ""
                            }`}
                          >
                            {entry.block.startTime} · {entry.subtaskTitle}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium opacity-75">
                            <span
                              aria-hidden="true"
                              className="size-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: colors.dot }}
                            />
                            <span className="truncate">
                              {entry.assignmentTitle}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {entries.length > visibleEntries.length ? (
                      <p className="px-1 text-xs font-semibold text-slate-500">
                        还有 {entries.length - visibleEntries.length} 项
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
