/**
 * 浏览器语音识别 Hook（免费，无需 API Key）
 * Chrome/Edge 支持，Firefox 不支持
 */
import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function useSpeechRecognition(lang: string = 'zh-CN') {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<any>(null)
  const callbackRef = useRef<((text: string) => void) | null>(null)

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setSupported(!!SR)
  }, [])

  const start = useCallback((onResult: (text: string) => void) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    callbackRef.current = onResult
    const rec = new SR()
    rec.lang = lang
    rec.interimResults = false
    rec.continuous = false
    rec.maxAlternatives = 1

    rec.onresult = (e: any) => {
      const text = e.results[0]?.[0]?.transcript || ''
      if (text.trim()) onResult(text.trim())
    }

    rec.onerror = (e: any) => {
      console.warn('[SpeechRecognition] error:', e.error)
      setListening(false)
    }

    rec.onend = () => setListening(false)

    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }, [lang])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, supported, start, stop }
}
