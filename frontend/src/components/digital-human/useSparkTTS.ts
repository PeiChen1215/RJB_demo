/**
 * 讯飞 TTS Hook
 * - 优先使用后端讯飞超拟人 TTS（需配置 SPARK_TTS_* 凭证）
 * - 若后端不可用或出错，自动回退到浏览器 SpeechSynthesis
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ttsApi } from '@/services/api'

export function useSparkTTS() {
  const [speaking, setSpeaking] = useState(false)
  const [sparkAvailable, setSparkAvailable] = useState<boolean | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 检测 TTS 服务是否可用
  useEffect(() => {
    ttsApi.status().then((r) => setSparkAvailable(r.data.tts_available)).catch(() => setSparkAvailable(false))
  }, [])

  // 清理
  useEffect(() => {
    const a = audioRef.current
    return () => {
      a?.pause()
      window.speechSynthesis?.cancel()
    }
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback(async (text: string, speed: number = 50) => {
    if (!text) return
    stop()

    // 优先尝试后端 TTS
    if (sparkAvailable) {
      try {
        const res = await ttsApi.synthesize(text, speed)
        const blob = res.data as Blob
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url) }
        audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url) }
        await audio.play()
        setSpeaking(true)
        return
      } catch {
        // 回退到浏览器 TTS
      }
    }

    // 浏览器 TTS 回退
    const synth = window.speechSynthesis
    if (!synth) return
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    // 讯飞 speed 50 → 浏览器 rate 1.0，映射关系
    utter.rate = speed / 50
    utter.pitch = 1
    utter.volume = 1
    const voices = synth.getVoices()
    const zh = voices.find((v) => v.lang.startsWith('zh'))
    if (zh) utter.voice = zh
    utter.onend = () => setSpeaking(false)
    utter.onerror = () => setSpeaking(false)
    synth.speak(utter)
    setSpeaking(true)
  }, [sparkAvailable, stop])

  return { speaking, sparkAvailable, speak, stop }
}
