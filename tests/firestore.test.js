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
      about: { title: 'Nuestra historia', story: 'Atención cercana', mission: 'Escuchar', values: 'Respeto' },
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
        serviceIds: uid === 'pro' ? ['massage'] : [],
        createdAt: Timestamp.now(),
      })
    await setDoc(doc(db, 'categories', 'care'), {
      id: 'care',
      businessId: 'studio',
      name: 'Bienestar',
      description: '',
      isActive: true,
      displayOrder: 1,
      image: { url: null, publicId: null },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
      professionalIds: ['studio_pro'],
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

test('professionals can read services in their business but cannot write services directly', async () => {
  const db = dbFor('pro')
  const assigned = await assertSucceeds(getDocs(query(collection(db, 'services'), where('businessId', '==', 'studio'), where('professionalIds', 'array-contains', 'studio_pro'))))
  assert.deepEqual(assigned.docs.map(service => service.id), ['massage'])
  await assertSucceeds(getDoc(doc(db, 'services', 'massage')))
  await assertSucceeds(getDocs(query(collection(db, 'categories'), where('businessId', '==', 'studio'))))
  await assertFails(getDocs(query(collection(db, 'services'), where('businessId', '==', 'other-business'))))
  await assertFails(updateDoc(doc(db, 'services', 'massage'), { price: 1 }))
})

test('category writes are tenant scoped and validate editable fields', async () => {
  const db = dbFor('owner')
  const category = id => ({
    id, businessId: 'studio', name: 'Odontología general', description: 'Atención odontológica.',
    displayOrder: 2, isActive: true, image: { url: null, publicId: null },
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  await assertSucceeds(setDoc(doc(db, 'categories', 'category-valid'), category('category-valid')))
  await assertFails(setDoc(doc(db, 'categories', 'category-long'), { ...category('category-long'), name: 'x'.repeat(81) }))
  await assertFails(setDoc(doc(db, 'categories', 'category-description-long'), { ...category('category-description-long'), description: 'x'.repeat(301) }))
  await assertFails(setDoc(doc(db, 'categories', 'category-extra'), { ...category('category-extra'), elevated: true }))
  await assertFails(setDoc(doc(db, 'categories', 'category-other'), { ...category('category-other'), businessId: 'private' }))
  await assertFails(setDoc(doc(dbFor('pro'), 'categories', 'category-professional'), category('category-professional')))
  await assertFails(setDoc(doc(dbFor('client'), 'categories', 'category-client'), category('category-client')))
  await assertFails(updateDoc(doc(db, 'categories', 'care'), { businessId: 'private', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(db, 'categories', 'care'), { isActive: 'false', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(db, 'categories', 'care'), { adminOnly: true, updatedAt: serverTimestamp() }))
  await assertSucceeds(updateDoc(doc(db, 'categories', 'care'), { name: 'Bienestar y salud', updatedAt: serverTimestamp() }))
})

test('reservations are read by active scoped actors but all direct mutations and locks are denied', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'reservations', 'protected-reservation'), { businessId: 'studio', clientUserId: 'client', professionalUserId: 'pro', status: 'pending' })
    await setDoc(doc(context.firestore(), 'bookingLocks', 'studio'), { revision: 1 })
  })
  for (const uid of ['owner', 'client', 'pro']) {
    const db = dbFor(uid)
    await assertSucceeds(getDoc(doc(db, 'reservations', 'protected-reservation')))
    await assertFails(updateDoc(doc(db, 'reservations', 'protected-reservation'), { status: 'confirmed' }))
    await assertFails(setDoc(doc(db, 'reservations', `forged-${uid}`), { businessId: 'studio', clientUserId: uid, professionalUserId: 'pro', status: 'confirmed' }))
    await assertFails(deleteDoc(doc(db, 'reservations', 'protected-reservation')))
    await assertFails(getDoc(doc(db, 'bookingLocks', 'studio')))
  }
  await assertFails(getDoc(doc(dbFor('outsider'), 'reservations', 'protected-reservation')))
  await assertFails(getDoc(doc(dbFor('pending'), 'reservations', 'protected-reservation')))
})

test('client catalog stays scoped and read-only even when the public website is disabled', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', 'catalog-private'), { status: 'active', settings: { publicPageEnabled: false }, ownerUserId: 'owner' })
    await setDoc(doc(db, 'memberships', 'catalog-private_client'), { ...membership('client', 'client'), businessId: 'catalog-private' })
    await setDoc(doc(db, 'categories', 'catalog-care'), { businessId: 'catalog-private', name: 'Bienestar' })
    for (const [id, isActive, isPublic] of [['visible', true, true], ['inactive', false, true], ['hidden', true, false]]) {
      await setDoc(doc(db, 'services', `catalog-${id}`), { businessId: 'catalog-private', name: id, isActive, isPublic })
    }
  })
  const client = dbFor('client')
  await assertSucceeds(getDocs(query(collection(client, 'categories'), where('businessId', '==', 'catalog-private'))))
  const services = await assertSucceeds(getDocs(query(collection(client, 'services'), where('businessId', '==', 'catalog-private'), where('isActive', '==', true), where('isPublic', '==', true))))
  assert.equal(services.size, 1)
  await assertFails(getDoc(doc(client, 'services', 'catalog-inactive')))
  await assertFails(getDoc(doc(client, 'services', 'catalog-hidden')))
  await assertFails(updateDoc(doc(client, 'categories', 'catalog-care'), { name: 'Changed' }))
  await assertFails(getDoc(doc(client, 'professionals', 'studio_pro')))
  await assertFails(getDoc(doc(dbFor('outsider'), 'categories', 'catalog-care')))
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'services', 'catalog-visible')))
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'memberships', 'catalog-private_client'), { status: 'inactive' }))
  await assertFails(getDoc(doc(client, 'services', 'catalog-visible')))
})

