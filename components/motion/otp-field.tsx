'use client'

import { useRef } from 'react'

type OtpFieldProps = {
  value: string
  onChange: (value: string) => void
  onComplete: (value: string) => void
  disabled?: boolean
  error?: boolean
}

const codeLength = 6

export function OtpField({ value, onChange, onComplete, disabled = false, error = false }: OtpFieldProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const digits = Array.from({ length: codeLength }, (_, index) => value[index] ?? '')

  function updateDigit(index: number, input: string) {
    const digit = input.replace(/\D/g, '').slice(-1)
    const next = digits.slice()
    next[index] = digit
    const nextValue = next.join('')
    onChange(nextValue)
    if (digit && index < codeLength - 1) inputRefs.current[index + 1]?.focus()
    if (nextValue.length === codeLength) onComplete(nextValue)
  }

  function pasteCode(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, codeLength)
    if (!pasted) return
    event.preventDefault()
    onChange(pasted)
    inputRefs.current[Math.min(pasted.length, codeLength) - 1]?.focus()
    if (pasted.length === codeLength) onComplete(pasted)
  }

  return (
    <div className={`otp-field ${error ? 'is-error' : ''}`} dir="ltr" role="group" aria-label="رمز التحقق المكوّن من ستة أرقام">
      {digits.map((digit, index) => (
        <div key={index} className="otp-cell">
          <input
            ref={(element) => { inputRefs.current[index] = element }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            pattern="[0-9]*"
            maxLength={1}
            aria-label={`الرقم ${index + 1}`}
            value={digit}
            disabled={disabled}
            onChange={(event) => updateDigit(index, event.target.value)}
            onPaste={pasteCode}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digit && index > 0) inputRefs.current[index - 1]?.focus()
              if (event.key === 'ArrowLeft' && index < codeLength - 1) inputRefs.current[index + 1]?.focus()
              if (event.key === 'ArrowRight' && index > 0) inputRefs.current[index - 1]?.focus()
            }}
          />
        </div>
      ))}
    </div>
  )
}
