import SqliteWorker from '@/workers/sqlite.worker.ts?worker'
import { ProcessedOperations } from '../idempotency'

type WorkerOk = { id: number; ok: true; payload: unknown }
type WorkerErr = { id: number; ok: false; error: string }

export class CompanySqlite {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  readonly operations = new ProcessedOperations()
  persistOk = false
  vfsName = 'none'

  async runOnce<T>(operationId: string, work: () => Promise<T>): Promise<{ status: 'applied' | 'duplicate'; value: T }> {
    const existing = await this.query<{ result_json: string }>(
      'select result_json from processed_operations where operation_id = ?',
      [operationId],
    )
    if (existing[0]) {
      return { status: 'duplicate', value: JSON.parse(existing[0].result_json) as T }
    }
    const value = await work()
    await this.exec(
      'insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)',
      [operationId, JSON.stringify(value), new Date().toISOString()],
    )
    return { status: 'applied', value }
  }

  async open(companyId: string): Promise<void> {
    this.close()
    this.worker = new SqliteWorker()
    this.worker.onmessage = (event: MessageEvent<WorkerOk | WorkerErr>) => {
      const pending = this.pending.get(event.data.id)
      if (!pending) return
      this.pending.delete(event.data.id)
      if (event.data.ok) pending.resolve(event.data.payload)
      else pending.reject(new Error(event.data.error))
    }
    const payload = (await this.send('open', { companyId })) as {
      persistOk: boolean
      vfsName?: string
    }
    this.persistOk = payload.persistOk
    this.vfsName = payload.vfsName ?? 'unknown'
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.send('exec', { sql, params })
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const payload = (await this.send('query', { sql, params })) as {
      rows: T[]
    }
    return payload.rows
  }

  close() {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }

  private send(type: string, extra: Record<string, unknown>) {
    if (!this.worker) {
      return Promise.reject(new Error('SQLite worker가 없습니다.'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker?.postMessage({ id, type, ...extra })
    })
  }
}
