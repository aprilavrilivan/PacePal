import type { Assignment } from "@/features/pacepal/model";
import type { RefinementOperation } from "@/features/pacepal/refinement";

function quoted(values: string[]) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length <= 3) return unique.map((value) => `“${value}”`).join("、");
  return `${unique
    .slice(0, 3)
    .map((value) => `“${value}”`)
    .join("、")}等 ${unique.length} 项`;
}

export function summarizeRefinementOperations(
  assignment: Assignment,
  operations: RefinementOperation[],
) {
  const taskById = new Map(
    assignment.subtasks.map((task) => [task.id, task.title]),
  );
  const completed: string[] = [];
  const blocked: string[] = [];
  const progressed: string[] = [];
  const resetToTodo: string[] = [];
  const paused: string[] = [];
  const reopened: string[] = [];
  const edited: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  let reordered = 0;
  let estimatesChanged = 0;
  let dependenciesChanged = 0;
  let rescheduled = false;
  let availabilityChanged = false;

  for (const operation of operations) {
    if (operation.type === "set_status") {
      const title = taskById.get(operation.taskId) ?? operation.taskId;
      if (operation.status === "completed") completed.push(title);
      else if (operation.status === "blocked") blocked.push(title);
      else if (operation.status === "in_progress") progressed.push(title);
      else if (operation.status === "todo") resetToTodo.push(title);
      else if (["paused", "postponed"].includes(operation.status)) {
        paused.push(title);
      }
    } else if (operation.type === "reopen_task") {
      reopened.push(taskById.get(operation.taskId) ?? operation.taskId);
    } else if (operation.type === "update_task") {
      edited.push(
        operation.patch.title ??
          taskById.get(operation.taskId) ??
          operation.taskId,
      );
      if (operation.patch.estimatedMinutes !== undefined) estimatesChanged += 1;
      if (operation.patch.dependencies !== undefined) dependenciesChanged += 1;
    } else if (operation.type === "add_task") {
      added.push(operation.task.title);
      taskById.set(operation.task.id, operation.task.title);
    } else if (operation.type === "remove_task") {
      removed.push(taskById.get(operation.taskId) ?? operation.taskId);
    } else if (operation.type === "reorder_tasks") {
      reordered = operation.taskIds.length;
    } else if (operation.type === "reschedule") {
      rescheduled = true;
    } else if (operation.type === "set_availability") {
      availabilityChanged = true;
    }
  }

  const changes: string[] = [];
  if (completed.length) changes.push(`将 ${quoted(completed)} 标记为完成`);
  if (blocked.length) changes.push(`将 ${quoted(blocked)} 标记为受阻`);
  if (progressed.length) changes.push(`将 ${quoted(progressed)} 标记为进行中`);
  if (resetToTodo.length) {
    changes.push(`将 ${quoted(resetToTodo)} 调整为待开始`);
  }
  if (paused.length) changes.push(`暂停或延期 ${quoted(paused)}`);
  if (reopened.length) changes.push(`重新打开 ${quoted(reopened)}`);
  if (added.length) changes.push(`新增 ${quoted(added)}`);
  if (removed.length) changes.push(`移除 ${quoted(removed)}`);
  if (edited.length) {
    const details = [
      estimatesChanged ? `校准 ${estimatesChanged} 项耗时` : "",
      dependenciesChanged ? `更新 ${dependenciesChanged} 项依赖` : "",
    ].filter(Boolean);
    changes.push(
      details.length > 0
        ? `${details.join("并")}（涉及 ${quoted(edited)}）`
        : `更新 ${quoted(edited)}`,
    );
  }
  if (reordered) changes.push(`重新排列 ${reordered} 个未完成步骤`);
  if (availabilityChanged) changes.push("更新计划时间设置");

  if (changes.length === 0 && rescheduled) {
    return "我已根据当前进度重新计算后续安排；任务内容和顺序保持不变。";
  }
  if (changes.length === 0) return "我没有修改已保存的计划。";

  const schedule = rescheduled
    ? blocked.length > 0
      ? "，并优先重排其他可执行工作"
      : "，并重新计算后续安排"
    : "";
  return `我已${changes.join("；")}${schedule}。`;
}
