import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeRequiredPasswordChange, enforcePasswordChangeGate } from '../functions/requiredPasswordChange.js'

function fakeDb(profile, role = 'admin', uid = 'new-admin', membershipStatus = 'active') {
  const businessId = profile.defaultBusinessId || 'business-1'
  const values = { [`users/${uid}`]: { defaultBusinessId: businessId, globalRole: 'user', ...profile }, [`memberships/${businessId}_${uid}`]: { role, status: membershipStatus } }
  let audit = null
  const userRef = path => ({ path, get: async () => ({ exists: Boolean(values[path]), data: () => values[path], get: key => values[path]?.[key] }) })
  const db = {
    values,
    doc: userRef,
    collection: name => ({ doc: () => ({ path: `${name}/generated-audit` }) }),
    runTransaction: async callback => callback({
      get: async ref => ref.get(),
      update: (ref, patch) => { values[ref.path] = { ...values[ref.path], ...patch } },
      create: (_ref, event) => { audit = event },
    }),
    get audit() { return audit },
  }
  return db
}

const recentIdentity = { uid: 'new-admin', auth_time: Math.floor(Date.now() / 1000) }

test('new administrator is blocked from backend operations until required password change completes', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: true })
  await assert.rejects(enforcePasswordChangeGate(db, 'new-admin', 'platformActivity'), { code: 'failed-precondition' })
  await enforcePasswordChangeGate(db, 'old-admin', 'platformActivity')
  await assert.rejects(enforcePasswordChangeGate(fakeDb({ status: 'active', mustChangePassword: true }, 'professional'), 'new-admin', 'professionalSchedule'), { code: 'failed-precondition' })
  await enforcePasswordChangeGate(fakeDb({ status: 'active', mustChangePassword: true }, 'professional'), 'new-admin', 'requiredPasswordChange')
  await enforcePasswordChangeGate(fakeDb({ status: 'active', mustChangePassword: true }, 'professional', 'inactive-pro', 'inactive'), 'inactive-pro', 'professionalSchedule')
})

test('password change requires recent authentication and enforces length server-side', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: true })
  const auth = { updateUser: async () => assert.fail('no debe actualizarse') }
  await assert.rejects(completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'short' }, auth), { code: 'invalid-argument' })
  await assert.rejects(completeRequiredPasswordChange(db, 'new-admin', { ...recentIdentity, auth_time: 1 }, { newPassword: 'a secure password' }, auth), { code: 'failed-precondition' })
})

test('successful required change updates Firebase Auth, clears server-owned flag and writes a password-free audit event', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: true })
  let updated
  const auth = { updateUser: async (uid, data) => { updated = { uid, ...data } } }
  await completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'a secure password' }, auth)
  assert.deepEqual(updated, { uid: 'new-admin', password: 'a secure password' })
  assert.equal(db.values['users/new-admin'].mustChangePassword, false)
  assert.equal(db.audit.action, 'requiredPasswordChanged')
  assert.equal(db.audit.businessId, 'business-1')
  assert.equal(Object.keys(db.audit).some(key => /password/i.test(key)), false)
})

test('an active professional can complete the required change but an inactive membership cannot', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: true }, 'professional', 'new-professional')
  const identity = { ...recentIdentity, uid: 'new-professional' }
  let updated = false
  await completeRequiredPasswordChange(db, 'new-professional', identity, { newPassword: 'a secure password' }, { updateUser: async () => { updated = true } })
  assert.equal(updated, true)
  assert.equal(db.values['users/new-professional'].mustChangePassword, false)
  const inactive = fakeDb({ status: 'active', mustChangePassword: true }, 'professional', 'inactive-pro', 'inactive')
  await assert.rejects(completeRequiredPasswordChange(inactive, 'inactive-pro', { ...identity, uid: 'inactive-pro' }, { newPassword: 'a secure password' }, { updateUser: async () => assert.fail('no debe actualizarse') }), { code: 'permission-denied' })
})

test('a professional without the required flag is not blocked', async () => {
  await enforcePasswordChangeGate(fakeDb({ status: 'active' }, 'professional'), 'new-admin', 'professionalSchedule')
})

test('superadmins are excluded from the tenant password gate and professional change endpoint', async () => {
  const db = fakeDb({ status: 'active', globalRole: 'superadmin', mustChangePassword: true }, 'admin')
  await enforcePasswordChangeGate(db, 'new-admin', 'platformActivity')
  await assert.rejects(completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'a secure password' }, { updateUser: async () => assert.fail('no debe cambiarse esta cuenta') }), { code: 'permission-denied' })
})

test('an interrupted Auth-to-profile completion can be retried after the password changed', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: true })
  let attempts = 0
  const auth = { updateUser: async () => { attempts++ } }
  const original = db.runTransaction
  db.runTransaction = async () => { throw new Error('temporary Firestore error') }
  await assert.rejects(completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'a secure password' }, auth))
  assert.equal(db.values['users/new-admin'].mustChangePassword, true)
  db.runTransaction = original
  await completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'another secure password' }, auth)
  assert.equal(attempts, 2)
  assert.equal(db.values['users/new-admin'].mustChangePassword, false)
})

test('a lost response after the flag is cleared can be retried safely', async () => {
  const db = fakeDb({ status: 'active', mustChangePassword: false })
  const auth = { updateUser: async () => assert.fail('no debe repetir el cambio de contraseña') }
  assert.deepEqual(await completeRequiredPasswordChange(db, 'new-admin', recentIdentity, { newPassword: 'a secure password' }, auth), { ok: true, alreadyCompleted: true })
})
