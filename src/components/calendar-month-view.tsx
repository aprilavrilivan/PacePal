"use client";

import type { DragEvent } from "react";
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

type CalendarEntry = {
  assignmentId: string;
  assignmentTitle: string;
  block: Assignment["schedule"][number];
  colorIndex: number;
  status: Assignment["subtasks"][number]["status"];
  subtaskTitle: string;
};

type ProjectSpan = {
  assignmentId: string;
  assignmentTitle: string;
  colorIndex: number;
  end: number;
  lane: number;
  start: number;
};

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

function spansForWeek(
  week: Date[],
  assignments: Assignment[],
  entriesByDate: Map<string, CalendarEntry[]>,
) {
  const spans: ProjectSpan[] = [];
  let lane = 0;

  for (const assignment of assignments) {
    const activeDays = week
      .map((date, index) => ({
        index,
        scheduled: (entriesByDate.get(dateKey(date)) ?? []).some(
          (entry) => entry.assignmentId === assignment.id,
        ),
      }))
      .filter((day) => day.scheduled)
      .map((day) => day.index);
    const projectSpans: Array<{ start: number; end: number }> = [];

    for (const index of activeDays) {
      const current = projectSpans.at(-1);
      if (current && index === current.end + 1) {
        current.end = index;
      } else {
        projectSpans.push({ start: index, end: index });
      }
    }

    const continuous = projectSpans.filter(
      (span) => span.end - span.start >= 1,
    );
    if (continuous.length === 0) continue;

    spans.push(
      ...continuous.map((span) => ({
        ...span,
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        colorIndex: assignmentColorIndex(assignment.id),
        lane,
      })),
    );
    lane += 1;
  }

  return { laneCount: lane, spans };
}

export function CalendarMonthView({
  assignments,
  onMoveSubtask,
  onSelectAssignment,
}: {
  assignments: Assignment[];
  onMoveSubtask: (
    assignmentId: string,
    subtaskId: string,
    date: string,
  ) => void;
  onSelectAssignment: (assignmentId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [dragging, setDragging] = useState<{
    assignmentId: string;
    subtaskId: string;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();

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

  const weeks = useMemo(() => {
    const start = startOfCalendarGrid(visibleMonth);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
    return Array.from({ length: 6 }, (_, index) =>
      days.slice(index * 7, index * 7 + 7),
    );
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

  function startDragging(event: DragEvent, entry: CalendarEntry) {
    const value = `${entry.assignmentId}::${entry.block.subtaskId}`;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", value);
    setDragging({
      assignmentId: entry.assignmentId,
      subtaskId: entry.block.subtaskId,
    });
  }

  function dropOnDate(event: DragEvent, date: string) {
    event.preventDefault();
    const [assignmentId, subtaskId] = (
      event.dataTransfer.getData("text/plain") ||
      (dragging ? `${dragging.assignmentId}::${dragging.subtaskId}` : "")
    ).split("::");
    setDragging(null);
    setDropTarget(null);
    if (assignmentId && subtaskId) {
      onMoveSubtask(assignmentId, subtaskId, date);
    }
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

          <div className="divide-y divide-slate-200/80">
            {weeks.map((week) => {
              const { laneCount, spans } = spansForWeek(
                week,
                assignments,
                entriesByDate,
              );
              return (
                <div
                  className="relative grid grid-cols-7 gap-px bg-slate-200/80"
                  key={dateKey(week[0]!)}
                >
                  {week.map((date) => {
                    const key = dateKey(date);
                    const entries = entriesByDate.get(key) ?? [];
                    const isCurrentMonth =
                      date.getMonth() === visibleMonth.getMonth() &&
                      date.getFullYear() === visibleMonth.getFullYear();
                    const isToday = key === todayKey;
                    const isWeekend =
                      date.getDay() === 0 || date.getDay() === 6;

                    return (
                      <div
                        className={`min-h-[10rem] min-w-0 p-2.5 transition ${
                          isWeekend ? "bg-slate-50/90" : "bg-white"
                        } ${dropTarget === key ? "ring-2 ring-violet-500 ring-inset" : ""}`}
                        data-date={key}
                        key={key}
                        onDragEnter={() => dragging && setDropTarget(key)}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setDropTarget((current) =>
                              current === key ? null : current,
                            );
                          }
                        }}
                        onDragOver={(event) => {
                          if (!dragging) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => dropOnDate(event, key)}
                      >
                        <div className="mb-2 flex justify-end">
                          <time
                            className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                              isToday
                                ? "bg-[#5b55df] text-white"
                                : !isCurrentMonth || isWeekend
                                  ? "text-slate-400"
                                  : "text-slate-700"
                            }`}
                            dateTime={key}
                          >
                            {date.getDate()}
                          </time>
                        </div>

                        <div
                          aria-label={
                            entries.length > 0
                              ? `${date.getMonth() + 1}月${date.getDate()}日计划，共${entries.length}项`
                              : undefined
                          }
                          className="space-y-1.5"
                          data-calendar-events={key}
                          style={{ marginTop: laneCount * 24 }}
                        >
                          {entries.map((entry) => {
                            const colors = eventColors[entry.colorIndex];
                            const completed = entry.status === "completed";
                            return (
                              <button
                                aria-label={`${entry.block.startTime} ${entry.subtaskTitle}，属于${entry.assignmentTitle}`}
                                className={`block w-full cursor-grab overflow-hidden rounded-md border px-2 py-1.5 text-left transition hover:brightness-95 focus:ring-2 focus:ring-violet-500/30 focus:outline-none active:cursor-grabbing ${
                                  completed ? "opacity-55" : ""
                                }`}
                                draggable={!completed}
                                key={`${entry.assignmentId}-${entry.block.id}`}
                                onClick={() =>
                                  onSelectAssignment(entry.assignmentId)
                                }
                                onDragEnd={() => {
                                  setDragging(null);
                                  setDropTarget(null);
                                }}
                                onDragStart={(event) =>
                                  startDragging(event, entry)
                                }
                                style={{
                                  backgroundColor: colors.background,
                                  borderColor: colors.border,
                                  color: colors.text,
                                }}
                                title={`${entry.subtaskTitle} · ${entry.assignmentTitle} · ${entry.block.durationMinutes} 分钟；拖动可改期`}
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
                        </div>
                      </div>
                    );
                  })}

                  {spans.length > 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 top-11 z-10 grid grid-cols-7 gap-y-1 px-1">
                      {spans.map((span) => {
                        const colors = eventColors[span.colorIndex];
                        return (
                          <button
                            className="pointer-events-auto h-5 truncate px-2 text-left text-[11px] font-semibold shadow-sm"
                            data-project-span={span.assignmentId}
                            key={`${span.assignmentId}-${span.start}-${span.end}`}
                            onClick={() =>
                              onSelectAssignment(span.assignmentId)
                            }
                            style={{
                              backgroundColor: colors.background,
                              borderColor: colors.border,
                              color: colors.text,
                              gridColumn: `${span.start + 1} / ${span.end + 2}`,
                              gridRow: span.lane + 1,
                            }}
                            title={`${span.assignmentTitle} · 连续安排`}
                            type="button"
                          >
                            {span.assignmentTitle}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
