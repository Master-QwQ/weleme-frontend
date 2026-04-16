// WebSocket message types

export type ClientMessageType =
  | 'ping'
  | 'create_team'
  | 'join_team'
  | 'leave_team'
  | 'remove_member'
  | 'update_team_size'
  | 'send_public_message'
  | 'send_team_message'
  | 'dissolve_team'

export type ServerMessageType =
  | 'pong'
  | 'error'
  | 'online_users'
  | 'user_online'
  | 'user_offline'
  | 'team_rejoined'
  | 'team_created'
  | 'team_joined'
  | 'team_update'
  | 'team_dissolved'
  | 'user_status_update'
  | 'public_message'
  | 'team_message'

export type RegisterPayload = { userId: string }
export type CreateTeamPayload = { teamSize: number }
export type JoinTeamPayload = { teamId: string }
export type RemoveMemberPayload = { targetUserId: string }
export type UpdateTeamSizePayload = { maxMembers: number }
export type SendMessagePayload = { content: string; teamId?: string }

export type TeamMember = {
  id: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
}

export type TeamInfo = {
  id: string
  creatorId: string
  members: TeamMember[]
  maxMembers: number
  allowRandomJoin?: boolean
  inviteCode?: string
  recruitText?: string
}

export type OnlineUserInfo = {
  userId: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
  teamId?: string | null
}

export type MessageData = {
  id: string
  userId: string
  nickname: string
  nicknameSuffix?: string
  avatar: string
  doctorLevel?: number
  content: string
  timestamp: number
  teamId?: string | null
}

export type UserStatusUpdate = {
  userId: string
  teamId?: string | null
}

export type WSMessage<T = any> = {
  type: ServerMessageType
  payload: T
}

export type MessageCallback = (message: WSMessage) => void
export type ErrorCallback = (error: string) => void
export type ConnectionCallback = (code?: number) => void
