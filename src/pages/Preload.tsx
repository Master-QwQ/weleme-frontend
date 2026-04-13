import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

export default function Preload() {
  const navigate = useNavigate()
  const { setPreloaded } = useAppStore()

  const handleContinue = () => {
    setPreloaded(true)
    navigate('/auth')
  }

  // Preload front-end resources simulate
  useEffect(() => {
    const timer = setTimeout(() => {
      // Simulate resource loading or theme setup
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground space-y-6">
      <div className="w-48 h-48 rounded-full overflow-hidden bg-muted shadow-lg">
        {/* Expression Pack Image */}
        <img
          src="/public/qu_lai.jpg"
          alt="qu_lai"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=Qu+Lai'
          }}
        />
      </div>
      <h1 className="text-4xl font-bold tracking-tight">卫了么</h1>
      <p className="text-xl text-muted-foreground">欢迎各位博士使用卫了么</p>

      <button
        onClick={handleContinue}
        className="px-6 py-2 border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground rounded-md transition-colors duration-200"
      >
        使用邮箱继续
      </button>
    </div>
  )
}
