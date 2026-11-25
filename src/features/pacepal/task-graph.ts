import type { Subtask } from "@/features/pacepal/model";

/**
 * Manual drag-and-drop uses the visible order as a simple dependency chain.
 * AI-authored plans keep their richer dependency graph and never pass through
 * this helper.
 */
export function chainTasksByOrder(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((subtask, index) => ({
    ...subtask,
    dependencies: index === 0 ? [] : [subtasks[index - 1]!.id],
  }));
}
