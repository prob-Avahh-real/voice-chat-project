import Voice from './plugins/voice/index.js'
import { createVoiceBridge } from './lib/voice-engines.js'
import { healthAnalyzer } from './lib/health/health-analyzer.js'

const bridge = createVoiceBridge({
  env: typeof window !== 'undefined' ? window : {},
  nativeApi: Voice,
  windowObj: typeof window !== 'undefined' ? window : {},
})

// Health analysis integration
let healthAnalysisEnabled = false
let lastHealthAnalysis = null
let voiceRecordingBuffer = [] // Buffer to accumulate voice data for analysis
const MAX_BUFFER_SIZE = 5 // Keep last 5 voice recordings for analysis

// Extended bridge with health capabilities
const extendedBridge = {
  ...bridge,
  
  // Enable/disable health analysis
  setHealthAnalysisEnabled(enabled) {
    healthAnalysisEnabled = !!enabled
    if (healthAnalysisEnabled) {
      console.log('Health analysis enabled')
    } else {
      console.log('Health analysis disabled')
    }
  },
  
  // Get current health analysis status
  getHealthAnalysisStatus() {
    return {
      enabled: healthAnalysisEnabled,
      lastAnalysis: lastHealthAnalysis,
      bufferSize: voiceRecordingBuffer.length
    }
  },
  
  // Analyze voice recording for health indicators
  async analyzeVoiceForHealth(text, voiceMetrics = {}) {
    if (!healthAnalysisEnabled || !text) {
      return null
    }
    
    try {
      // Perform health analysis
      const analysis = healthAnalyzer.analyzeHealthFromText(text, voiceMetrics)
      
      // Store in buffer
      voiceRecordingBuffer.push({
        timestamp: new Date().toISOString(),
        text: text.substring(0, 100), // Store truncated text for privacy
        analysis: analysis
      })
      
      // Keep buffer size limited
      if (voiceRecordingBuffer.length > MAX_BUFFER_SIZE) {
        voiceRecordingBuffer.shift()
      }
      
      // Store last analysis
      lastHealthAnalysis = analysis
      
      // Persist to localStorage for longitudinal tracking
      healthAnalyzer.storeHealthData(analysis)
      
      return analysis
    } catch (error) {
      console.error('Health analysis failed:', error)
      return { error: 'Health analysis failed' }
    }
  },
  
  // Get health history and trends
  getHealthHistory() {
    return healthAnalyzer.getHealthHistory()
  },
  
  getHealthSummary() {
    return healthAnalyzer.generateHealthSummary()
  },
  
  // Clear health data
  clearHealthData() {
    try {
      localStorage.removeItem('xiaomanHealthData')
      voiceRecordingBuffer = []
      lastHealthAnalysis = null
      console.log('Health data cleared')
      return true
    } catch (error) {
      console.error('Failed to clear health data:', error)
      return false
    }
  }
}

if (typeof window !== 'undefined') {
  window.XiaoManVoice = extendedBridge;
  // Also expose health analyzer for direct access if needed
  window.XiaoManHealth = healthAnalyzer;
}

export default extendedBridge;