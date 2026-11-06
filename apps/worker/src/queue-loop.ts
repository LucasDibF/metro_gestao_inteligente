export interface QueueLoopOptions {
  shouldStop: () => boolean;
  stop: () => void;
  idleMs?: number;
}
/** Each queue polls on its own, so a slow job in one never delays the other. */
export async function runQueueLoops(
  queues: Array<() => Promise<boolean>>,
  { shouldStop, stop, idleMs = 2000 }: QueueLoopOptions,
): Promise<void> {
  const results = await Promise.allSettled(
    queues.map(async (processNext) => {
      try {
        while (!shouldStop()) {
          if (!(await processNext())) await new Promise((resolve) => setTimeout(resolve, idleMs));
        }
      } catch (error) {
        stop();
        throw error;
      }
    }),
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
}
