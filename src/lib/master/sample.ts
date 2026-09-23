export const SAMPLE_DEPARTMENTS = [
  { id: 'dept-admin', name: '총무' },
  { id: 'dept-marketing', name: '마케팅' },
  { id: 'dept-sales', name: '영업' },
  { id: 'dept-dev', name: '개발' },
] as const

export const SAMPLE_EMPLOYEES = [
  {
    id: 'emp-kim',
    name: '김담당',
    departmentId: 'dept-admin',
    title: '주임',
    hiredAt: '2026-03-02',
    leftAt: null as string | null,
    badgeName: '김담당',
    badgeDepartment: '총무',
  },
  {
    id: 'emp-park',
    name: '박재민',
    departmentId: 'dept-marketing',
    title: '과장',
    hiredAt: '2024-04-01',
    leftAt: null,
    badgeName: '박재민',
    badgeDepartment: '마케팅',
  },
  {
    id: 'emp-lee',
    name: '이수진',
    departmentId: 'dept-sales',
    title: '대리',
    hiredAt: '2025-07-14',
    leftAt: null,
    badgeName: '이 수 진',
    badgeDepartment: '영업',
  },
  {
    id: 'emp-choi',
    name: '최민호',
    departmentId: 'dept-dev',
    title: '사원',
    hiredAt: '2026-01-05',
    leftAt: null,
    badgeName: '최민호',
    badgeDepartment: '개발',
  },
  {
    id: 'emp-jung',
    name: '정하나',
    departmentId: 'dept-admin',
    title: '대리',
    hiredAt: '2023-11-20',
    leftAt: null,
    badgeName: '정하나',
    badgeDepartment: '총무',
  },
  {
    id: 'emp-oh',
    name: '오세훈',
    departmentId: 'dept-sales',
    title: '과장',
    hiredAt: '2022-06-01',
    leftAt: '2026-08-31',
    badgeName: '오세훈',
    badgeDepartment: '영업',
  },
] as const

export const SAMPLE_PARTNERS = [
  { id: 'partner-lease', name: '한국임대', phone: '02-3456-1000', memo: '사무실 임대' },
  { id: 'partner-mfp', name: '사무기기코리아', phone: '02-3456-2000', memo: '복합기 유지보수' },
  { id: 'partner-kt', name: 'KT', phone: '100', memo: '인터넷 전용회선' },
  { id: 'partner-samsung', name: '삼성화재', phone: '1588-5114', memo: '영업배상 책임보험' },
] as const

export const SAMPLE_CONTRACTS = [
  {
    id: 'sample:con-lease',
    title: '사무실 임대',
    contractNo: 'CON-2024-001',
    counterparty: '한국임대',
    signedAt: '2024-01-02',
    startAt: '2024-01-01',
    endAt: '2026-12-31',
    amount: 12_000_000,
    ownerName: '김담당',
  },
  {
    id: 'sample:con-mfp',
    title: '복합기 유지보수',
    contractNo: 'CON-2025-014',
    counterparty: '사무기기코리아',
    signedAt: '2025-03-01',
    startAt: '2025-03-01',
    endAt: '2026-02-28',
    amount: 2_400_000,
    ownerName: '정하나',
  },
  {
    id: 'sample:con-line',
    title: '인터넷 전용회선',
    contractNo: 'CON-2026-003',
    counterparty: 'KT',
    signedAt: '2026-01-02',
    startAt: '2026-01-01',
    endAt: '2026-12-31',
    amount: 1_800_000,
    ownerName: '최민호',
  },
  {
    id: 'sample:con-insurance',
    title: '영업배상 책임보험',
    contractNo: 'CON-2026-008',
    counterparty: '삼성화재',
    signedAt: '2026-04-01',
    startAt: '2026-04-01',
    endAt: '2027-03-31',
    amount: 3_600_000,
    ownerName: '박재민',
  },
] as const

export const SAMPLE_CHECKS = [
  { employeeId: 'emp-kim', itemKey: 'laptop', issuedAt: '2026-03-02' },
  { employeeId: 'emp-park', itemKey: 'badge', issuedAt: '2024-04-01' },
  { employeeId: 'emp-jung', itemKey: 'badge', issuedAt: '2023-11-20' },
  { employeeId: 'emp-jung', itemKey: 'uniform', issuedAt: '2023-11-20' },
] as const

