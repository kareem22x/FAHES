'use client'

import { cn } from '@/lib/utils'
import { forwardRef, useEffect, useRef } from 'react'

interface OTPInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  length?: number
  value: string
  onChange: (value: string) => void
  error?: boolean
}

const OTPInput = forwardRef<HTMLDivElement, OTPInputProps>(
  ({ length = 6, value = '', onChange, error = false, className, ...props }, ref) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    useEffect(() => {
      // Focus first input on mount
      if (inputRefs.current[0]) {
        inputRefs.current[0].focus()
      }
    }, [])

    const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      
      // Only allow numbers
      if (!/^\d*$/.test(newValue)) return

      // Update value
      const valueArray = value.split('')
      valueArray[index] = newValue.slice(-1) // Take only last character
      const newValueString = valueArray.join('')
      onChange(newValueString)

      // Auto-focus next input
      if (newValue && index < length - 1 && inputRefs.current[index + 1]) {
        inputRefs.current[index + 1]?.focus()
      }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle backspace
      if (e.key === 'Backspace') {
        if (!value[index] && index > 0 && inputRefs.current[index - 1]) {
          inputRefs.current[index - 1]?.focus()
        } else {
          const valueArray = value.split('')
          valueArray[index] = ''
          onChange(valueArray.join(''))
        }
      }

      // Handle arrow keys
      if (e.key === 'ArrowLeft' && index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
      if (e.key === 'ArrowRight' && index < length - 1) {
        inputRefs.current[index + 1]?.focus()
      }

      // Handle paste
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        navigator.clipboard.readText().then((pastedText) => {
          const numbers = pastedText.replace(/\D/g, '').slice(0, length)
          onChange(numbers.padEnd(length, ''))
          
          // Focus the last filled input
          const lastIndex = Math.min(numbers.length, length) - 1
          if (lastIndex >= 0 && inputRefs.current[lastIndex]) {
            inputRefs.current[lastIndex]?.focus()
          }
        })
      }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const pastedText = e.clipboardData.getData('text')
      const numbers = pastedText.replace(/\D/g, '').slice(0, length)
      onChange(numbers.padEnd(length, ''))
      
      // Focus the last filled input
      const lastIndex = Math.min(numbers.length, length) - 1
      if (lastIndex >= 0 && inputRefs.current[lastIndex]) {
        inputRefs.current[lastIndex]?.focus()
      }
    }

    return (
      <div ref={ref} className={cn('flex gap-2', className)} {...props}>
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={cn(
              'flex h-14 w-12 items-center justify-center rounded-xl border-2 bg-[#fafbf8] text-center text-2xl font-bold outline-none transition-all',
              'focus:border-[#0873d1] focus:ring-2 focus:ring-[#0873d1]/20',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
              !error && 'border-[#0b1f46]/15'
            )}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>
    )
  }
)

OTPInput.displayName = 'OTPInput'

export { OTPInput }
