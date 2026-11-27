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
    chatMessages: [],
    checkIn: { availableMinutes: 30, energy: "medium" },
    createdAt: "2026-11-01T00:00:00.000Z",
    deadline: "2026-12-15T18:00",
    deliverable: "",
    id: "assignment-1",
    priority: "medium",
    requirements: "",
    schedule: subtasks.map((task, index) => ({
      date: index < 3 ? "2026-11-27" : `2026-11-${25 + index}`,
      durationMinutes: 30,
      id: `block-${index + 1}`,
      locked: false,
      startTime: `09:${String(index * 10).padStart(2, "0")}`,
      subtaskId: task.id,
    })),
    scheduleNotice: "",
    scheduleVersion: 2,
    status: "scheduled",
    subtasks,
    title: "测试项目",
  };
}

describe("calendar month view", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T12:00:00+08:00"));
  });

  afterEach(() => vi.useRealTimers());

  it("lets the busiest day grow its week and reorders tasks within a day", () => {
    const onSelectAssignment = vi.fn();
    const onMoveSubtask = vi.fn();
    const { container } = render(
      <CalendarMonthView
        assignments={[assignment()]}
        onMoveSubtask={onMoveSubtask}
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
    expect(events).not.toHaveClass("overflow-y-auto");
    expect(container.querySelector('[data-date="2026-11-27"]')).not.toHaveClass(
      "h-[180px]",
    );
    expect(
      container.querySelector("[data-project-span]"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /任务 5/ }));
    expect(onSelectAssignment).toHaveBeenCalledWith("assignment-1");

    const dataTransfer = {
      dropEffect: "move",
      effectAllowed: "move",
      getData: vi.fn(() => "assignment-1::task-1"),
      setData: vi.fn(),
    };
    fireEvent.dragStart(screen.getByRole("button", { name: /任务 1/ }), {
      dataTransfer,
    });
    fireEvent.drop(container.querySelector('[data-date="2026-11-30"]')!, {
      dataTransfer,
    });
    expect(onMoveSubtask).toHaveBeenCalledWith(
      "assignment-1",
      "task-1",
      "2026-11-30",
      undefined,
    );

    const secondTask = screen.getByRole("button", { name: /任务 2/ });
    vi.spyOn(secondTask, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const reorderTransfer = {
      ...dataTransfer,
      getData: vi.fn(() => "assignment-1::task-1"),
    };
    fireEvent.dragStart(screen.getByRole("button", { name: /任务 1/ }), {
      dataTransfer: reorderTransfer,
    });
    fireEvent.dragOver(secondTask, {
      clientY: 10,
      dataTransfer: reorderTransfer,
    });
    expect(
      container.querySelector('[data-drop-placeholder="2026-11-27"]'),
    ).toBeInTheDocument();
    fireEvent.drop(secondTask, {
      clientY: 10,
      dataTransfer: reorderTransfer,
    });
    expect(onMoveSubtask).toHaveBeenLastCalledWith(
      "assignment-1",
      "task-1",
      "2026-11-27",
      { assignmentId: "assignment-1", subtaskId: "task-2" },
    );
  });

  it("uses gray backgrounds for weekends but not out-of-month weekdays", () => {
    const { container } = render(
      <CalendarMonthView
        assignments={[]}
        onMoveSubtask={vi.fn()}
        onSelectAssignment={vi.fn()}
      />,
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

  it("uses a distinct color for each project", () => {
    const first = assignment();
    const second = {
      ...assignment(),
      id: "assignment-2",
      title: "第二项目",
    };
    render(
      <CalendarMonthView
        assignments={[first, second]}
        onMoveSubtask={vi.fn()}
        onSelectAssignment={vi.fn()}
      />,
    );

    const firstColor = screen.getByRole("button", {
      name: /任务 1，属于测试项目/,
    }).style.backgroundColor;
    const secondColor = screen.getByRole("button", {
      name: /任务 1，属于第二项目/,
    }).style.backgroundColor;
    expect(firstColor).not.toBe(secondColor);
  });
});