test('public business pages can read only active categories from a published business', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, 'businesses', 'catalog-public'), { status: 'active', settings: { publicPageEnabled: true }, ownerUserId: 'owner' })
    await setDoc(doc(db, 'categories', 'catalog-public-active'), { businessId: 'catalog-public', name: 'Servicios', isActive: true })
    await setDoc(doc(db, 'categories', 'catalog-public-disabled'), { businessId: 'catalog-public', name: 'Oculta', isActive: false })
  })
  const visitor = env.unauthenticatedContext().firestore()
  const categories = await assertSucceeds(getDocs(query(collection(visitor, 'categories'), where('businessId', '==', 'catalog-public'), where('isActive', '==', true))))
  assert.deepEqual(categories.docs.map(item => item.id), ['catalog-public-active'])
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'businesses', 'catalog-public'), { 'settings.publicPageEnabled': false }))
  await assertFails(getDocs(query(collection(visitor, 'categories'), where('businessId', '==', 'catalog-public'), where('isActive', '==', true))))
})

function provisionProfessional(db, uid, businessId = 'studio') {
  const id = `${businessId}_${uid}`
  const batch = writeBatch(db)
  batch.set(doc(db, 'users', uid), {
    id: uid, auth_uid: uid, firstName: 'Nuevo', lastName: 'Profesional', email: `${uid}@example.test`, phone: '70000000',
    globalRole: 'user', status: 'active', businessIds: [businessId], onboardingComplete: true, createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'memberships', id), {
    userId: uid, businessId, role: 'professional', status: 'active', permissions: {}, createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'professionals', id), {
    id, businessId, userId: uid, displayName: 'Nuevo Profesional', isActive: true, serviceIds: [], createdAt: serverTimestamp(),
  })
  return batch.commit()
}

test('only administrators can provision complete professional accounts in their business', async () => {
  await assertSucceeds(provisionProfessional(dbFor('owner'), 'managed'))
  await assertFails(getDoc(doc(dbFor('owner'), 'users', 'managed')))
  await assertFails(provisionProfessional(dbFor('client'), 'forbidden'))
  await assertFails(provisionProfessional(dbFor('owner'), 'cross-tenant', 'private'))
  await assertFails(getDoc(doc(dbFor('outsider'), 'users', 'managed')))
  await assertSucceeds(getDoc(doc(dbFor('owner'), 'clients', 'studio_managed')))
})

