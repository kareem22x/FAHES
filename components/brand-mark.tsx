import Image from 'next/image'

export default function BrandMark({
  className,
  priority = false,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/fahes-logo-mark.png"
      alt=""
      aria-hidden="true"
      width={645}
      height={658}
      className={className}
      priority={priority}
    />
  )
}
