/**
 * 数字人教师组件
 * - 大尺寸 SVG 教师形象 + 旋转光环
 * - 待机：呼吸缩放 + 光环慢转
 * - 朗读：脉冲发光 + 光环加速 + 声波纹扩散 + 底部音律条跳动
 * - 优先使用讯飞 TTS，不可用时回退浏览器语音
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSparkTTS } from '@/components/digital-human/useSparkTTS'

interface DigitalHumanProps { text: string; concept?: string; className?: string }

function MouthBars({ active }: { active: boolean }) {
  const bars = [0, 1, 2, 3, 4, 5, 6]
  return (
    <div className="flex items-end justify-center gap-1.5 h-8">
      {bars.map((i) => (
        <motion.span key={i} className="block w-[6px] rounded-full bg-gradient-to-t from-amber-500 to-yellow-300"
          animate={active ? { height: [4, 8 + i * 3, 14 + i * 2, 6, 16 + i * 2, 4], opacity: [0.5, 1, 0.8, 1, 0.6, 0.5] } : { height: 3, opacity: 0.3 }}
          transition={active ? { duration: 0.55 + i * 0.07, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut', delay: i * 0.05 } : { duration: 0.3 }} />
      ))}
    </div>
  )
}

function SoundRings({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ width: 200, height: 200, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
      {[1, 2, 3].map((i) => (
        <motion.div key={i} className="absolute rounded-full border-2 border-amber-400/50"
          animate={active ? { width: [100, 180 + i * 20, 100], height: [100, 180 + i * 20, 100], opacity: [0.5, 0, 0.5] } : { width: 100, height: 100, opacity: 0 }}
          transition={active ? { duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' } : { duration: 0.5 }} />
      ))}
    </div>
  )
}

export function DigitalHuman({ text, concept, className }: DigitalHumanProps) {
  const { speaking, sparkAvailable, speak: ttsSpeak, stop: ttsStop } = useSparkTTS()
  const [rate, setRate] = useState(1)
  // 界面倍速 → API speed (0-100)
  const toApiSpeed = (r: number) => r === 0.5 ? 25 : r === 2 ? 100 : 50

  const handleSpeak = () => {
    if (speaking) { ttsStop(); return }
    ttsSpeak(text, toApiSpeed(rate))
  }

  const handleRateChange = (r: number) => {
    setRate(r)
    if (speaking) { ttsStop(); setTimeout(() => ttsSpeak(text, toApiSpeed(r)), 150) }
  }

  return (
    <div className={cn('flex flex-col items-center py-4', className)}>
      {/* TTS 来源标记 */}
      <div className="mb-2 text-[10px] text-slate-400">
        {sparkAvailable === null ? '' : sparkAvailable ? '讯飞超拟人 TTS' : '浏览器语音（可配置讯飞 TTS 提升音质）'}
      </div>

      {/* 形象区 */}
      <div className="relative mb-6" style={{ width: 200, height: 200 }}>
        <SoundRings active={speaking} />
        <motion.div className="absolute inset-0 flex items-center justify-center rounded-full"
          style={{ background: 'radial-gradient(circle at 40% 35%, #fef3c7 0%, #fde68a 40%, #fbbf24 100%)' }}
          animate={speaking ? { scale: [1, 1.06, 0.98, 1.04, 1], boxShadow: ['0 0 20px rgba(251,191,36,0.3)', '0 0 50px rgba(251,191,36,0.6)', '0 0 30px rgba(251,191,36,0.4)', '0 0 55px rgba(251,191,36,0.5)', '0 0 20px rgba(251,191,36,0.3)'] } : { scale: [1, 1.02, 1], boxShadow: '0 0 15px rgba(251,191,36,0.15)' }}
          transition={speaking ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}>
          <motion.div className="absolute rounded-full" style={{ width: 210, height: 210, border: '3px solid transparent', borderTopColor: 'rgba(251,191,36,0.5)', borderRightColor: 'rgba(245,158,11,0.3)' }}
            animate={{ rotate: 360 }} transition={{ duration: speaking ? 2 : 10, repeat: Infinity, ease: 'linear' }} />
          <motion.div className="absolute rounded-full" style={{ width: 220, height: 220, border: '2px solid transparent', borderBottomColor: 'rgba(168,85,247,0.35)', borderLeftColor: 'rgba(139,92,246,0.2)' }}
            animate={{ rotate: -360 }} transition={{ duration: speaking ? 3.5 : 14, repeat: Infinity, ease: 'linear' }} />
          <svg viewBox="0 0 120 120" className="w-[130px] h-[130px]" fill="none">
            <circle cx="60" cy="42" r="24" fill="url(#skin)" stroke="#d4a853" strokeWidth="1.5" />
            <path d="M36 35 Q36 18 60 18 Q84 18 84 35 Q84 28 60 28 Q36 28 36 35Z" fill="#5c4033" />
            <rect x="48" y="36" width="10" height="6" rx="2" fill="none" stroke="#4a3728" strokeWidth="1.2" />
            <rect x="62" y="36" width="10" height="6" rx="2" fill="none" stroke="#4a3728" strokeWidth="1.2" />
            <line x1="58" y1="39" x2="62" y2="39" stroke="#4a3728" strokeWidth="1" />
            <circle cx="53" cy="39" r="1.8" fill="#1e293b" /><circle cx="67" cy="39" r="1.8" fill="#1e293b" />
            <motion.path d={speaking ? "M52 51 Q60 58 68 51" : "M54 50 Q60 54 66 50"} stroke="#c2410c" strokeWidth="1.2" fill="none" strokeLinecap="round"
              animate={speaking ? { d: "M52 51 Q60 58 68 51" } : { d: "M54 50 Q60 54 66 50" }} transition={{ duration: 0.3 }} />
            <path d="M42 70 L42 95 Q42 105 60 105 Q78 105 78 95 L78 70" fill="url(#shirt)" stroke="#6366f1" strokeWidth="1.5" />
            <path d="M55 70 L60 80 L65 70" fill="#4f46e5" stroke="#4338ca" strokeWidth="0.8" />
            <path d="M57 80 L60 98 L63 80" fill="#4f46e5" />
            <path d="M42 74 Q30 82 28 96" stroke="url(#skin)" strokeWidth="10" strokeLinecap="round" fill="none" />
            <path d="M78 74 Q90 78 94 68" stroke="url(#skin)" strokeWidth="10" strokeLinecap="round" fill="none" />
            <line x1="92" y1="72" x2="102" y2="52" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
            <defs>
              <radialGradient id="skin" cx="40%" cy="35%"><stop stopColor="#fef7ed" /><stop offset="100%" stopColor="#f5d0a9" /></radialGradient>
              <linearGradient id="shirt" x1="42" y1="70" x2="78" y2="105"><stop stopColor="#e0e7ff" /><stop offset="100%" stopColor="#a5b4fc" /></linearGradient>
            </defs>
          </svg>
        </motion.div>
      </div>

      <div className="-mt-2 mb-3"><MouthBars active={speaking} /></div>

      <motion.div className="mb-4 text-sm font-bold" animate={{ color: speaking ? '#059669' : '#94a3b8' }}>
        {speaking ? '正在讲解...' : '点击按钮开始'}
      </motion.div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" className={cn('h-10 gap-1.5 rounded-xl text-sm font-bold min-w-[120px] transition-all', speaking ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/30' : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/30')}
          onClick={handleSpeak}>
          {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          {speaking ? '停止' : '朗读讲解'}
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
        {[0.5, 1, 2].map((r) => (
          <button key={r} onClick={() => handleRateChange(r)}
            className={cn('rounded-md px-3 py-1 text-xs font-bold transition-all', rate === r ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-slate-100')}>{r}x</button>
        ))}
      </div>

      {concept && <p className="mt-3 text-xs text-slate-400">讲解知识点：<span className="font-bold text-slate-600">{concept}</span></p>}
    </div>
  )
}