test('role and account state management requires synchronized profiles and protects the owner', async () => {
  const db = dbFor('owner')
  await assertSucceeds(provisionProfessional(db, 'managed-role'))
  const member = doc(db, 'memberships', 'studio_managed-role')
  const profile = doc(db, 'professionals', 'studio_managed-role')
  await assertFails(updateDoc(member, { role: 'client' }))
  const demote = writeBatch(db)
  demote.update(member, { role: 'client', status: 'inactive' })
  demote.update(profile, { isActive: false })
  demote.set(doc(db, 'clients', 'studio_managed-role'), {
    id: 'studio_managed-role', businessId: 'studio', userId: 'managed-role', createdAt: serverTimestamp(),
  })
  await assertSucceeds(demote.commit())
  await assertFails(updateDoc(doc(dbFor('managed-role'), 'memberships', 'studio_managed-role'), { status: 'active' }))
  await assertFails(updateDoc(member, { role: 'admin', status: 'active' }))
  await assertFails(updateDoc(doc(dbFor('managed-role'), 'businesses', 'studio'), { description: 'Cambio prohibido para una membresía inactiva' }))
  await assertFails(updateDoc(doc(dbFor('managed-role'), 'memberships', 'studio_owner'), { role: 'client' }))
  await assertFails(updateDoc(doc(dbFor('managed-role'), 'memberships', 'studio_managed-role'), { status: 'inactive' }))
  await assertSucceeds(updateDoc(member, { status: 'inactive' }))
  const promote = writeBatch(db)
  promote.update(member, { role: 'professional', status: 'active' })
  promote.update(profile, { isActive: true })
  await assertSucceeds(promote.commit())
  await assertFails(updateDoc(member, { permissions: { unrestricted: true } }))
  await assertFails(updateDoc(member, { businessId: 'private' }))
})

test('administrator can create a professional profile when converting a client', async () => {
  const db = dbFor('owner')
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'convert'), { id: 'convert', status: 'active', businessIds: ['studio'] })
    await setDoc(doc(context.firestore(), 'memberships', 'studio_convert'), membership('convert', 'client'))
  })
  await assertSucceeds(getDoc(doc(db, 'professionals', 'studio_convert')))
  const batch = writeBatch(db)
  batch.update(doc(db, 'memberships', 'studio_convert'), { role: 'professional', status: 'active' })
  batch.set(doc(db, 'professionals', 'studio_convert'), {
    id: 'studio_convert', businessId: 'studio', userId: 'convert', displayName: 'Cliente convertido',
    serviceIds: [], isActive: true, createdAt: serverTimestamp(),
  })
  await assertSucceeds(batch.commit())
})

