export class PlanningTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI planning request timed out after ${timeoutMs}ms.`);
    this.name = "PlanningTimeoutError";
  }
}

export function withPlanningTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new PlanningTimeoutError(timeoutMs));
    }, timeoutMs);
    operation(controller.signal).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
