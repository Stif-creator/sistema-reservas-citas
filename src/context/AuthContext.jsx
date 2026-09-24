import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'
import {
  doc,
  collection,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>')
  }
  return context
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [membership, setMembership] = useState(null)
  const [loading, setLoading] = useState(true)

  const [authError, setAuthError] = useState('')
  const generation = useRef(0)
  const provisioning = useRef(false)

  const reloadProfile = useCallback(async () => {
    const uid = auth.currentUser?.uid
    const version = ++generation.current
    setLoading(true)
    setAuthError('')
    setUserDoc(null)
    setMembership(null)
    try {
      if (!uid) return
      const userSnap = await getDoc(doc(db, 'users', uid))
      const data = userSnap.exists() ? userSnap.data() : null
      const businessId = data?.businessIds?.[0]
      const memberSnap = businessId
        ? await getDoc(doc(db, 'memberships', `${businessId}_${uid}`))
        : null
      if (version !== generation.current || auth.currentUser?.uid !== uid) return
      setUserDoc(data)
      setMembership(memberSnap?.exists() ? memberSnap.data() : null)
      if (!data || data.onboardingComplete === false || !memberSnap?.exists())
        setAuthError('Tu cuenta no tiene un perfil completo. Contacta al administrador.')
    } catch (err) {
      if (version === generation.current)
        setAuthError('No pudimos cargar tu cuenta. Comprueba tu conexión y vuelve a intentar.')
      console.error('Error al cargar la sesión', err)
    } finally {
      if (version === generation.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const sessionGeneration = generation
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      ++generation.current
      setCurrentUser(user)
      setUserDoc(null)
      setMembership(null)
      setAuthError('')
      if (provisioning.current) return
      void reloadProfile()
    })
    return () => {
      ++sessionGeneration.current
      unsubscribe()
    }
  }, [reloadProfile])

  // Apply membership revocation and administrator approval without a new login.
  const profileBusinessId = userDoc?.businessIds?.[0]
  useEffect(() => {
    if (!currentUser || !profileBusinessId || provisioning.current) return
    const uid = currentUser.uid
    const failed = () => {
      if (auth.currentUser?.uid === uid)
        setAuthError('No pudimos verificar el estado de tu cuenta. Vuelve a intentar.')
    }
    const stopUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (auth.currentUser?.uid === uid) setUserDoc(snap.exists() ? snap.data() : null)
      },
      failed
    )
    const stopMembership = onSnapshot(
      doc(db, 'memberships', `${profileBusinessId}_${uid}`),
      (snap) => {
        if (auth.currentUser?.uid === uid) setMembership(snap.exists() ? snap.data() : null)
      },
      failed
    )
    return () => {
      stopUser()
      stopMembership()
    }
  }, [currentUser, profileBusinessId])

  async function register({
    firstName,
    lastName,
    email,
    password,
    phone,
    role,
    businessId,
    businessName,
  }) {
    if (!['admin', 'professional', 'client'].includes(role)) throw new Error('Rol inválido.')
    if (role !== 'admin' && !businessId) throw new Error('Selecciona un negocio.')
    if (role === 'admin' && !businessName?.trim()) throw new Error('Ingresa el nombre del negocio.')
    provisioning.current = true
    setLoading(true)
    let credential
    try {
      credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      provisioning.current = false
      await reloadProfile()
      throw err
    }
    const uid = credential.user.uid

    // Provision in dependency order. A failed read after provisioning must never
    // roll back successfully created data.
    const createdRefs = []
    let step = ''

    try {
      const now = serverTimestamp()

      // El ID del negocio se genera localmente (no implica una escritura)
      // para poder incluirlo en users.businessIds antes de crear el
      // documento del negocio propiamente dicho.
      let finalBusinessId = businessId
      let businessRef = null
      if (role === 'admin') {
        businessRef = doc(collection(db, 'businesses'))
        finalBusinessId = businessRef.id
      }

      // 2. users/{uid}
      step = 'guardar tu perfil de usuario'
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        auth_uid: uid,
        firstName,
        lastName,
        email,
        phone,
        status: 'active',
        globalRole: 'user',
        onboardingComplete: false,
        businessIds: [finalBusinessId],
        emailVerified: false,
        photoUrl: null,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
        id: uid,
      })
      createdRefs.push(userRef)

      // 3. businesses/{nuevoId} (solo si el rol es admin)
      if (role === 'admin') {
        step = 'crear el negocio'
        await setDoc(businessRef, {
          name: businessName,
          ownerUserId: uid,
          appearance: { primaryColor: '#1672ed', secondaryColor: '#eaf3ff' },
          status: 'active',
          settings: {
            publicPageEnabled: true,
            currencyCode: 'BOB',
            timezone: 'America/La_Paz',
            bookingIntervalMinutes: 15,
            minAdvanceMinutes: 60,
            maxAdvanceDays: 90,
            cancellationLimitHours: 24,
            autoConfirmBookings: false,
          },
          createdAt: now,
          updatedAt: now,
          id: businessRef.id,
        })
        createdRefs.push(businessRef)
      }

      // 4. memberships/{businessId_uid}
      step = 'crear tu membresía en el negocio'
      const membershipRef = doc(db, 'memberships', `${finalBusinessId}_${uid}`)
      await setDoc(membershipRef, {
        userId: uid,
        businessId: finalBusinessId,
        role,
        permissions: {},
        status: role === 'professional' ? 'pending' : 'active',
        createdAt: now,
      })
      createdRefs.push(membershipRef)

      // 5. professionals/{businessId_uid} o clients/{businessId_uid}
      if (role === 'professional') {
        step = 'crear tu perfil de profesional'
        const professionalRef = doc(db, 'professionals', `${finalBusinessId}_${uid}`)
        await setDoc(professionalRef, {
          userId: uid,
          businessId: finalBusinessId,
          displayName: `${firstName} ${lastName}`,
          email,
          phone,
          isActive: false,
          serviceIds: [],
          createdAt: now,
          updatedAt: now,
          id: `${finalBusinessId}_${uid}`,
        })
        createdRefs.push(professionalRef)
      }

      if (role === 'client') {
        step = 'crear tu perfil de cliente'
        const clientRef = doc(db, 'clients', `${finalBusinessId}_${uid}`)
        await setDoc(clientRef, {
          userId: uid,
          businessId: finalBusinessId,
          firstName,
          lastName,
          email,
          phone,
          status: 'active',
          stats: {
            totalReservations: 0,
            completedReservations: 0,
            cancelledReservations: 0,
            noShowReservations: 0,
            lastReservationAt: null,
          },
          createdAt: now,
          updatedAt: now,
          id: `${finalBusinessId}_${uid}`,
        })
        createdRefs.push(clientRef)
      }

      step = 'finalizar tu perfil'
      await updateDoc(userRef, { onboardingComplete: true })
    } catch (err) {
      console.error(`Registro falló en el paso "${step}":`, err)

      let cleanupFailed = false
      for (const ref of createdRefs.reverse()) {
        try {
          await deleteDoc(ref)
        } catch {
          cleanupFailed = true
          break
        }
      }
      // Preserve authentication if data cleanup failed so the account remains recoverable.
      if (!cleanupFailed) {
        try {
          await deleteUser(credential.user)
        } catch {
          cleanupFailed = true
        }
      }
      throw new Error(
        cleanupFailed
          ? `El registro quedó incompleto al ${step}. Conservamos tu cuenta; contacta al administrador para recuperarla.`
          : `No se pudo completar el registro al ${step}. Se deshicieron los cambios; puedes intentarlo de nuevo.`
      )
    } finally {
      provisioning.current = false
      await reloadProfile()
    }
  }

  async function login(email, password, remember = true) {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence)
    const credential = await signInWithEmailAndPassword(auth, email, password)
    await updateDoc(doc(db, 'users', credential.user.uid), {
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch((err) => console.error('No se pudo actualizar lastLoginAt', err))
  }

  async function logout() {
    await signOut(auth)
  }

  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email)
  }

  const value = {
    currentUser,
    userDoc,
    membership,
    loading,
    authError,
    reloadProfile,
    register,
    login,
    logout,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
