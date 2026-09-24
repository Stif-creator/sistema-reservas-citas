import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  and,
  or,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'

let env
const dbFor = (uid) => env.authenticatedContext(uid).firestore()
const membership = (uid, role, status = 'active') => ({
  userId: uid,
  businessId: 'studio',
  role,
  status,
  permissions: {},
  createdAt: Timestamp.now(),
})
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-citaspro',
    firestore: {
      rules: await readFile('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    for (const [uid, role, status] of [
      ['owner', 'admin', 'active'],
      ['pro', 'professional', 'active'],
      ['pending', 'professional', 'pending'],
      ['client', 'client', 'active'],
      ['outsider', 'client', 'active'],
    ]) {
      await setDoc(doc(db, 'users', uid), {
        id: uid,
        auth_uid: uid,
        firstName: uid,
        lastName: 'Test',
        status: 'active',
        globalRole: 'user',
        businessIds: ['studio'],
        onboardingComplete: true,
        createdAt: Timestamp.now(),
      })
      if (uid !== 'outsider')
        await setDoc(doc(db, 'memberships', `studio_${uid}`), membership(uid, role, status))
    }
    await setDoc(doc(db, 'businesses', 'studio'), {
      id: 'studio',
      ownerUserId: 'owner',
      name: 'Estudio Violeta',
      description: 'Un espacio para cuidarte y disfrutar de tu tiempo.',
      status: 'active',
      settings: {
        publicPageEnabled: true,
        timezone: 'America/La_Paz',
        currencyCode: 'BOB',
      },
      appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
      createdAt: Timestamp.now(),
    })
    await setDoc(doc(db, 'businesses', 'private'), {
      id: 'private',
      ownerUserId: 'outsider',
      status: 'active',
      settings: { publicPageEnabled: false },
    })
    for (const uid of ['pro', 'pending'])
      await setDoc(doc(db, 'professionals', `studio_${uid}`), {
        id: `studio_${uid}`,
        userId: uid,
        businessId: 'studio',
        displayName: uid,
        isActive: uid === 'pro',
        serviceIds: [],
        createdAt: Timestamp.now(),
      })
    await setDoc(doc(db, 'categories', 'care'), {
      id: 'care',
      businessId: 'studio',
      name: 'Bienestar',
      isActive: true,
      displayOrder: 1,
    })
    await setDoc(doc(db, 'services', 'massage'), {
      id: 'massage',
      businessId: 'studio',
      categoryId: 'care',
      name: 'Masaje relajante',
      description: 'Una pausa para reconectar contigo.',
      price: 150,
      durationMinutes: 60,
      currencyCode: 'BOB',
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      isActive: true,
      isPublic: true,
      professionalIds: [],
    })
    await setDoc(doc(db, 'services', 'hidden'), {
      id: 'hidden',
      businessId: 'studio',
      isActive: false,
      isPublic: false,
    })
    for (const [id, all, pid] of [
      ['all', true, null],
      ['own', false, 'studio_pro'],
      ['other', false, 'studio_pending'],
    ])
      await setDoc(doc(db, 'scheduleBlocks', id), {
        id,
        businessId: 'studio',
        allProfessionals: all,
        professionalId: pid,
        createdByUserId: 'owner',
        startAt: Timestamp.now(),
        endAt: Timestamp.fromMillis(Date.now() + 3600000),
      })
  })
})
after(async () => {
  await env?.cleanup()
})

test('incomplete registration can roll back, but cannot claim another business as admin', async () => {
  const db = dbFor('incomplete')
  await assertSucceeds(
    setDoc(doc(db, 'users', 'incomplete'), {
      id: 'incomplete',
      auth_uid: 'incomplete',
      globalRole: 'user',
      status: 'active',
      businessIds: ['studio'],
      onboardingComplete: false,
      createdAt: serverTimestamp(),
    })
  )
  await assertFails(
    setDoc(doc(db, 'memberships', 'studio_incomplete'), {
      ...membership('incomplete', 'admin'),
      createdAt: serverTimestamp(),
    })
  )
  await assertSucceeds(
    setDoc(doc(db, 'memberships', 'studio_incomplete'), {
      ...membership('incomplete', 'client'),
      createdAt: serverTimestamp(),
    })
  )
  await assertSucceeds(deleteDoc(doc(db, 'memberships', 'studio_incomplete')))
  await assertSucceeds(deleteDoc(doc(db, 'users', 'incomplete')))
})

