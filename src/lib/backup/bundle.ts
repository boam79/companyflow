import { decryptWithPassphrase, encryptWithPassphrase, type PassphraseEnvelope } from '../crypto/passphrase'

export const BACKUP_MAGIC = 'companyflow-backup'
export const BACKUP_FORMAT = 1

export type BackupHeader = PassphraseEnvelope & {
  magic: typeof BACKUP_MAGIC
  format: typeof BACKUP_FORMAT
  companyId: string
  schemaVersion: number
  createdAt: string
}

export type BackupSnapshot = {
  companyId: string
  schemaVersion: number
  dumpedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

export function currentSchemaVersion(migrationCount: number) {
  return migrationCount
}

export function assertRestorable(input: {
  openCompanyId: string
  headerCompanyId: string
  payloadCompanyId: string
  payloadSchemaVersion: number
  currentSchemaVersion: number
}) {
  if (input.headerCompanyId !== input.openCompanyId || input.payloadCompanyId !== input.openCompanyId) {
    throw new Error('다른 회사 백업입니다. 현재 원본은 그대로입니다.')
  }
  if (input.payloadSchemaVersion > input.currentSchemaVersion) {
    throw new Error('이 앱보다 새 백업입니다. 현재 원본은 그대로입니다.')
  }
}

export function parseBackupFile(text: string): BackupHeader {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('백업 파일이 아닙니다. 현재 원본은 그대로입니다.')
  }
  const row = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  if (row.magic !== BACKUP_MAGIC || row.format !== BACKUP_FORMAT) {
    throw new Error('이 백업 형식을 모릅니다. 현재 원본은 그대로입니다.')
  }
  if (typeof row.companyId !== 'string' || typeof row.schemaVersion !== 'number') {
    throw new Error('백업 회사 정보가 없습니다. 현재 원본은 그대로입니다.')
  }
  if (row.v !== 1 || typeof row.ct !== 'string') {
    throw new Error('백업 암호문이 없습니다. 현재 원본은 그대로입니다.')
  }
  return row as BackupHeader
}

export async function sealBackup(input: {
  passphrase: string
  snapshot: BackupSnapshot
}): Promise<BackupHeader> {
  const envelope = await encryptWithPassphrase(input.passphrase, JSON.stringify(input.snapshot))
  return {
    magic: BACKUP_MAGIC,
    format: BACKUP_FORMAT,
    companyId: input.snapshot.companyId,
    schemaVersion: input.snapshot.schemaVersion,
    createdAt: input.snapshot.dumpedAt,
    ...envelope,
  }
}

export async function openBackup(input: {
  passphrase: string
  fileText: string
  openCompanyId: string
  currentSchemaVersion: number
}): Promise<BackupSnapshot> {
  const header = parseBackupFile(input.fileText)
  const plain = await decryptWithPassphrase(input.passphrase, header)
  let snapshot: BackupSnapshot
  try {
    snapshot = JSON.parse(plain) as BackupSnapshot
  } catch {
    throw new Error('백업 내용이 깨졌습니다. 현재 원본은 그대로입니다.')
  }
  assertRestorable({
    openCompanyId: input.openCompanyId,
    headerCompanyId: header.companyId,
    payloadCompanyId: snapshot.companyId,
    payloadSchemaVersion: snapshot.schemaVersion,
    currentSchemaVersion: input.currentSchemaVersion,
  })
  return snapshot
}

export function tableNameOk(name: string) {
  return /^[a-z_][a-z0-9_]*$/i.test(name)
}
