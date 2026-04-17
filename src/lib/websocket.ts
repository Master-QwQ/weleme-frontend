import { BASE_URL } from './api'
export * from './websocketTypes'
import type {
  ClientMessageType,
  WSMessage,
  MessageCallback,
  ErrorCallback,
  ConnectionCallback
} from './websocketTypes'

// 生成UUID函数
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

class WebSocketService {
  private ws: WebSocket | null = null
  private userId: string | null = null
  private token: string | null = null
  private fingerprint: string | null = null  // 缓存 fingerprint，重连时复用
  private sessionId: string = generateUUID()  // 会话唯一标识
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private heartbeatInterval: number | null = null
  private isManualClose = false
  private isConnecting = false  // 防止重复连接

  private onMessageCallbacks: MessageCallback[] = []
  private onErrorCallbacks: ErrorCallback[] = []
  private onOpenCallbacks: ConnectionCallback[] = []
  private onCloseCallbacks: ConnectionCallback[] = []

  connect(userId: string | null = null, token?: string, fingerprint?: string): Promise<void> {
    // 如果已经连接，直接返回
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // 如果有token且未升级认证，执行升级
      if (token && !this.token) {
        this.upgradeAuth(token)
      }
      console.log('[WebSocket] Already connected')
      return Promise.resolve()
    }

    // 如果正在连接中，返回现有 Promise
    if (this.isConnecting) {
      console.log('[WebSocket] Connection in progress, waiting...')
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval)
            // 如果有token且未升级认证，执行升级
            if (token && !this.token) {
              this.upgradeAuth(token)
            }
            resolve()
          } else if (this.ws && this.ws.readyState === WebSocket.CLOSED) {
            clearInterval(checkInterval)
            reject(new Error('Connection failed'))
          }
        }, 100)
      })
    }

    this.isConnecting = true
    return new Promise((resolve, reject) => {
      this.userId = userId
      this.token = null // 初始化为null，等待升级认证
      if (fingerprint) this.fingerprint = fingerprint  // 缓存 fingerprint
      this.isManualClose = false

      // 协议检测：HTTPS 下必须使用 WSS，否则浏览器会拦截
      const isHttps = window.location.protocol === 'https:'
      const protocol = isHttps ? 'wss' : 'ws'
      
      const isDev = import.meta.env.DEV
      let wsUrl: string
      if (isDev) {
        // 开发环境：通过 Vite 代理
        wsUrl = `${protocol}://${window.location.host}/ws/chat`
      } else {
        // 生产环境
        const baseUrl = BASE_URL || window.location.origin
        wsUrl = baseUrl.replace(/^http(s)?/, protocol) + '/ws/chat'
      }

      // 总是使用 fingerprint 连接，废弃直接使用 token 连接
      if (fingerprint) {
        wsUrl += `?fingerprint=${encodeURIComponent(fingerprint)}`
      }

      console.log(`[WebSocket] Trying ${protocol.toUpperCase()}...`)
      console.log('[WebSocket] Connecting to:', wsUrl)

      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected successfully')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000

          // 连接成功后，如果有token，执行升级认证
          if (token) {
            this.upgradeAuth(token)
          }

          this.startHeartbeat()
          this.onOpenCallbacks.forEach(cb => cb())
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: WSMessage = JSON.parse(event.data)
            console.log('[WebSocket] Received:', message.type)

            if (message.type === 'pong') {
              return
            }

            this.onMessageCallbacks.forEach(cb => cb(message))
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Error occurred:', error)
          this.isConnecting = false

          this.onErrorCallbacks.forEach(cb => cb('WebSocket 连接错误，请检查后端服务是否运行'))
          reject(error)
        }

        this.ws.onclose = (event) => {
          console.log('[WebSocket] Disconnected, code:', event.code)
          this.isConnecting = false
          this.stopHeartbeat()
          this.onCloseCallbacks.forEach(cb => cb(event.code))

          // 4001 = 鉴权失败，不重连
          if (event.code === 4001) {
            console.error('[WebSocket] Authentication failed, not reconnecting')
            return
          }

          if (!this.isManualClose) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        console.error('[WebSocket] Connection failed:', error)
        this.isConnecting = false
        reject(error)
      }
    })
  }

  disconnect(): void {
    this.isManualClose = true
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  upgradeAuth(token: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Upgrading connection with auth token...');
      const timestamp = Date.now(); // Unix时间戳（毫秒）
      this.send({ 
        type: 'auth', 
        payload: { 
          token, 
          timestamp, 
          sessionId: this.sessionId 
        } 
      });
      this.token = token;
    } else {
      console.warn('[WebSocket] Cannot upgrade auth: Connection not open or missing.');
    }
  }

  send(message: { type: ClientMessageType; payload: any }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Not connected, cannot send message')
      return
    }

    try {
      this.ws.send(JSON.stringify(message))
      console.log('[WebSocket] Sent:', message.type)
    } catch (error) {
      console.error('[WebSocket] Send failed:', error)
      this.onErrorCallbacks.forEach(cb => cb('Failed to send message'))
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'ping', payload: {} })
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached')
      this.onErrorCallbacks.forEach(cb => cb('Connection lost, please refresh'))
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )

    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    )

    setTimeout(() => {
      if (this.userId && !this.isManualClose) {
        this.connect(this.userId, this.token || undefined, this.fingerprint || undefined).catch(console.error)
      }
    }, delay)
  }

  onMessage(callback: MessageCallback): () => void {
    this.onMessageCallbacks.push(callback)
    return () => {
      this.onMessageCallbacks = this.onMessageCallbacks.filter(
        cb => cb !== callback
      )
    }
  }

  onError(callback: ErrorCallback): () => void {
    this.onErrorCallbacks.push(callback)
    return () => {
      this.onErrorCallbacks = this.onErrorCallbacks.filter(cb => cb !== callback)
    }
  }

  onOpen(callback: ConnectionCallback): () => void {
    this.onOpenCallbacks.push(callback)
    return () => {
      this.onOpenCallbacks = this.onOpenCallbacks.filter(cb => cb !== callback)
    }
  }

  onClose(callback: ConnectionCallback): () => void {
    this.onCloseCallbacks.push(callback)
    return () => {
      this.onCloseCallbacks = this.onCloseCallbacks.filter(cb => cb !== callback)
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

export const wsService = new WebSocketService()
