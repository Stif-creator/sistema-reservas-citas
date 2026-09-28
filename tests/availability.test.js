import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableSlots } from '../src/lib/availability.js'

const business = { id: 'studio', status: 'active', settings: { timezone: 'America/La_Paz', bookingIntervalMinutes: 30 }, weeklyHours: { 1: [{ start: '09:00', end: '12:00' }] } }
const professional = { id: 'studio_pro', businessId: 'studio', isActive: true, serviceIds: ['service'], weeklyHours: { 1: [{ start: '08:00', end: '13:00' }] } }
const service = { id: 'service', businessId: 'studio', isActive: true, durationMinutes: 30 }
const input = { business, professional, service, date: '2026-09-28', now: Date.parse('2026-09-27T12:00Z') }
const block = { businessId: 'studio', professionalId: 'studio_pro', startAt: '2026-09-28T14:00Z', endAt: '2026-09-28T15:00Z' }
const labels = (changes = {}) => availableSlots({ ...input, ...changes }).map((slot) => slot.label)

test('availability intersects weekly hours and removes only overlapping own or global blocks', () => {
  assert.deepEqual(labels(), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'])
  assert.deepEqual(labels({ blocks: [block] }), ['09:00', '09:30', '11:00', '11:30'])
  assert.deepEqual(labels({ blocks: [{ ...block, professionalId: null, allProfessionals: true }] }), ['09:00', '09:30', '11:00', '11:30'])
  assert.equal(labels({ blocks: [{ ...block, professionalId: 'other' }, { ...block, businessId: 'other' }] }).length, 6)
  assert.equal(labels({ blocks: [{ ...block, startAt: '2026-09-27T22:00Z', endAt: '2026-09-29T02:00Z' }] }).length, 0)
})

test('duration and preparation/cleanup must fit opening hours and avoid blocks', () => {
  assert.deepEqual(labels({ service: { ...service, durationMinutes: 60 }, blocks: [block] }), ['09:00', '11:00'])
  assert.deepEqual(labels({ service: { ...service, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 }, blocks: [block] }), [])
  assert.deepEqual(labels({ service: { ...service, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 } }), ['09:30', '10:00', '10:30', '11:00'])
})

test('closed days, inactive/unassigned professionals and schedule validity produce no slots', () => {
  assert.deepEqual(labels({ date: '2026-09-29' }), [])
  for (const changes of [{ isActive: false }, { serviceIds: [] }, { scheduleValidFrom: '2026-09-29' }, { scheduleValidUntil: '2026-09-27' }, { weeklyHours: {} }]) {
    assert.deepEqual(labels({ professional: { ...professional, ...changes } }), [])
  }
  assert.deepEqual(labels({ service: { ...service, isActive: false } }), [])
  assert.deepEqual(labels({ business: { ...business, status: 'inactive' } }), [])
})

test('business timezone, advance limits and invalid inputs are respected', () => {
  assert.equal(availableSlots(input)[0].start, Date.parse('2026-09-28T13:00Z'))
  assert.deepEqual(labels({ now: Date.parse('2026-09-28T14:15Z') }), ['10:30', '11:00', '11:30'])
  assert.deepEqual(labels({ business: { ...business, settings: { ...business.settings, maxAdvanceDays: 0 } } }), [])
  assert.deepEqual(labels({ service: { ...service, durationMinutes: 0 } }), [])
  assert.deepEqual(labels({ business: { ...business, settings: { ...business.settings, bookingIntervalMinutes: 0 } } }), [])
  assert.deepEqual(labels({ blocks: [{ ...block, startAt: 'invalid' }] }), [])
  assert.deepEqual(labels({ professional: { ...professional, weeklyHours: { 1: 'invalid' } } }), [])
  assert.deepEqual(labels({ professional: { ...professional, weeklyHours: { 1: [null] } } }), [])
})
