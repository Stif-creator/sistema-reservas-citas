import { BookingError } from './bookingError.js'

const fail = (code, message) => { throw new BookingError(code, message) }

export async function enforcePasswordChangeGate(db, uid, action) {
  if (!uid) return
  const profile = (await db.doc(`users/${uid}`).get()).data()
  const businessId = profile?.defaultBusinessId || profile?.businessIds?.[0]
  const membership = businessId ? (await db.doc(`memberships/${businessId}_${uid}`).get()).data() : null
  if (profile?.mustChangePassword === true && membership?.role === 'admin' && action !== 'requiredPasswordChange') {
    fail('failed-precondition', 'Debes cambiar tu contraseña inicial antes de continuar.')
  }
}

export async function completeRequiredPasswordChange(db, uid, identity, input, authService) {
  if (!uid || !identity || identity.uid !== uid) fail('unauthenticated', 'Inicia sesión para continuar.')
  if (typeof input.newPassword !== 'string' || input.newPassword.length < 12 || input.newPassword.length > 128) {
    fail('invalid-argument', 'La nueva contraseña debe tener entre 12 y 128 caracteres.')
  }
  if (!Number.isInteger(identity.auth_time) || Date.now() / 1000 - identity.auth_time > 5 * 60 || identity.auth_time > Date.now() / 1000 + 60) {
    fail('failed-precondition', 'Confirma tu contraseña actual y vuelve a intentarlo.')
  }

  const userRef = db.doc(`users/${uid}`)
  const profile = (await userRef.get()).data()
  if (!profile || profile.status !== 'active') fail('permission-denied', 'La cuenta no está activa.')
  const businessId = profile.defaultBusinessId || profile.businessIds?.[0]
  const membership = businessId ? (await db.doc(`memberships/${businessId}_${uid}`).get()).data() : null
  if (membership?.role !== 'admin' || membership.status !== 'active') fail('permission-denied', 'El cambio obligatorio solo está disponible para administradores activos.')
  // Idempotent response handles a lost HTTP response after the profile was cleared.
  if (profile.mustChangePassword !== true) return { ok: true, alreadyCompleted: true }

  // La contraseña solo se mantiene en memoria durante esta petición HTTPS.
  // Nunca se persiste ni se incluye en logs o auditoría.
  try {
    await authService.updateUser(uid, { password: input.newPassword })
  } catch (error) {
    if (['auth/invalid-password', 'auth/password-does-not-meet-requirements'].includes(error?.code))
      fail('invalid-argument', 'La nueva contraseña no cumple la política de seguridad configurada para la cuenta.')
    throw error
  }

  await db.runTransaction(async tx => {
    const latest = await tx.get(userRef)
    if (!latest.exists || latest.get('status') !== 'active') fail('permission-denied', 'La cuenta no está activa.')
    if (latest.get('mustChangePassword') !== true) fail('failed-precondition', 'La cuenta ya no requiere cambiar la contraseña.')
    tx.update(userRef, { mustChangePassword: false, updatedAt: new Date() })
    const auditRef = db.collection('auditLogs').doc()
    tx.create(auditRef, {
      actorUserId: uid,
      businessId: businessId || null,
      action: 'requiredPasswordChanged',
      createdAt: new Date(),
    })
  })

  return { ok: true }
}
