import type { LedgerLine } from '../lib/stock/engine'
import {
  buildLedgerView,
  buildSupplyLedgerView,
  filterLedgerView,
  rowsAreRelated,
  type LedgerFilter,
} from '../lib/stock/ledgerView'

type NamedRow = { id: string; name: string }

function formatWhen(createdAt?: string): string {
  if (!createdAt) return '—'
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return createdAt
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function StockLedgerTable(props: {
  ledger: LedgerLine[]
  items: NamedRow[]
  warehouses: NamedRow[]
  departments?: NamedRow[]
  filter: LedgerFilter
  selected?: LedgerLine | null
  onSelect: (line: LedgerLine) => void
  variant?: 'full' | 'supply'
}) {
  const names = { departments: props.departments, warehouses: props.warehouses }
  const built =
    props.variant === 'supply'
      ? buildSupplyLedgerView(
          { processed: new Map(), orders: new Map(), ledger: props.ledger },
          names,
        )
      : buildLedgerView({ processed: new Map(), orders: new Map(), ledger: props.ledger }, names)
  const rows = filterLedgerView(built, props.filter)
  const supply = props.variant === 'supply'

  if (!props.ledger.length) {
    return <p className="mt-3 text-sm text-muted">아직 입출고 원장이 없습니다. 오른쪽에서 입고·반출을 확정하면 이 표에 이어집니다.</p>
  }

  if (!rows.length) {
    return <p className="mt-4 text-sm text-muted">이 구분의 입출고가 없습니다. 전체에서 입고·출고가 한 줄씩 이어집니다.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="mt-3 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            <th className="py-2 pr-3 font-medium">시각</th>
            <th className="py-2 pr-3 font-medium">구분</th>
            <th className="py-2 pr-3 font-medium">품목</th>
            {supply ? null : <th className="py-2 pr-3 font-medium">창고</th>}
            <th className="py-2 pr-3 text-right font-medium">입고</th>
            <th className="py-2 pr-3 text-right font-medium">출고</th>
            {supply ? null : <th className="py-2 pr-3 text-right font-medium">창고잔량</th>}
            <th className="py-2 pr-3 text-right font-medium">잔량</th>
            <th className="py-2 font-medium">연결</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const active = props.selected ? rowsAreRelated(props.selected, row.line) : false
            return (
              <tr
                key={row.line.id}
                className={`cursor-pointer border-b border-line/70 ${
                  active ? 'bg-accent-soft' : 'hover:bg-paper'
                }`}
                onClick={() => props.onSelect(row.line)}
              >
                <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatWhen(row.line.createdAt)}</td>
                <td className="py-2 pr-3 font-medium">{row.label}</td>
                <td className="py-2 pr-3">
                  {props.items.find((item) => item.id === row.line.itemId)?.name ?? row.line.itemId}
                </td>
                {supply ? null : (
                  <td className="py-2 pr-3">
                    {props.warehouses.find((warehouse) => warehouse.id === row.line.warehouseId)?.name ??
                      row.line.warehouseId}
                  </td>
                )}
                <td className="py-2 pr-3 text-right tabular-nums text-ok">
                  {row.inbound ?? ''}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-danger">
                  {row.outbound ?? ''}
                </td>
                {supply ? null : (
                  <td className="py-2 pr-3 text-right tabular-nums">{row.warehouseBalance}</td>
                )}
                <td className="py-2 pr-3 text-right tabular-nums">{row.companyBalance}</td>
                <td className="py-2 text-muted">{row.link || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
