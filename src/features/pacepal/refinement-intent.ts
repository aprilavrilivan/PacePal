import type { Assignment, Subtask } from "@/features/pacepal/model";

const conceptGroups = [
  ["主题", "选题", "题目", "研究问题", "研究方向"],
  ["要求", "需求", "题意", "作业说明"],
  ["资料", "史料", "文献", "来源", "调研", "研究"],
  ["提纲", "大纲", "结构", "框架"],
  ["初稿", "第一稿", "正文", "撰写", "写作"],
  ["润色", "修改", "校对", "格式", "引用"],
  ["提交", "核对", "检查", "上传"],
] as const;

export function progressFragment(message: string) {
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
