import type { RefinementOutput } from "@/features/pacepal/refinement";
import type { Assignment } from "@/features/pacepal/model";

function taskSnapshot(assignment: Assignment) {
  return assignment.subtasks.map(
    ({
      id,
      title,
      description,
      estimatedMinutes,
      completionCriteria,
      difficulty,
      dependencies,
    }) => ({
      id,
      title,
      description,
      estimatedMinutes,
      completionCriteria,
      difficulty,
      dependencies,
    }),
  );
}

export function generateMockRefinement(
  assignment: Assignment,
  message: string,
): RefinementOutput {
  const subtasks = taskSnapshot(assignment);
  const availability = { ...assignment.availability };
  const availableMatch = message.match(/(\d{2,3})\s*分钟/);

  if (availableMatch && /(每天|时间|可用|安排)/.test(message)) {
    availability.dailyMinutes = Math.max(
      15,
      Math.min(240, Number(availableMatch[1])),
    );
    return {
      assistantMessage: `已把每天可用时间调整为 ${availability.dailyMinutes} 分钟，并重排后续任务。`,
      availability,
      changed: true,
      subtasks,
    };
  }

  if (/(拆|小一点|太大|难开始)/.test(message)) {
    const targetIndex = assignment.subtasks.findIndex(
      (task) => task.status !== "completed",
    );
    const target = subtasks[targetIndex];
    if (target) {
      const originalMinutes = target.estimatedMinutes;
      const firstMinutes = Math.max(10, Math.ceil(originalMinutes / 2 / 5) * 5);
      const followUpId = `${target.id}-next`;
      subtasks[targetIndex] = {
        ...target,
        estimatedMinutes: firstMinutes,
        title: `${target.title}：先完成第一步`,
      };
      subtasks.splice(targetIndex + 1, 0, {
        ...target,
        dependencies: [target.id],
        estimatedMinutes: Math.max(10, originalMinutes - firstMinutes),
        id: followUpId,
        title: `${target.title}：继续完成`,
      });
      for (const task of subtasks.slice(targetIndex + 2)) {
        task.dependencies = task.dependencies.map((dependency) =>
          dependency === target.id ? followUpId : dependency,
        );
      }
      return {
        assistantMessage: `已把“${target.title}”拆成两个更容易开始的步骤。`,
        availability,
        changed: true,
        subtasks,
      };
    }
  }

  return {
    assistantMessage:
      "我可以直接拆分任务、调整每天可用时间，或重新平衡后续安排。",
    availability,
    changed: false,
    subtasks,
  };
}
