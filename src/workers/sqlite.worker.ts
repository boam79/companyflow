import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { companyDbFileName } from '../lib/companyPaths'
import { LOCAL_MIGRATIONS } from '../lib/sqlite/schema'

type Incoming =
  | { id: number; type: 'open'; companyId: string }
  | { id: number; type: 'exec'; sql: string; params?: unknown[] }
  | { id: number; type: 'query'; sql: string; params?: unknown[] }
  | { id: number; type: 'batch'; statements: { sql: string; params?: unknown[] }[] }
  | { id: number; type: 'close' }

type DbHandle = {
  exec: (args: {
    sql: string
    bind?: unknown[]
    rowMode?: string
    returnValue?: string
  }) => unknown
  close: () => void
}

type SahPool = {
  OpfsSAHPoolDb: new (filename: string) => DbHandle
}

type Sqlite3Ns = {
  installOpfsSAHPoolVfs: (options: {
    name?: string
    directory?: string
    initialCapacity?: number
    forceReinitIfPreviouslyFailed?: boolean
  }) => Promise<SahPool>
  oo1: {
    OpfsDb?: new (filename: string) => DbHandle
    DB: new (filename: string, flags?: string) => DbHandle
  }
  opfs?: unknown
}

let db: DbHandle | null = null
let persistOk = false
let vfsName = 'none'

function reply(id: number, payload: unknown) {
  self.postMessage({ id, ok: true, payload })
}

function fail(id: number, message: string) {
  self.postMessage({ id, ok: false, error: message })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function openDb(companyId: string) {
  if (!navigator.storage?.getDirectory) {
    throw new Error('이 브라우저는 OPFS를 지원하지 않습니다. 지정 Chrome을 사용하세요.')
  }

  const sqlite3 = (await sqlite3InitModule()) as unknown as Sqlite3Ns
  const fileName = companyDbFileName(companyId)
  const sahErrors: string[] = []

  try {
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: 'companyflow',
      directory: '.companyflow-sah',
      initialCapacity: 8,
      forceReinitIfPreviouslyFailed: true,
    })
    db = new pool.OpfsSAHPoolDb(fileName)
    persistOk = true
    vfsName = 'opfs-sahpool'
  } catch (error) {
    sahErrors.push(errorMessage(error))
    if ('opfs' in sqlite3 && sqlite3.oo1.OpfsDb) {
      db = new sqlite3.oo1.OpfsDb(`/${fileName}`)
      persistOk = true
      vfsName = 'opfs'
    }
  }

  if (!db || !persistOk) {
    throw new Error(
      `OPFS 영속 DB를 열 수 없습니다. isolated=${String((self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated)} sah=${sahErrors.join('; ') || '없음'} classicOpfs=${'opfs' in sqlite3}`,
    )
  }

  for (const sql of LOCAL_MIGRATIONS) {
    db.exec({ sql })
  }
  db.exec({
    sql: 'insert or replace into meta(key, value) values(?, ?)',
    bind: ['company_id', companyId],
  })
  db.exec({
    sql: 'insert or replace into meta(key, value) values(?, ?)',
    bind: ['schema_version', String(LOCAL_MIGRATIONS.length)],
  })
  db.exec({
    sql: 'insert or replace into meta(key, value) values(?, ?)',
    bind: ['vfs', vfsName],
  })
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data
  try {
    if (msg.type === 'open') {
      await openDb(msg.companyId)
      reply(msg.id, { persistOk, vfsName })
      return
    }
    if (!db) {
      fail(msg.id, 'DB가 열려 있지 않습니다.')
      return
    }
    if (msg.type === 'exec') {
      db.exec({ sql: msg.sql, bind: msg.params })
      reply(msg.id, { persistOk, vfsName })
      return
    }
    if (msg.type === 'batch') {
      db.exec({ sql: 'BEGIN IMMEDIATE' })
      try {
        for (const statement of msg.statements) {
          db.exec({ sql: statement.sql, bind: statement.params })
        }
        db.exec({ sql: 'COMMIT' })
      } catch (error) {
        try {
          db.exec({ sql: 'ROLLBACK' })
        } catch {
          // 이미 롤백됐거나 BEGIN이 실패한 경우
        }
        throw error
      }
      reply(msg.id, { persistOk, vfsName, count: msg.statements.length })
      return
    }
    if (msg.type === 'query') {
      const rows = db.exec({
        sql: msg.sql,
        bind: msg.params,
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      reply(msg.id, { rows: Array.isArray(rows) ? rows : [], persistOk, vfsName })
      return
    }
    if (msg.type === 'close') {
      db.close()
      db = null
      persistOk = false
      vfsName = 'none'
      reply(msg.id, {})
    }
  } catch (error) {
    fail(msg.id, errorMessage(error))
  }
}

export {}
