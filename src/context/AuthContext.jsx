import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser,
} from 'firebase/auth'
import {
  doc,
  collection,
  setDoc,
  deleteDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
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

  // Carga (o recarga) el documento de users y el membership del negocio
  // principal (businessIds[0]). Se usa tanto en onAuthStateChanged como
  // justo después de un registro exitoso, para no depender de que el
  // listener vuelva a dispararse.
  async function loadUserData(uid) {
    const userSnap = await getDoc(doc(db, 'users', uid))
    const userData = userSnap.exists() ? userSnap.data() : null
    setUserDoc(userData)

    if (userData?.businessIds?.length > 0) {
      const businessId = userData.businessIds[0]
      const membershipSnap = await getDoc(doc(db, 'memberships', `${businessId}_${uid}`))
      setMembership(membershipSnap.exists() ? membershipSnap.data() : null)
    } else {
      setMembership(null)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)

      if (user) {
        await loadUserData(user.uid)
      } else {
        setUserDoc(null)
        setMembership(null)
      }

      setLoading(false)
    })

    return unsubscribe
  }, [])

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
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    const uid = credential.user.uid

    // Las reglas de Firestore evalúan cada escritura contra el estado de
    // la base ANTES de la operación en curso: no pueden validar, por
    // ejemplo, la membresía contra un documento de negocio que se está
    // creando en la misma operación. Por eso aquí no usamos un
    // writeBatch: escribimos un documento a la vez, en el orden exacto
    // que las reglas necesitan, esperando cada uno antes de continuar.
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
        status: 'active',
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
          isActive: true,
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

      await loadUserData(uid)
    } catch (err) {
      console.error(`Registro falló en el paso "${step}":`, err)

      // Deshacemos en orden inverso solo lo que sí llegó a crearse, y
      // luego eliminamos la cuenta de Auth: así no quedan datos
      // huérfanos ni en Firestore ni en Authentication.
      for (const ref of createdRefs.reverse()) {
        await deleteDoc(ref).catch(() => {})
      }
      await deleteUser(credential.user).catch(() => {})

      throw new Error(
        `No se pudo completar el registro (falló al ${step}). Tu cuenta no fue creada, intenta de nuevo.`
      )
    }
  }

  async function login(email, password) {
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
    register,
    login,
    logout,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
