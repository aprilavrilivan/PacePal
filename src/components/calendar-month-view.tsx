"use client";

import type { DragEvent } from "react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { Assignment } from "@/features/pacepal/model";

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type CalendarEntry = {
  assignmentId: string;
  assignmentTitle: string;
  block: Assignment["schedule"][number];
  colors: ReturnType<typeof assignmentColors>;
  status: Assignment["subtasks"][number]["status"];
  subtaskTitle: string;
};

type CalendarPosition = {
  assignmentId: string;
  subtaskId: string;
};

type DraggingTask = CalendarPosition;

type DropPreview = {
  date: string;
  index: number;
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

function assignmentColors(index: number) {
  const hue = Math.round((246 + index * 137.508) % 360);
  return {
    background: `hsl(${hue} 85% 96%)`,
    border: `hsl(${hue} 72% 84%)`,
    dot: `hsl(${hue} 70% 55%)`,
    text: `hsl(${hue} 62% 34%)`,
  };
}

function entryKey(entry: CalendarEntry) {
  return `${entry.assignmentId}::${entry.block.subtaskId}`;
}

function DropSlot({
  colors,
  date,
  onDrop,
}: {
  colors?: CalendarEntry["colors"];
  date: string;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="h-[3.25rem] shrink-0 rounded-md border-2 border-dashed border-violet-400 bg-violet-50 shadow-inner transition-all duration-150"
      data-drop-placeholder={date}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={onDrop}
      style={{
        backgroundColor: colors?.background,
        borderColor: colors?.dot,
      }}
    />
  );
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
    before?: CalendarPosition,
  ) => void;
  onSelectAssignment: (assignmentId: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [dragging, setDragging] = useState<DraggingTask | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousPositions = useRef(new Map<string, DOMRect>());

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEntry[]>();

    for (const [assignmentIndex, assignment] of assignments.entries()) {
      const subtasks = new Map(
        assignment.subtasks.map((subtask) => [subtask.id, subtask]),
      );
      const colors = assignmentColors(assignmentIndex);

      for (const block of assignment.schedule) {
        const subtask = subtasks.get(block.subtaskId);
        if (!subtask) continue;
        const dateEntries = grouped.get(block.date) ?? [];
        dateEntries.push({
          assignmentId: assignment.id,
          assignmentTitle: assignment.title,
          block,
          colors,
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

  useLayoutEffect(() => {
    const nextPositions = new Map<string, DOMRect>();
    for (const [key, element] of cardRefs.current) {
      element.getAnimations?.().forEach((animation) => animation.cancel());
      nextPositions.set(key, element.getBoundingClientRect());
    }
    for (const [key, next] of nextPositions) {
      const previous = previousPositions.current.get(key);
      const element = cardRefs.current.get(key);
      if (!previous || !element) continue;
      const x = previous.left - next.left;
      const y = previous.top - next.top;
      if (x === 0 && y === 0) continue;
      element.animate?.(
        [
          { transform: `translate(${x}px, ${y}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: 170, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
    previousPositions.current = nextPositions;
  }, [dragging, dropPreview, entriesByDate]);

  const draggedColors = dragging
    ? [...entriesByDate.values()]
        .flat()
        .find(
          (entry) =>
            entry.assignmentId === dragging.assignmentId &&
            entry.block.subtaskId === dragging.subtaskId,
        )?.colors
    : null;

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
    const value = entryKey(entry);
    const sourceIndex = (entriesByDate.get(entry.block.date) ?? []).findIndex(
      (candidate) => entryKey(candidate) === value,
    );
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", value);
    setDragging({
      assignmentId: entry.assignmentId,
      subtaskId: entry.block.subtaskId,
    });
    setDropPreview({ date: entry.block.date, index: Math.max(0, sourceIndex) });
  }

  function entriesWithoutDragged(date: string) {
    const draggedKey = dragging
      ? `${dragging.assignmentId}::${dragging.subtaskId}`
      : null;
    return (entriesByDate.get(date) ?? []).filter(
      (entry) => entryKey(entry) !== draggedKey,
    );
  }

  function previewDrop(date: string, index: number) {
    setDropPreview((current) =>
      current?.date === date && current.index === index
        ? current
        : { date, index },
    );
  }

  function insertionIndex(event: DragEvent, date: string, targetKey: string) {
    const entries = entriesWithoutDragged(date);
    const targetIndex = entries.findIndex(
      (entry) => entryKey(entry) === targetKey,
    );
    if (targetIndex < 0) return entries.length;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      targetIndex + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0)
    );
  }

  function dropOnDate(event: DragEvent, date: string, index: number) {
    event.preventDefault();
    const [assignmentId, subtaskId] = (
      event.dataTransfer.getData("text/plain") ||
      (dragging ? `${dragging.assignmentId}::${dragging.subtaskId}` : "")
    ).split("::");
    const beforeEntry = entriesWithoutDragged(date)[index];
    setDragging(null);
    setDropPreview(null);
    if (assignmentId && subtaskId) {
      onMoveSubtask(
        assignmentId,
        subtaskId,
        date,
        beforeEntry
          ? {
              assignmentId: beforeEntry.assignmentId,
              subtaskId: beforeEntry.block.subtaskId,
            }
          : undefined,
      );
    }
  }

  return (
    <section
      aria-label={`${monthTitle}日历`}
      className="luxury-surface overflow-hidden rounded-[1.75rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 bg-white/40 px-5 py-4 sm:px-6">
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
          <div className="grid grid-cols-7 border-b border-white/70 bg-gradient-to-r from-violet-50/80 via-white/70 to-indigo-50/80">
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
              return (
                <div
                  className="relative grid grid-cols-7 gap-px bg-violet-100/70"
                  key={dateKey(week[0]!)}
                >
                  {week.map((date) => {
                    const key = dateKey(date);
                    const entries = entriesByDate.get(key) ?? [];
                    const draggedKey = dragging
                      ? `${dragging.assignmentId}::${dragging.subtaskId}`
                      : null;
                    const visibleEntryCount = entries.filter(
                      (entry) => entryKey(entry) !== draggedKey,
                    ).length;
                    const previewIndex =
                      dropPreview?.date === key ? dropPreview.index : null;
                    let visibleIndex = 0;
                    const isCurrentMonth =
                      date.getMonth() === visibleMonth.getMonth() &&
                      date.getFullYear() === visibleMonth.getFullYear();
                    const isToday = key === todayKey;
                    const isWeekend =
                      date.getDay() === 0 || date.getDay() === 6;

                    return (
                      <div
                        className={`min-h-[10rem] min-w-0 p-2.5 transition ${
                          isWeekend
                            ? "bg-slate-100/90"
                            : "bg-white/90 backdrop-blur-sm"
                        } ${previewIndex !== null ? "ring-2 ring-violet-500 ring-inset" : ""}`}
                        data-date={key}
                        key={key}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setDropPreview((current) =>
                              current?.date === key ? null : current,
                            );
                          }
                        }}
                        onDragOver={(event) => {
                          if (!dragging) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          previewDrop(key, visibleEntryCount);
                        }}
                        onDrop={(event) =>
                          dropOnDate(
                            event,
                            key,
                            previewIndex ?? visibleEntryCount,
                          )
                        }
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
                          className="flex flex-col gap-1.5"
                          data-calendar-events={key}
                        >
                          {entries.map((entry) => {
                            const colors = entry.colors;
                            const completed = entry.status === "completed";
                            const currentKey = entryKey(entry);
                            const isDragged = currentKey === draggedKey;
                            const currentVisibleIndex = visibleIndex;
                            if (!isDragged) visibleIndex += 1;
                            return (
                              <Fragment
                                key={`${entry.assignmentId}-${entry.block.id}`}
                              >
                                {!isDragged &&
                                previewIndex === currentVisibleIndex ? (
                                  <DropSlot
                                    colors={draggedColors ?? colors}
                                    date={key}
                                    onDrop={(event) => {
                                      event.stopPropagation();
                                      dropOnDate(
                                        event,
                                        key,
                                        currentVisibleIndex,
                                      );
                                    }}
                                  />
                                ) : null}
                                <button
                                  aria-hidden={isDragged || undefined}
                                  aria-label={`${entry.block.startTime} ${entry.subtaskTitle}，属于${entry.assignmentTitle}`}
                                  className={`block max-h-20 w-full cursor-grab overflow-hidden rounded-md border px-2 py-1.5 text-left transition-all duration-150 hover:brightness-95 focus:ring-2 focus:ring-violet-500/30 focus:outline-none active:cursor-grabbing ${
                                    completed ? "opacity-55" : ""
                                  } ${isDragged ? "pointer-events-none max-h-0 border-0 py-0 opacity-0" : ""}`}
                                  draggable={!completed}
                                  onClick={() =>
                                    onSelectAssignment(entry.assignmentId)
                                  }
                                  onDragEnd={() => {
                                    setDragging(null);
                                    setDropPreview(null);
                                  }}
                                  onDragOver={(event) => {
                                    if (!dragging || isDragged) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    event.dataTransfer.dropEffect = "move";
                                    previewDrop(
                                      key,
                                      insertionIndex(event, key, currentKey),
                                    );
                                  }}
                                  onDragStart={(event) =>
                                    startDragging(event, entry)
                                  }
                                  onDrop={(event) => {
                                    if (!dragging || isDragged) return;
                                    event.stopPropagation();
                                    dropOnDate(
                                      event,
                                      key,
                                      insertionIndex(event, key, currentKey),
                                    );
                                  }}
                                  ref={(element) => {
                                    if (element) {
                                      cardRefs.current.set(currentKey, element);
                                    } else {
                                      cardRefs.current.delete(currentKey);
                                    }
                                  }}
                                  style={{
                                    backgroundColor: colors.background,
                                    borderColor: colors.border,
                                    color: colors.text,
                                  }}
                                  tabIndex={isDragged ? -1 : undefined}
                                  title={`${entry.subtaskTitle} · ${entry.assignmentTitle} · ${entry.block.durationMinutes} 分钟；拖动可改期或调整顺序`}
                                  type="button"
                                >
                                  <span
                                    className={`block truncate text-xs font-semibold ${
                                      completed ? "line-through" : ""
                                    }`}
                                  >
                                    {entry.block.startTime} ·{" "}
                                    {entry.subtaskTitle}
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
                              </Fragment>
                            );
                          })}
                          {previewIndex !== null &&
                          previewIndex >= visibleEntryCount ? (
                            <DropSlot
                              colors={draggedColors ?? undefined}
                              date={key}
                              onDrop={(event) => {
                                event.stopPropagation();
                                dropOnDate(event, key, visibleEntryCount);
                              }}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