test('public catalog queries succeed while private records stay private', async () => {
  const db = env.unauthenticatedContext().firestore()
  await assertSucceeds(
    getDocs(
      query(
        collection(db, 'businesses'),
        where('status', '==', 'active'),
        where('settings.publicPageEnabled', '==', true)
      )
    )
  )
  await assertSucceeds(
    getDocs(
      query(
        collection(db, 'services'),
        where('businessId', '==', 'studio'),
        where('isActive', '==', true),
        where('isPublic', '==', true)
      )
    )
  )
  await assertFails(getDoc(doc(db, 'businesses', 'private')))
  await assertFails(getDoc(doc(db, 'users', 'owner')))
  await assertFails(getDoc(doc(db, 'professionals', 'studio_pro')))
  await assertFails(getDoc(doc(db, 'services', 'hidden')))
})
test('clients cannot modify a business, elevate role or reactivate themselves', async () => {
  const db = dbFor('client')
  await assertFails(updateDoc(doc(db, 'businesses', 'studio'), { name: 'Hijacked' }))
  await assertFails(updateDoc(doc(db, 'memberships', 'studio_client'), { role: 'admin' }))
  await assertFails(updateDoc(doc(db, 'users', 'client'), { status: 'inactive' }))
  await assertFails(deleteDoc(doc(db, 'memberships', 'studio_client')))
  await assertFails(deleteDoc(doc(db, 'users', 'client')))
})
test('admin reads scoped lists and updates public branding', async () => {
  const db = dbFor('owner')
  await assertSucceeds(
    getDocs(query(collection(db, 'professionals'), where('businessId', '==', 'studio')))
  )
  await assertSucceeds(
    getDocs(
      query(
        collection(db, 'categories'),
        where('businessId', '==', 'studio'),
        orderBy('displayOrder')
      )
    )
  )
  await assertSucceeds(
    updateDoc(doc(db, 'businesses', 'studio'), {
      appearance: { primaryColor: '#7c3aed', secondaryColor: '#f0e7ff' },
    })
  )
  await assertFails(updateDoc(doc(db, 'businesses', 'private'), { name: 'Cross tenant' }))
})
test('pending professionals need atomic administrator approval', async () => {
  const pending = dbFor('pending')
  await assertFails(
    getDocs(query(collection(pending, 'scheduleBlocks'), where('businessId', '==', 'studio')))
  )
  await assertFails(
    updateDoc(doc(pending, 'memberships', 'studio_pending'), {
      status: 'active',
    })
  )
  const db = dbFor('owner')
  await assertFails(updateDoc(doc(db, 'memberships', 'studio_pending'), { status: 'active' }))
  const batch = writeBatch(db)
  batch.update(doc(db, 'memberships', 'studio_pending'), { status: 'active' })
  batch.update(doc(db, 'professionals', 'studio_pending'), { isActive: true })
  await assertSucceeds(batch.commit())
})
test('professional query sees only global and own blocks; cannot delete administrator blocks', async () => {
  const db = dbFor('pro')
  const result = await assertSucceeds(
    getDocs(
      query(
        collection(db, 'scheduleBlocks'),
        and(
          where('businessId', '==', 'studio'),
          or(where('allProfessionals', '==', true), where('professionalId', '==', 'studio_pro'))
        ),
        orderBy('startAt')
      )
    )
  )
  assert.equal(result.size, 2)
  await assertFails(getDoc(doc(db, 'scheduleBlocks', 'other')))
  await assertFails(deleteDoc(doc(db, 'scheduleBlocks', 'own')))
  const block = {
    id: 'new-block',
    businessId: 'studio',
    professionalId: 'studio_pro',
    allProfessionals: false,
    title: 'Descanso',
    reason: 'personal',
    createdByUserId: 'pro',
    startAt: Timestamp.now(),
    endAt: Timestamp.fromMillis(Date.now() + 3600000),
    createdAt: serverTimestamp(),
  }
  await assertSucceeds(setDoc(doc(db, 'scheduleBlocks', block.id), block))
  await assertSucceeds(deleteDoc(doc(db, 'scheduleBlocks', block.id)))
  await assertFails(
    setDoc(doc(db, 'scheduleBlocks', block.id), {
      ...block,
      allProfessionals: true,
      professionalId: null,
    })
  )
})
test('registration provisions owner, client and pending professional in dependency order', async () => {
  for (const role of ['admin', 'client', 'professional']) {
    const uid = `new-${role}`
    const db = dbFor(uid)
    const bid = role === 'admin' ? 'new-studio' : 'studio'
    await assertSucceeds(
      setDoc(doc(db, 'users', uid), {
        id: uid,
        auth_uid: uid,
        globalRole: 'user',
        status: 'active',
        businessIds: [bid],
        onboardingComplete: false,
        createdAt: serverTimestamp(),
      })
    )
    if (role === 'admin')
      await assertSucceeds(
        setDoc(doc(db, 'businesses', bid), {
          id: bid,
          ownerUserId: uid,
          name: 'New studio',
          status: 'active',
          settings: { publicPageEnabled: true },
          createdAt: serverTimestamp(),
        })
      )
    await assertSucceeds(
      setDoc(doc(db, 'memberships', `${bid}_${uid}`), {
        userId: uid,
        businessId: bid,
        role,
        status: role === 'professional' ? 'pending' : 'active',
        permissions: {},
        createdAt: serverTimestamp(),
      })
    )
    if (role !== 'admin')
      await assertSucceeds(
        setDoc(doc(db, role === 'client' ? 'clients' : 'professionals', `${bid}_${uid}`), {
          id: `${bid}_${uid}`,
          userId: uid,
          businessId: bid,
          isActive: false,
          serviceIds: [],
          createdAt: serverTimestamp(),
        })
      )
    await assertSucceeds(updateDoc(doc(db, 'users', uid), { onboardingComplete: true }))
    await assertFails(deleteDoc(doc(db, 'users', uid)))
  }
})
