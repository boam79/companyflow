import { tableNameOk, type BackupSnapshot } from './bundle'

export type SnapshotDb = {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  exec: (sql: string, params?: unknown[]) => Promise<void>
  batch: (statements: { sql: string; params?: unknown[] }[]) => Promise<void>
}

export async function dumpTables(db: Pick<SnapshotDb, 'query'>): Promise<Record<string, Record<string, unknown>[]>> {
  const tables = await db.query<{ name: string }>(
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
  )
  const data: Record<string, Record<string, unknown>[]> = {}
  for (const row of tables) {
    if (!tableNameOk(row.name)) continue
    data[row.name] = await db.query<Record<string, unknown>>(`select * from ${row.name}`)
  }
  return data
}

function insertStatements(tables: Record<string, Record<string, unknown>[]>) {
  const statements: { sql: string; params?: unknown[] }[] = []
  for (const [name, rows] of Object.entries(tables)) {
    if (!tableNameOk(name)) throw new Error('백업 표 이름이 올바르지 않습니다. 현재 원본은 그대로입니다.')
    statements.push({ sql: `delete from ${name}` })
    for (const row of rows) {
      const cols = Object.keys(row)
      if (!cols.length) continue
      if (cols.some((col) => !tableNameOk(col))) {
        throw new Error('백업 칸 이름이 올바르지 않습니다. 현재 원본은 그대로입니다.')
      }
      statements.push({
        sql: `insert into ${name}(${cols.join(', ')}) values(${cols.map(() => '?').join(', ')})`,
        params: cols.map((col) => row[col]),
      })
    }
  }
  return statements
}

export async function applySnapshot(db: SnapshotDb, snapshot: BackupSnapshot): Promise<void> {
  const safety = await dumpTables(db)
  try {
    await db.batch(insertStatements(snapshot.tables))
  } catch (error) {
    try {
      await db.batch(insertStatements(safety))
    } catch {
      // 안전 복사 되돌리기 실패는 원래 오류를 남긴다
    }
    throw error instanceof Error ? error : new Error('복원에 실패했습니다. 현재 원본은 그대로입니다.')
  }
}

export async function writeLastBackupAt(
  db: Pick<SnapshotDb, 'exec'>,
  iso: string,
): Promise<void> {
  await db.exec('insert or replace into meta(key, value) values(?, ?)', ['last_backup_at', iso])
}

export async function readLastBackupAt(db: Pick<SnapshotDb, 'query'>): Promise<string> {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', ['last_backup_at'])
  return rows[0]?.value ?? ''
}

export async function readRelayPrivateJwk(db: Pick<SnapshotDb, 'query'>): Promise<JsonWebKey | null> {
  const rows = await db.query<{ value: string }>('select value from meta where key = ?', ['relay_private_jwk'])
  if (!rows[0]?.value) return null
  try {
    return JSON.parse(rows[0].value) as JsonWebKey
  } catch {
    return null
  }
}

export async function writeRelayPrivateJwk(db: Pick<SnapshotDb, 'exec'>, jwk: JsonWebKey): Promise<void> {
  await db.exec('insert or replace into meta(key, value) values(?, ?)', ['relay_private_jwk', JSON.stringify(jwk)])
}
