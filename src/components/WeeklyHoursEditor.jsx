import { Plus, Trash2 } from 'lucide-react'

import { DAYS, isSlotInvalid } from '../lib/hours'

function WeeklyHoursEditor({ value, onChange }) {
  function addSlot(dayKey) {
    const daySlots = value[dayKey] ?? []
    onChange({ ...value, [dayKey]: [...daySlots, { start: '', end: '' }] })
  }

  function removeSlot(dayKey, index) {
    const daySlots = value[dayKey] ?? []
    onChange({ ...value, [dayKey]: daySlots.filter((_, i) => i !== index) })
  }

  function updateSlot(dayKey, index, field, newValue) {
    const daySlots = value[dayKey] ?? []
    onChange({
      ...value,
      [dayKey]: daySlots.map((slot, i) => (i === index ? { ...slot, [field]: newValue } : slot)),
    })
  }

  const timeInputClasses = (invalid) =>
    `rounded-lg border bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 ${
      invalid ? 'border-error focus:border-error' : 'border-border focus:border-primary'
    }`

  return (
    <div className="divide-y divide-border">
      {DAYS.map((day) => {
        const daySlots = value[day.key] ?? []
        return (
          <div
            key={day.key}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <p className="w-24 shrink-0 pt-1.5 text-sm font-medium text-ink">{day.label}</p>

            <div className="flex-1 space-y-2">
              {daySlots.length === 0 ? (
                <p className="pt-1.5 text-sm text-muted">Cerrado</p>
              ) : (
                daySlots.map((slot, index) => {
                  const invalid = isSlotInvalid(slot)
                  return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${day.label}, inicio de franja ${index + 1}`}
                        value={slot.start}
                        onChange={(e) => updateSlot(day.key, index, 'start', e.target.value)}
                        className={timeInputClasses(invalid)}
                      />
                      <span className="text-sm text-muted">a</span>
                      <input
                        type="time"
                        aria-label={`${day.label}, fin de franja ${index + 1}`}
                        value={slot.end}
                        onChange={(e) => updateSlot(day.key, index, 'end', e.target.value)}
                        className={timeInputClasses(invalid)}
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(day.key, index)}
                        className="rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-error"
                        aria-label="Eliminar franja"
                      >
                        <Trash2 size={16} />
                      </button>
                      {invalid && (
                        <span className="text-sm text-error">
                          Completa ambas horas; el fin debe ser posterior al inicio.
                        </span>
                      )}
                    </div>
                  )
                })
              )}

              <button
                type="button"
                onClick={() => addSlot(day.key)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
              >
                <Plus size={16} />
                Agregar franja
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default WeeklyHoursEditor
