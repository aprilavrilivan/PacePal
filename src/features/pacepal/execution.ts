import type { CheckIn, Subtask } from "@/features/pacepal/model";

export type TaskRecommendation = {
  isPartial: boolean;
  suggestedMinutes: number;
  task: Subtask;
};

const energyRank = { low: 1, medium: 2, high: 3 } as const;
const statusRank: Record<Subtask["status"], number> = {
  in_progress: 50,
  paused: 40,
  todo: 30,
  postponed: 20,
  blocked: 0,
  completed: 0,
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function recommendNextTask(
  subtasks: Subtask[],
  checkIn: CheckIn,
  now = new Date(),
): TaskRecommendation | null {
  const completed = new Set(
    subtasks
      .filter((task) => task.status === "completed")
      .map((task) => task.id),
  );
  const today = dateKey(now);

  const candidates = subtasks
    .filter(
      (task) =>
        task.status !== "completed" &&
        task.status !== "blocked" &&
        (!task.postponedUntil || task.postponedUntil <= today) &&
        task.dependencies.every((dependency) => completed.has(dependency)),
    )
    .map((task, index) => {
      const fitsTime = task.estimatedMinutes <= checkIn.availableMinutes;
      const fitsEnergy =
        energyRank[task.difficulty] <= energyRank[checkIn.energy];
      return {
        index,
        score:
          statusRank[task.status] + (fitsTime ? 20 : 0) + (fitsEnergy ? 10 : 0),
        task,
      };
    })
    .sort(
      (left, right) => right.score - left.score || left.index - right.index,
    );

  const task = candidates[0]?.task;
  if (!task) return null;

  return {
    isPartial: task.estimatedMinutes > checkIn.availableMinutes,
    suggestedMinutes: Math.min(task.estimatedMinutes, checkIn.availableMinutes),
    task,
  };
}