test('legacy professional IDs retain own blocks and synchronize membership state', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'users', 'legacy'), { status: 'active', businessIds: ['studio'] })
    await setDoc(doc(db, 'memberships', 'studio_legacy'), membership('legacy', 'professional'))
    await setDoc(doc(db, 'professionals', 'professional_001'), { businessId: 'studio', userId: 'legacy', isActive: true, serviceIds: ['missing-service'] })
  })
  const db = dbFor('legacy')
  await assertSucceeds(getDocs(query(collection(db, 'professionals'), where('businessId', '==', 'studio'), where('userId', '==', 'legacy'))))
  const block = {
    id: 'legacy-block', businessId: 'studio', professionalId: 'professional_001', allProfessionals: false,
    title: 'Descanso', reason: 'personal', createdByUserId: 'legacy', createdAt: serverTimestamp(),
    startAt: Timestamp.now(), endAt: Timestamp.fromMillis(Date.now() + 3600000),
  }
  await assertFails(setDoc(doc(db, 'scheduleBlocks', block.id), block))
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'scheduleBlocks', block.id), block))
  const blocks = await assertSucceeds(getDocs(query(collection(db, 'scheduleBlocks'),
    and(where('businessId', '==', 'studio'), or(where('allProfessionals', '==', true), where('professionalId', '==', 'professional_001'))))))
  assert.equal(blocks.size, 2)
  await assertFails(getDocs(query(collection(db, 'scheduleBlocks'), where('businessId', '==', 'studio'), where('professionalId', '==', 'studio_pro'))))
  await assertFails(deleteDoc(doc(db, 'scheduleBlocks', block.id)))
  const owner = dbFor('owner')
  const batch = writeBatch(owner)
  batch.update(doc(owner, 'memberships', 'studio_legacy'), { role: 'client', status: 'inactive', professionalId: 'professional_001' })
  batch.update(doc(owner, 'professionals', 'professional_001'), { isActive: false })
  await assertSucceeds(batch.commit())
  await assertFails(updateDoc(doc(owner, 'memberships', 'studio_legacy'), { professionalId: 'studio_pro' }))
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
  await assertFails(updateDoc(doc(db, 'businesses', 'studio'), { about: { title: 'No autorizado' } }))
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
  await assertFails(setDoc(doc(db, 'scheduleBlocks', block.id), block))
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'scheduleBlocks', block.id), block))
  await assertFails(deleteDoc(doc(db, 'scheduleBlocks', block.id)))
  await assertFails(
    setDoc(doc(db, 'scheduleBlocks', block.id), {
      ...block,
      allProfessionals: true,
      professionalId: null,
    })
  )
})
test('public registration provisions clients and pending professionals but cannot create a business administrator', async () => {
  for (const role of ['client', 'professional']) {
    const uid = `new-${role}`
    const db = dbFor(uid)
    const bid = 'studio'
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
  const publicDb = dbFor('unauthorized-admin')
  await assertSucceeds(setDoc(doc(publicDb, 'users', 'unauthorized-admin'), { id: 'unauthorized-admin', auth_uid: 'unauthorized-admin', globalRole: 'user', status: 'active', businessIds: ['new-business'], onboardingComplete: false, createdAt: serverTimestamp() }))
  await assertFails(setDoc(doc(publicDb, 'businesses', 'new-business'), { id: 'new-business', ownerUserId: 'unauthorized-admin', name: 'Forged', status: 'active', settings: { publicPageEnabled: true }, createdAt: serverTimestamp() }))
  await assertFails(setDoc(doc(publicDb, 'memberships', 'new-business_unauthorized-admin'), { businessId: 'new-business', userId: 'unauthorized-admin', role: 'admin', status: 'active', permissions: {}, createdAt: serverTimestamp() }))
})


test('superadmin supervision does not grant operational writes or unaudited configuration; clients cannot promote themselves', async () => {
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'users', 'platform'), { status: 'active', globalRole: 'superadmin', businessIds: ['studio'] }))
  const owner = dbFor('owner'), platform = dbFor('platform')
  await assertFails(updateDoc(doc(owner, 'businesses', 'studio'), { 'appearance.primaryColor': '#123456' }))
  await assertFails(updateDoc(doc(owner, 'businesses', 'studio'), { appearance: {
    primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#d97706', surfaceColor: '#f4f6f8',
  } }))
  await assertFails(updateDoc(doc(owner, 'businesses', 'studio'), { name: 'Forbidden rename' }))
  await assertFails(updateDoc(doc(owner, 'businesses', 'studio'), { status: 'inactive' }))
  await assertSucceeds(updateDoc(doc(owner, 'businesses', 'studio'), { description: 'Updated business description' }))
  await assertFails(updateDoc(doc(owner, 'users', 'owner'), { globalRole: 'superadmin' }))
  await assertFails(updateDoc(doc(dbFor('client'), 'users', 'client'), { globalRole: 'superadmin' }))
  await assertSucceeds(getDocs(collection(platform, 'businesses')))
  await assertSucceeds(getDocs(collection(platform, 'memberships')))
  await assertSucceeds(getDocs(collection(platform, 'auditLogs')))
  await assertFails(getDoc(doc(platform, 'professionals', 'studio_pro')))
  await assertFails(getDoc(doc(platform, 'services', 'hidden')))
  await assertFails(updateDoc(doc(platform, 'memberships', 'studio_pro'), { status: 'inactive' }))
  await assertFails(updateDoc(doc(platform, 'services', 'massage'), { price: 1 }))
  await assertFails(updateDoc(doc(platform, 'businesses', 'private'), { appearance: {
    primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#be123c', surfaceColor: '#f8fafc',
  } }))
  await assertFails(updateDoc(doc(platform, 'businesses', 'private'), { status: 'inactive' }))
  await assertSucceeds(getDocs(query(collection(platform, 'reservations'), where('businessId', '==', 'studio'))))
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'users', 'platform'), { status: 'inactive' }))
  await assertFails(updateDoc(doc(platform, 'businesses', 'private'), { name: 'Denied' }))
})


