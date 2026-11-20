import type {
  Availability,
  ScheduleBlock,
  Subtask,
} from "@/features/pacepal/model";

export type ScheduleResult = {
  blocks: ScheduleBlock[];
  unscheduledMinutes: number;
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
): ScheduleResult {
  const deadlineDate = new Date(deadline);
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);
  deadlineDate.setHours(23, 59, 59, 999);

  const ordered = orderByDependencies(subtasks);
  const blocks: ScheduleBlock[] = [];
  let dayOffset = 0;
  let usedToday = 0;
  let blockIndex = 0;
  let unscheduledMinutes = 0;

  for (const subtask of ordered) {
    let taskMinutes = subtask.estimatedMinutes;

    while (taskMinutes > 0) {
      const date = addDays(startDate, dayOffset);

      if (date > deadlineDate) {
        unscheduledMinutes += taskMinutes;
        break;
      }

      const availableToday = availability.dailyMinutes - usedToday;

      if (availableToday <= 0) {
        dayOffset += 1;
        usedToday = 0;
        continue;
      }

      const durationMinutes = Math.min(taskMinutes, availableToday);

      blocks.push({
        id: `block-${blockIndex + 1}-${subtask.id}`,
        subtaskId: subtask.id,
        date: toDateKey(date),
        startTime: addMinutes(availability.preferredTime, usedToday),
        durationMinutes,
      });

      taskMinutes -= durationMinutes;
      usedToday += durationMinutes;
      blockIndex += 1;
    }
  }

  return { blocks, unscheduledMinutes };
}