export const SAMPLE_ASSETS = [
  {
    id: 'sample:desk-1',
    itemId: 'item-desk',
    locationText: '3층 총무석',
    departmentName: '총무',
    ownerName: '김담당',
    model: '우드라인 1400',
    serialNo: 'DSK-001',
    acquiredAt: '2024-02-01',
  },
  {
    id: 'sample:desk-2',
    itemId: 'item-desk',
    locationText: '3층 마케팅',
    departmentName: '마케팅',
    ownerName: '박재민',
    model: '우드라인 1400',
    serialNo: 'DSK-002',
    acquiredAt: '2024-04-01',
  },
  {
    id: 'sample:chair-1',
    itemId: 'item-chair',
    locationText: '회의실 A',
    departmentName: '총무',
    ownerName: '',
    model: '메쉬 회의용의자',
    serialNo: 'CHR-011',
    acquiredAt: '2024-02-01',
  },
  {
    id: 'sample:table-1',
    itemId: 'item-table',
    locationText: '회의실 A',
    departmentName: '총무',
    ownerName: '',
    model: '회의탁자 10인',
    serialNo: 'TBL-01',
    acquiredAt: '2023-12-10',
  },
  {
    id: 'sample:cabinet-1',
    itemId: 'item-cabinet',
    locationText: '3층 문서실',
    departmentName: '총무',
    ownerName: '정하나',
    model: '3단 서랍장',
    serialNo: 'CAB-03',
    acquiredAt: '2023-11-20',
  },
  {
    id: 'sample:computer-1',
    itemId: 'item-computer',
    locationText: '3층 마케팅',
    departmentName: '마케팅',
    ownerName: '박재민',
    model: 'iMac 24',
    serialNo: 'IMAC-2401',
    acquiredAt: '2024-04-08',
  },
  {
    id: 'sample:computer-2',
    itemId: 'item-computer',
    locationText: '2층 개발석',
    departmentName: '개발',
    ownerName: '최민호',
    model: 'ThinkCentre M70',
    serialNo: 'PC-DEV-07',
    acquiredAt: '2026-01-06',
  },
  {
    id: 'sample:monitor-1',
    itemId: 'item-monitor',
    locationText: '2층 개발석',
    departmentName: '개발',
    ownerName: '최민호',
    model: '27인치 QHD',
    serialNo: 'MON-2707',
    acquiredAt: '2026-01-06',
  },
  {
    id: 'sample:printer-1',
    itemId: 'item-printer',
    locationText: '3층 복사실',
    departmentName: '총무',
    ownerName: '김담당',
    model: '복합기 C3550',
    serialNo: 'PRN-3550',
    acquiredAt: '2023-09-01',
  },
] as const

const SAMPLE_ITEM_NAMES: Record<string, string> = {
  'item-desk': '책상',
  'item-chair': '의자',
  'item-table': '회의탁자',
  'item-cabinet': '서랍장',
  'item-computer': '컴퓨터',
  'item-monitor': '모니터',
  'item-printer': '복합기',
}

export function sampleAssetNames() {
  return [...new Set(SAMPLE_ASSETS.map((asset) => SAMPLE_ITEM_NAMES[asset.itemId]))]
}

export function sampleContractTitles() {
  return SAMPLE_CONTRACTS.map((row) => row.title)
}

export async function writeSampleCompanyData(db: {
  exec: (sql: string, params?: unknown[]) => Promise<void>
}): Promise<void> {
  const now = new Date().toISOString()
  for (const dept of SAMPLE_DEPARTMENTS) {
    await db.exec('insert or ignore into departments(id, name, created_at) values(?, ?, ?)', [
      dept.id,
      dept.name,
      now,
    ])
  }
  for (const partner of SAMPLE_PARTNERS) {
    await db.exec('insert or ignore into partners(id, name, created_at) values(?, ?, ?)', [
      partner.id,
      partner.name,
      now,
    ])
    await db.exec(
      `update partners set phone = ?, memo = ? where id = ? and (phone is null or phone = '')`,
      [partner.phone, partner.memo, partner.id],
    )
  }
  for (const employee of SAMPLE_EMPLOYEES) {
    await db.exec(
      `insert or ignore into employees(id, name, department_id, title, hired_at, left_at, badge_name, badge_department, created_at)
        values(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employee.id,
        employee.name,
        employee.departmentId,
        employee.title,
        employee.hiredAt,
        employee.leftAt,
        employee.badgeName,
        employee.badgeDepartment,
        now,
      ],
    )
    await db.exec(
      `update employees set
        department_id = coalesce(nullif(department_id, ''), ?),
        title = coalesce(nullif(title, ''), ?),
        badge_name = coalesce(nullif(badge_name, ''), ?),
        badge_department = coalesce(nullif(badge_department, ''), ?)
       where id = ?`,
      [employee.departmentId, employee.title, employee.badgeName, employee.badgeDepartment, employee.id],
    )
  }
  for (const check of SAMPLE_CHECKS) {
    await db.exec(
      `insert or ignore into employment_checks(employee_id, item_key, issued, issued_at, returned_at, updated_at)
        values(?, ?, 1, ?, null, ?)`,
      [check.employeeId, check.itemKey, check.issuedAt, now],
    )
  }
  for (const asset of SAMPLE_ASSETS) {
    await db.exec(
      `insert or ignore into assets(
          id, item_id, warehouse_id, status, employee_id, source_operation_id, created_at,
          qr_token, model, serial_no, location_text, department_name, owner_name, acquired_at
        ) values(?, ?, 'wh-main', 'in_storage', null, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id,
        asset.itemId,
        `sample:${asset.id}`,
        now,
        `sample-qr:${asset.id}`,
        asset.model,
        asset.serialNo,
        asset.locationText,
        asset.departmentName,
        asset.ownerName || null,
        asset.acquiredAt,
      ],
    )
  }
  for (const contract of SAMPLE_CONTRACTS) {
    await db.exec(
      `insert or ignore into contracts(
          id, title, contract_no, counterparty, signed_at, start_at, end_at, amount, currency,
          owner_name, status, ocr_status, created_at
        ) values(?, ?, ?, ?, ?, ?, ?, ?, 'KRW', ?, 'draft', 'off', ?)`,
      [
        contract.id,
        contract.title,
        contract.contractNo,
        contract.counterparty,
        contract.signedAt,
        contract.startAt,
        contract.endAt,
        contract.amount,
        contract.ownerName,
        now,
      ],
    )
  }
}
