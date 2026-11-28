import type { ScheduleBlock, Subtask } from "@/features/pacepal/model";

export type ScheduleResult = {
  blocks: ScheduleBlock[];
};

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

function fromDateKey(value: string) {
  return new Date(`${value}T00:00:00`);
}

function orderByDependencies(subtasks: Subtask[]) {
  const completed = new Set(
    subtasks
      .filter((subtask) => subtask.status === "completed")
      .map((subtask) => subtask.id),
  );
  const remaining = subtasks.filter(
    (subtask) => subtask.status !== "completed",
  );
  const ordered: Subtask[] = [];

  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((subtask) =>
      subtask.dependencies.every(
        (dependency) =>
          completed.has(dependency) ||
          ordered.some((orderedTask) => orderedTask.id === dependency),
      ),
    );

    if (nextIndex === -1) {
      ordered.push(...remaining);
      break;
    }

    ordered.push(remaining.splice(nextIndex, 1)[0]);
  }

  return ordered;
}

function schedulableTasks(subtasks: Subtask[]) {
  const blocked = new Set<string>();
  return orderByDependencies(subtasks).filter((subtask) => {
    if (
      subtask.status === "blocked" ||
      subtask.dependencies.some((dependency) => blocked.has(dependency))
    ) {
      blocked.add(subtask.id);
      return false;
    }
    return true;
  });
}

/**
 * Gives every unfinished subtask exactly one calendar block. Tasks are spread
 * one per day when the deadline allows it, then distributed across the
 * remaining days in dependency order when there are more tasks than days.
 */
export function buildSchedule(
  subtasks: Subtask[],
  deadline: string,
  now = new Date(),
  existingBlocks: ScheduleBlock[] = [],
): ScheduleResult {
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  const parsedDeadline = new Date(deadline);
  parsedDeadline.setHours(0, 0, 0, 0);
  const deadlineDate =
    parsedDeadline < startDate ? new Date(startDate) : parsedDeadline;
  const dayCount =
    Math.floor((deadlineDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  const dates = Array.from({ length: dayCount }, (_, index) =>
    toDateKey(addDays(startDate, index)),
  );
  const ordered = schedulableTasks(subtasks);
  const taskById = new Map(ordered.map((task) => [task.id, task]));
  const orderById = new Map(ordered.map((task, index) => [task.id, index]));
  const existingByTask = new Map<string, ScheduleBlock>();

  for (const block of [...existingBlocks].sort((left, right) =>
    left.date.localeCompare(right.date),
  )) {
    if (!existingByTask.has(block.subtaskId)) {
      existingByTask.set(block.subtaskId, block);
    }
  }

  const lockedByTask = new Map<string, ScheduleBlock>();
  for (const block of existingBlocks) {
    if (
      !block.locked ||
      lockedByTask.has(block.subtaskId) ||
      !taskById.has(block.subtaskId) ||
      fromDateKey(block.date) < startDate ||
      fromDateKey(block.date) > deadlineDate
    ) {
      continue;
    }
    lockedByTask.set(block.subtaskId, { ...block, locked: true });
  }

  const blocks = [...lockedByTask.values()];
  const occupiedDates = new Set(blocks.map((block) => block.date));

  for (const [index, task] of ordered.entries()) {
    if (lockedByTask.has(task.id)) continue;

    const evenlyDistributedIndex =
      ordered.length <= dayCount
        ? index
        : Math.floor((index * dayCount) / ordered.length);
    const postponedIndex = task.postponedUntil
      ? Math.max(
          0,
          Math.floor(
            (fromDateKey(task.postponedUntil).getTime() - startDate.getTime()) /
              86_400_000,
          ),
        )
      : 0;
    let dateIndex = Math.min(
      dayCount - 1,
      Math.max(evenlyDistributedIndex, postponedIndex),
    );

    if (ordered.length <= dayCount) {
      while (dateIndex < dayCount - 1 && occupiedDates.has(dates[dateIndex]!)) {
        dateIndex += 1;
      }
    }

    const previous = existingByTask.get(task.id);
    const date = dates[dateIndex]!;
    blocks.push({
      date,
      durationMinutes: task.estimatedMinutes,
      id: previous?.id ?? `block-${task.id}`,
      locked: false,
      order: previous?.order ?? orderById.get(task.id) ?? 0,
      subtaskId: task.id,
    });
    occupiedDates.add(date);
  }

  return {
    blocks: blocks.sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.order - right.order,
    ),
  };
}
