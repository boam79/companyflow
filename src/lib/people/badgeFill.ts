import type { BadgeFieldKey } from './badgeTemplate'

export type TextRun = { str: string; x: number; y: number; width: number; height: number }

export type BadgeSlot = {
  key: BadgeFieldKey
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export type BadgeFillValues = {
  name?: string
  title?: string
  department?: string
}

const LABEL_BY_KEY: { key: BadgeFieldKey; labels: string[] }[] = [
  { key: 'name', labels: ['성명', '이름', 'NAME', 'Name'] },
  { key: 'title', labels: ['직위', '직급', '직책', 'TITLE', 'Title'] },
  { key: 'department', labels: ['부서', '소속', 'DEPARTMENT', 'Department'] },
]

const PLACEHOLDER_NAME = /^[가-힣](?:\s+[가-힣]){1,4}$/

export function badgeFillValues(
  employee: { name: string; badgeName?: string; title?: string },
  departmentName?: string,
): BadgeFillValues {
  return {
    name: (employee.badgeName || employee.name).trim() || undefined,
    title: employee.title?.trim() || undefined,
    department: departmentName?.trim() || undefined,
  }
}

export function fallbackSlots(width: number, height: number): BadgeSlot[] {
  return [
    {
      key: 'name',
      x: width * 0.08,
      y: height * 0.36,
      width: width * 0.4,
      height: height * 0.3,
      fontSize: Math.max(14, height * 0.16),
    },
    {
      key: 'title',
      x: width * 0.52,
      y: height * 0.3,
      width: width * 0.42,
      height: height * 0.2,
      fontSize: Math.max(12, height * 0.12),
    },
    {
      key: 'department',
      x: width * 0.52,
      y: height * 0.52,
      width: width * 0.42,
      height: height * 0.18,
      fontSize: Math.max(11, height * 0.1),
    },
  ]
}

function slotFromRun(key: BadgeFieldKey, run: TextRun, beside = false): BadgeSlot {
  if (beside) {
    return {
      key,
      x: run.x + run.width + 6,
      y: run.y - run.height * 0.2,
      width: Math.max(run.width * 3, 72),
      height: Math.max(run.height * 1.6, 16),
      fontSize: Math.max(run.height, 12),
    }
  }
  return {
    key,
    x: run.x,
    y: run.y,
    width: Math.max(run.width, 48),
    height: Math.max(run.height, 14),
    fontSize: Math.max(run.height, 12),
  }
}

export function slotsFromRuns(runs: TextRun[]): BadgeSlot[] {
  const slots: BadgeSlot[] = []
  const used = new Set<BadgeFieldKey>()
  const placeholder = runs.find((run) => PLACEHOLDER_NAME.test(run.str.trim()))
  if (placeholder) {
    slots.push(slotFromRun('name', placeholder))
    used.add('name')
  }
  for (const hint of LABEL_BY_KEY) {
    if (used.has(hint.key)) continue
    const run = runs.find((item) => hint.labels.some((label) => item.str.includes(label)))
    if (!run) continue
    slots.push(slotFromRun(hint.key, run, true))
    used.add(hint.key)
  }
  return slots
}

export function nameplateOverlay(): { key: keyof BadgeFillValues; left: string; top: string; width: string; height: string; fontSize: string }[] {
  return [
    { key: 'name', left: '6%', top: '30%', width: '46%', height: '44%', fontSize: '1.2rem' },
    { key: 'title', left: '54%', top: '28%', width: '40%', height: '26%', fontSize: '0.95rem' },
    { key: 'department', left: '54%', top: '56%', width: '40%', height: '24%', fontSize: '0.8rem' },
  ]
}

export function slotsForPage(runs: TextRun[], width: number, height: number): BadgeSlot[] {
  const found = slotsFromRuns(runs).filter((slot) => {
    const run = runs.find((item) => Math.abs(item.x - slot.x) < 1 && Math.abs(item.y - slot.y) < 1)
    if (slot.key === 'name' && run && PLACEHOLDER_NAME.test(run.str.trim())) return true
    return false
  })
  if (found.length) {
    const missing = fallbackSlots(width, height).filter((slot) => !found.some((row) => row.key === slot.key))
    return [...found, ...missing]
  }
  return fallbackSlots(width, height)
}

export function isBadgeFilled(values: BadgeFillValues) {
  return Boolean(values.name && (values.title || values.department))
}
