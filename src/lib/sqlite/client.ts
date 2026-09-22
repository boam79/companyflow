import SqliteWorker from '@/workers/sqlite.worker.ts?worker'
import { ProcessedOperations } from '../idempotency'
import { acquireCompanyWriteLock } from '../tabLock'
import { assertCompanyStorageId } from '../companyPaths'
import { explainSqliteOpenError, isSahHandleBusy } from './openError'
import { sqliteOpenMode } from './openPlan'
import { createOpQueue } from './opQueue'

type WorkerOk = { id: number; ok: true; payload: unknown }
type WorkerErr = { id: number; ok: false; error: string }

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class CompanySqlite {
  private worker: Worker | null = null
  private nextId = 1
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >()
  private lockRelease: (() => void) | null = null
  private readonly enqueue = createOpQueue()
  readonly operations = new ProcessedOperations()
  persistOk = false
  vfsName = 'none'
  companyId = ''

  isOpen(companyId: string): boolean {
    return Boolean(this.worker && this.persistOk && this.companyId === companyId)
  }

  async runOnce<T>(operationId: string, work: () => Promise<T>): Promise<{ status: 'applied' | 'duplicate'; value: T }> {
    const existing = await this.query<{ result_json: string }>(
      'select result_json from processed_operations where operation_id = ?',
      [operationId],
    )
    if (existing[0]) {
      return { status: 'duplicate', value: JSON.parse(existing[0].result_json) as T }
    }
    const value = await work()
    await this.exec('insert into processed_operations(operation_id, result_json, created_at) values(?, ?, ?)', [
      operationId,
      JSON.stringify(value),
      new Date().toISOString(),
    ])
    return { status: 'applied', value }
  }

  async open(companyId: string, options?: { force?: boolean; memory?: boolean }): Promise<void> {
    return this.enqueue(() => this.openNow(companyId, options))
  }

  private async openNow(companyId: string, options?: { force?: boolean; memory?: boolean }): Promise<void> {
    const id = assertCompanyStorageId(companyId)
    const memory = sqliteOpenMode({ companyId: id, memory: options?.memory }).memory
    if (!options?.force && this.isOpen(id) && (!memory || this.vfsName === 'memory')) return
    this.close()
    if (!memory) {
      const lock = await acquireCompanyWriteLock(id)
      if (!lock.ok) {
        throw new Error('다른 탭이 이 회사 원본을 사용 중입니다. 그 탭을 닫고 다시 여세요.')
      }
      this.lockRelease = lock.release
    }
    try {
      await this.startWorker(id, memory)
    } catch (error) {
      if (!memory && isSahHandleBusy(error instanceof Error ? error.message : String(error))) {
        this.detachWorker()
        await sleep(300)
        try {
          await this.startWorker(id, memory)
          return
        } catch (retryError) {
          this.close()
          throw new Error(explainSqliteOpenError(retryError))
        }
      }
      this.close()
      throw new Error(explainSqliteOpenError(error))
    }
  }

  async exec(sql: string, params?: unknown[]): Promise<void> {
    await this.enqueue(() => this.execNow(sql, params))
  }

  private async execNow(sql: string, params?: unknown[]): Promise<void> {
    await this.send('exec', { sql, params })
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.enqueue(() => this.queryNow<T>(sql, params))
  }

  private async queryNow<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const payload = (await this.send('query', { sql, params })) as {
      rows: T[]
    }
    return payload.rows
  }

  async batch(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
    await this.enqueue(() => this.send('batch', { statements }).then(() => undefined))
  }

  close() {
    this.detachWorker()
    this.lockRelease?.()
    this.lockRelease = null
    this.persistOk = false
    this.vfsName = 'none'
    this.companyId = ''
  }

  private async startWorker(companyId: string, memory = false): Promise<void> {
    this.detachWorker()
    this.worker = new SqliteWorker()
    this.worker.onmessage = (event: MessageEvent<WorkerOk | WorkerErr>) => {
      const pending = this.pending.get(event.data.id)
      if (!pending) return
      this.pending.delete(event.data.id)
      if (event.data.ok) pending.resolve(event.data.payload)
      else pending.reject(new Error(event.data.error))
    }
    const payload = (await this.send('open', { companyId, memory })) as {
      persistOk: boolean
      vfsName?: string
    }
    this.persistOk = payload.persistOk
    this.vfsName = payload.vfsName ?? 'unknown'
    this.companyId = companyId
  }

  private detachWorker() {
    this.worker?.terminate()
    this.worker = null
    for (const pending of this.pending.values()) {
      pending.reject(new Error('SQLite worker가 닫혔습니다.'))
    }
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
