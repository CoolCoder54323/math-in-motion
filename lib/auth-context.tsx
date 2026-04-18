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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  const login = () => {
    setUser({
      id: "mock-user-1",
      email: "user@example.com",
      name: "Mock User",
      tier: "free",
      promptsUsed: 0,
      promptsLimit: TIER_LIMITS.free,
    })
  }

  const logout = () => {
    setUser(null)
  }

  const signup = () => {
    setUser({
      id: "mock-user-1",
      email: "user@example.com",
      name: "Mock User",
      tier: "free",
      promptsUsed: 0,
      promptsLimit: TIER_LIMITS.free,
    })
  }

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
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (!user) {
      router.push("/login")
    } else {
      setIsChecking(false)
    }
  }, [user, router])

  if (isChecking && !user) {
    return null
  }

  return <>{children}</>
}
