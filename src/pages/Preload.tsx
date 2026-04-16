import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/useAppStore'

export default function Preload() {
  const navigate = useNavigate()
  const { setPreloaded } = useAppStore()

  const handleContinue = () => {
    setPreloaded(true)
    navigate('/auth')
  }

  // Background asset preloading is now handled globally in App.tsx via AssetPreloader.ts

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground space-y-6">
      <div className="w-48 h-48 rounded-full overflow-hidden bg-muted shadow-lg">
        {/* Expression Pack Image */}
        <img
          src="/asset/qu_lai.jpg"
          alt="qu_lai"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://placehold.co/200x200?text=Qu+Lai'
          }}
        />
      </div>
      <h1 className="text-4xl font-black italic tracking-tighter text-primary uppercase">卫了么</h1>
      <div className="flex flex-col items-center space-y-2">
        <p className="text-sm font-bold uppercase tracking-[0.4em] text-muted-foreground whitespace-nowrap">真正的四区兄弟,在哪</p>
      </div>

      <button
        onClick={handleContinue}
        className={`px-12 py-3 border font-black uppercase tracking-[0.3em] text-sm rounded-xl transition-all duration-500 shadow-2xl bg-primary text-primary-foreground border-primary hover:scale-105 active:translate-y-1`}
      >
        使用邮箱继续
      </button>
    </div>
  )
}
