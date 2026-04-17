import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Check, Music, Loader2, Search, Shuffle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { api } from '@/lib/api'
import SparkMD5 from 'spark-md5'
import { getFingerprint } from '@/lib/fingerprint'
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "@/styles/datepicker_custom.css";
import { parse, format, isValid } from "date-fns";
import { wsService } from '../lib/websocket';

export interface RegistrationData {
  doctorId: string
  doctorLevel: number
  server: string
  nickname: string
  avatar: string
  agreed: boolean
  psychologicalGender: string
  biologicalGender: string
  birthday: string
  contactType: string
  contactValue: string
}

interface LyricLine {
  time: number
  text: string
}

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
  const [isLongLoading, setIsLongLoading] = useState(false)
  const [loadingAudio, setLoadingAudio] = useState<HTMLAudioElement | null>(null)
  const [volume, setVolume] = useState(0.3)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricText, setCurrentLyricText] = useState('')

  // OCR & Upload status
  const [ocrSuccess, setOcrSuccess] = useState(false)
  const [cardImage, setCardImage] = useState<string | null>(null)


  // Dynamic Data
  const [avatarList, setAvatarList] = useState<string[]>([])
  const [genderList, setGenderList] = useState<string[]>([])

  // Form Data
  const [formData, setFormData] = useState<RegistrationData>(() => {
    const saved = localStorage.getItem('weleme_registration_form')
    const initialData: RegistrationData = {
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
    fetch('/asset/avatars.json')
      .then(res => res.json())
      .then(data => {
        const avatars = data.avatars || []
        setAvatarList(avatars)
        if (!formData.avatar && avatars?.[0]) {
          setFormData((prev: RegistrationData) => ({ ...prev, avatar: `/asset/avatars/${avatars[0]}` }))
        }
        // 将所有头像URL存入全局缓存，供后续页面使用
        const cacheUpdates: Record<string, string> = {}
        for (const avatar of avatars) {
          const avatarUrl = `/asset/avatars/${avatar}`
          cacheUpdates[avatar] = avatarUrl
        }
        updateAvatarCache(cacheUpdates)
      })
      .catch(err => console.error('Failed to load avatars:', err))

    fetch('/asset/genders.json')
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

  // 生日转换逻辑: string (YYYY-MM-DD) <-> Date
  const getSelectedDate = () => {
    if (!formData.birthday) return null;
    const d = parse(formData.birthday, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  };

  const handleDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, birthday: format(date, 'yyyy-MM-dd') }));
    } else {
      setFormData(prev => ({ ...prev, birthday: '' }));
    }
  };

  const handleDateRawChange = (e: any) => {
    const rawValue = e?.target?.value;
    if (!rawValue) return;
    
    // 智能识别 8 位纯数字格式，如 20060909
    if (/^\d{8}$/.test(rawValue)) {
      const year = parseInt(rawValue.slice(0, 4));
      const month = parseInt(rawValue.slice(4, 6));
      const day = parseInt(rawValue.slice(6, 8));
      const date = new Date(year, month - 1, day);
      if (isValid(date) && date.getFullYear() === year) {
        handleDateChange(date);
      }
    }
  };

  // 解析 LRC 格式
  const parseLRC = (lrc: string): LyricLine[] => {
    const lines = lrc.split('\n')
    const result: LyricLine[] = []
    const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

    for (const line of lines) {
      const match = timeReg.exec(line)
      if (match) {
        const mins = parseInt(match[1])
        const secs = parseInt(match[2])
        const ms = parseInt(match[3])
        const time = mins * 60 + secs + (ms > 99 ? ms / 1000 : ms / 100)
        const text = line.replace(timeReg, '').trim()
        if (text) result.push({ time, text })
      }
    }
    return result.sort((a, b) => a.time - b.time)
  }

  // BGM 与 歌词联动控制
  useEffect(() => {
    let audio: HTMLAudioElement | null = null
    let fadeInterval: any = null

    if (isLongLoading) {
      // 1. 加载并解析歌词 (如果尚未加载)
      if (lyrics.length === 0) {
        fetch('/asset/loading.lrc')
          .then(res => res.text())
          .then(text => setLyrics(parseLRC(text)))
          .catch(e => console.warn('Failed to load lyrics:', e))
      }

      // 2. 初始化音频
      audio = new Audio('/asset/loading.mp3')
      audio.loop = true
      audio.volume = 0
      setLoadingAudio(audio)

      // 3. 歌词同步逻辑
      const onTimeUpdate = () => {
        if (!audio) return
        const curTime = audio.currentTime
        // 查找当前时间对应的歌词行
        let activeLine = ''
        for (let i = lyrics.length - 1; i >= 0; i--) {
          if (curTime >= lyrics[i].time) {
            activeLine = lyrics[i].text
            break
          }
        }
        setCurrentLyricText(activeLine)
      }

      audio.addEventListener('timeupdate', onTimeUpdate)

      // 4. 尝试播放并淡入
      audio.play().then(() => {
        let currentVol = 0
        const targetVol = volume
        fadeInterval = setInterval(() => {
          currentVol += 0.05
          if (currentVol >= targetVol) {
            audio!.volume = targetVol
            clearInterval(fadeInterval)
          } else {
            audio!.volume = currentVol
          }
        }, 50)
      }).catch(e => console.warn('BGM blocked:', e))
    }

    return () => {
      if (fadeInterval) clearInterval(fadeInterval)
      if (audio) {
        // 使用现有的 fadeOutAudio 渐渐停止音乐，提升体验感
        fadeOutAudio(audio, 1500)
        setLoadingAudio(null)
        // 歌词不要瞬间消失，可以略微留存一点点时间
        setTimeout(() => setCurrentLyricText(''), 1500)
      }
    }
  }, [isLongLoading, lyrics.length]) // 注意：由于歌词是异步加载的，长度变化时也会触发重连逻辑

  // 音量实时同步
  useEffect(() => {
    if (loadingAudio) {
      loadingAudio.volume = volume
    }
  }, [volume, loadingAudio])

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
    })
  }

  // 辅助函数：渐渐停止音乐
  const fadeOutAudio = (audio: HTMLAudioElement, duration = 1500) => {
    if (!audio) return
    const startVolume = audio.volume
    const steps = 20
    const intervalTime = duration / steps
    const volumeStep = startVolume / steps

    const timer = setInterval(() => {
      if (audio.volume > volumeStep) {
        audio.volume -= volumeStep
      } else {
        audio.volume = 0
        audio.pause()
        clearInterval(timer)
      }
    }, intervalTime)
  }

  const startOCR = async (file: File) => {
    setIsLoading(true)
    setIsLongLoading(true)

    // 创建 AbortController 用于超时控制
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('OCR timeout triggered after 30s, aborting request...')
      controller.abort()
      console.warn('OCR request timed out after 30s')
    }, 30000) // 30秒超时

    try {
      const processedFile = await processImage(file)
      setCardImage(URL.createObjectURL(processedFile))

      const urlRes = await api.get(
        `/api/ocr/upload-url?file_name=${encodeURIComponent(processedFile.name)}&content_type=${encodeURIComponent(processedFile.type)}&fingerprint=${fingerprint}`,
        { signal: controller.signal }
      )
      if (!urlRes.success || !urlRes.data) throw new Error('Failed to get upload URL')

      const { upload_url: url, key, policy, ...tosParams } = urlRes.data
      const objectKey = key // Use the key returned from backend

      const tosFormData = new FormData()
      tosFormData.append('key', key) // 'key' MUST be early in the FormData
      tosFormData.append('policy', policy)
      tosFormData.append('x-tos-algorithm', tosParams['x-tos-algorithm'])
      tosFormData.append('x-tos-credential', tosParams['x-tos-credential'])
      tosFormData.append('x-tos-date', tosParams['x-tos-date'])
      tosFormData.append('x-tos-signature', tosParams['x-tos-signature'])
      if (tosParams['x-tos-security-token']) {
        tosFormData.append('x-tos-security-token', tosParams['x-tos-security-token'])
      }
      tosFormData.append('file', processedFile) // Use processedFile, and must be last

      const uploadRes = await fetch(url, {
        method: 'POST',
        body: tosFormData,
        signal: controller.signal,
      })

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text()
        console.error('TOS upload error:', errorText)
        throw new Error(`TOS POST upload failed: ${uploadRes.status}`)
      }

      const fd = new FormData()
      fd.append('fingerprint', fingerprint)
      fd.append('object_key', objectKey)

      const result = await api.upload('/api/ocr/card', fd, { signal: controller.signal })

      if (result && result.success && result.data) {
        const data = result.data
        setFormData((prev: RegistrationData) => {
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
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('AbortError caught, displaying timeout alert...')
        alert('识别超时（30秒），请检查网络或重试')
        // 重置UI状态
        setIsLoading(false)
        setIsLongLoading(false)
        setCardImage(null)
        setOcrSuccess(false)
      } else {
        console.error('OCR failed:', err)
        alert('解析失败，请检查图像是否清晰')
      }
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
      setIsLongLoading(false)
    }
  }

  const handleUploadClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e: any) => {
      const file = e.target.files[0]
      if (file) {
        try {
          // 静默检查配额，不再触发全局 Loading 闪现
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
        
        // 使用已预热的连接，瞬间升权授权
        wsService.upgradeAuth(res.user.token)
        
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


      <div className="max-w-4xl w-full bg-card rounded-xl p-8 border border-border shadow-xl relative overflow-hidden transition-all duration-300">



        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">欢迎新博士的加入</h1>
          <p className="text-muted-foreground">请上传个人名片并完成注册喵</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card Upload Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">1. 个人名片上传区</h3>
              <div className="flex items-center space-x-2 bg-muted/30 px-3 py-1.5 rounded-full border border-border">
                <Music className="w-3 h-3 text-primary" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-16 h-1 accent-primary cursor-pointer"
                  title="识别语音音量调节"
                />
                <span className="text-[10px] font-mono w-6 text-muted-foreground">{Math.round(volume * 100)}%</span>
              </div>
            </div>

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
                  <label className="text-xs text-muted-foreground uppercase font-bold flex items-center">
                    博士ID <span className="text-destructive ml-1">*</span>
                  </label>
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
                  <label className="text-xs text-muted-foreground uppercase font-bold flex items-center">
                    博士昵称 (含#后缀) <span className="text-destructive ml-1">*</span>
                  </label>
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
                    const avatarUrl = `/asset/avatars/${avatar}`
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
              className="w-5 h-5 accent-blue-500"
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
                        setFormData((prev: RegistrationData) => ({ ...prev, psychologicalGender: randomGender }));
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
                      setFormData((prev: RegistrationData) => ({ ...prev, psychologicalGender: randomGender }));
                    }
                  } else {
                    setFormData((prev: RegistrationData) => ({ ...prev, psychologicalGender: value }));
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
              <DatePicker
                selected={getSelectedDate()}
                onChange={handleDateChange}
                onChangeRaw={handleDateRawChange}
                dateFormat="yyyy/MM/dd"
                placeholderText="YYYY/MM/DD"
                showYearDropdown
                scrollableYearDropdown
                yearDropdownItemNumber={100}
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
            <div className="space-y-6 flex flex-col items-center">
              <img
                src="/asset/loading.gif"
                alt="Loading..."
                className="w-48 h-auto rounded-lg shadow-2xl border border-primary/20 animate-in zoom-in-95 duration-500"
              />
              <div className="space-y-1">
                <p className="text-xl font-black tracking-[0.2em] text-primary uppercase animate-pulse">
                  正在使用触须分辨信息素...
                </p>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                  DECODING PHEROMONES // DOCTOR RECOGNITION
                </p>
              </div>

              {/* 加载中的音量调节 */}
              <div className="flex items-center space-x-3 bg-black/40 px-4 py-2 rounded-full border border-white/10 mt-4 backdrop-blur-sm">
                <Music className="w-4 h-4 text-primary" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    setVolume(v)
                    if (loadingAudio) loadingAudio.volume = v
                  }}
                  className="w-32 h-1 accent-primary cursor-pointer"
                />
                <span className="text-xs font-mono w-8 text-primary/80">{Math.round(volume * 100)}%</span>
              </div>

              {/* 歌词轨道 */}
              <div className="h-8 flex items-center justify-center overflow-hidden">
                <p className="text-sm font-bold text-white/90 italic tracking-wider animate-in slide-in-from-bottom-2 duration-500 key={currentLyricText}">
                  {currentLyricText || '// 正在同步频率...'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug Controls (Temporary) */}
      {/* <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 opacity-20 hover:opacity-100 transition-opacity">
        <button 
          onClick={() => {
            setIsLoading(!isLoading)
            setIsLongLoading(!isLongLoading)
          }}
          className="bg-black/80 text-[10px] text-white px-3 py-1 rounded border border-white/20 whitespace-nowrap"
        >
          {isLoading ? '关闭' : '开启'} 调试遮罩
        </button>
      </div> */}

      {/* Image Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-5xl w-full animate-in zoom-in-95 duration-300">
            <img
              src={cardImage || '/asset/card_example.jpg'}
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
                  handleVerifyAndStart()
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
          <div className="bg-[#0a0a0c] border border-white/5 rounded-3xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-hide shadow-[0_0_100px_rgba(0,0,0,0.8)] space-y-8 animate-in fade-in zoom-in-95 duration-300 relative border-t-primary/20">
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
                  <img src="/asset/card_example.jpg" alt="Example Card" className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-700 group-hover:scale-105" />
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

      {/* Gemini Footer */}
      <div className="mt-auto pt-8 pb-4 w-full text-center">
        <p className="text-[10px] text-muted-foreground/30 font-black uppercase tracking-[0.4em]">
          Powered By <span className="text-primary/50">Gemini</span>
        </p>
      </div>
    </div>
  )
}
