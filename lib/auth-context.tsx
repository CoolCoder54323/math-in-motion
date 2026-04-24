"use client"

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

export type Tier = "free" | "starter" | "pro" | "unlimited"

export interface User {
  id: string
  email: string
  name: string
  tier: Tier
  promptsUsed: number
  promptsLimit: number
}

const TIER_LIMITS: Record<Tier, number> = {
  free: 0,
  starter: 5,
  pro: 15,
  unlimited: Infinity,
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => void
  logout: () => void
  signup: (email: string, password: string, name: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = "math-in-motion-user"

function storeUser(user: User | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

const MOCK_USER: User = {
  id: "mock-user-1",
  email: "user@example.com",
  name: "Mock User",
  tier: "free",
  promptsUsed: 0,
  promptsLimit: TIER_LIMITS.free,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = loadUser()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this mount-only hydration restores persisted auth state from localStorage.
    if (stored) setUser(stored)
    setHydrated(true)
  }, [])

  const login = () => {
    setUser(MOCK_USER)
    storeUser(MOCK_USER)
  }

  const logout = () => {
    setUser(null)
    storeUser(null)
  }

  const signup = () => {
    setUser(MOCK_USER)
    storeUser(MOCK_USER)
  }

  if (!hydrated) return null

  return (
    <AuthContext.Provider value={{ user, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user === null) {
      router.push("/login")
    }
  }, [user, router])

  if (!user) return null

  return <>{children}</>
}
