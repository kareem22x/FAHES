'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type FaqItem = { question: string; answer: string }

/**
 * Smooth accordion for the FAQ. The panel animates with
 * `grid-template-rows: 0fr -> 1fr` (no height measuring, no layout thrash);
 * collapsed panels are `inert` + `aria-hidden` so they stay out of the
 * accessibility tree and tab order.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const baseId = useId()

  return (
    <div className="faq-accordion">
      {items.map((item, index) => {
        const isOpen = openIndex === index
        const panelId = `${baseId}-panel-${index}`
        const buttonId = `${baseId}-button-${index}`

        return (
          <div key={item.question} className={`faq-item ${isOpen ? 'is-open' : ''}`}>
            <h3 className="faq-heading">
              <button
                type="button"
                id={buttonId}
                className="faq-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenIndex(isOpen ? null : index)}
              >
                <span>{item.question}</span>
                <ChevronDown size={19} aria-hidden="true" />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="faq-panel"
              aria-hidden={isOpen ? undefined : true}
              inert={isOpen ? undefined : true}
            >
              <div className="faq-panel-inner">
                <p>{item.answer}</p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
