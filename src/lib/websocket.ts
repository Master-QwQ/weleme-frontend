import { BASE_URL } from './api'
export * from './websocketTypes'
import type {
  ClientMessageType,
  WSMessage,
  MessageCallback,
  ErrorCallback,
  ConnectionCallback
} from './websocketTypes'

class WebSocketService {
  private ws: WebSocket | null = null
  private userId: string | null = null
  private token: string | null = null
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

  connect(userId: string, token?: string): Promise<void> {
    // 如果已经连接，直接返回
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
      this.token = token || null
      this.isManualClose = false

      // 协议检测：HTTPS 下必须使用 WSS，否则浏览器会拦截
      const isHttps = window.location.protocol === 'https:'
      const protocol = isHttps ? 'wss' : 'ws'
      
      let wsUrl: string
      if (isDev) {
        // 开发环境：通过 Vite 代理
        wsUrl = `${protocol}://${window.location.host}/ws/chat`
      } else {
        // 生产环境
        const baseUrl = BASE_URL || window.location.origin
        wsUrl = baseUrl.replace(/^http(s)?/, protocol) + '/ws/chat'
      }

      // 携带 token 鉴权
      if (token) {
        wsUrl += `?token=${encodeURIComponent(token)}`
      }

      console.log(`[WebSocket] Trying ${currentProtocol.toUpperCase()}...`)
      console.log('[WebSocket] Connecting to:', wsUrl)

      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected successfully')
          this.isConnecting = false
          this.reconnectAttempts = 0
          this.reconnectDelay = 1000

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
          this.onCloseCallbacks.forEach(cb => cb())

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
        this.connect(this.userId, this.token || undefined).catch(console.error)
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
