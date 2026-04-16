import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Users, Shuffle, MessageSquare, CheckCircle2, Wifi, WifiOff, UserMinus, X, Send, Check, Copy, Search } from 'lucide-react'
import { motion } from 'framer-motion'

import { useAppStore } from '../store/useAppStore'
import { useChatWebSocket } from '../hooks/useChatWebSocket'
import { wsService } from '../lib/websocket'
import { api } from '../lib/api'
import { isValidRecruitMessage, sanitizeContent, formatTime, deduplicateMessages } from '../lib/messageValidator'

interface ChatMessage {
  id: string
  userId: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
  doctorLevel?: number
  content: string
  timestamp: number
  isMe?: boolean
}

// 等级称号系统
function getLevelTitle(level: number): string {
  if (level >= 120) return '萌新'
  if (level >= 81) return '老登'
  if (level >= 41) return '中登'
  return '小登'
}

function getLevelColor(level: number): string {
  if (level >= 120) return 'text-orange-400'   // 橙色
  if (level >= 81) return 'text-purple-400'    // 紫色
  if (level >= 41) return 'text-blue-400'      // 蓝色
  return 'text-green-400'                       // 绿色
}

function getLevelBgColor(level: number): string {
  if (level >= 120) return 'bg-orange-500/20 border-orange-500/30'
  if (level >= 81) return 'bg-purple-500/20 border-purple-500/30'
  if (level >= 41) return 'bg-blue-500/20 border-blue-500/30'
  return 'bg-green-500/20 border-green-500/30'
}

