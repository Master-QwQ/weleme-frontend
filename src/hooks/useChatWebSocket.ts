import { useEffect, useCallback } from 'react'
import { useAppStore } from '../store/useAppStore'
import { wsService } from '../lib/websocket'
import type { WSMessage, MessageData, TeamInfo, OnlineUserInfo } from '../lib/websocketTypes'

interface UseChatWebSocketOptions {
  onPublicMessage?: (message: MessageData) => void
  onTeamMessage?: (message: MessageData) => void
  onTeamUpdate?: (team: TeamInfo) => void
  onTeamDissolved?: (teamId: string) => void
  onError?: (error: string) => void
}

export function useChatWebSocket(options: UseChatWebSocketOptions = {}) {
  const { user, setUser, setTeam, setTeamSynced, setOnlineUsers, setWsConnected } = useAppStore()

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'online_users': {
          const users = message.payload as OnlineUserInfo[]
          setOnlineUsers(users)
          // online_users is sent after all initial state, mark team as synced
          setTeamSynced(true)
          // 补全当前用户的 nicknameSuffix（从 localStorage 恢复的旧数据可能缺少）
          if (user?.id) {
            const me = users.find(u => u.userId === user.id)
            if (me && me.nicknameSuffix && me.nicknameSuffix !== user.nicknameSuffix) {
              setUser({ ...user, nicknameSuffix: me.nicknameSuffix })
            }
          }
          break
        }

        case 'user_online': {
          const newUser = message.payload as OnlineUserInfo
          setOnlineUsers(prev => {
            // Avoid duplicates
            if (prev.some(u => u.userId === newUser.userId)) {
              return prev
            }
            return [...prev, newUser]
          })
          break
        }

        case 'user_offline': {
          const offlineUserId = (message.payload as { userId: string }).userId
          setOnlineUsers(prev => prev.filter(u => u.userId !== offlineUserId))
          break
        }

        case 'team_rejoined':
        case 'team_created':
        case 'team_joined':
        case 'team_update': {
          const team = message.payload as TeamInfo
          console.log('[WebSocket] Team update:', message.type, team)
          setTeam(team)
          options.onTeamUpdate?.(team)
          break
        }

        case 'team_dissolved': {
          const { teamId } = message.payload as { teamId: string }
          setTeam(null)
          options.onTeamDissolved?.(teamId)
          break
        }

        case 'public_message': {
          const msg = message.payload as MessageData
          options.onPublicMessage?.(msg)
          break
        }

        case 'team_message': {
          const msg = message.payload as MessageData
          options.onTeamMessage?.(msg)
          break
        }

        case 'user_status_update': {
          const { userId, teamId } = message.payload as {
            userId: string
            teamId?: string | null
          }
          // Update online users team info
          setOnlineUsers(prev =>
            prev.map(u => (u.userId === userId ? { ...u, teamId } : u))
          )
          // 如果是自己离开队伍，清除 team 状态
          if (userId === user?.id && !teamId) {
            setTeam(null)
          }
          break
        }

        case 'error': {
          const errorMsg = (message.payload as { message: string }).message
          console.error('[WebSocket] Server error:', errorMsg)
          options.onError?.(errorMsg)
          break
        }

        default:
          console.log('[WebSocket] Unknown message type:', message.type)
      }
    },
    [setUser, setTeam, setTeamSynced, setOnlineUsers, user, options]
  )

  // Handle errors
  const handleError = useCallback(
    (error: string) => {
      console.error('[WebSocket] Error:', error)
      options.onError?.(error)
    },
    [options]
  )

  // Handle connection open
  const handleOpen = useCallback(() => {
    console.log('[WebSocket] Connection established')
    setWsConnected(true)
  }, [setWsConnected])

  // Handle connection close
  const handleClose = useCallback(() => {
    console.log('[WebSocket] Connection closed')
    setWsConnected(false)
  }, [setWsConnected])

  useEffect(() => {
    if (!user?.id) {
      console.warn('[WebSocket] No user ID, cannot connect')
      return
    }

    if (!user?.token) {
      console.warn('[WebSocket] No session token, cannot connect')
      return
    }

    // Register callbacks
    const unsubscribeMessage = wsService.onMessage(handleMessage)
    const unsubscribeError = wsService.onError(handleError)
    const unsubscribeOpen = wsService.onOpen(handleOpen)
    const unsubscribeClose = wsService.onClose(handleClose)

    // Connect to WebSocket (only if not already connected)
    wsService.connect(user.id, user.token).catch(err => {
      console.error('[WebSocket] Connection failed:', err)
      options.onError?.('Failed to connect to server')
    })

    // Cleanup on unmount - do NOT disconnect here, let the service manage connection
    return () => {
      unsubscribeMessage()
      unsubscribeError()
      unsubscribeOpen()
      unsubscribeClose()
      // Don't disconnect on unmount - keep connection alive for HMR
    }
  }, [user?.id, user?.token])  // Depend on user.id and user.token

  // Action functions
  const sendPublicMessage = useCallback((content: string) => {
    wsService.send({
      type: 'send_public_message',
      payload: { content }
    })
  }, [])

  const sendTeamMessage = useCallback((content: string, teamId: string) => {
    wsService.send({
      type: 'send_team_message',
      payload: { content, teamId }
    })
  }, [])

  const createTeam = useCallback((teamSize: number, allowRandomJoin: boolean = true, inviteCode: string = '', recruitText: string = '') => {
    wsService.send({
      type: 'create_team',
      payload: { teamSize, allowRandomJoin, inviteCode, recruitText }
    })
  }, [])

  const joinTeam = useCallback((teamId: string, isRandom: boolean = false) => {
    wsService.send({
      type: 'join_team',
      payload: { teamId, isRandom }
    })
  }, [])

  const leaveTeam = useCallback(() => {
    wsService.send({
      type: 'leave_team',
      payload: {}
    })
  }, [])

  const removeMember = useCallback((targetUserId: string) => {
    wsService.send({
      type: 'remove_member',
      payload: { targetUserId }
    })
  }, [])

  const dissolveTeam = useCallback(() => {
    wsService.send({
      type: 'dissolve_team',
      payload: {}
    })
  }, [])

  const updateTeamSize = useCallback((maxMembers: number) => {
    wsService.send({
      type: 'update_team_size',
      payload: { maxMembers }
    })
  }, [])

  return {
    sendPublicMessage,
    sendTeamMessage,
    createTeam,
    joinTeam,
    leaveTeam,
    dissolveTeam,
    removeMember,
    updateTeamSize,
    isConnected: wsService.isConnected()
  }
}
