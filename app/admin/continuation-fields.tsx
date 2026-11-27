'use client'

import { useRef, useState } from 'react'

export function ContinuationFields({
  required = false,
}: {
  required?: boolean
}) {
  const nextId = useRef(1)
  const [rows, setRows] = useState([0])

  return (
    <fieldset className='admin-group'>
      <legend>Продолжения</legend>
      {rows.map((id, index) => (
        <div className='admin-continuation' key={id}>
          <label className='field'>
            Продолжение {index + 1} на португальском
            <input
              name='continuation'
              lang='pt-BR'
              required={required || index > 0}
              maxLength={500}
            />
          </label>
          <label className='field'>
            Перевод продолжения {index + 1}
            <input
              name='continuationTranslation'
              required={required || index > 0}
              maxLength={500}
            />
          </label>
          {rows.length > 1 && (
            <button
              type='button'
              onClick={() => setRows(rows.filter((row) => row !== id))}
            >
              Убрать продолжение {index + 1}
            </button>
          )}
        </div>
      ))}
      <button
        type='button'
        disabled={rows.length >= 20}
        onClick={() => {
          setRows([...rows, nextId.current])
          nextId.current++
        }}
      >
        Добавить продолжение
      </button>
    </fieldset>
  )
}
