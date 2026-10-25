import test from 'node:test'
import assert from 'node:assert/strict'
import { getServiceProfessionals } from '../src/lib/serviceProfessionals.js'

test('service associations include every professional linked from either side', () => {
  const service = { id: 'service-a', professionalIds: ['professional-a', 'user-b'] }
  const professionals = [
    { id: 'professional-a', displayName: 'Ana' },
    { id: 'professional-b', userId: 'user-b', displayName: 'Luis' },
    { id: 'professional-c', serviceIds: ['service-a'], displayName: 'Marta' },
    { id: 'professional-d', serviceIds: ['another-service'], displayName: 'Diego' },
  ]

  assert.deepEqual(getServiceProfessionals(service, professionals).map(person => person.id), [
    'professional-a', 'professional-b', 'professional-c',
  ])
})

test('legacy single professional IDs are supported without inventing associations', () => {
  const professionals = [{ id: 'professional-a' }, { id: 'professional-b', serviceIds: [] }]
  assert.deepEqual(getServiceProfessionals({ id: 'service-a', professionalIds: 'professional-a' }, professionals), [professionals[0]])
  assert.deepEqual(getServiceProfessionals({ id: 'service-b' }, professionals), [])
})
