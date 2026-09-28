import { collection, getDocs, query, where } from 'firebase/firestore'

export function profileQuery(db, collectionName, businessId, userId) {
  return query(collection(db, collectionName), where('businessId', '==', businessId), where('userId', '==', userId))
}

export async function findProfileId(db, collectionName, businessId, userId) {
  const result = await getDocs(profileQuery(db, collectionName, businessId, userId))
  if (result.size > 1) throw new Error('Hay varios perfiles para esta cuenta. Contacta al administrador para revisarlos.')
  return result.docs[0]?.id || `${businessId}_${userId}`
}