test('audit events require an actual atomic change, cannot be forged, modified or removed', async () => {
  const db = dbFor('owner')
  const before = (await getDoc(doc(db,'businesses','studio'))).data()
  const log = {businessId:'studio',actorUserId:'owner',action:'businessUpdate',beforeName:before.name || '',afterName:before.name || '',beforeAppearance:before.appearance || {},afterAppearance:before.appearance || {},createdAt:serverTimestamp()}
  await assertFails(setDoc(doc(db,'auditLogs','forged'),log))
  const batch = writeBatch(db)
  batch.update(doc(db,'businesses','studio'),{description:'Audited update',updatedAt:serverTimestamp()})
  batch.set(doc(db,'auditLogs','verified'),log)
  await assertSucceeds(batch.commit())
  await assertFails(updateDoc(doc(db,'auditLogs','verified'),{actorUserId:'pro'}))
  await assertFails(deleteDoc(doc(db,'auditLogs','verified')))
  await assertFails(getDoc(doc(dbFor('pro'),'auditLogs','verified')))
  await assertFails(getDoc(doc(dbFor('client'),'auditLogs','verified')))
})

test('platform configuration requires a new atomic audit and cannot change ownership, status or booking policy', async () => {
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users', 'config-platform'), { status: 'active', globalRole: 'superadmin', businessIds: [] })
    await setDoc(doc(context.firestore(), 'businesses', 'config-business'), { name: 'Original', status: 'inactive', ownerUserId: 'owner', settings: { publicPageEnabled: false, bookingIntervalMinutes: 15 } })
  })
  const db = dbFor('config-platform'), ref = doc(db, 'businesses', 'config-business')
  let sequence = 0
  async function change(patch, { actor = 'config-platform', omitLog = false, auditBusiness = 'config-business' } = {}) {
    const before = (await getDoc(ref)).data(), id = `config-audit-${++sequence}`
    const batch = writeBatch(db)
    batch.update(ref, { ...patch, lastConfigAuditId: id, updatedAt: serverTimestamp() })
    if (!omitLog) batch.set(doc(db, 'auditLogs', id), { businessId: auditBusiness, actorUserId: actor, action: 'businessUpdate', beforeName: before.name || '', afterName: patch.name ?? before.name ?? '', beforeAppearance: before.appearance || {}, afterAppearance: patch.appearance ?? before.appearance ?? {}, createdAt: serverTimestamp() })
    return batch.commit()
  }
  await assertSucceeds(change({ name: 'Configurado', description: 'Descripción', 'settings.publicPageEnabled': true, appearance: { primaryColor: '#123456', secondaryColor: '#abcdef', accentColor: '#334455', surfaceColor: '#f8fafc' }, about: { title: 'Nosotros' }, contact: { phone: '+59176543210' }, logo: { url: 'https://example.test/logo.png' }, cover: { url: '' }, location: { latitude: -16.5, longitude: -68.15 }, weeklyHours: { '1': [{ start: '09:00', end: '12:00' }] } }))
  await assertFails(updateDoc(doc(dbFor('owner'), 'businesses', 'config-business'), { 'settings.publicPageEnabled': false, updatedAt: serverTimestamp() }))
  assert.equal((await getDoc(ref)).data().name, 'Configurado')
  await assertFails(change({ name: 'Sin evento' }, { omitLog: true }))
  await assertFails(change({ name: 'Identidad falsa' }, { actor: 'owner' }))
  await assertFails(change({ name: 'Otro negocio' }, { auditBusiness: 'studio' }))
  for (const patch of [{ ownerUserId: 'config-platform' }, { status: 'active' }, { administratorEmail: 'hijacked@example.test' }, { 'settings.bookingIntervalMinutes': 1 }, { 'settings.publicPageEnabled': 'yes' }, { name: '' }, { appearance: { primaryColor: 'red' } }, { location: { latitude: 100, longitude: 0 } }]) await assertFails(change(patch))
  const saved = (await getDoc(ref)).data()
  await assertFails(updateDoc(ref, { description: 'Reuse audit', lastConfigAuditId: saved.lastConfigAuditId, updatedAt: serverTimestamp() }))
  for (const uid of ['owner', 'pro', 'client']) await assertFails(updateDoc(doc(dbFor(uid), 'businesses', 'config-business'), { name: 'Cross tenant', updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(), 'businesses', 'config-business'), { name: 'Anonymous' }))
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'users', 'config-platform'), { status: 'inactive' }))
  await assertFails(updateDoc(ref, { name: 'Revoked', updatedAt: serverTimestamp() }))
})
