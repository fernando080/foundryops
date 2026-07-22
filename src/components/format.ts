export function formatMoney(amountMinor: number, currency: string): string {
  const amount = amountMinor / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

// Layer A (measured) formatting — raw contract field values, no unit
// reinterpretation beyond the explicit M -> nM conversions the spec calls
// for. Never rounds away precision that would change a QC verdict.
export function formatNullableNumber(v: number | null, digits = 3): string {
  if (v === null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return v.toExponential(digits)
  return v.toFixed(digits)
}

export function formatMolarAsNm(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return `${(v * 1e9).toFixed(digits)} nM`
}

export function formatReplicateKdsNm(values: number[] | null, digits = 2): string {
  if (!values || values.length === 0) return '—'
  return `${values.map((v) => (v * 1e9).toFixed(digits)).join(', ')} nM`
}
