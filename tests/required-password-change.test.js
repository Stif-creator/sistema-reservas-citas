import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completeRequiredPasswordChange, enforcePasswordChangeGate } from '../functions/requiredPasswordChange.js'

function fakeDb(profile, role = 'admin') {
  const values = { 'users/new-admin': { defaultBusinessId: 'business-1', ...profile }, 'memberships/business-1_new-admin': { role, status: 'active' } }
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
  await enforcePasswordChangeGate(fakeDb({ status: 'active', mustChangePassword: true }, 'professional'), 'new-admin', 'professionalSchedule')
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
