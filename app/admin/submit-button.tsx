'use client'

import { useFormStatus } from 'react-dom'

export function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <button className='admin-submit' type='submit' disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  )
}
