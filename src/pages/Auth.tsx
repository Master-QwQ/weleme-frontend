import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { Loader2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getFingerprint } from '@/lib/fingerprint'

export default function Auth() {
  const navigate = useNavigate()
  const setEmailVerified = useAppStore(state => state.setEmailVerified)
  const setUser = useAppStore(state => state.setUser)
  const setTempAuthData = useAppStore(state => state.setTempAuthData)
  const setVerifiedAt = useAppStore(state => state.setVerifiedAt)
  const user = useAppStore(state => state.user)
  const verifiedAt = useAppStore(state => state.verifiedAt)

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [timer, setTimer] = useState(0)
  const [errorVisible, setErrorVisible] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [redirectCountdown, setRedirectCountdown] = useState(5)

  // Redirect if already logged in (with 7-day window check)
  useEffect(() => {
    if (user?.token && verifiedAt) {
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (Date.now() - verifiedAt < sevenDays) {
        setShowPrompt(true)
      } else {
        // Session expired (logical)
        clearAuth()
      }
    }
  }, []) // Run once on mount

  // Auto-redirect timer
  useEffect(() => {
    let timer: any
    if (showPrompt && redirectCountdown > 0) {
      timer = setInterval(() => {
        setRedirectCountdown(prev => prev - 1)
      }, 1000)
    } else if (showPrompt && redirectCountdown === 0) {
      navigate('/chat', { replace: true })
    }
    return () => clearInterval(timer)
  }, [showPrompt, redirectCountdown, navigate])
  const clearAuth = () => {
    setUser(null)
    setEmailVerified(false)
    setVerifiedAt(null)
  }

  // Timer Effect
  useEffect(() => {
    let interval: any
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [timer])

  const triggerEmailSend = async (targetEmail: string) => {
    setIsPending(true)
    setErrorVisible(false)
    try {
      const res = await api.post('/api/auth/send-code', { email: targetEmail, type: 'register' })
      if (!res.success) {
        throw new Error(res.message || '发送失败')
      }
    } catch (err) {
      console.error('Failed to send code', err)
      setErrorVisible(true)
      setTimer(0) // Allow immediate retry on failure
    } finally {
      setIsPending(false)
    }
  }

  const handleSendCode = async () => {
    if (!email) return
    setStep('code')
    setTimer(60)
    triggerEmailSend(email)
  }

  const handleResend = () => {
    if (timer > 0 || isPending) return
    setTimer(60)
    triggerEmailSend(email)
  }

  const handleVerify = async () => {
    if (!code) return
    setIsLoading(true)
    setVerifyError(null)

    try {
      const res = await api.post('/api/auth/verify', {
        email,
        code,
        fingerprint: getFingerprint()
      })

      if (res.success) {
        setEmailVerified(true)
        setVerifiedAt(Date.now())
        if (res.registered && res.user) {
          // User already exists, log them in
          // Map userId to id for store compatibility
          setUser({
            id: res.user.userId,
            nickname: res.user.nickname,
            nicknameSuffix: res.user.nicknameSuffix,
            avatar: res.user.avatar,
            teamId: res.user.teamId,
            token: res.user.token
          })
          navigate('/loading')
        } else {
          // New user, go to register with temp data
          setTempAuthData({ email, code })
          navigate('/register')
        }
      } else {
        setVerifyError(res.message || '验证码无效或已过期')
      }
    } catch (err) {
      console.error('Failed to verify code', err)
      setVerifyError('验证失败，请重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      {isLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300">
          <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
          <p className="text-lg font-medium tracking-widest animate-pulse">
            {step === 'email' ? '正在发送验证码...' : '正在验证...'}
          </p>
        </div>
      )}
      <div className="w-full max-w-md space-y-8 p-8 border border-border bg-card rounded-xl shadow-xl">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-black italic tracking-tighter text-primary uppercase">欢迎
          </h2>
          <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            {step === 'email' ? '使用卫了么需要邮箱喔' : '验证码已发送~'}
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-3">
            <label htmlFor="email" className="text-sm font-medium leading-none" >邮箱地址</label>
            <input
              id="email"
              type="email"
              placeholder="cs@hypergryph.com"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={step === 'code'}
            />
          </div>

          {step === 'code' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="code" className="text-sm font-medium leading-none">验证码</label>
                  {isPending && (
                    <span className="text-[10px] font-bold text-primary animate-pulse tracking-widest uppercase">正在发送中...</span>
                  )}
                  {errorVisible && !isPending && (
                    <span className="text-[10px] font-bold text-destructive animate-bounce tracking-widest uppercase">发送失败，请重试</span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="code"
                    type="text"
                    placeholder="输入6位验证码"
                    className={`flex h-12 w-full rounded-xl border bg-background/50 px-4 py-2 text-lg font-mono text-center focus-visible:outline-none focus-visible:ring-2 transition-all shadow-inner ${verifyError ? 'border-destructive focus-visible:ring-destructive/50' : 'border-border focus-visible:ring-primary/50'}`}
                    value={code}
                    maxLength={6}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCode(val);
                      setVerifyError(null);
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                      setCode(pastedData);
                    }}
                  />
                </div>
                {verifyError && (
                  <p className="text-xs text-destructive font-medium animate-in fade-in slide-in-from-top-1 duration-200">
                    {verifyError}
                  </p>
                )}
              </div>

              <button
                onClick={handleResend}
                disabled={timer > 0 || isPending}
                className="w-full py-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <span>{timer > 0 ? `重新发送 (${timer}s)` : '重新发送验证码'}</span>
              </button>
            </div>
          )}

          <div className="pt-4">
            {step === 'email' ? (
              <button
                onClick={handleSendCode}
                disabled={isLoading}
                className="w-full flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                继续
              </button>
            ) : (
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className="w-full flex h-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                验证并登录
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Relogin Prompt Modal */}
      {showPrompt && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl p-8 max-w-sm w-full space-y-8 animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden text-center">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20" />

            <div className="space-y-2">
              <h3 className="text-xl font-black italic tracking-tighter text-primary uppercase">检测到有效凭证</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">Session Detected</p>
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full border-2 border-primary/20 p-1 relative">
                <img src={user?.avatar || '/asset/avatars/default.jpg'} alt="User" className="w-full h-full rounded-full object-cover" />
                <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg">
                  {user?.nicknameSuffix || '#0000'}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-bold text-foreground tracking-tight">{user?.nickname}</p>
                <p className="text-xs text-muted-foreground italic">欢迎回来，博士</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigate('/chat', { replace: true })}
                className="w-full py-4 bg-primary text-primary-foreground font-black rounded-xl hover:bg-primary/90 transition shadow-[0_10px_30px_rgba(var(--primary-rgb),0.3)] tracking-[0.2em] relative group overflow-hidden"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  直接进入系统
                  <span className="text-[10px] opacity-60 font-mono">({redirectCountdown}s)</span>
                </span>
                <div
                  className="absolute left-0 bottom-0 h-1 bg-white/30 transition-all duration-1000 ease-linear"
                  style={{ width: `${(redirectCountdown / 5) * 100}%` }}
                />
              </button>
              <button
                onClick={() => {
                  clearAuth()
                  setShowPrompt(false)
                }}
                className="w-full py-3 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-white transition-colors"
              >
                切换账号 / 重新验证
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
