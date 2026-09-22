export function createOpQueue() {
  let tail: Promise<unknown> = Promise.resolve()

  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = tail.then(work, work)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}
