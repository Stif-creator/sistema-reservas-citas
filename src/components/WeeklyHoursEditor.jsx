// weeklyHours: { "1": [{ start: "HH:MM", end: "HH:MM" }, ...], ..., "7": [...] }
// Llaves ISO: 1 = Lunes ... 7 = Domingo.
export const DAYS = [
  { key: '1', label: 'Lunes' },
  { key: '2', label: 'Martes' },
  { key: '3', label: 'Miércoles' },
  { key: '4', label: 'Jueves' },
  { key: '5', label: 'Viernes' },
  { key: '6', label: 'Sábado' },
  { key: '7', label: 'Domingo' },
]

export function isSlotInvalid(slot) {
  return Boolean(slot.start && slot.end && slot.end <= slot.start)
}

export function hasInvalidWeeklyHoursSlot(weeklyHours) {
  return DAYS.some((day) => (weeklyHours[day.key] ?? []).some(isSlotInvalid))
}

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

  return (
    <div>
      {DAYS.map((day) => {
        const daySlots = value[day.key] ?? []
        return (
          <div key={day.key} style={{ marginBottom: 12 }}>
            <strong>{day.label}</strong>
            {daySlots.length === 0 ? (
              <p style={{ margin: '4px 0', color: '#666' }}>Cerrado</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0' }}>
                {daySlots.map((slot, index) => {
                  const invalid = isSlotInvalid(slot)
                  return (
                    <li key={index} style={{ marginBottom: 4 }}>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => updateSlot(day.key, index, 'start', e.target.value)}
                        style={invalid ? { borderColor: 'red' } : undefined}
                      />{' '}
                      a{' '}
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => updateSlot(day.key, index, 'end', e.target.value)}
                        style={invalid ? { borderColor: 'red' } : undefined}
                      />{' '}
                      <button type="button" onClick={() => removeSlot(day.key, index)}>
                        Eliminar franja
                      </button>
                      {invalid && (
                        <span style={{ color: 'red', marginLeft: 8 }}>
                          La hora de fin debe ser mayor que la de inicio.
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <button type="button" onClick={() => addSlot(day.key)}>
              + Agregar franja
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default WeeklyHoursEditor
