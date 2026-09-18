import type { BadgeFillValues } from './badgeFill'

export type NotifySettings = {
  adminEmail: string
  slackWebhook: string
}

export const CURRENT_NOTIFY_ID = 'current'

export const NOTIFY_TABLE_SQL = [
  `create table if not exists notify_settings (
    id text primary key,
    admin_email text,
    slack_webhook text,
    updated_at text not null
  )`,
]

export function assertAdminEmail(value: string) {
  const email = value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('관리자 이메일이 올바르지 않습니다.')
  return email
}

export function assertSlackWebhook(value: string) {
  const url = value.trim()
  if (!/^https:\/\/hooks\.slack\.com\//i.test(url)) {
    throw new Error('슬랙 Incoming Webhook 주소만 받습니다.')
  }
  return url
}

export function badgeNotifyMessage(values: BadgeFillValues) {
  return [
    '명찰이 채워졌습니다.',
    values.name ? `이름: ${values.name}` : '',
    values.title ? `직위: ${values.title}` : '',
    values.department ? `부서: ${values.department}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function mailtoHref(email: string, subject: string, body: string) {
  return `mailto:${assertAdminEmail(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function slackFormBody(text: string) {
  return `payload=${encodeURIComponent(JSON.stringify({ text }))}`
}

export async function loadNotifySettings(
  db: { query: <T>(sql: string, params?: unknown[]) => Promise<T[]> },
): Promise<NotifySettings> {
  const rows = await db.query<{ admin_email?: string | null; slack_webhook?: string | null }>(
    'select admin_email, slack_webhook from notify_settings where id = ?',
    [CURRENT_NOTIFY_ID],
  )
  return {
    adminEmail: rows[0]?.admin_email || '',
    slackWebhook: rows[0]?.slack_webhook || '',
  }
}

export async function executeSaveNotifySettings(
  db: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
    exec: (sql: string, params?: unknown[]) => Promise<void>
  },
  input: NotifySettings,
  updatedAt = new Date().toISOString(),
): Promise<NotifySettings> {
  const adminEmail = input.adminEmail.trim() ? assertAdminEmail(input.adminEmail) : ''
  const slackWebhook = input.slackWebhook.trim() ? assertSlackWebhook(input.slackWebhook) : ''
  await db.exec(
    `insert or replace into notify_settings(id, admin_email, slack_webhook, updated_at) values(?, ?, ?, ?)`,
    [CURRENT_NOTIFY_ID, adminEmail || null, slackWebhook || null, updatedAt],
  )
  return { adminEmail, slackWebhook }
}

export async function sendSlackWebhook(webhook: string, text: string) {
  const url = assertSlackWebhook(webhook)
  await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: slackFormBody(text),
  })
}
