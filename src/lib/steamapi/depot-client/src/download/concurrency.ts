export interface MapConcurrentOptions {
  /**
   * Stop dispatching new work after the first failure, but still wait for
   * already-started workers to finish before rejecting. Defaults to true.
   */
  stopOnError?: boolean;
}

export interface MapConcurrentFailure<T> {
  index: number;
  item: T;
  error: unknown;
}

function createConcurrentMapError<T>(failures: MapConcurrentFailure<T>[]): unknown {
  if (failures.length === 1) 
    return failures[0]!.error;
  

  const message = `${failures.length} concurrent worker operations failed`;
  const errors = failures.map(failure => failure.error);

  if (typeof AggregateError !== 'undefined') {
    const error = new AggregateError(errors, message) as AggregateError & { failures?: MapConcurrentFailure<T>[] };
    error.failures = failures;
    return error;
  }

  const error = new Error(message) as Error & { errors?: unknown[]; failures?: MapConcurrentFailure<T>[] };
  error.errors = errors;
  error.failures = failures;
  return error;
}

export function normalizeConcurrency(concurrency: number, name = 'concurrency'): number {
  if (!Number.isFinite(concurrency)) 
    throw new RangeError(`${name} must be a finite number`);
  

  const limit = Math.floor(concurrency);
  if (limit < 1) 
    throw new RangeError(`${name} must be at least 1`);
  

  return limit;
}

export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options: MapConcurrentOptions = {}
): Promise<R[]> {
  const limit = normalizeConcurrency(concurrency);
  const results = new Array<R>(items.length);
  const failures: MapConcurrentFailure<T>[] = [];
  const stopOnError = options.stopOnError ?? true;

  let cursor = 0;
  let stopDispatching = false;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      if (stopDispatching && stopOnError) 
        return;
      

      const index = cursor++;
      if (index >= items.length) 
        return;
      

      try {
        results[index] = await worker(items[index]!, index);
      } catch (error) {
        failures.push({ index, item: items[index]!, error });

        if (stopOnError) {
          stopDispatching = true;
          return;
        }
      }
    }
  });

  await Promise.all(workers);

  if (failures.length > 0) 
    throw createConcurrentMapError(failures);
  

  return results;
}
