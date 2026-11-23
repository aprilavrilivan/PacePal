import type { Assignment } from "@/features/pacepal/model";
import {
  findReferencedTask,
  progressFragment,
} from "@/features/pacepal/refinement-intent";
import type {
  RefinementOperation,
  RefinementOutput,
} from "@/features/pacepal/refinement";

function unchanged(message: string): RefinementOutput {
  return { assistantMessage: message, changed: false, operations: [] };
}

export function generateMockRefinement(
  assignment: Assignment,
  message: string,
): RefinementOutput {
  const operations: RefinementOperation[] = [];
  const availableMatch = message.match(/(\d{1,3})\s*分钟/);

  if (availableMatch && /(每天|时间|可用|安排)/.test(message)) {
    return unchanged(
      "不记录固定的每日可用时间。你可以在“今日重点”按当下可用时间和精力获取推荐。",
    );
  }

  if (
    /(已完成|完成了|做完了|已经做完|搞定了|finished|\bdone\b)/i.test(message)
  ) {
    const task = findReferencedTask(assignment, progressFragment(message));
    if (task) {
      return {
        assistantMessage: `已将“${task.title}”标记为完成，并根据当前进度重排后续任务。`,
        changed: true,
        operations: [
          { type: "set_status", taskId: task.id, status: "completed" },
          { type: "reschedule" },
        ],
      };
    }
  }

  if (/(卡住|受阻|无法继续|blocked)/i.test(message)) {
    const task = findReferencedTask(assignment, message);
    if (task) {
      return {
        assistantMessage: `已将“${task.title}”标记为受阻，暂时推荐其他可执行任务。`,
        changed: true,
        operations: [
          { type: "set_status", taskId: task.id, status: "blocked" },
          { type: "reschedule" },
        ],
      };
    }
  }

  if (/(拆|小一点|太大|难开始)/.test(message)) {
    const target = findReferencedTask(assignment, message);
    if (target) {
      const firstMinutes = Math.max(
        10,
        Math.ceil(target.estimatedMinutes / 2 / 5) * 5,
      );
      const followUpId = `${target.id}-next`;
      operations.push({
        type: "update_task",
        taskId: target.id,
        patch: {
          estimatedMinutes: firstMinutes,
          title: `${target.title}：先完成第一步`,
        },
      });
      operations.push({
        type: "add_task",
        afterTaskId: target.id,
        task: {
          completionCriteria: target.completionCriteria,
          dependencies: [target.id],
          description: target.description,
          difficulty: target.difficulty,
          estimatedMinutes: Math.max(
            10,
            target.estimatedMinutes - firstMinutes,
          ),
          id: followUpId,
          title: `${target.title}：继续完成`,
        },
      });
      operations.push({ type: "reschedule" });
      return {
        assistantMessage: `已把“${target.title}”拆成两个更容易开始的步骤。`,
        changed: true,
        operations,
      };
    }
  }

  if (/(重新平衡|重新安排|重排|调整后续)/.test(message)) {
    return {
      assistantMessage: "已根据当前进度、截止时间和任务依赖重新安排后续任务。",
      changed: true,
      operations: [{ type: "reschedule" }],
    };
  }

  return unchanged(
    "我没有擅自修改计划。你可以告诉我完成了哪一步、哪里卡住，或希望如何拆分任务。",
  );
}
