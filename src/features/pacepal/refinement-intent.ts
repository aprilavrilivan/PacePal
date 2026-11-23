import type { Assignment, Subtask } from "@/features/pacepal/model";

const conceptGroups = [
  ["主题", "选题", "题目", "研究问题", "研究方向", "topic", "question"],
  ["要求", "需求", "题意", "任务说明", "requirement", "scope"],
  [
    "资料",
    "史料",
    "文献",
    "来源",
    "调研",
    "研究",
    "literature",
    "source",
    "research",
  ],
  ["提纲", "大纲", "结构", "框架", "outline", "structure"],
  ["初稿", "第一稿", "正文", "撰写", "写作", "draft", "writing", "paper"],
  ["实验", "操控", "操作", "manipulation", "experiment"],
  ["平衡", "方案", "选项", "balanced", "option"],
  ["润色", "修改", "校对", "格式", "引用", "revise", "format", "edit"],
  ["提交", "核对", "检查", "上传", "submit", "review", "check"],
] as const;

export function progressFragment(message: string) {
  return message.split(/你看|请看|接下来|下一步|[。！？\n]/)[0] ?? message;
}

function taskScore(task: Subtask, message: string) {
  const normalizedMessage = message.toLocaleLowerCase();
  const taskText =
    `${task.title} ${task.description} ${task.completionCriteria}`.toLocaleLowerCase();
  let score = normalizedMessage.includes(task.title.toLocaleLowerCase())
    ? 20
    : 0;

  for (const group of conceptGroups) {
    if (
      group.some((term) => normalizedMessage.includes(term)) &&
      group.some((term) => taskText.includes(term))
    ) {
      score += 4;
    }
  }

  for (let index = 0; index < task.title.length - 1; index += 1) {
    const pair = task.title.slice(index, index + 2);
    if (
      !/[\s：:，,。.!！?？]/.test(pair) &&
      normalizedMessage.includes(pair.toLocaleLowerCase())
    ) {
      score += 1;
    }
  }

  return score;
}

export function findReferencedTask(assignment: Assignment, message: string) {
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

export function findReferencedTasks(
  assignment: Assignment,
  message: string,
  includeCompleted = false,
) {
  return assignment.subtasks
    .filter((task) => includeCompleted || task.status !== "completed")
    .map((task) => ({ score: taskScore(task, message), task }))
    .filter(({ score }) => score >= 2)
    .sort((left, right) => right.score - left.score)
    .map(({ task }) => task);
}

export function findTaskForPhrase(
  assignment: Assignment,
  phrase: string,
  includeCompleted = true,
) {
  return findReferencedTasks(assignment, phrase, includeCompleted)[0] ?? null;
}
