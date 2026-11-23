import type {
  Availability,
  ScheduleBlock,
  Subtask,
} from "@/features/pacepal/model";

export type ScheduleResult = {
  blocks: ScheduleBlock[];
  unscheduledMinutes: number;
};

export type DeadlineRisk = {
  capacityMinutes: number;
  remainingMinutes: number;
  shortfallMinutes: number;
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

function addMinutes(time: string, minutes: number) {
  const [hours, initialMinutes] = time.split(":").map(Number);
  const total = hours * 60 + initialMinutes + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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

export function buildSchedule(
  subtasks: Subtask[],
  deadline: string,
  availability: Availability,
  now = new Date(),
  existingBlocks: ScheduleBlock[] = [],
): ScheduleResult {
  const deadlineDate = new Date(deadline);
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  deadlineDate.setHours(23, 59, 59, 999);

  const ordered = orderByDependencies(subtasks);
  const taskById = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const blocks: ScheduleBlock[] = existingBlocks
    .filter((block) => {
      const task = taskById.get(block.subtaskId);
      return (
        block.locked &&
        task &&
        task.status !== "completed" &&
        task.status !== "blocked" &&
        fromDateKey(block.date) >= startDate &&
        fromDateKey(block.date) <= deadlineDate
      );
    })
    .map((block) => ({ ...block, locked: true }));
  const usedByDate = new Map<string, number>();
  const lockedByTask = new Map<string, number>();

  for (const block of blocks) {
    usedByDate.set(
      block.date,
      (usedByDate.get(block.date) ?? 0) + block.durationMinutes,
    );
    lockedByTask.set(
      block.subtaskId,
      (lockedByTask.get(block.subtaskId) ?? 0) + block.durationMinutes,
    );
  }

  let dayOffset = 0;
  let blockIndex = blocks.length;
  let unscheduledMinutes = 0;
  const blockedDependencies = new Set<string>();
  const usedBlockIds = new Set(blocks.map((block) => block.id));

  for (const subtask of ordered) {
    let taskMinutes = Math.max(
      0,
      subtask.estimatedMinutes - (lockedByTask.get(subtask.id) ?? 0),
    );

    if (
      subtask.status === "blocked" ||
      subtask.dependencies.some((dependency) =>
        blockedDependencies.has(dependency),
      )
    ) {
      blockedDependencies.add(subtask.id);
      unscheduledMinutes += taskMinutes;
      continue;
    }

    const earliestDate = subtask.postponedUntil
      ? fromDateKey(subtask.postponedUntil)
      : startDate;

    while (taskMinutes > 0) {
      const date = addDays(startDate, dayOffset);

      if (date > deadlineDate) {
        unscheduledMinutes += taskMinutes;
        break;
      }

      if (date < earliestDate) {
        dayOffset += 1;
        continue;
      }

      const dateKey = toDateKey(date);
      const usedToday = usedByDate.get(dateKey) ?? 0;
      const availableToday = availability.dailyMinutes - usedToday;

      if (availableToday <= 0) {
        dayOffset += 1;
        continue;
      }

      const durationMinutes = Math.min(taskMinutes, availableToday);
      let blockId = "";
      do {
        blockIndex += 1;
        blockId = `block-${blockIndex}-${subtask.id}`;
      } while (usedBlockIds.has(blockId));
      usedBlockIds.add(blockId);

      blocks.push({
        id: blockId,
        subtaskId: subtask.id,
        date: dateKey,
        startTime: addMinutes(availability.preferredTime, usedToday),
        durationMinutes,
        locked: false,
      });

      taskMinutes -= durationMinutes;
      usedByDate.set(dateKey, usedToday + durationMinutes);
    }
  }

  return {
    blocks: blocks.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.startTime.localeCompare(right.startTime),
    ),
    unscheduledMinutes,
  };
}

export function calculateDeadlineRisk(
  subtasks: Subtask[],
  deadline: string,
  availability: Availability,
  now = new Date(),
): DeadlineRisk {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(deadline);
  end.setHours(23, 59, 59, 999);
  const days = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1,
  );
  const remainingMinutes = subtasks
    .filter((task) => task.status !== "completed")
    .reduce((total, task) => total + task.estimatedMinutes, 0);
  const capacityMinutes = days * availability.dailyMinutes;

  return {
    capacityMinutes,
    remainingMinutes,
    shortfallMinutes: Math.max(0, remainingMinutes - capacityMinutes),
  };
}
