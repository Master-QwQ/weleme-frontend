import { useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import { wsService } from '../lib/websocket'
import { getFingerprint } from '../lib/fingerprint'
import type { WSMessage, MessageData, TeamInfo, OnlineUserInfo } from '../lib/websocketTypes'

interface UseChatWebSocketOptions {
  onPublicMessage?: (message: MessageData) => void
  onTeamMessage?: (message: MessageData) => void
  onTeamUpdate?: (team: TeamInfo) => void
  onTeamDissolved?: (teamId: string) => void
  onError?: (error: string) => void
}

export function useChatWebSocket(options: UseChatWebSocketOptions = {}) {
  const { user, setUser, setTeam, setTeamSynced, setOnlineCount, updateAvatarCache, setWsConnected } = useAppStore()

  // 用 ref 存储 options，确保 handleMessage 始终读取最新值
  const optionsRef = useRef(options)
  optionsRef.current = options

  // Handle incoming messages
  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'online_users': {
          const payload = message.payload as { count: number }
          setOnlineCount(payload.count)
          // online_users is sent after all initial state, mark team as synced
          setTeamSynced(true)
          break
        }

        case 'user_online': {
          const newUser = message.payload as OnlineUserInfo
          // 直接更新头像缓存，无需维护用户列表
          if (newUser.avatar) {
            updateAvatarCache({ [newUser.userId]: newUser.avatar })
          }
          break
        }

        case 'user_offline': {
          // 不再维护在线用户列表，忽略此事件
          break
        }

        case 'team_rejoined':
        case 'team_created':
        case 'team_joined':
        case 'team_update': {
          const team = message.payload as TeamInfo
          console.log('[WebSocket] Team update:', message.type, team)
          setTeam(team)
          optionsRef.current.onTeamUpdate?.(team)
          break
        }

        case 'team_dissolved': {
          const { teamId } = message.payload as { teamId: string }
          setTeam(null)
          optionsRef.current.onTeamDissolved?.(teamId)
          break
        }

        case 'public_message': {
          const msg = message.payload as MessageData
          console.log('[useChatWebSocket] public_message callback triggered, msg id:', msg.id)
          optionsRef.current.onPublicMessage?.(msg)
          break
        }

        case 'team_message': {
          const msg = message.payload as MessageData
          optionsRef.current.onTeamMessage?.(msg)
          break
        }

        case 'user_status_update': {
          const { userId, teamId } = message.payload as {
            userId: string
            teamId?: string | null
          }
          // 如果是自己离开队伍，清除 team 状态
          if (userId === user?.id && !teamId) {
            setTeam(null)
          }
          break
        }

        case 'error': {
          const payload = message.payload as { message: string, code?: number }
          const errorMsg = payload.message
          console.error('[WebSocket] Server error:', errorMsg)
          
          if (payload.code === 4003) {
            alert(errorMsg || '您的账号已在别处登录，请重新登录')
            setUser(null)
            setTeam(null)
            window.location.href = '/auth'
            return
          }
          
          optionsRef.current.onError?.(errorMsg)
          break
        }

        default:
          console.log('[WebSocket] Unknown message type:', message.type)
      }
    },
    [setUser, setTeam, setTeamSynced, setOnlineCount, updateAvatarCache, user]
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
  const handleClose = useCallback((code?: number) => {
    console.log('[WebSocket] Connection closed with code:', code)
    setWsConnected(false)

    if (code === 4001 || code === 4003) {
      alert('登录已失效或在别处登录，请重新登录')
      setUser(null)
      setTeam(null)
      window.location.href = '/auth'
    }
  }, [setWsConnected, setUser, setTeam])

  // Store user ID and token in refs to avoid reconnection on user object changes
  // Initialize to undefined so the first mount always triggers connection
  const userIdRef = useRef<string | undefined>(undefined)
  const userTokenRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!user?.id || !user?.token) {
      console.warn('[WebSocket] No user ID or token, cannot connect')
      return
    }

    // Only reconnect if user ID or token actually changed
    if (userIdRef.current === user.id && userTokenRef.current === user.token) {
      console.log('[WebSocket] User ID and token unchanged, skipping reconnection')
      return
    }

    // Update refs
    userIdRef.current = user.id
    userTokenRef.current = user.token

    // Register callbacks
    const unsubscribeMessage = wsService.onMessage(handleMessage)
    const unsubscribeError = wsService.onError(handleError)
    const unsubscribeOpen = wsService.onOpen(handleOpen)
    const unsubscribeClose = wsService.onClose(handleClose)

    // Check if already connected and update state
    if (wsService.isConnected()) {
      handleOpen()
      // 发送注册消息，确保获取队伍信息
      wsService.send({ type: 'register', payload: { userId: user.id } })
    }

    // Connect to WebSocket (only if not already connected)
    const fingerprint = getFingerprint()
    wsService.connect(user.id, user.token, fingerprint).catch(err => {
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
  }, [user?.id, user?.token])  // Still depend on user.id and user.token to detect actual changes

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

  const sendRandomJoin = useCallback(() => {
    wsService.send({
      type: 'random_join',
      payload: {}
    })
  }, [])

  const sendJoinUserTeam = useCallback((targetUserId: string) => {
    wsService.send({
      type: 'join_user_team',
      payload: { targetUserId }
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
    sendRandomJoin,
    sendJoinUserTeam,
    isConnected: wsService.isConnected(),
  }
}
