import type { Assignment, CheckIn, Subtask } from "@/features/pacepal/model";

export type TaskRecommendation = {
  isPartial: boolean;
  suggestedMinutes: number;
  task: Subtask;
};

export type GlobalTaskRecommendation = TaskRecommendation & {
  assignment: Assignment;
  reasons: string[];
  score: number;
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

const priorityScore: Record<Assignment["priority"], number> = {
  high: 30,
  medium: 20,
  low: 10,
};

export function recommendAcrossAssignments(
  assignments: Assignment[],
  checkIn: CheckIn,
  now = new Date(),
): GlobalTaskRecommendation | null {
  const today = dateKey(now);
  const candidates: GlobalTaskRecommendation[] = [];

  for (const assignment of assignments) {
    const completed = new Set(
      assignment.subtasks
        .filter((task) => task.status === "completed")
        .map((task) => task.id),
    );
    const daysRemaining = Math.max(
      0,
      (new Date(assignment.deadline).getTime() - now.getTime()) / 86_400_000,
    );
    const urgency = Math.max(0, 35 - Math.min(35, daysRemaining * 2.5));
    for (const task of assignment.subtasks) {
      if (
        task.status === "completed" ||
        task.status === "blocked" ||
        (task.postponedUntil && task.postponedUntil > today) ||
        !task.dependencies.every((dependency) => completed.has(dependency))
      ) {
        continue;
      }

      const fitsTime = task.estimatedMinutes <= checkIn.availableMinutes;
      const fitsEnergy =
        energyRank[task.difficulty] <= energyRank[checkIn.energy];
      const continuity =
        task.status === "in_progress" ? 16 : task.status === "paused" ? 8 : 0;
      const score =
        priorityScore[assignment.priority] +
        urgency +
        (fitsEnergy ? 15 : -10) +
        (fitsTime ? 10 : 4) +
        continuity;
      const reasons = [
        daysRemaining < 3
          ? "临近截止"
          : assignment.priority === "high"
            ? "优先级高"
            : "当前可推进",
        fitsEnergy ? "匹配当前精力" : "建议先完成一部分",
        fitsTime ? "适合可用时间" : `先做 ${checkIn.availableMinutes} 分钟`,
      ];

      candidates.push({
        assignment,
        isPartial: !fitsTime,
        reasons,
        score,
        suggestedMinutes: Math.min(
          task.estimatedMinutes,
          checkIn.availableMinutes,
        ),
        task,
      });
    }
  }

  return candidates.sort((left, right) => right.score - left.score)[0] ?? null;
}