// 消息气泡组件
function MessageBubble({ msg, onJoinTeam, showJoinButton, getUserAvatar, onJoinTeamById, showCopyButton, onCopy }: {
  msg: ChatMessage
  onJoinTeam?: (userId: string) => void
  showJoinButton?: boolean
  getUserAvatar: (userId: string) => string
  onJoinTeamById?: (userId: string) => void
  showCopyButton?: boolean
  onCopy?: (text: string) => void
}) {
  const level = msg.doctorLevel || 1
  const title = getLevelTitle(level)
  const colorClass = getLevelColor(level)
  const bgClass = getLevelBgColor(level)
  const avatar = getUserAvatar(msg.userId)

  // 解析招募消息中的 [邀请码]，渲染为醒目的可点击按钮
  const renderContent = (content: string) => {
    const recruitRegex = /\[([a-zA-Z0-9]{10,20})\]/
    const match = content.match(recruitRegex)
    if (!match || !onJoinTeamById) {
      return sanitizeContent(content)
    }
    const inviteCode = match[1]
    const before = content.substring(0, match.index)
    const after = content.substring(match.index! + match[0].length)
    return (
      <>
        {sanitizeContent(before)}
        <button
          onClick={() => onJoinTeamById(msg.userId)}
          className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 rounded-md bg-primary/15 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/25 hover:border-primary/50 transition-all duration-150 cursor-pointer"
          title="点击加入该队伍"
        >
          <span className="opacity-60">[</span>
          <span>{inviteCode}</span>
          <span className="opacity-60">]</span>
        </button>
        {sanitizeContent(after)}
      </>
    )
  }

  return (
    <div className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex ${msg.isMe ? 'flex-row-reverse' : 'flex-row'} items-start gap-2 max-w-[80%]`}>
        {/* 头像 */}
        <div className="w-10 h-10 rounded-full overflow-hidden border border-border shrink-0">
          {avatar ? <img src={avatar} alt={msg.nickname} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-bold">{msg.nickname?.[0] || '?'}</div>}
        </div>
        {/* 消息内容 */}
        <div className="flex flex-col gap-1">
          {/* 等级 + 昵称 */}
          <div className={`flex items-center gap-1.5 ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${bgClass} ${colorClass}`}>
              {title} Lv{level}
            </span>
            {showJoinButton && !msg.isMe ? (
              <button
                onClick={() => onJoinTeam?.(msg.userId)}
                className="text-xs text-primary hover:underline"
                title="点击加入该用户的队伍"
              >
                {msg.nickname}{msg.nicknameSuffix || ''}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {msg.nickname}{msg.nicknameSuffix || ''}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground opacity-50">{formatTime(msg.timestamp)}</span>
          </div>
          {/* 消息气泡 */}
          <div className={`flex items-end gap-1 ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`px-3 py-2 rounded-xl text-sm break-all whitespace-pre-wrap ${msg.isMe
              ? 'bg-primary/10 border border-primary/20 rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm'
              }`}>
              {renderContent(msg.content)}
            </div>
            {showCopyButton && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(msg.content)
                  onCopy?.(msg.content)
                }}
                className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-all duration-150 cursor-pointer"
                title="复制消息"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const { theme, setTheme, user, setUser, team, onlineUsers, wsConnected, avatarCache, updateAvatarCache } = useAppStore()

  // 没有 token 时跳转回验证页
  useEffect(() => {
    if (!user?.token) {
      navigate('/auth', { replace: true })
    }
  }, [user?.token, navigate])

  // State
  const [publicMessages, setPublicMessages] = useState<ChatMessage[]>([])
  const [teamMessages, setTeamMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [teamInputValue, setTeamInputValue] = useState('')

  // 消息到达时，将头像存入全局缓存
  useEffect(() => {
    const allMessages = [...publicMessages, ...teamMessages]
    const updates: Record<string, string> = {}
    for (const msg of allMessages) {
      if (msg.userId && msg.avatar && !avatarCache[msg.userId]) {
        updates[msg.userId] = msg.avatar
      }
    }
    if (Object.keys(updates).length > 0) {
      updateAvatarCache(updates)
    }
  }, [publicMessages, teamMessages])

  // 在线用户变化时同步头像缓存（其他用户换头像时实时更新）
  useEffect(() => {
    if (onlineUsers.length > 0) {
      const updates: Record<string, string> = {}
      for (const u of onlineUsers) {
        if (u.avatar) {
          updates[u.userId] = u.avatar
        }
      }
      if (Object.keys(updates).length > 0) {
        updateAvatarCache(updates)
      }
    }
  }, [onlineUsers])

  // 从缓存获取头像，无缓存时返回空
  const getUserAvatar = useCallback((userId: string) => {
    return avatarCache[userId] || ''
  }, [avatarCache])

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createRecruitMessage, setCreateRecruitMessage] = useState('')
  const [createAllowRandom, setCreateAllowRandom] = useState(true)
  const [inviteCodeError, setInviteCodeError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [showGroupWelcome, setShowGroupWelcome] = useState(false)
  const [btnHoverCount, setBtnHoverCount] = useState(0)
  const [isBtnSwapped, setIsBtnSwapped] = useState(false)
  const [showQRPreview, setShowQRPreview] = useState(false)
  const [activeTab, setActiveTab] = useState<'public' | 'team'>('public')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [pendingPublicMessage, setPendingPublicMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const teamMessagesEndRef = useRef<HTMLDivElement>(null)

  const handleCopy = useCallback((text: string) => {
    // 检查是否包含招募邀请码，如果是，弹出特定提示
    const isRecruit = /\[[a-zA-Z0-9]{10,20}\]/.test(text)
    setSuccessMsg(isRecruit ? '已经复制啦,请打开明日方舟加入小队' : '内容已复制到剪贴板')
    setTimeout(() => setSuccessMsg(null), 3000)
  }, [])

  // WebSocket hook
  const {
    sendPublicMessage,
    sendTeamMessage,
    createTeam,
    joinTeam,
    leaveTeam,
    dissolveTeam,
    removeMember,
    updateTeamSize,
    isConnected
  } = useChatWebSocket({
    onPublicMessage: (msg) => {
      setPublicMessages(prev => deduplicateMessages(prev, {
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        nicknameSuffix: msg.nicknameSuffix,
        avatar: msg.avatar,
        doctorLevel: msg.doctorLevel,
        content: msg.content,
        timestamp: msg.timestamp,
        isMe: msg.userId === user?.id
      }))
    },
    onTeamMessage: (msg) => {
      setTeamMessages(prev => deduplicateMessages(prev, {
        id: msg.id,
        userId: msg.userId,
        nickname: msg.nickname,
        nicknameSuffix: msg.nicknameSuffix,
        avatar: msg.avatar,
        doctorLevel: msg.doctorLevel,
        content: msg.content,
        timestamp: msg.timestamp,
        isMe: msg.userId === user?.id
      }))
    },
    onTeamUpdate: (updatedTeam) => {
      console.log('[Chat] Team updated:', updatedTeam)
    },
    onTeamDissolved: (teamId) => {
      console.log('[Chat] Team dissolved:', teamId)
      setSuccessMsg('队伍已解散')
      setTimeout(() => setSuccessMsg(null), 3000)
    },
    onError: (errorMsg) => {
      console.error('[Chat] WebSocket error:', errorMsg)
      setError(errorMsg)
      setTimeout(() => setError(null), 3000)
    }
  })

  // Redirect if no user
  useEffect(() => {
    if (!user) {
      navigate('/auth')
    }
  }, [user, navigate])

  // Load message history
  useEffect(() => {
    if (!user) return

    const loadHistory = async () => {
      try {
        setIsLoading(true)

        // Load public messages
        const publicRes = await api.getPublicMessages()
        if (publicRes.success && publicRes.data) {
          const msgs = publicRes.data.map((msg: any) => ({
            id: msg.id,
            userId: msg.userId,
            nickname: msg.nickname,
            nicknameSuffix: msg.nicknameSuffix,
            avatar: msg.avatar,
            doctorLevel: msg.doctorLevel,
            content: msg.content,
            timestamp: msg.timestamp,
            isMe: msg.userId === user.id
          }))
          setPublicMessages(msgs)
        }

        // Load team messages if in a team
        if (team?.id) {
          const teamRes = await api.getTeamMessages(team.id)
          if (teamRes.success && teamRes.data) {
            const msgs = teamRes.data.map((msg: any) => ({
              id: msg.id,
              userId: msg.userId,
              nickname: msg.nickname,
              nicknameSuffix: msg.nicknameSuffix,
              avatar: msg.avatar,
              doctorLevel: msg.doctorLevel,
              content: msg.content,
              timestamp: msg.timestamp,
              isMe: msg.userId === user.id
            }))
            setTeamMessages(msgs)
          }
        }
      } catch (err) {
        console.error('Failed to load message history:', err)
        setError('加载消息历史失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadHistory()
  }, [user?.id, team?.id])

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldown])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [publicMessages])

  useEffect(() => {
    teamMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [teamMessages])

  // Send pending message after team is created
  useEffect(() => {
    if (team && pendingPublicMessage && wsConnected) {
      console.log('[Chat] Team created, sending pending message:', pendingPublicMessage)
      sendPublicMessage(pendingPublicMessage)
      setPendingPublicMessage(null)
      setInputValue('')
      setCooldown(10)
    }
  }, [team, pendingPublicMessage, wsConnected, sendPublicMessage])

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarList, setAvatarList] = useState<string[]>([])
  const [avatarDisplayLimit, setAvatarDisplayLimit] = useState(25)

  // 加载头像列表
  useEffect(() => {
    fetch('/asset/avatars.json')
      .then(res => res.json())
      .then(data => setAvatarList(data.avatars || []))
      .catch(err => console.error('Failed to load avatars:', err))
  }, [])

  // 检查是否显示加群弹窗
  useEffect(() => {
    const isSuppressed = localStorage.getItem('weleme_group_welcome_suppressed')
    if (!isSuppressed) {
      const timer = setTimeout(() => {
        setShowGroupWelcome(true)
      }, 1500) // 延迟一点显示，体验更好
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAvatarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget
    if (scrollHeight - scrollTop - clientHeight < 20) {
      if (avatarDisplayLimit < avatarList.length) {
        setAvatarDisplayLimit(prev => Math.min(prev + 10, avatarList.length))
      }
    }
  }

  const [avatarChangeError, setAvatarChangeError] = useState<string | null>(null)

  const handleAvatarChange = async (avatarUrl: string) => {
    if (!user?.id) return
    setAvatarChangeError(null)
    try {
      const res = await api.put('/api/users/avatar', { user_id: user.id, avatar: avatarUrl })
      if (res.success) {
        setUser({ ...user, avatar: avatarUrl })
        // 更新头像缓存，消息渲染会自动使用新头像
        updateAvatarCache({ [user.id]: avatarUrl })
        setShowAvatarPicker(false)
        // 重连WebSocket，让服务端自动广播新头像给所有在线用户
        wsService.disconnect()
        wsService.connect(user.id, user.token).catch(() => { })
      } else {
        setAvatarChangeError(res.message || '更换头像失败')
      }
    } catch (err) {
      setAvatarChangeError('网络错误，请稍后重试')
    }
  }

  const handleLogout = () => {
    setShowLogoutConfirm(true)
  }

  const confirmLogout = () => {
    setUser(null)
    navigate('/auth')
    setShowLogoutConfirm(false)
  }

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleSendMessage = () => {
    if (!inputValue.trim()) return

    // Validate recruitment message format
    if (!isValidRecruitMessage(inputValue)) {
      alert("信息被拦截：公聊区域仅可发送合规的招募协议！\n例如: [xxxx]nickname邀请你加入卫戍协议:盟约【xx模拟】")
      return
    }

    if (cooldown > 0) {
      alert(`发送频繁，请等待 ${cooldown} 秒后再试`)
      return
    }

    // Must have a team to send public messages
    if (!team) {
      setPendingPublicMessage(inputValue)
      setCreateRecruitMessage(inputValue) // 自动带入完整招募消息
      setShowCreateModal(true)
      return
    }

    sendPublicMessage(inputValue)
    setInputValue('')
    setCooldown(10)
  }

  const handleSendTeamMessage = () => {
    if (!teamInputValue.trim() || !team) return

    sendTeamMessage(teamInputValue, team.id)
    setTeamInputValue('')
  }

  const handleCreateRoom = (size: number) => {
    if (team) {
      setError('你已经在一个队伍中，请先退出当前队伍')
      setTimeout(() => setError(null), 3000)
      setShowCreateModal(false)
      return
    }

    // 从完整招募消息中提取邀请码
    const inviteCodeRegex = /\[([a-zA-Z0-9]{10,20})\]/
    if (!createRecruitMessage.trim()) {
      setInviteCodeError('请输入招募消息')
      return
    }
    const match = createRecruitMessage.match(inviteCodeRegex)
    if (!match) {
      setInviteCodeError('未找到有效邀请码，格式如 [dhn397nd8fkg53]xxx邀请你加入卫戍协议:盟约【xxx模拟】')
      return
    }
    const inviteCode = match[1]

    console.log('[Chat] Creating team with size:', size, 'inviteCode:', inviteCode)
    createTeam(size, createAllowRandom, inviteCode, createRecruitMessage)
    // 只有手动创建（非公聊发送进入）才清除 pendingPublicMessage
    // 公聊发送进入时 pendingPublicMessage 有值，创建后由 useEffect 自动发送
    if (!pendingPublicMessage) {
      setPendingPublicMessage(null)
    }
    setShowCreateModal(false)
    setCreateRecruitMessage('')
    setInviteCodeError(null)
  }

  const handleRandomJoin = async () => {
    if (team) {
      setError('你已经在一个队伍中，请先退出当前队伍')
      setTimeout(() => setError(null), 3000)
      return
    }

    const teamsWithSlots = onlineUsers
      .filter(u => u.teamId && u.userId !== user?.id)
      .reduce((acc: Map<string, number>, u) => {
        if (u.teamId) {
          acc.set(u.teamId, (acc.get(u.teamId) || 0) + 1)
        }
        return acc
      }, new Map<string, number>())

    for (const [teamId, count] of teamsWithSlots) {
      if (count < 4) {
        joinTeam(teamId, true)
        return
      }
    }

    alert('当前没有可用的队伍，请创建新队伍')
  }

  const handleJoinTeamById = (userId: string) => {
    // 点击自己名的容错处理
    if (user && userId === user.id) {
      if (team) {
        alert('您已在此队伍中')
      } else {
        alert('该用户（您当前）不在任何队伍中，请重新发送招募或加入队伍')
      }
      return
    }

    const targetUser = onlineUsers.find(u => u.userId === userId)
    if (!targetUser || !targetUser.teamId) {
      alert('该用户不在任何队伍中')
      return
    }
    if (team) {
      alert('您已在队伍中，请先离开当前队伍')
      return
    }
    joinTeam(targetUser.teamId)
  }

  const handleLeaveTeam = () => {
    if (isTeamLeader) {
      // 队长解散不需要二次确认弹窗，由服务端广播后显示气泡即可
      dissolveTeam()
    } else {
      if (confirm('确定要离开当前队伍吗？')) {
        leaveTeam()
      }
    }
  }

  const handleRemoveMember = (targetUserId: string, targetNickname: string) => {
    if (confirm(`确定要将 ${targetNickname} 移出队伍吗？`)) {
      removeMember(targetUserId)
    }
  }

  const isTeamLeader = team && user && team.creatorId === user.id

  return (
    <div className="flex flex-col h-screen bg-background text-foreground transition-colors duration-300 overflow-hidden">

      {/* Global Toasts */}
      {error && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground px-6 py-3 rounded-full shadow-lg flex items-center transition-all duration-300 animate-slide-down">
          <X className="w-4 h-4 mr-2 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-lg flex items-center transition-all duration-300 animate-slide-down">
          <Check className="w-4 h-4 mr-2 shrink-0" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      <style>{`
        @keyframes slide-down {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out forwards;
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <header className="h-14 md:h-16 flex items-center justify-between px-3 md:px-6 bg-card border-b border-border shadow-sm shrink-0">
        <div className="flex items-center space-x-2">
          <MessageSquare className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          <h1 className="text-lg md:text-xl font-bold tracking-tight">卫了么</h1>
          {(!isConnected || !wsConnected) && (
            <span className="ml-2 md:ml-4 text-[10px] md:text-xs bg-destructive text-destructive-foreground px-1.5 md:px-2 py-0.5 rounded-full animate-pulse">
              断开
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2 md:space-x-4">
          {/* Connection Status - 移动端只显示图标 */}
          <div className={`flex items-center space-x-1 text-xs px-1.5 md:px-2 py-1 rounded-full ${wsConnected && isConnected ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
            {wsConnected && isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden md:inline">{wsConnected && isConnected ? '已连接' : '断开'}</span>
          </div>

          {/* Online Users Count - 移动端精简 */}
          <div className="text-[10px] md:text-xs text-muted-foreground">
            <span className="hidden md:inline">在线: {onlineUsers.length > 99 ? '99+' : onlineUsers.length}</span>
            <span className="md:hidden">{onlineUsers.length > 9 ? '9+' : onlineUsers.length}</span>
          </div>

          {/* User Info Block */}
          <div className="flex items-center space-x-1.5 md:space-x-3 bg-muted/50 py-1 px-2 md:px-3 rounded-full border border-border">
            <button
              onClick={() => { setShowAvatarPicker(true); setAvatarChangeError(null) }}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-primary/20 overflow-hidden border border-primary flex items-center justify-center font-bold text-xs hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer"
              title="更换头像"
            >
              {user?.avatar ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" /> : 'DR'}
            </button>
            <div className="text-xs md:text-sm font-medium hidden md:block">
              {user?.nickname}{user?.nicknameSuffix || ''}
            </div>
            <button
              onClick={handleLogout}
              className="w-7 h-7 md:w-8 md:h-8 rounded-full hover:scale-110 active:scale-95 flex items-center justify-center transition-all duration-150"
              title="登出"
            >
              <img src="/asset/exit.svg" alt="退出" className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>

          <button
            onClick={toggleTheme}
            className="p-1.5 md:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5" />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">

        {/* Mobile Tab Bar */}
        <div className="flex md:hidden border-b border-border bg-card shrink-0">
          <button
            onClick={() => setActiveTab('public')}
            className={`flex-1 py-2.5 text-sm font-semibold text-center transition-colors relative ${
              activeTab === 'public' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Users className="w-4 h-4" />
              公共大厅
            </span>
            {activeTab === 'public' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`flex-1 py-2.5 text-sm font-semibold text-center transition-colors relative ${
              activeTab === 'team' ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              我的小队
              {team?.id && <span className="text-[10px] opacity-60">({team.members.length}/{team.maxMembers})</span>}
            </span>
            {activeTab === 'team' && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
        </div>

        {/* Left: Public Chat (70% on desktop, full on mobile) */}
        <section className={`flex-1 md:flex-initial md:w-2/3 flex flex-col border-r border-border min-h-0 ${activeTab === 'public' ? 'flex' : 'hidden md:flex'}`}>
          <div className="h-12 border-b border-border items-center px-4 bg-muted/30 hidden md:flex">
            <h2 className="font-semibold text-sm flex items-center">
              <Users className="w-4 h-4 mr-2" />
              公共大厅
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
            {isLoading ? (
              // Loading Skeleton for Public Chat
              Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-pub-${i}`} className="flex items-start gap-2 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                  <div className="flex flex-col gap-1 w-full max-w-[70%]">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-12 bg-muted rounded-xl" />
                  </div>
                </div>
              ))
            ) : (
              publicMessages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  getUserAvatar={getUserAvatar}
                  onJoinTeam={handleJoinTeamById}
                  onJoinTeamById={handleJoinTeamById}
                  showCopyButton={true}
                  showJoinButton={true}
                  onCopy={handleCopy}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="bg-card border-t border-border p-2 md:p-4 flex flex-col justify-center shrink-0">
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="粘贴招募协议..."
                className="flex-1 h-10 bg-input border border-border rounded-lg px-3 md:px-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                disabled={!isConnected}
              />
              <button
                onClick={handleSendMessage}
                disabled={cooldown > 0 || !isConnected}
                className={`h-10 px-4 md:px-6 rounded-lg font-medium text-sm transition shrink-0 ${cooldown > 0 || !isConnected ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow'}`}
              >
                {cooldown > 0 ? `${cooldown}s` : '发送'}
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 md:mt-2 text-right hidden md:block">
              当前频段：限制每条消息10秒冷却，一分钟不超过6条
            </div>
          </div>
        </section>

        {/* Right: Team Chat (30% on desktop, full on mobile) */}
        <section className={`flex-1 md:flex-initial md:w-1/3 flex flex-col relative bg-muted/10 min-h-0 ${activeTab === 'team' ? 'flex' : 'hidden md:flex'}`}>
          <div className="h-auto min-h-[3rem] md:h-12 border-b border-border flex flex-col md:flex-row md:items-center justify-between px-3 md:px-4 py-2 md:py-0 bg-muted/30 shrink-0 gap-2 md:gap-0">
            {/* Mobile First Line: Invite Code Area */}
            {team?.inviteCode && (
              <div className="flex md:hidden items-center justify-center gap-2 w-full pb-2 border-b border-border/10">
                <span className="text-primary font-mono text-sm tracking-widest bg-primary/5 px-4 py-1 rounded border border-primary/20 shadow-inner">
                  [{team.inviteCode}]
                </span>
                <button
                  onClick={() => {
                    const textToCopy = team.recruitText || (team.inviteCode ? `[${team.inviteCode}]` : '')
                    if (textToCopy) {
                      navigator.clipboard?.writeText(textToCopy)
                      setSuccessMsg('已经复制啦,请打开明日方舟加入小队')
                      setTimeout(() => setSuccessMsg(null), 3000)
                    }
                  }}
                  className="p-1.5 rounded bg-card text-muted-foreground border border-border shadow-sm hover:text-primary hover:border-primary/50 active:scale-95 transition cursor-pointer flex items-center justify-center"
                  title="复制全条招募消息"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Main Header Area (Team Info + Controls) */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <h2 className="font-semibold text-sm flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 mr-0.5 md:mr-1 text-primary/70" />
                <span className="hidden md:inline">当前小队</span>
                <span className="md:hidden">小队</span>
                {team?.id ? <span className="text-muted-foreground ml-0.5">({team.members.length}/{team.maxMembers})</span> : ''}
                
                {/* Desktop Invite Code */}
                {team?.inviteCode && (
                  <div className="hidden md:flex items-center ml-2">
                    <span className="text-muted-foreground/30 mr-2">|</span>
                    <span className="text-primary font-mono text-xs">[{team.inviteCode}]</span>
                    <button
                      onClick={() => {
                        const textToCopy = team.recruitText || (team.inviteCode ? `[${team.inviteCode}]` : '')
                        if (textToCopy) {
                          navigator.clipboard?.writeText(textToCopy)
                          setSuccessMsg('已经复制啦,请打开明日方舟加入小队')
                          setTimeout(() => setSuccessMsg(null), 3000)
                        }
                      }}
                      className="p-1 ml-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition cursor-pointer"
                      title="复制全条招募消息"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </h2>

              {/* Mobile Leave Button */}
              {team?.id && (
                <button
                  onClick={handleLeaveTeam}
                  className="md:hidden text-[10px] text-muted-foreground bg-card border border-border pb-0.5 pt-0.5 px-2 rounded hover:text-destructive hover:border-destructive/50 transition flex items-center gap-1 active:scale-95 shadow-sm"
                  title={isTeamLeader ? "解散队伍" : "离开队伍"}
                >
                  <X className="w-3.5 h-3.5" />
                  {isTeamLeader ? "解散" : "退出"}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between w-full md:w-auto mt-1 md:mt-0">
              {/* Modify Team Size Buttons - Only Team Leader */}
              {isTeamLeader && (
                <div className="flex items-center gap-1 bg-background/50 p-0.5 rounded-md border border-border shadow-inner">
                  {[2, 3, 4].map(size => (
                    <button
                      key={size}
                      onClick={() => updateTeamSize(size)}
                      className={`text-[10px] md:text-[9px] font-black w-8 h-6 md:w-5 md:h-5 flex items-center justify-center rounded transition-all duration-200 ${team.maxMembers === size
                        ? 'bg-primary text-primary-foreground shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]'
                        : 'text-muted-foreground hover:bg-muted/80 active:scale-95'
                        }`}
                      title={`将小队规模修改为 ${size} 人`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}

              {/* Desktop Leave Button */}
              {team?.id && (
                <button
                  onClick={handleLeaveTeam}
                  className="hidden md:flex text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition items-center gap-1 ml-4"
                  title={isTeamLeader ? "解散队伍" : "离开队伍"}
                >
                  <X className="w-4 h-4" />
                  {isTeamLeader ? "解散" : "退出"}
                </button>
              )}
            </div>
          </div>

          {!team?.id ? (
            // Mask Area
            <div className="absolute inset-0 top-12 z-10 bg-background/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center shadow-inner">
              <div className="bg-card p-6 rounded-xl border border-border shadow-2xl space-y-4 w-full max-w-sm">
                <h3 className="font-bold text-lg">尚未配属小队</h3>
                <p className="text-sm text-muted-foreground mb-4">发送大厅广播前必须先创建或加入一个小队。</p>
                <div className="space-y-3">
                  <button onClick={() => setShowCreateModal(true)} disabled={!isConnected} className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition shadow disabled:opacity-50">
                    手动创建房间
                  </button>
                  <button onClick={handleRandomJoin} disabled={!isConnected} className="w-full py-2 bg-secondary text-secondary-foreground rounded-lg border border-border hover:bg-secondary/80 transition flex items-center justify-center disabled:opacity-50">
                    <Shuffle className="w-4 h-4 mr-2" />
                    随机分配至未满员房间
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Team Chat Content
            <>
              {/* Team Members List */}
              <div className="border-b border-border bg-card/50 p-3">
                <div className="text-xs text-muted-foreground mb-2">队伍成员</div>
                <div className="flex flex-wrap gap-2">
                  {/* 已加入成员 */}
                  {[...team.members].sort((a, b) => a.id === team.creatorId ? -1 : b.id === team.creatorId ? 1 : 0).map(member => (
                    <div key={member.id} className={`flex items-center space-x-1 pl-1 pr-2 py-1 rounded-full border transition-all duration-300 transform hover:scale-[1.02] ${member.id === team.creatorId ? 'bg-rose-500/10 border-rose-500/30 shadow-[0_0_8px_rgba(244,63,94,0.2)]' : 'bg-muted/50 border-transparent'}`}>
                      <img src={member.avatar} alt={member.nickname} className="w-5 h-5 rounded-full object-cover" />
                      <span className={`text-xs ${member.id === team.creatorId ? 'text-rose-500 font-extrabold' : 'font-medium'}`}>
                        {member.nickname}{member.nicknameSuffix || ''}{member.id === team.creatorId ? ' (队长)' : ''}
                      </span>
                      {isTeamLeader && member.id !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(member.id, member.nickname)}
                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                          title="移除队员"
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* 空余槽位预渲染 */}
                  {Array.from({ length: Math.max(0, team.maxMembers - team.members.length) }).map((_, index) => (
                    <div
                      key={`empty-slot-${index}`}
                      className="flex items-center space-x-2 pl-1 pr-3 py-1 rounded-full border border-dashed border-white/20 bg-white/5 select-none animate-pulse-slow shadow-inner"
                    >
                      <div className="w-5 h-5 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
                        <span className="text-[10px] text-primary font-black tracking-tighter shadow-[0_0_5px_rgba(var(--primary-rgb),0.5)]">?</span>
                      </div>
                      <span className="text-[10px] text-white/70 font-black italic tracking-widest uppercase">
                        席位待机 // WAITING
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="text-center text-xs text-muted-foreground py-2 border-b border-border/50">已进入小队通讯频道</div>
                {isLoading ? (
                  // Loading Skeleton for Team Chat
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={`skeleton-team-${i}`} className="flex items-start gap-2 animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-muted shrink-0" />
                      <div className="flex flex-col gap-1 w-full max-w-[70%]">
                        <div className="h-4 w-20 bg-muted rounded" />
                        <div className="h-10 bg-muted rounded-xl" />
                      </div>
                    </div>
                  ))
                ) : (
                  teamMessages.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      getUserAvatar={getUserAvatar}
                      onJoinTeam={handleJoinTeamById}
                      onJoinTeamById={handleJoinTeamById}
                      onCopy={handleCopy}
                    />
                  ))
                )}
                <div ref={teamMessagesEndRef} />
              </div>
              {/* Team Input Area with Send Button */}
              <div className="h-20 border-t border-border p-3 bg-card flex items-center gap-2">
                <input
                  type="text"
                  value={teamInputValue}
                  onChange={e => setTeamInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendTeamMessage()}
                  placeholder="在小队频道说点什么..."
                  disabled={!wsConnected}
                  className="flex-1 h-10 bg-input border border-border rounded-lg px-3 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                <button
                  onClick={handleSendTeamMessage}
                  disabled={!teamInputValue.trim() || !wsConnected}
                  className="h-10 w-10 rounded-lg flex items-center justify-center transition shrink-0 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
                  title="发送"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-2">组成新的四区兄弟</h3>
              <p className="text-sm text-muted-foreground mb-4">确定房间规模。创建完成后，您的招募信息将对外广播。</p>

              {/* 招募消息输入 */}
              <div className="mb-4">
                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block">招募消息 <span className="text-destructive">*</span></label>
                <p className="text-xs text-muted-foreground/60 mb-1.5">粘贴完整的招募消息，系统将自动提取邀请码</p>
                <input
                  type="text"
                  value={createRecruitMessage}
                  onChange={e => { setCreateRecruitMessage(e.target.value); setInviteCodeError(null) }}
                  placeholder="[xxxx]nickname邀请你加入卫戍协议:盟约【xx模拟】"
                  className={`w-full bg-input border rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none ${inviteCodeError ? 'border-destructive' : 'border-border'}`}
                />
                {inviteCodeError && <p className="text-xs text-destructive mt-1">{inviteCodeError}</p>}
              </div>

              {/* 是否允许随机加入 */}
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createAllowRandom}
                  onChange={e => setCreateAllowRandom(e.target.checked)}
                  className="w-4 h-4 accent-blue-500"
                />
                <label className="text-sm cursor-pointer" onClick={() => setCreateAllowRandom(!createAllowRandom)}>
                  允许他人通过"随机分配"加入此小队
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-2">
                {[2, 3, 4].map(size => (
                  <button
                    key={size}
                    onClick={() => handleCreateRoom(size)}
                    className="py-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition text-center"
                  >
                    <div className="font-bold text-xl">{size} 人</div>
                    <div className="text-xs text-muted-foreground">小队规模</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-muted p-4 flex justify-end space-x-3">
              <button
                onClick={() => { setShowCreateModal(false); setCreateRecruitMessage(''); setInviteCodeError(null) }}
                className="px-4 py-2 rounded border border-border hover:bg-card transition text-sm font-medium"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100" onClick={e => e.stopPropagation()}>
            <div className="p-5 text-center">
              <h3 className="text-lg font-bold mb-2">确认登出</h3>
              <p className="text-sm text-muted-foreground mb-5">离开后将无法接收消息</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2 rounded-lg border border-border hover:bg-muted transition text-sm font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition text-sm font-medium"
                >
                  登出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowAvatarPicker(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-100" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-lg font-bold mb-3">更换头像</h3>
              {avatarChangeError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {avatarChangeError}
                </div>
              )}
              <div
                onScroll={handleAvatarScroll}
                className="grid grid-cols-5 gap-2 max-h-[240px] overflow-y-auto scrollbar-hide p-1"
              >
                {avatarList.slice(0, avatarDisplayLimit).map((avatar, idx) => {
                  const avatarUrl = `/asset/avatars/${avatar}`
                  const isSelected = user?.avatar === avatarUrl
                  return (
                    <div
                      key={idx}
                      onClick={() => handleAvatarChange(avatarUrl)}
                      className={`aspect-square rounded-lg cursor-pointer border-2 transition overflow-hidden bg-background flex items-center justify-center group relative ${isSelected ? 'border-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'border-transparent hover:border-border'}`}
                    >
                      <img
                        src={avatarUrl}
                        alt={avatar}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover transition group-hover:scale-110"
                      />
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <Check className="w-5 h-5 text-primary" />
                        </div>
                      )}
                    </div>
                  )
                })}
                {avatarDisplayLimit < avatarList.length && (
                  <div className="col-span-1 aspect-square flex items-center justify-center">
                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
            <div className="bg-muted p-3 flex justify-end">
              <button
                onClick={() => { setShowAvatarPicker(false); setAvatarDisplayLimit(25) }}
                className="px-4 py-1.5 rounded border border-border hover:bg-card transition text-sm font-medium"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Preview Modal (Internal to Chat) */}
      {/* QR Preview Modal (Internal to Chat) */}
      {showQRPreview && (
        <div
          className="fixed inset-0 z-[160] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
          onClick={() => setShowQRPreview(false)}
        >
          <div className="relative max-w-[75vw] max-h-[75vh] animate-in zoom-in-95 duration-300 flex flex-col items-center">
            <img
              src="/asset/qq_group_qr.png"
              alt="QR Preview"
              className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl border border-white/10"
            />
            <button
              className="mt-4 text-white/50 hover:text-primary transition-colors text-[10px] font-black uppercase tracking-[0.4em]"
              onClick={() => setShowQRPreview(false)}
            >
              点击背景或此处关闭预览 [ESC]
            </button>
          </div>
        </div>
      )}

      {/* Group Welcome Modal - Tactical Version */}
      {showGroupWelcome && (
        <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-white/10 rounded-2xl p-0 max-w-lg w-full max-h-[90vh] overflow-hidden shadow-[0_0_80px_rgba(var(--primary-rgb),0.2)] animate-in fade-in zoom-in-95 duration-500 flex flex-col relative">
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">

              {/* Message Header */}
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="w-1 bg-primary h-8 rounded-full" />
                  <div className="space-y-1">
                    <p className="text-lg font-bold text-foreground leading-snug">
                      加入我们的<span className="text-primary px-1 font-black">银帕大家庭</span>
                    </p>
                    <p className="text-xs text-muted-foreground tracking-wide font-medium italic">
                      "在这里你甚至可以聊明日方舟!"
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Blocks */}
              <div className="grid grid-cols-1 gap-4">

                {/* QR Section */}
                <div className="group relative bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden transition-all duration-300 hover:border-primary/30">
                  <div className="p-2 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase italic px-2 py-0.5 bg-white/5 rounded">二维码 // IDENTIFICATION</span>
                    <span className="text-[10px] font-mono text-primary/50">VALID STATUS</span>
                  </div>
                  <div className="p-3 flex flex-col items-center">
                    <div
                      onClick={() => setShowQRPreview(true)}
                      className="relative w-64 h-[297px] bg-white/10 rounded-xl border border-white/10 p-1 cursor-zoom-in transition-transform duration-500 hover:scale-[1.02] active:scale-95 group/qr"
                    >
                      <img src="/asset/qq_group_qr.png" alt="QQ Group QR" className="w-full h-full object-contain rounded-lg" />
                      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/qr:opacity-100 transition-opacity flex items-center justify-center">
                        <Search className="text-white w-8 h-8 drop-shadow-lg" />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-center text-muted-foreground font-mono uppercase tracking-widest opacity-60">
                      点击放大扫描识别 // SCAN
                    </p>
                  </div>
                </div>

                {/* Direct Link Section */}
                <a
                  href="https://qm.qq.com/q/H9JTfq1Ny8"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative h-11 bg-primary text-primary-foreground rounded-2xl overflow-hidden transition-all duration-500 hover:scale-[1.02] active:scale-[0.98] shadow-[0_10px_40px_rgba(var(--primary-rgb),0.3)]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  <div className="absolute inset-0 flex items-center justify-center space-x-3">
                    <span className="font-black text-sm tracking-[0.2em] uppercase italic">立即加入!</span>
                    <span className="text-[10px] opacity-50 font-mono tracking-tighter">IMPART</span>
                  </div>
                </a>
              </div>

              <div className="flex flex-col">
                {/* Security Warning 和 Acknowledge Button 构成的交换区域 */}
                {(() => {
                  const MotionDiv = motion.div as any;
                  return (
                    <MotionDiv
                      layout
                      className={`flex flex-col space-y-4 p-6 ${isBtnSwapped ? 'flex-col-reverse space-y-reverse' : ''}`}
                    >
                      {/* Security Warning */}
                      <MotionDiv
                        layout
                        className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start space-x-3"
                      >
                        <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center shrink-0 border border-amber-500/20">
                          <span className="text-amber-500 text-[10px] font-black">!</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 font-medium leading-tight">
                          进群请遵守相关守则。禁止发布任何违规或推销信息。
                        </p>
                      </MotionDiv>

                      {/* Acknowledge Button */}
                      <MotionDiv layout>
                        <button
                          onMouseEnter={() => {
                            if (btnHoverCount < 2) {
                              setIsBtnSwapped(!isBtnSwapped)
                              setBtnHoverCount(prev => prev + 1)
                            }
                          }}
                          onClick={() => {
                            localStorage.setItem('weleme_group_welcome_suppressed', 'true')
                            setShowGroupWelcome(false)
                          }}
                          className="w-full py-4 bg-muted/30 border border-white/5 text-muted-foreground font-black rounded-xl hover:bg-muted/50 hover:text-white transition-all duration-300 tracking-[0.6em] uppercase text-xs cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                        >
                          我知道了
                        </button>
                      </MotionDiv>
                    </MotionDiv>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
