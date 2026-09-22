import { Link } from 'react-router-dom'

export function ModuleClosed({ title }: { title: string }) {
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">이 회사는 {title} 메뉴를 쓰지 않습니다. 저장된 내용은 지우지 않았습니다.</p>
      <Link className="text-sm text-accent underline" to="/settings">
        회사 설정
      </Link>
    </div>
  )
}
