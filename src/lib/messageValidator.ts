/**
 * Message validation and formatting utilities
 */

// Recruitment message regex: [xxxx]nickname邀请你加入卫戍协议:盟约【sim】
export const RECRUIT_REGEX = /^\[([a-zA-Z0-9]{14})\](.+)邀请你加入卫戍协议:盟约【(终极模拟|绝境模拟|标准模拟|险境模拟)】$/

/**
 * Validate if a message matches the recruitment protocol format
 */
export function isValidRecruitMessage(message: string): boolean {
  return RECRUIT_REGEX.test(message)
}

/**
 * Parse recruitment message to extract components
 */
export function parseRecruitMessage(message: string) {
  const match = message.match(RECRUIT_REGEX)
  if (!match) {
    return null
  }

  return {
    code: match[1], // The 14-character code
    nickname: match[2], // The inviter's nickname
    simulationType: match[3] // The simulation type
  }
}

/**
 * Sanitize message content to prevent XSS
 */
export function sanitizeContent(content: string): string {
  // Remove potential HTML tags and scripts
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Format timestamp to readable time string
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  // If within 24 hours, show HH:MM
  if (diff < 24 * 60 * 60 * 1000) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Otherwise show YYYY-MM-DD
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * Deduplicate messages based on ID
 */
export function deduplicateMessages<T extends { id: string }>(
  messages: T[],
  newMessage: T
): T[] {
  // Check if message already exists
  if (messages.some(msg => msg.id === newMessage.id)) {
    return messages
  }
  return [...messages, newMessage]
}

/**
 * Get recent messages within time window (10 minutes as per API spec)
 */
export function getRecentMessages<T extends { timestamp: number }>(
  messages: T[],
  windowMs: number = 10 * 60 * 1000
): T[] {
  const cutoff = Date.now() - windowMs
  return messages.filter(msg => msg.timestamp >= cutoff)
}
