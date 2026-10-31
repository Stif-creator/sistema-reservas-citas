import { useState } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'

import { DAYS, isSlotInvalid } from '../lib/hours'
import { useFeedback } from '../context/feedback-context'

function WeeklyHoursEditor({ value, onChange, confirmCopy = false, emptyNewSlot = false, compact = false }) {
  const { confirm } = useFeedback()
  const [copyFrom, setCopyFrom] = useState('1')
  const [copyDays, setCopyDays] = useState([])
  const [copyOpen, setCopyOpen] = useState(false)
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
    <div className="weekly-hours-editor"><div className="mb-5 rounded-xl bg-slate-50 p-4"><button type="button" className="inline-flex gap-2 items-center font-medium text-primary text-sm" onClick={() => setCopyOpen(!copyOpen)}><Copy size={16} />Copiar a otros días</button>{copyOpen && <div className="mt-4 space-y-3"><label className="block text-sm">Copiar horario de<select className="ml-3 rounded-lg border p-2" value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>{DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}</select></label><div className="flex flex-wrap gap-4">{DAYS.filter(d => String(d.key) !== copyFrom).map(d => <label key={d.key} className="flex gap-2 text-sm"><input type="checkbox" checked={copyDays.includes(d.key)} onChange={e => setCopyDays(e.target.checked ? [...copyDays,d.key] : copyDays.filter(k => k !== d.key))} />{d.label}</label>)}</div><p className="text-xs text-muted">{confirmCopy ? 'Se copiarán las franjas al guardar. Los horarios existentes se reemplazan solo tras confirmar.' : 'Reemplaza las franjas de los días seleccionados. Guarda el formulario para aplicar los cambios.'}</p><button type="button" disabled={!copyDays.length} className="rounded-lg bg-primary text-white px-4 py-2 text-sm disabled:opacity-50" onClick={async () => { const next = {...value}; if (confirmCopy) { const destinations = copyDays.map(key => DAYS.find(day => day.key === key)?.label).filter(Boolean); const source = DAYS.find(day => String(day.key) === copyFrom)?.label; const overwrites = copyDays.some(key => (value[key] || []).length); const accepted = await confirm({ title: overwrites ? '¿Reemplazar horarios existentes?' : '¿Copiar este horario?', description: `Se copiarán ${value[copyFrom]?.length || 0} franjas de ${source} a ${destinations.join(', ')}.${overwrites ? ' Los horarios actuales de esos días se reemplazarán.' : ''}`, confirmLabel: 'Confirmar copia' }); if (!accepted) return }; copyDays.filter(k => String(k) !== copyFrom).forEach(k => { next[k] = (value[copyFrom] || []).map(slot => ({...slot})) }); onChange(next); setCopyOpen(false); setCopyDays([]) }}>{confirmCopy ? 'Confirmar y copiar' : 'Aplicar copia'}</button></div>}</div><div className="divide-y divide-border">
      {DAYS.map((day) => {
        const daySlots = value[day.key] ?? []
        return (
          <div
            key={day.key}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
          >
            <div className={compact ? 'weekly-day-control' : 'w-32 shrink-0 pt-1.5'}><p className={`text-sm font-semibold text-ink ${compact ? '' : 'mb-3'}`}>{day.label}</p><button type="button" role="switch" aria-checked={daySlots.length > 0} aria-label={`Abrir ${day.label}`} onClick={() => onChange({...value, [day.key]: daySlots.length ? [] : [emptyNewSlot ? {start:'',end:''} : {start:'09:00',end:'13:00'}]})} className={`relative h-6 w-11 items-center rounded-full ${daySlots.length ? 'bg-primary' : 'bg-slate-300'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${daySlots.length ? 'left-6' : 'left-1'}`} /></button></div>

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
    </div></div>
  )
}

export default WeeklyHoursEditor
