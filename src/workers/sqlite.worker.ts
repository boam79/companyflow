import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { companyDbFileName } from '../lib/companyPaths'
import { LOCAL_MIGRATIONS } from '../lib/sqlite/schema'

type Incoming =
  | { id: number; type: 'open'; companyId: string }
  | { id: number; type: 'exec'; sql: string; params?: unknown[] }
  | { id: number; type: 'query'; sql: string; params?: unknown[] }
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

let db: DbHandle | null = null
let persistOk = false

function reply(id: number, payload: unknown) {
  self.postMessage({ id, ok: true, payload })
}

function fail(id: number, message: string) {
  self.postMessage({ id, ok: false, error: message })
}

async function openDb(companyId: string) {
  const sqlite3 = await sqlite3InitModule()

  const fileName = `/companyflow/${companyDbFileName(companyId)}`
  if ('opfs' in sqlite3 && sqlite3.oo1.OpfsDb) {
    db = new sqlite3.oo1.OpfsDb(fileName) as DbHandle
    persistOk = true
  } else {
    db = new sqlite3.oo1.DB(fileName, 'ct') as DbHandle
    persistOk = false
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
}

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const msg = event.data
  try {
    if (msg.type === 'open') {
      await openDb(msg.companyId)
      reply(msg.id, { persistOk })
      return
    }
    if (!db) {
      fail(msg.id, 'DB가 열려 있지 않습니다.')
      return
    }
    if (msg.type === 'exec') {
      db.exec({ sql: msg.sql, bind: msg.params })
      reply(msg.id, { persistOk })
      return
    }
    if (msg.type === 'query') {
      const rows = db.exec({
        sql: msg.sql,
        bind: msg.params,
        rowMode: 'object',
        returnValue: 'resultRows',
      })
      reply(msg.id, { rows: Array.isArray(rows) ? rows : [], persistOk })
      return
    }
    if (msg.type === 'close') {
      db.close()
      db = null
      reply(msg.id, {})
    }
  } catch (error) {
    fail(msg.id, error instanceof Error ? error.message : String(error))
  }
}

export {}
