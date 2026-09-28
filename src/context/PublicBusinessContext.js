import { createContext, useContext } from 'react'

export const PublicContext = createContext(null)
export const usePublicBusiness = () => useContext(PublicContext)
