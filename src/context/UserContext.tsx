import { createContext, useContext, useState, type ReactNode } from 'react'

interface UserContextType {
  name: string
  setName: (name: string) => void
}

const UserContext = createContext<UserContextType>({ name: '', setName: () => {} })

export function UserProvider({ children }: { children: ReactNode }) {
  const [name, setNameState] = useState<string>(
    () => localStorage.getItem('connect_user_name') ?? ''
  )

  function setName(n: string) {
    const trimmed = n.trim()
    localStorage.setItem('connect_user_name', trimmed)
    setNameState(trimmed)
  }

  return (
    <UserContext.Provider value={{ name, setName }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
