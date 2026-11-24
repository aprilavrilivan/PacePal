export class PlanningTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI planning request timed out after ${timeoutMs}ms.`);
    this.name = "PlanningTimeoutError";
  }
}

/**
 * Rejects on our own deadline even when a provider SDK does not promptly
 * settle after receiving an abort signal. The SDK still receives the signal
 * so the underlying request can be cancelled when supported.
 */
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
