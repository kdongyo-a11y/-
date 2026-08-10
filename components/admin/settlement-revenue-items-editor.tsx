"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { formatWon } from "@/lib/guild-data"
import type { SettlementRevenueItemInput } from "@/lib/settlement-revenue-item-types"
import { sumRevenueItemAmounts, validateRevenueItemsForTotalIncome } from "@/lib/settlement-revenue-item-utils"
import { cn } from "@/lib/utils"

type DraftRow = {
  key: string
  description: string
  quantity: string
  unitPrice: string
  amount: string
  memo: string
}

type Props = {
  totalIncome: number
  value: SettlementRevenueItemInput[]
  onChange: (items: SettlementRevenueItemInput[]) => void
  className?: string
}

function emptyRow(): DraftRow {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: "",
    unitPrice: "",
    amount: "",
    memo: "",
  }
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(/\D/g, ""))
  return Number.isFinite(n) ? n : null
}

function rowsToInputs(rows: DraftRow[]): SettlementRevenueItemInput[] {
  return rows
    .filter((r) => r.description.trim() || r.amount.trim())
    .map((r) => ({
      description: r.description.trim(),
      quantity: parseOptionalNumber(r.quantity),
      unitPrice: parseOptionalNumber(r.unitPrice),
      amount: Number(r.amount.replace(/\D/g, "")) || 0,
      memo: r.memo.trim(),
    }))
}

function inputsToRows(items: SettlementRevenueItemInput[]): DraftRow[] {
  if (items.length === 0) return [emptyRow()]
  return items.map((item) => ({
    key: crypto.randomUUID(),
    description: item.description,
    quantity: item.quantity == null ? "" : String(item.quantity),
    unitPrice: item.unitPrice == null ? "" : String(item.unitPrice),
    amount: String(item.amount),
    memo: item.memo ?? "",
  }))
}

export function SettlementRevenueItemsEditor({ totalIncome, value, onChange, className }: Props) {
  const [open, setOpen] = useState(value.length > 0)
  const [rows, setRows] = useState<DraftRow[]>(() => inputsToRows(value))

  const items = useMemo(() => rowsToInputs(rows), [rows])
  const itemSum = useMemo(() => sumRevenueItemAmounts(items), [items])
  const validation = useMemo(
    () => (items.length === 0 ? { ok: true as const } : validateRevenueItemsForTotalIncome(totalIncome, items)),
    [items, totalIncome],
  )

  function sync(nextRows: DraftRow[]) {
    setRows(nextRows)
    onChange(rowsToInputs(nextRows))
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    sync(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    sync([...rows, emptyRow()])
    setOpen(true)
  }

  function removeRow(key: string) {
    const next = rows.filter((r) => r.key !== key)
    sync(next.length > 0 ? next : [emptyRow()])
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground",
          className,
        )}
      >
        + 수익 상세 기록 (선택)
      </button>
    )
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <SectionTitle>수익 상세 (선택)</SectionTitle>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            sync([emptyRow()])
          }}
          className="text-[10px] text-muted-foreground underline"
        >
          접기
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        설명과 금액만 입력해도 됩니다. 수량·단가는 선택 사항이며 회계 기준 금액은 항목 금액(amount)입니다.
      </p>

      {rows.map((row) => (
        <Card key={row.key} className="flex flex-col gap-2 p-3">
          <input
            type="text"
            value={row.description}
            onChange={(e) => updateRow(row.key, { description: e.target.value })}
            placeholder="설명 (예: 보스 아이템 일괄 판매)"
            className="w-full rounded-lg border border-border bg-input px-2.5 py-2 text-xs"
          />
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="text-[10px] text-muted-foreground">수량 (선택)</span>
              <input
                type="text"
                inputMode="decimal"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                placeholder="—"
                className="mt-0.5 w-full rounded-lg border border-border bg-input px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">단가 (선택)</span>
              <input
                type="text"
                inputMode="numeric"
                value={row.unitPrice}
                onChange={(e) => updateRow(row.key, { unitPrice: e.target.value.replace(/\D/g, "") })}
                placeholder="—"
                className="mt-0.5 w-full rounded-lg border border-border bg-input px-2 py-1.5 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] text-muted-foreground">금액</span>
              <input
                type="text"
                inputMode="numeric"
                value={row.amount}
                onChange={(e) => updateRow(row.key, { amount: e.target.value.replace(/\D/g, "") })}
                placeholder="0"
                className="mt-0.5 w-full rounded-lg border border-border bg-input px-2 py-1.5 font-mono text-xs"
              />
            </label>
          </div>
          <input
            type="text"
            value={row.memo}
            onChange={(e) => updateRow(row.key, { memo: e.target.value })}
            placeholder="메모 (선택)"
            className="w-full rounded-lg border border-border bg-input px-2.5 py-1.5 text-xs"
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="flex items-center gap-1 self-end text-[10px] text-destructive"
            >
              <Trash2 className="h-3 w-3" /> 삭제
            </button>
          )}
        </Card>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> 항목 추가
      </button>

      {items.length > 0 && (
        <Card className="flex items-center justify-between px-3 py-2 text-xs">
          <span className="text-muted-foreground">항목 합계 / 총 수익</span>
          <span
            className={cn(
              "font-mono font-semibold tabular-nums",
              validation.ok ? "text-foreground" : "text-destructive",
            )}
          >
            {formatWon(itemSum)} / {formatWon(totalIncome)}
          </span>
        </Card>
      )}
      {!validation.ok && (
        <p className="text-center text-[10px] text-destructive">{validation.message}</p>
      )}
    </div>
  )
}

export function validateRevenueItemsBeforeCreate(
  totalIncome: number,
  items: SettlementRevenueItemInput[],
): { ok: true } | { ok: false; message: string } {
  if (items.length === 0) return { ok: true }
  return validateRevenueItemsForTotalIncome(totalIncome, items)
}
