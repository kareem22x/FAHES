export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('966')) return digits.slice(3)
  if (digits.startsWith('00966')) return digits.slice(5)
  if (digits.startsWith('0')) return digits.slice(1)
  return digits
}

export function isValidSaudiMobile(phone: string): boolean {
  const n = normalizePhone(phone)
  return /^5\d{8}$/.test(n)
}

export function e164Saudi(phone: string): string {
  return `+966${normalizePhone(phone)}`
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return 'غير مضاف'
  const n = normalizePhone(phone)
  if (n.length < 4) return '••••'
  return `05••••${n.slice(-3)}`
}
