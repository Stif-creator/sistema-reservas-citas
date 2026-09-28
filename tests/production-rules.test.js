import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore'

let env
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-citaspro', firestore: {
    host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8'),
  } })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', 'studio'), { ownerUserId: 'owner', status: 'active', settings: { publicPageEnabled: true } })
    await setDoc(doc(db, 'businesses', 'other'), { ownerUserId: 'outsider', status: 'active', settings: { publicPageEnabled: false } })
    await setDoc(doc(db, 'categories', 'legacy-category'), { businessId: 'studio', name: 'Categoría antigua' })
    for (const [uid, businessId, role] of [['owner', 'studio', 'admin'], ['client', 'studio', 'client'], ['pro', 'studio', 'professional'], ['outsider', 'other', 'admin'], ['unrelated', 'studio', null]]) {
      await setDoc(doc(db, 'users', uid), { firstName: uid, status: 'active', businessIds: [businessId] })
      if (role) await setDoc(doc(db, 'memberships', `${businessId}_${uid}`), { userId: uid, businessId, role, status: 'active' })
    }
    await setDoc(doc(db, 'services', 'demo-document'), { name: 'Servicio demo 01', businessId: 'studio', categoryId: 'legacy-category', price: 10, durationMinutes: 30, isActive: true, isPublic: true })
  })
})
after(async () => { await env?.cleanup() })

test('production administrator reads own business users including old profiles without embedded IDs', async () => {
  const db = env.authenticatedContext('owner').firestore()
  for (const uid of ['owner', 'client', 'pro']) await assertSucceeds(getDoc(doc(db, 'users', uid)))
  await assertFails(getDoc(doc(db, 'users', 'outsider')))
  await assertFails(getDoc(doc(db, 'users', 'unrelated')))
})

test('production clients, professionals and visitors cannot read other user profiles', async () => {
  for (const uid of ['client', 'pro', 'outsider']) {
    const db = env.authenticatedContext(uid).firestore()
    await assertFails(getDoc(doc(db, 'users', 'owner')))
    await assertSucceeds(getDoc(doc(db, 'users', uid)))
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'owner')))
})

test('production administrator edits legacy service fields and they persist', async () => {
  const db = env.authenticatedContext('owner').firestore()
  const ref = doc(db, 'services', 'demo-document')
  await assertSucceeds(updateDoc(ref, { name: 'Servicio actualizado', price: 125.5, durationMinutes: 45 }))
  assert.equal((await getDoc(ref)).data().price, 125.5)
  await assertFails(updateDoc(doc(env.authenticatedContext('outsider').firestore(), 'services', 'demo-document'), { price: 1 }))
})
