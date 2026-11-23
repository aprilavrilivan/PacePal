import type { Assignment } from "@/features/pacepal/model";
import {
  findReferencedTask,
  findReferencedTasks,
  findTaskForPhrase,
  progressFragment,
} from "@/features/pacepal/refinement-intent";
import type {
  RefinementOperation,
  RefinementOutput,
} from "@/features/pacepal/refinement";

function unchanged(message: string): RefinementOutput {
  return { assistantMessage: message, changed: false, operations: [] };
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function quotedWork(message: string) {
  return unique(
    [...message.matchAll(/["“”'‘’]([^"“”'‘’]{2,80})["“”'‘’]/g)]
      .map((match) => match[1]?.trim() ?? "")
      .filter(Boolean),
  );
}

function remainingScopeFragment(message: string) {
  const marker = /(只剩(?:下)?|还剩(?:下)?|剩余|remaining|left|only)/i.exec(
    message,
  );
  if (!marker) return "";

  const afterMarker = message.slice(marker.index + marker[0].length);
  const end =
    afterMarker.search(
      /(?:其他|其余|剩下的|everything else|all (?:the )?other(?:s)?).{0,16}(?:完成|做完|结束|done|finished)/i,
    ) ?? -1;
  const scoped = end >= 0 ? afterMarker.slice(0, end) : afterMarker;
  // A remaining-work declaration often spans more than one sentence, for
  // example “只剩 A、B。然后是 C，其他都完成了”. Keep everything up to the
  // explicit “其他都完成” boundary instead of dropping C at the first full
  // stop. Quoted-work extraction below will still isolate the concrete items.
  return scoped.replace(/^[：:\s，,]+|[：:\s，,]+$/g, "").trim();
}

function workPhrases(fragment: string) {
  const quoted = quotedWork(fragment);
  if (quoted.length > 0) return quoted;

  return unique(
    fragment
      .split(/(?:、|，|,|；|;|\s+(?:and|then)\s+|\s+和\s*|以及|然后|接着)/i)
      .map((part) => part.replace(/^(?:就是|包括|are|is)\s*/i, "").trim())
      .filter((part) => part.length >= 2),
  );
}

function safeTaskId(title: string, usedIds: Set<string>) {
  const base =
    title
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "new-task";
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function hasAuthoritativeRemainingScope(message: string) {
  return (
    /(只剩|还剩下?|剩余|remaining|left|only)/i.test(message) &&
    /(其他|其余|剩下的|everything else|all other).{0,12}(完成|做完|结束|done|finished)/i.test(
      message,
    )
  );
}

function authoritativeRemainingRefinement(
  assignment: Assignment,
  message: string,
): RefinementOutput | null {
  if (!hasAuthoritativeRemainingScope(message)) return null;

  // Only inspect the clause after “只剩 / only / left”. The same message often
  // names already-completed work before that marker; matching the whole message
  // would incorrectly reopen it as remaining work.
  const remainingFragment = remainingScopeFragment(message);
  const phrases = workPhrases(remainingFragment);
  if (phrases.length === 0) return null;

  const operations: RefinementOperation[] = [];
  const remainingIds: string[] = [];
  const remainingTitles: string[] = [];
  const usedIds = new Set(assignment.subtasks.map((task) => task.id));
  let previousId: string | null = null;

  for (const phrase of phrases) {
    // A short phrase can legitimately share vocabulary with two adjacent
    // steps (for example "format check" and "final submission review").
    // Prefer the strongest task that has not already been claimed by another
    // remaining phrase instead of silently dropping the second item.
    const matched = findReferencedTasks(assignment, phrase, true).find(
      (task) => !remainingIds.includes(task.id),
    );
    if (matched) {
      remainingIds.push(matched.id);
      remainingTitles.push(matched.title);
      previousId = matched.id;
      if (matched.status === "completed") {
        operations.push({
          type: "reopen_task",
          taskId: matched.id,
          status: "todo",
        });
      }
      continue;
    }

    const id = safeTaskId(phrase, usedIds);
    operations.push({
      type: "add_task",
      afterTaskId: previousId,
      task: {
        id,
        title: phrase,
        description: `完成 ${phrase}`,
        estimatedMinutes: 60,
        completionCriteria: `${phrase} 已达到可交付状态`,
        difficulty: "medium",
        dependencies: previousId ? [previousId] : [],
      },
    });
    remainingIds.push(id);
    remainingTitles.push(phrase);
    previousId = id;
  }

  const completedTitles: string[] = [];
  for (const task of assignment.subtasks) {
    if (task.status !== "completed" && !remainingIds.includes(task.id)) {
      operations.push({
        type: "set_status",
        taskId: task.id,
        status: "completed",
      });
      completedTitles.push(task.title);
    }
  }

  if (remainingIds.length > 1) {
    operations.push({ type: "reorder_tasks", taskIds: remainingIds });
  }
  operations.push({ type: "reschedule" });

  const completedSummary =
    completedTitles.length > 0
      ? `并将其余 ${completedTitles.length} 个步骤按你的说明记为完成`
      : "并保留已有完成记录";
  return {
    assistantMessage: `我理解为现在只剩 ${remainingTitles.map((title) => `“${title}”`).join("、")}，其他工作都已经完成。\n\n我已保留或补充这 ${remainingTitles.length} 项剩余工作，${completedSummary}，再按上述顺序重新安排后续计划。`,
    changed: true,
    operations,
  };
}

function explicitOrderRefinement(
  assignment: Assignment,
  message: string,
): RefinementOutput | null {
  const orderMatch = message.match(/先(.{1,100}?)(?:再|然后|接着)(.{1,100})/);
  if (!orderMatch) return null;

  const first = findTaskForPhrase(assignment, orderMatch[1] ?? "", false);
  const second = findTaskForPhrase(assignment, orderMatch[2] ?? "", false);
  if (!first || !second || first.id === second.id) return null;

  const pendingIds = assignment.subtasks
    .filter((task) => task.status !== "completed")
    .map((task) => task.id);
  const orderedIds = [
    first.id,
    second.id,
    ...pendingIds.filter((id) => id !== first.id && id !== second.id),
  ];

  return {
    assistantMessage: `我理解为你希望先做“${first.title}”，再做“${second.title}”。\n\n我已把这两项移到后续任务最前面，并按这个顺序重新计算安排；其他未完成任务保持不变。`,
    changed: true,
    operations: [
      { type: "reorder_tasks", taskIds: orderedIds },
      { type: "reschedule" },
    ],
  };
}

export function generateMockRefinement(
  assignment: Assignment,
  message: string,
): RefinementOutput {
  const operations: RefinementOperation[] = [];
  const availableMatch = message.match(/(\d{1,3})\s*分钟/);

  const remainingScope = authoritativeRemainingRefinement(assignment, message);
  if (remainingScope) return remainingScope;

  const explicitOrder = explicitOrderRefinement(assignment, message);
  if (explicitOrder) return explicitOrder;

  if (
    /(已完成|完成了|做完了|已经做完|搞定了|finished|\bdone\b)/i.test(message)
  ) {
    const progress = progressFragment(message);
    const exactTasks = assignment.subtasks.filter(
      (task) =>
        task.status !== "completed" &&
        progress.toLocaleLowerCase().includes(task.title.toLocaleLowerCase()),
    );
    const tasks =
      exactTasks.length > 0
        ? exactTasks
        : findReferencedTasks(assignment, progress);
    const matchedTasks =
      tasks.length > 0
        ? tasks
        : [findReferencedTask(assignment, progress)].filter(
            (task): task is NonNullable<typeof task> => Boolean(task),
          );
    if (matchedTasks.length > 0) {
      const titles = matchedTasks.map((task) => task.title);
      return {
        assistantMessage: `我理解为 ${titles.map((title) => `“${title}”`).join("、")} 已经完成。\n\n我已更新这 ${titles.length} 项的状态，并根据最新进度重新安排尚未完成的任务。`,
        changed: true,
        operations: [
          ...matchedTasks.map((task): RefinementOperation => ({
            type: "set_status",
            taskId: task.id,
            status: "completed",
          })),
          { type: "reschedule" },
        ],
      };
    }
  }

  if (/(卡住|受阻|无法继续|blocked)/i.test(message)) {
    const task = findReferencedTask(assignment, message);
    if (task) {
      return {
        assistantMessage: `我理解为“${task.title}”目前遇到阻塞，暂时不能继续。\n\n我已把它标记为受阻，并重新安排其他可执行任务；解除阻塞后可以随时继续。`,
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
        assistantMessage: `我理解为“${target.title}”目前太大，不容易直接开始。\n\n我已把它拆成两个更小的连续步骤，保留原有进度记录，并重新安排后续计划。`,
        changed: true,
        operations,
      };
    }
  }

  if (/(重新平衡|重新安排|重排|调整后续)/.test(message)) {
    return {
      assistantMessage:
        "我理解为你希望在不改变任务内容的前提下，重新计算后续执行节奏。\n\n我已根据当前进度、截止时间和任务依赖重新安排后续任务。",
      changed: true,
      operations: [{ type: "reschedule" }],
    };
  }

  if (
    availableMatch &&
    /(?:每天|每日).{0,16}(?:可用|时间)|(?:可用|时间).{0,16}(?:每天|每日)/.test(
      message,
    )
  ) {
    return unchanged(
      "不记录固定的每日可用时间。你可以在“今日重点”按当下可用时间和精力获取推荐。",
    );
  }

  return unchanged(
    "我没有擅自修改计划。你可以告诉我完成了哪一步、哪里卡住，或希望如何拆分任务。",
  );
}
