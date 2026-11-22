import type { Assignment, Subtask } from "@/features/pacepal/model";
import type {
  RefinementOperation,
  RefinementOutput,
} from "@/features/pacepal/refinement";

const conceptGroups = [
  ["主题", "选题", "题目", "研究问题", "研究方向"],
  ["要求", "需求", "题意", "作业说明"],
  ["资料", "史料", "文献", "来源", "调研", "研究"],
  ["提纲", "大纲", "结构", "框架"],
  ["初稿", "第一稿", "正文", "撰写", "写作"],
  ["润色", "修改", "校对", "格式", "引用"],
  ["提交", "核对", "检查", "上传"],
] as const;

function progressFragment(message: string) {
  return message.split(/你看|请看|接下来|下一步|[。！？\n]/)[0] ?? message;
}

function taskScore(task: Subtask, message: string) {
  const taskText = `${task.title} ${task.description} ${task.completionCriteria}`;
  let score = message.includes(task.title) ? 20 : 0;

  for (const group of conceptGroups) {
    if (
      group.some((term) => message.includes(term)) &&
      group.some((term) => taskText.includes(term))
    ) {
      score += 4;
    }
  }

  for (let index = 0; index < task.title.length - 1; index += 1) {
    const pair = task.title.slice(index, index + 2);
    if (!/[\s：:，,。.!！?？]/.test(pair) && message.includes(pair)) {
      score += 1;
    }
  }

  return score;
}

function findReferencedTask(assignment: Assignment, message: string) {
  const candidates = assignment.subtasks.filter(
    (task) => task.status !== "completed",
  );
  if (candidates.length === 0) return null;

  if (/(第一|第1|首个|第一个)/.test(message)) return candidates[0];
  if (/(最后|最终|末尾)/.test(message)) return candidates.at(-1) ?? null;

  const ranked = candidates
    .map((task) => ({ score: taskScore(task, message), task }))
    .sort((left, right) => right.score - left.score);
  if ((ranked[0]?.score ?? 0) >= 2) return ranked[0]?.task ?? null;
  return candidates.length === 1 ? candidates[0] : null;
}

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
    const dailyMinutes = Math.max(15, Math.min(240, Number(availableMatch[1])));
    return {
      assistantMessage: `已把每天可用时间调整为 ${dailyMinutes} 分钟，并重排后续任务。`,
      changed: true,
      operations: [
        { type: "set_availability", availability: { dailyMinutes } },
        { type: "reschedule" },
      ],
    };
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
      assistantMessage:
        "已根据当前进度、截止时间和每日可用时间重新安排后续任务。",
      changed: true,
      operations: [{ type: "reschedule" }],
    };
  }

  return unchanged(
    "我没有擅自修改计划。你可以告诉我完成了哪一步、哪里卡住，或希望如何拆分任务。",
  );
}
