export function formatMoney(amountMinor: number, currency: string): string {
  const amount = amountMinor / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}
