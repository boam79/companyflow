import type { BadgeFieldKey } from './badgeTemplate'

export type TextRun = {
  str: string
  x: number
  y: number
  width: number
  height: number
  fontSize?: number
  fontName?: string
}

export type BadgeFillValues = {
  name?: string
  title?: string
  department?: string
}

export type OverlayBox = {
  key: keyof BadgeFillValues
  left: string
  top: string
  width: string
  height: string
  fontSize: string
  fontFamily: string
  fontWeight: number
  textAlign: 'left' | 'center'
  sample?: string
}

export type BadgeSlot = {
  key: BadgeFieldKey
  x: number
  y: number
  width: number
  height: number
  fontSize: number
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

export function cssFontFromPdfName(pdfName?: string): { fontFamily: string; fontWeight: number } {
  const raw = (pdfName || '').replace(/^[A-Z0-9]{4,}\+/, '')
  const packed = raw.toLowerCase().replace(/[-_\s]/g, '')
  const bold = /bold|black|heavy|extrabold/.test(packed)
  if (packed.includes('nanumgothic')) {
    return { fontFamily: '"Nanum Gothic", "나눔고딕", sans-serif', fontWeight: bold ? 700 : 400 }
  }
  if (packed.includes('nanummyeongjo')) {
    return { fontFamily: '"Nanum Myeongjo", "나눔명조", serif', fontWeight: bold ? 700 : 400 }
  }
  if (packed.includes('notosans')) {
    return { fontFamily: '"Noto Sans KR", sans-serif', fontWeight: bold ? 700 : 400 }
  }
  if (packed.includes('malgun')) {
    return { fontFamily: '"Malgun Gothic", sans-serif', fontWeight: bold ? 700 : 400 }
  }
  const family = raw.replace(/Bold|Black|Regular|Medium|Light/g, '').trim() || 'sans-serif'
  const quoted = /[^A-Za-z0-9-]/.test(family) ? `"${family}"` : family
  return { fontFamily: `${quoted}, sans-serif`, fontWeight: bold ? 700 : 400 }
}

export function matchTemplateSpacing(text: string, sample?: string) {
  const fill = text.trim()
  if (!fill) return fill
  const spaced = /^[^\s](?:\s+[^\s])+$/.test(sample?.trim() || '')
  if (!spaced) return fill
  return Array.from(fill.replace(/\s+/g, '')).join(' ')
}

function pct(value: number, total: number) {
  if (!(total > 0)) return '0%'
  return `${Number(((value / total) * 100).toFixed(4))}%`
}

function toCqw(px: number, cropWidth: number) {
  if (!(cropWidth > 0)) return '1rem'
  return `${Number(((px / cropWidth) * 100).toFixed(4))}cqw`
}

function classifyRuns(runs: TextRun[]) {
  const leftover = runs.filter((run) => run.str.trim())
  const classified: Partial<Record<keyof BadgeFillValues, TextRun>> = {}
  const nameIndex = leftover.findIndex((run) => PLACEHOLDER_NAME.test(run.str.trim()))
  if (nameIndex >= 0) {
    classified.name = leftover.splice(nameIndex, 1)[0]
  } else {
    const bySize = [...leftover].sort(
      (a, b) => (b.fontSize || b.height) - (a.fontSize || a.height),
    )
    if (bySize[0] && (bySize[0].fontSize || bySize[0].height) > (bySize[1]?.fontSize || bySize[1]?.height || 0) * 1.2) {
      classified.name = bySize[0]
      leftover.splice(leftover.indexOf(bySize[0]), 1)
    }
  }
  leftover.sort((a, b) => a.y - b.y)
  if (leftover[0]) classified.title = leftover[0]
  if (leftover[1]) classified.department = leftover[1]
  return classified
}

function boxFromRun(
  key: keyof BadgeFillValues,
  run: TextRun,
  cropWidth: number,
  cropHeight: number,
): OverlayBox {
  const font = cssFontFromPdfName(run.fontName)
  const size = run.fontSize || run.height
  const padX = Math.max(run.width * 0.08, 4)
  const padY = Math.max(size * 0.18, 2)
  return {
    key,
    left: pct(run.x - padX, cropWidth),
    top: pct(run.y - padY, cropHeight),
    width: pct(run.width + padX * 2, cropWidth),
    height: pct(Math.max(run.height, size) + padY * 2, cropHeight),
    fontSize: toCqw(size, cropWidth),
    fontFamily: font.fontFamily,
    fontWeight: font.fontWeight,
    textAlign: key === 'name' ? 'left' : 'center',
    sample: run.str.trim(),
  }
}

function fallbackOverlay(): OverlayBox[] {
  const regular = cssFontFromPdfName('NanumGothic')
  const bold = cssFontFromPdfName('NanumGothicBold')
  return [
    {
      key: 'name',
      left: '6%',
      top: '30%',
      width: '46%',
      height: '44%',
      fontSize: '11.25cqw',
      ...bold,
      textAlign: 'left',
    },
    {
      key: 'title',
      left: '54%',
      top: '28%',
      width: '40%',
      height: '26%',
      fontSize: '6.875cqw',
      ...regular,
      textAlign: 'center',
    },
    {
      key: 'department',
      left: '54%',
      top: '56%',
      width: '40%',
      height: '24%',
      fontSize: '6cqw',
      ...regular,
      textAlign: 'center',
    },
  ]
}

export function overlayFromRuns(runs: TextRun[], cropWidth: number, cropHeight: number): OverlayBox[] {
  const classified = classifyRuns(runs)
  const keys: (keyof BadgeFillValues)[] = ['name', 'title', 'department']
  return keys.flatMap((key) => {
    const run = classified[key]
    return run ? [boxFromRun(key, run, cropWidth, cropHeight)] : []
  })
}

export function nameplateOverlay(
  runs: TextRun[] = [],
  cropWidth = 240,
  cropHeight = 120,
): OverlayBox[] {
  const found = overlayFromRuns(runs, cropWidth, cropHeight)
  if (!found.length) return fallbackOverlay()
  const missing = fallbackOverlay().filter((box) => !found.some((row) => row.key === box.key))
  return [...found, ...missing]
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
