import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'
import { Loader2 } from 'lucide-react'

type LoadingStep = {
  id: string
  label: string
  completed: boolean
}

export default function Loading() {
  const navigate = useNavigate()
  const { user, wsConnected, teamSynced } = useAppStore()

  // 没有 token 时跳转回验证页
  useEffect(() => {
    if (user && !user.token) {
      navigate('/auth', { replace: true })
    }
  }, [user, navigate])
  const [currentStep, setCurrentStep] = useState(0)
  const [steps, setSteps] = useState<LoadingStep[]>([
    { id: 'user', label: '验证用户身份', completed: false },
    { id: 'websocket', label: '连接 WebSocket', completed: false },
    { id: 'team', label: '同步队伍状态', completed: false },
  ])

  // Update steps based on state
  useEffect(() => {
    setSteps(prev => prev.map(step => {
      if (step.id === 'user') {
        return { ...step, completed: !!user }
      }
      if (step.id === 'websocket') {
        return { ...step, completed: wsConnected }
      }
      if (step.id === 'team') {
        // Team is synced when we receive online_users (which comes after team_rejoined)
        return { ...step, completed: teamSynced }
      }
      return step
    }))
  }, [user, wsConnected, teamSynced])

  // Auto-advance to next step
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextIncomplete = steps.findIndex(step => !step.completed)
      if (nextIncomplete !== -1) {
        setCurrentStep(nextIncomplete)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [steps])

  // Navigate to chat when all steps are complete
  useEffect(() => {
    const allCompleted = steps.every(step => step.completed)
    if (allCompleted && user) {
      const timer = setTimeout(() => {
        navigate('/chat')
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [steps, user, navigate])

  // Fallback: force navigate after 5 seconds even if not fully synced
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        console.warn('[Loading] Timeout reached, proceeding to chat')
        navigate('/chat')
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [user, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground">
      <div className="w-full max-w-md p-8 space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">卫了么</h1>
          <p className="text-sm text-muted-foreground">正在准备大厅...</p>
        </div>

        {/* Loading Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center space-x-3 transition-opacity duration-300 ${
                index <= currentStep ? 'opacity-100' : 'opacity-40'
              }`}
            >
              <div className="flex-shrink-0">
                {step.completed ? (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                ) : index === currentStep ? (
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-muted" />
                )}
              </div>
              <span
                className={`text-sm ${
                  step.completed
                    ? 'text-foreground'
                    : index === currentStep
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{
              width: `${(steps.filter(s => s.completed).length / steps.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
