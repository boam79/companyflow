import { useState, type FormEvent } from 'react'
import { ProcessedOperations } from '../lib/idempotency'

type CreateState = {
  name: string
  code: string
  adminEmail: string
  message: string
}

const createOps = new ProcessedOperations()

export function OperatorCompaniesPage() {
  const [form, setForm] = useState<CreateState>({
    name: '',
    code: '',
    adminEmail: '',
    message: '',
  })
  const configured = Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
  )

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const operationId = crypto.randomUUID()
    const result = createOps.run(operationId, () => ({
      name: form.name.trim(),
      code: form.code.trim(),
      adminEmail: form.adminEmail.trim(),
      createdAt: new Date().toISOString(),
    }))

    const prefix = configured
      ? '생성 요청을 준비했습니다. 운영 관리자 RPC가 연결되면 같은 요청 ID로 재시도합니다.'
      : '중앙 프로젝트가 아직 연결되지 않아 로컬 생성 요청만 기록했습니다.'

    setForm((prev) => ({
      ...prev,
      message: `${prefix} operation_id=${operationId} (${result.status})`,
    }))
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">회사 관리</h1>
        <p className="mt-2 text-sm text-muted">
          운영 관리자만 회사를 등록합니다. 일반 계정은 자가 승격할 수 없습니다.
        </p>
      </div>
      <form className="space-y-4 rounded-lg border border-line bg-card p-6" onSubmit={onSubmit}>
        <label className="block text-sm">
          회사명
          <input
            required
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          회사코드
          <input
            required
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          최초 회사 관리자 이메일
          <input
            required
            type="email"
            className="mt-1 w-full rounded border border-line px-3 py-2"
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          />
        </label>
        <button
          type="submit"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          회사 생성 요청
        </button>
      </form>
      {form.message ? <p className="text-sm text-ok">{form.message}</p> : null}
    </div>
  )
}
