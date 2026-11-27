import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarMonthView } from "@/components/calendar-month-view";
import type { Assignment } from "@/features/pacepal/model";

function assignment(): Assignment {
  const subtasks = Array.from({ length: 5 }, (_, index) => ({
    activeSince: null,
    actualMinutes: 0,
    completionCriteria: `完成任务 ${index + 1}`,
    dependencies: [],
    description: `任务 ${index + 1}`,
    difficulty: "medium" as const,
    estimatedMinutes: 30,
    id: `task-${index + 1}`,
    postponedUntil: null,
    status: "todo" as const,
    title: `任务 ${index + 1}`,
  }));

  return {
    availability: { dailyMinutes: 60, preferredTime: "09:00" },
    chatMessages: [],
    checkIn: { availableMinutes: 30, energy: "medium" },
    createdAt: "2026-11-01T00:00:00.000Z",
    deadline: "2026-12-15T18:00",
    deliverable: "",
    id: "assignment-1",
    priority: "medium",
    requirements: "",
    schedule: subtasks.map((task, index) => ({
      date: "2026-11-27",
      durationMinutes: 30,
      id: `block-${index + 1}`,
      locked: false,
      startTime: `09:${String(index * 10).padStart(2, "0")}`,
      subtaskId: task.id,
    })),
    scheduleNotice: "",
    status: "scheduled",
    subtasks,
    title: "测试项目",
    unscheduledMinutes: 0,
  };
}

describe("calendar month view", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T12:00:00+08:00"));
  });

  afterEach(() => vi.useRealTimers());

  it("keeps every event in a scrollable day cell", () => {
    const onSelectAssignment = vi.fn();
    const { container } = render(
      <CalendarMonthView
        assignments={[assignment()]}
        onSelectAssignment={onSelectAssignment}
      />,
    );

    for (let index = 1; index <= 5; index += 1) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`任务 ${index}`),
        }),
      ).toBeInTheDocument();
    }
    expect(screen.queryByText(/还有 \d+ 项/)).not.toBeInTheDocument();

    const events = container.querySelector(
      '[data-calendar-events="2026-11-27"]',
    );
    expect(events).toHaveClass("overflow-y-auto");
    expect(events).not.toHaveClass("overscroll-contain");

    fireEvent.click(screen.getByRole("button", { name: /任务 5/ }));
    expect(onSelectAssignment).toHaveBeenCalledWith("assignment-1");
  });

  it("uses gray backgrounds for weekends but not out-of-month weekdays", () => {
    const { container } = render(
      <CalendarMonthView assignments={[]} onSelectAssignment={vi.fn()} />,
    );

    expect(container.querySelector('[data-date="2026-11-28"]')).toHaveClass(
      "bg-slate-50/90",
    );

    const outOfMonthWeekday = container.querySelector(
      '[data-date="2026-10-26"]',
    );
    expect(outOfMonthWeekday).toHaveClass("bg-white");
    expect(outOfMonthWeekday).not.toHaveClass("opacity-45");
    expect(
      outOfMonthWeekday?.querySelector('time[datetime="2026-10-26"]'),
    ).toHaveClass("text-slate-400");
  });
});
