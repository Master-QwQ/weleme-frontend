import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

export interface User {
  id: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
  doctorLevel?: number
  teamId?: string | null
  token?: string
}

export interface TeamMember {
  id: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
}

export interface Team {
  id: string
  creatorId: string
  members: TeamMember[]
  maxMembers: number
  allowRandomJoin?: boolean
  inviteCode?: string
  recruitText?: string
}

export interface OnlineUser {
  userId: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
  teamId?: string | null
}

interface AppState {
  theme: Theme
  setTheme: (theme: Theme) => void
  user: User | null
  setUser: (user: User | null) => void
  isPreloaded: boolean
  setPreloaded: (status: boolean) => void
  isEmailVerified: boolean
  setEmailVerified: (status: boolean) => void
  verifiedAt: number | null
  setVerifiedAt: (time: number | null) => void
  tempAuthData: { email: string; code: string } | null
  setTempAuthData: (data: { email: string; code: string } | null) => void
  // Avatar cache: userId -> avatarUrl
  avatarCache: Record<string, string>
  setAvatarCache: (cache: Record<string, string>) => void
  updateAvatarCache: (updates: Record<string, string>) => void
  // WebSocket and team state
  team: Team | null
  setTeam: (team: Team | null) => void
  teamSynced: boolean
  setTeamSynced: (synced: boolean) => void
  onlineUsers: OnlineUser[]
  setOnlineUsers: (users: OnlineUser[] | ((prev: OnlineUser[]) => OnlineUser[])) => void
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      user: null,
      setUser: (user) => set({ user }),
      isPreloaded: false,
      setPreloaded: (status) => set({ isPreloaded: status }),
      isEmailVerified: false,
      setEmailVerified: (status) => set({ isEmailVerified: status }),
      verifiedAt: null,
      setVerifiedAt: (time) => set({ verifiedAt: time }),
      tempAuthData: null,
      setTempAuthData: (data) => set({ tempAuthData: data }),
      // Avatar cache
      avatarCache: {},
      setAvatarCache: (cache) => set({ avatarCache: cache }),
      updateAvatarCache: (updates) => set((state) => ({ avatarCache: { ...state.avatarCache, ...updates } })),
      // WebSocket and team state (not persisted)
      team: null,
      setTeam: (team) => set({ team }),
      teamSynced: false,
      setTeamSynced: (synced) => set({ teamSynced: synced }),
      onlineUsers: [],
      setOnlineUsers: (users) => set((state) => ({
        onlineUsers: typeof users === 'function' ? users(state.onlineUsers) : users
      })),
      wsConnected: false,
      setWsConnected: (connected) => set({ wsConnected: connected })
    }),
    {
      name: 'weleme-app-storage',
      // Only persist certain fields, not WebSocket state
      partialize: (state) => ({
        theme: state.theme,
        user: state.user,
        isPreloaded: state.isPreloaded,
        isEmailVerified: state.isEmailVerified,
        verifiedAt: state.verifiedAt,
        tempAuthData: state.tempAuthData
      })
    }
  )
)
