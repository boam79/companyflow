import { describe, expect, it } from 'vitest'
import { createOpQueue } from './opQueue'

describe('createOpQueue', () => {
  it('runs the next job only after the previous one finishes', async () => {
    const enqueue = createOpQueue()
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const first = enqueue(
      () =>
        new Promise<void>((resolve) => {
          order.push('first-start')
          releaseFirst = () => {
            order.push('first-end')
            resolve()
          }
        }),
    )
    const second = enqueue(async () => {
      order.push('second')
    })

    await Promise.resolve()
    expect(order).toEqual(['first-start'])
    releaseFirst()
    await first
    await second
    expect(order).toEqual(['first-start', 'first-end', 'second'])
  })
})