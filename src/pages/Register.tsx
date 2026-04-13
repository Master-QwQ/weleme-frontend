import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Check, Music, VolumeX, Loader2, Search, Shuffle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { api } from '@/lib/api'
import SparkMD5 from 'spark-md5'
import { getFingerprint } from '@/lib/fingerprint'

export default function Register() {
  const navigate = useNavigate()

  // Auth Data
  const isEmailVerified = useAppStore(state => state.isEmailVerified)
  const tempAuthData = useAppStore(state => state.tempAuthData)
  const setUser = useAppStore(state => state.setUser)
  const updateAvatarCache = useAppStore(state => state.updateAvatarCache)
  const verifiedAt = useAppStore(state => state.verifiedAt)
  const setEmailVerified = useAppStore(state => state.setEmailVerified)

  useEffect(() => {
    const thirtyMinutes = 30 * 60 * 1000
    const isExpired = verifiedAt && (Date.now() - verifiedAt > thirtyMinutes)

    if (!isEmailVerified || !tempAuthData || isExpired) {
      if (isExpired) {
        setEmailVerified(false)
      }
      navigate('/auth')
    }
  }, [isEmailVerified, tempAuthData, navigate, verifiedAt, setEmailVerified])

  const [isLoading, setIsLoading] = useState(false)

  // OCR & Upload status
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const [cardImage, setCardImage] = useState<string | null>(null)

  // BGM status
  const [isMuted, setIsMuted] = useState(true)

  // Dynamic Data
  const [avatarList, setAvatarList] = useState<string[]>([])
  const [genderList, setGenderList] = useState<string[]>([])

  // Form Data
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('weleme_registration_form')
    const initialData = {
      doctorId: '',
      doctorLevel: 114,
      server: '官方服务器',
      nickname: '',
      avatar: '',
      agreed: true,
      psychologicalGender: '',
      biologicalGender: '',
      birthday: '',
      contactType: 'qq',
      contactValue: ''
    }
    if (saved) {
      try {
        return { ...initialData, ...JSON.parse(saved) }
      } catch (e) {
        return initialData
      }
    }
    return initialData
  })

  // Persistence: Save form data to localStorage
  useEffect(() => {
    // Only save if important fields have some content
    localStorage.setItem('weleme_registration_form', JSON.stringify(formData))
  }, [formData])

  // Avatar Loading
  const [avatarDisplayLimit, setAvatarDisplayLimit] = useState(10) // Initial 5*2 as requested


  // Load Dynamic Data
  useEffect(() => {
    fetch('/public/avatars.json')
      .then(res => res.json())
      .then(data => {
        const avatars = data.avatars || []
        setAvatarList(avatars)
        if (!formData.avatar && avatars?.[0]) {
          setFormData(prev => ({ ...prev, avatar: `/public/avatars/${avatars[0]}` }))
        }
        // 将所有头像URL存入全局缓存，供后续页面使用
        const cacheUpdates: Record<string, string> = {}
        for (const avatar of avatars) {
          const avatarUrl = `/public/avatars/${avatar}`
          cacheUpdates[avatar] = avatarUrl
        }
        updateAvatarCache(cacheUpdates)
      })
      .catch(err => console.error('Failed to load avatars:', err))

    fetch('/public/genders.json')
      .then(res => res.json())
      .then(data => setGenderList(data.genders || []))
      .catch(err => console.error('Failed to load genders:', err))
  }, [])

  const handleAvatarScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget

    // Trigger loading when reaching near the bottom (20px buffer)
    if (scrollHeight - scrollTop - clientHeight < 20) {
      if (avatarDisplayLimit < avatarList.length) {
        setAvatarDisplayLimit(prev => Math.min(prev + 10, avatarList.length))
      }
    }
  }

  const [showWelcome, setShowWelcome] = useState(() => {
    const suppressedAt = localStorage.getItem('weleme_welcome_suppressed')
    if (suppressedAt) {
      const hoursSince = (Date.now() - parseInt(suppressedAt)) / (1000 * 60 * 60)
      if (hoursSince < 2) return false
    }
    return true
  })
  const [showPreview, setShowPreview] = useState(false)
  const [showUsageConfirm, setShowUsageConfirm] = useState(false)
  const [usageLimit, setUsageLimit] = useState(0)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fingerprint = getFingerprint()

  // OCR & Image Processing
  const processImage = async (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.src = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0)

        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('Failed to convert image'))

          const arrayBuffer = await blob.arrayBuffer()
          const spark = new SparkMD5.ArrayBuffer()
          spark.append(arrayBuffer)
          const md5 = spark.end()

          const newFile = new File([blob], `${md5}_${Date.now()}.jpg`, { type: 'image/jpeg' })
          resolve(newFile)
        }, 'image/jpeg', 0.85)
      }
      img.onerror = reject
    })
  }

  const startOCR = async (file: File) => {
    setIsLoading(true)
    try {
      const processedFile = await processImage(file)
      setCardImage(URL.createObjectURL(processedFile))

      const fd = new FormData()
      fd.append('file', processedFile)
      fd.append('fingerprint', fingerprint)

      const result = await api.upload('/api/ocr/card', fd)

      if (result && result.success && result.data) {
        const data = result.data
        setFormData(prev => {
          const combinedNickname = data.nickname || (data.nicknameText && data.nicknameSuffix ? `${data.nicknameText}#${data.nicknameSuffix}` : data.nicknameText || prev.nickname)
          return {
            ...prev,
            doctorId: data.doctorId || prev.doctorId,
            doctorLevel: data.doctorLevel || prev.doctorLevel,
            nickname: combinedNickname,
            server: data.server || prev.server
          }
        })
        setOcrSuccess(true)
      } else if (result && !result.success) {
        alert(result.message || '识别失败')
      }
    } catch (err) {
      console.error('OCR failed:', err)
      alert('解析失败，请检查图像是否清晰')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUploadClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (file) {
        setIsLoading(true)
        try {
          const usageResult = await api.get(`/api/ocr/usage?fingerprint=${fingerprint}`)
          if (usageResult && typeof usageResult.count === 'number') {
            const limit = usageResult.limit || 5
            const remaining = Math.max(0, limit - usageResult.count)

            if (remaining <= 0) {
              alert('今日识别次数已达上限')
              return
            }

            setUsageLimit(remaining)
            setPendingFile(file)
            setCardImage(URL.createObjectURL(file))
            setOcrSuccess(false)
            setShowUsageConfirm(true) // Prompt immediately as requested
          }
        } catch (err) {
          console.error('Usage check failed:', err)
          // Fallback
          setPendingFile(file)
          setCardImage(URL.createObjectURL(file))
          setShowUsageConfirm(true)
        } finally {
          setIsLoading(false)
        }
      }
    }
    input.click()
  }

  const handleVerifyAndStart = async () => {
    if (!pendingFile) return
    startOCR(pendingFile)
  }

  const handleRegister = async () => {
    if (!tempAuthData) return
    if (!formData.biologicalGender) {
      alert("生理性别为必填项，请务必准确记录！")
      return
    }

    setIsLoading(true)
    try {
      const payload = {
        email: tempAuthData.email,
        code: tempAuthData.code,
        nickname: formData.nickname,
        avatar: formData.avatar,
        doctor_id: formData.doctorId,
        doctor_level: formData.doctorLevel,
        server: formData.server,
        birthday: formData.birthday,
        biological_gender: formData.biologicalGender,
        psychological_gender: formData.psychologicalGender,
        qq: formData.contactType === 'qq' ? formData.contactValue : '',
        wechat: formData.contactType === 'wechat' ? formData.contactValue : '',
        fingerprint: getFingerprint()
      }

      const res = await api.post('/api/auth/register', payload)
      if (res.success && res.user) {
        // Sync local store
        setUser({
          id: res.user.userId,
          nickname: res.user.nickname,
          nicknameSuffix: res.user.nicknameSuffix,
          avatar: res.user.avatar,
          doctorLevel: formData.doctorLevel,
          token: res.user.token
        })
        localStorage.removeItem('weleme_registration_form') // Clear form cache on success
        navigate('/loading')
      } else {
        alert(res.message || '注册失败')
      }
    } catch (err) {
      console.error('Registration failed', err)
      alert('注册过程中发生错误，请稍后重试')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center py-12 px-4 space-y-8">
      {/* Hidden Audio Element for BGM */}
      <audio
        src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
        autoPlay
        loop
        muted={isMuted}
      />

      <div className="max-w-4xl w-full bg-card rounded-xl p-8 border border-border shadow-xl relative overflow-hidden transition-all duration-300">

        {/* BGM Toggle */}
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="absolute top-4 right-4 p-2 bg-muted rounded-full hover:bg-muted/80 transition"
          title={isMuted ? "取消静音开始播放获取信息素的BGM" : "静音"}
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-muted-foreground" /> : <Music className="w-5 h-5 text-primary" />}
        </button>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">欢迎新博士的加入</h1>
          <p className="text-muted-foreground">请上传个人名片并完成注册喵</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card Upload Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg flex items-center">
              1. 个人名片上传区
            </h3>

            <div
              className="relative aspect-video w-full border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-default bg-muted/20 overflow-hidden group"
            >
              {cardImage ? (
                <img
                  src={cardImage}
                  alt="Card preview"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted-foreground/30 space-y-4">
                  <Upload className="w-16 h-16 mb-2 animate-pulse" />
                  <div className="text-center space-y-1">
                    <p className="text-xs font-black uppercase tracking-[0.2em]">等待名片上传 // AWAITING UPLOAD</p>
                    <p className="text-[10px] text-muted-foreground/50">请务必上传清晰的名片截图以确保识别准确性</p>
                  </div>
                </div>
              )}

              {/* Hover Actions */}
              <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center space-x-6 backdrop-blur-[2px]">
                <button
                  onClick={handleUploadClick}
                  className="flex flex-col items-center space-y-2 hover:text-primary transition-colors bg-card/80 p-4 rounded-xl shadow-lg border border-border"
                >
                  <Upload className="w-8 h-8" />
                  <span className="text-xs font-bold uppercase tracking-widest">上传名片</span>
                </button>
                {cardImage && (
                  <button
                    onClick={() => setShowPreview(true)}
                    className="flex flex-col items-center space-y-2 hover:text-primary transition-colors bg-card/80 p-4 rounded-xl shadow-lg border border-border"
                  >
                    <Search className="w-8 h-8" />
                    <span className="text-xs font-bold uppercase tracking-widest">查看原图</span>
                  </button>
                )}
              </div>

            </div>

            {/* Action Area Below Image */}
            <div className="space-y-3">
              {pendingFile && !ocrSuccess && !isLoading && (
                <button
                  onClick={handleVerifyAndStart}
                  className="w-full py-4 bg-black/40 text-primary font-black uppercase tracking-[0.3em] rounded-xl shadow-[0_0_20px_rgba(0,0,0,0.4)] hover:bg-primary/10 hover:border-primary transition-all duration-300 flex items-center justify-center space-x-3 border border-primary/30 group"
                >
                  <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="text-sm">开始识别</span>
                </button>
              )}

              {isLoading && pendingFile && (
                <div className="w-full py-3 bg-muted/50 text-muted-foreground rounded-lg border border-border flex items-center justify-center space-x-3 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-xs font-bold uppercase tracking-widest">正在解析信息素特征...</span>
                </div>
              )}

              {ocrSuccess && (
                <div className="bg-primary/20 text-primary p-3 rounded-lg border border-primary/30 flex items-center space-x-2 animate-in zoom-in-95 duration-300">
                  <Check className="w-5 h-5" />
                  <span className="text-sm font-medium">信息素解析完成</span>
                </div>
              )}
            </div>
          </div>

          {/* Form Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">2. 博士信息</h3>

            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground uppercase font-bold">博士ID</label>
                  <input
                    type="text"
                    value={formData.doctorId}
                    onChange={e => setFormData({ ...formData, doctorId: e.target.value })}
                    required
                    className="w-full bg-input border border-border rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="1145141919810"
                  />
                </div>
                <div className="w-24">
                  <label className="text-xs text-muted-foreground uppercase font-bold">等级</label>
                  <input
                    type="number"
                    value={formData.doctorLevel}
                    onChange={e => setFormData({ ...formData, doctorLevel: parseInt(e.target.value) || 1 })}
                    required
                    className="w-full bg-input border border-border rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="12"
                  />
                </div>
              </div>

              <div className="flex space-x-4">
                <div className="w-1/3">
                  <label className="text-xs text-muted-foreground uppercase font-bold">服务器</label>
                  <select
                    value={formData.server}
                    onChange={e => setFormData({ ...formData, server: e.target.value })}
                    className="w-full bg-input border border-border rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                  >
                    <option value="官方服务器">官服</option>
                    <option value="哔哩哔哩服务器">B服</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground uppercase font-bold">博士昵称 (含#后缀)</label>
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={e => setFormData({ ...formData, nickname: e.target.value })}
                    required
                    className="w-full bg-input border border-border rounded p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    placeholder="PLAN#0325"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase font-bold mb-1 block text-left">自选头像记录</label>
                <div
                  onScroll={handleAvatarScroll}
                  className="grid grid-cols-5 auto-rows-min gap-4 p-2 bg-muted/30 rounded border border-border h-[111px] overflow-y-auto scrollbar-hide w-full"
                >
                  {avatarList.slice(0, avatarDisplayLimit).map((avatar, idx) => {
                    const avatarUrl = `/public/avatars/${avatar}`
                    return (
                      <div
                        key={idx}
                        onClick={() => setFormData({ ...formData, avatar: avatarUrl })}
                        className={`aspect-square w-full rounded-lg cursor-pointer border-2 transition overflow-hidden bg-background flex items-center justify-center group relative ${formData.avatar === avatarUrl ? 'border-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : 'border-transparent hover:border-border'}`}
                      >
                        <img
                          src={avatarUrl}
                          alt={avatar}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover transition group-hover:scale-110"
                        />
                        {formData.avatar === avatarUrl && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <Check className="w-6 h-6 text-primary" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {avatarDisplayLimit < avatarList.length && (
                    <div className="col-span-1 aspect-square flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Terms Spliter */}
        <div className="my-8 py-4 border-y border-border">
          <label className="flex items-center space-x-3 cursor-pointer p-4 bg-muted/50 rounded-lg border border-border hover:bg-muted transition">
            <input
              type="checkbox"
              checked={formData.agreed}
              onChange={e => setFormData({ ...formData, agreed: e.target.checked })}
              className="w-5 h-5 accent-primary"
            />
            <span className="font-medium text-sm">我同意卫了么收集额外信息用于未来的神秘项目</span>
          </label>
        </div>

        {/* Lower Section (Requires Agreement) */}
        <div className={`space-y-6 transition-all duration-500 overflow-hidden ${formData.agreed ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <h3 className="font-semibold text-lg border-l-4 border-primary pl-3">3. 额外信息收集区</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground uppercase font-bold">心理性别</label>
                {formData.psychologicalGender && (
                  <button
                    type="button"
                    onClick={() => {
                      if (genderList.length > 0) {
                        const randomGender = genderList[Math.floor(Math.random() * genderList.length)];
                        setFormData(prev => ({ ...prev, psychologicalGender: randomGender }));
                      }
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    🎲 随机!
                  </button>
                )}
              </div>
              <select
                value={formData.psychologicalGender}
                onChange={e => {
                  const value = e.target.value;
                  if (value === 'RANDOM_GENDER') {
                    if (genderList.length > 0) {
                      const randomGender = genderList[Math.floor(Math.random() * genderList.length)];
                      setFormData(prev => ({ ...prev, psychologicalGender: randomGender }));
                    }
                  } else {
                    setFormData(prev => ({ ...prev, psychologicalGender: value }));
                  }
                }}
                className="w-full bg-input border border-border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="" disabled>请选择心理性别</option>
                <option value="RANDOM_GENDER">🎲 随机一个</option>
                {genderList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold flex items-center">
                生理性别 <span className="text-destructive ml-1">*</span>
              </label>
              <select
                value={formData.biologicalGender}
                onChange={e => setFormData({ ...formData, biologicalGender: e.target.value })}
                className={`w-full bg-input border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary ${!formData.biologicalGender ? 'border-destructive/50' : 'border-border'}`}
                required
              >
                <option value="" disabled>请选择生理性别</option>
                <option value="男">男</option>
                <option value="女">女</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold flex items-center">
                出生日期 <span className="text-destructive ml-1">*</span>
              </label>
              <input
                type="date"
                value={formData.birthday}
                onChange={e => setFormData({ ...formData, birthday: e.target.value })}
                className={`w-full bg-input border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary ${!formData.birthday ? 'border-destructive/50' : 'border-border'}`}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground uppercase font-bold flex items-center">
                联系方式 <span className="text-destructive ml-1">*</span>
              </label>
              <div className="flex space-x-2">
                <select
                  value={formData.contactType}
                  onChange={e => setFormData({ ...formData, contactType: e.target.value })}
                  className="w-24 bg-input border border-border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="qq">QQ</option>
                  <option value="wechat">WeChat</option>
                </select>
                <input
                  type="text"
                  value={formData.contactValue}
                  onChange={e => setFormData({ ...formData, contactValue: e.target.value })}
                  placeholder="输入相关号码"
                  className={`flex-1 bg-input border rounded p-2 text-sm outline-none focus:ring-1 focus:ring-primary ${!formData.contactValue ? 'border-destructive/50' : 'border-border'}`}
                  required
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleRegister}
            disabled={isLoading || !formData.biologicalGender || !formData.agreed || !formData.birthday || !formData.contactValue}
            className="w-full py-4 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition shadow-lg text-lg tracking-widest uppercase mt-4 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                信息素提交中...
              </>
            ) : (
              '进入卫了么'
            )}
          </button>
        </div>
      </div>

      {/* Global Loading Mask */}
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-md flex flex-col items-center justify-center space-y-6 text-center">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xl font-medium tracking-[0.2em] animate-pulse text-primary uppercase">
              正在使用触须分辨信息素...
            </p>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-5xl w-full animate-in zoom-in-95 duration-300">
            <img
              src={cardImage || '/public/card_example.jpg'}
              alt="Preview"
              className="w-full h-auto rounded-lg shadow-2xl border border-white/10"
            />
            <button
              className="absolute -top-12 right-0 text-white hover:text-primary transition-colors text-sm font-bold uppercase tracking-widest"
              onClick={() => setShowPreview(false)}
            >
              关闭预览 [ESC]
            </button>
          </div>
        </div>
      )}
      {/* Usage Confirmation Modal */}
      {showUsageConfirm && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0a0a0c] border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-[0_0_50px_rgba(0,0,0,0.5)] space-y-6 animate-in fade-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-10">
              <Shuffle className="w-24 h-24 -mr-8 -mt-8" />
            </div>
            <div className="space-y-2 text-center relative">
              <h3 className="text-xl font-black italic tracking-tighter text-primary uppercase">Quota Verification</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">配额核对</p>
            </div>
            <p className="text-sm text-center text-muted-foreground leading-relaxed px-2">
              为了减轻服务器的压力,卫了么的名片识别有每日配额。您的设备今日剩余识别次数：<span className="text-primary font-mono font-bold text-lg ">{usageLimit}</span>
            </p>
            <div className="flex gap-4 pt-2">
              <button
                onClick={() => setShowUsageConfirm(false)}
                className="flex-1 py-3 text-xs font-bold uppercase tracking-widest hover:bg-white/5 rounded-lg transition border border-white/10 text-muted-foreground hover:text-white"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowUsageConfirm(false)
                  // File is already selected and preview is showing, user just confirms they know the quota
                }}
                className="flex-1 py-3 text-xs font-black uppercase tracking-widest bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition shadow-[0_0_20px_rgba(var(--primary-rgb),0.3)]"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Welcome Modal */}
      {showWelcome && (
        <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-[#0a0a0c] border border-white/5 rounded-3xl p-10 max-w-lg w-full shadow-[0_0_100px_rgba(0,0,0,0.8)] space-y-8 animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden border-t-primary/20">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[80px] -mr-16 -mt-16" />

            <div className="space-y-3 text-center border-b border-white/5 pb-6">
              <h2 className="text-3xl font-black italic tracking-tighter text-primary uppercase">欢迎注册卫了么</h2>
              <div className="flex items-center justify-center space-x-2">
                <div className="h-[1px] w-8 bg-primary/30" />
                <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.4em]">注册指引</p>
                <div className="h-[1px] w-8 bg-primary/30" />
              </div>
            </div>

            <div className="space-y-6 text-sm leading-relaxed">
              <div className="space-y-2">
                <p className="text-muted-foreground font-medium flex items-center">
                  <span className="w-1 h-3 bg-primary mr-2" />
                  请上传您的<span className="text-foreground font-bold px-1 underline decoration-primary/30 underline-offset-4">《明日方舟》个人名片截图</span>
                </p>
                <p className="text-[11px] text-muted-foreground/60 pl-3">系统将通过触须分辨对应信息素（OCR）为各位自动填写部分档案信息。</p>
              </div>

              <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">名片示例 // EXAMPLE</span>
                </div>
                <div
                  onClick={() => setShowPreview(true)}
                  className="relative aspect-video rounded-xl border border-white/10 bg-black/40 overflow-hidden cursor-zoom-in group shadow-inner"
                >
                  <img src="/public/card_example.jpg" alt="Example Card" className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-primary/50 shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300">
                      <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">点击查看原图</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-start space-x-4 relative group hover:bg-primary/10 transition-colors duration-300">
                <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center shrink-0 border border-primary/20">
                  <span className="text-primary text-xs font-black">!</span>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest opacity-80 underline decoration-primary/20">注意!</p>
                  <p className="text-[12px] text-muted-foreground font-medium leading-snug">
                    OCR 识别可能存在偏差或错误，识别完成后请务必仔细核对您的博士 ID 及昵称信息。
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                localStorage.setItem('weleme_welcome_suppressed', Date.now().toString())
                setShowWelcome(false)
              }}
              className="w-full py-4 bg-primary text-primary-foreground font-black rounded-xl hover:bg-primary/90 transition shadow-[0_10px_30px_rgba(var(--primary-rgb),0.3)] tracking-[0.4em] uppercase text-sm border-t border-white/20 active:translate-y-0.5"
            >
              确认
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
