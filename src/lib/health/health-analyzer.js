/**
 * Health analysis module for extracting health information from voice recordings
 * Analyzes voice patterns, speech content, and linguistic markers to infer health status
 */

export class HealthAnalyzer {
  constructor() {
    this.healthKeywords = {
      // Symptoms and sensations
      pain: ['疼', '痛', '酸', '麻', '胀', '不适', '难受', '痒'],
      fatigue: ['累', '乏力', '没力', '倦怠', '困', '瞌睡', '嗜睡', '无精打采'],
      appetite: ['饿', '不饿', '没胃口', '不想吃', '厌食', '暴食', '食欲'],
      sleep: ['失眠', '多梦', '浅睡', '早醒', '睡不着', '做梦多', '睡眠质量'],
      digestion: ['胃', '肠', '消化', '便秘', '腹泻', '胀气', '打嗝', '反酸'],
      respiratory: ['咳', '痰', '喘', '胸闷', '气短', '呼吸', '鼻塞', '流泪'],
      cardiovascular: ['心悸', '胸痛', '血压', '头晕', '心跳快', '心慌'],
      neurological: ['头痛', '头晕', '记忆', '健忘', '反应慢', '注意力'],
      emotional: ['焦虑', '抑郁', '烦躁', '易怒', '敏感', '情绪', '压力', '紧张']
    };

    this.voicePatternIndicators = {
      // Speech rate indicators (words per minute approximate)
      slow: { min: 80, max: 120, possibleMeanings: ['疲劳', '抑郁', '帕金森', '用药副作用'] },
      normal: { min: 120, max: 180, possibleMeanings: ['正常'] },
      fast: { min: 180, max: 250, possibleMeanings: ['焦虑', '躁狂', '兴奋', '咖啡因'] },
      veryFast: { min: 250, max: 350, possibleMeanings: ['躁狂状态', '兴奋剂', '甲状腺功能亢进'] }
    };

    // Health score tracking (0-100 scale)
    this.healthScores = {
      overall: 80, // Start with good health assumption
      physical: 80,
      mental: 80,
      sleep: 80,
      energy: 80
    };
  }

  /**
   * Analyze transcribed text for health indicators
   * @param {string} text - Transcribed speech text
   * @param {Object} voiceMetrics - Optional voice characteristics (rate, pitch, volume, etc.)
   * @returns {Object} Health analysis results
   */
  analyzeHealthFromText(text, voiceMetrics = {}) {
    if (!text || typeof text !== 'string') {
      return { error: 'Invalid text input' };
    }

    const analysis = {
      timestamp: new Date().toISOString(),
      textLength: text.length,
      detectedSymptoms: {},
      keywordCounts: {},
      healthSignals: [],
      riskLevel: 'low',
      recommendations: [],
      voiceAnalysis: voiceMetrics || {}
    };

    // Convert to lowercase for matching
    const lowerText = text.toLowerCase();

    // Analyze each health category
    Object.entries(this.healthKeywords).forEach(([category, keywords]) => {
      const matches = keywords.filter(keyword => lowerText.includes(keyword));
      if (matches.length > 0) {
        analysis.detectedSymptoms[category] = matches;
        analysis.keywordCounts[category] = matches.length;
        
        // Add to health signals
        matches.forEach(keyword => {
          analysis.healthSignals.push({
            category,
            keyword,
            context: this.extractContext(text, keyword),
            severity: this.assessKeywordSeverity(keyword, category)
          });
        });
      }
    });

    // Analyze voice patterns if metrics provided
    if (voiceMetrics && voiceMetrics.speechRate) {
      analysis.voiceAnalysis.pattern = this.analyzeVoicePattern(voiceMetrics.speechRate);
    }

    // Calculate health scores
    analysis.healthScores = this.calculateHealthScores(analysis);
    
    // Determine risk level
    analysis.riskLevel = this.determineRiskLevel(analysis.healthScores);
    
    // Generate recommendations
    analysis.recommendations = this.generateRecommendations(analysis);

    return analysis;
  }

  /**
   * Extract context around a keyword for better understanding
   * @param {string} text - Full text
   * @param {string} keyword - Keyword to find context for
   * @returns {string} Context snippet
   */
  extractContext(text, keyword) {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index === -1) return '';
    
    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + keyword.length + 20);
    return text.substring(start, end).trim();
  }

  /**
   * Assess severity of a keyword based on medical knowledge
   * @param {string} keyword - The symptom keyword
   * @param {string} category - Health category
   * @returns {string} Severity level: low, medium, high
   */
  assessKeywordSeverity(keyword, category) {
    const highSeverityKeywords = [
      '胸痛', '呼吸困难', '严重疼痛', '呕血', '便血', '意识不清',
      '胸闷', '心悸严重', '说话困难', '面部不对称', '肢体无力'
    ];
    
    const mediumSeverityKeywords = [
      '发热', '持续咳嗽', '剧烈头痛', '持续腹泻', '持续便秘',
      '食欲不振', '失眠多日', '情绪低落', '焦虑感强'
    ];

    if (highSeverityKeywords.includes(keyword)) return 'high';
    if (mediumSeverityKeywords.includes(keyword)) return 'medium';
    return 'low';
  }

  /**
   * Analyze voice pattern based on speech rate
   * @param {number} speechRate - Words per minute
   * @returns {Object} Voice pattern analysis
   */
  analyzeVoicePattern(speechRate) {
    for (const [pattern, range] of Object.entries(this.voicePatternIndicators)) {
      if (speechRate >= range.min && speechRate <= range.max) {
        return {
          pattern,
          rate: speechRate,
          possibleMeanings: range.possibleMeanings,
          normal: pattern === 'normal'
        };
      }
    }
    
    return {
      pattern: 'unknown',
      rate: speechRate,
      possibleMeanings: ['语速异常'],
      normal: false
    };
  }

  /**
   * Calculate health scores based on detected symptoms
   * @param {Object} analysis - Health analysis results
   * @returns {Object} Health scores (0-100)
   */
  calculateHealthScores(analysis) {
    const scores = { ...this.healthScores }; // Start with baseline
    
    // Penalize based on detected symptoms
    const symptomPenalties = {
      pain: 15,
      fatigue: 12,
      appetite: 10,
      sleep: 18,
      digestion: 12,
      respiratory: 15,
      cardiovascular: 20,
      neurological: 10,
      emotional: 15
    };

    Object.entries(analysis.detectedSymptoms).forEach(([category, symptoms]) => {
      const penalty = symptomPenalties[category] || 10;
      const severityFactor = Math.min(symptoms.length / 3, 1); // Cap at 3 symptoms for full penalty
      const penaltyAmount = penalty * severityFactor;
      
      // Map categories to score types
      const scoreMap = {
        pain: 'physical',
        fatigue: 'energy',
        appetite: 'physical',
        sleep: 'sleep',
        digestion: 'physical',
        respiratory: 'physical',
        cardiovascular: 'physical',
        neurological: 'mental',
        emotional: 'mental'
      };
      
      const scoreType = scoreMap[category] || 'overall';
      scores[scoreType] = Math.max(0, scores[scoreType] - penaltyAmount);
    });

    // Overall score is average of key dimensions
    scores.overall = Math.round(
      (scores.physical + scores.mental + scores.sleep + scores.energy) / 4
    );

    return scores;
  }

  /**
   * Determine risk level based on health scores
   * @param {Object} scores - Health scores
   * @returns {string} Risk level: low, medium, high, critical
   */
  determineRiskLevel(scores) {
    const minScore = Math.min(
      scores.physical,
      scores.mental,
      scores.sleep,
      scores.energy
    );

    if (minScore >= 70) return 'low';
    if (minScore >= 50) return 'medium';
    if (minScore >= 30) return 'high';
    return 'critical';
  }

  /**
   * Generate health recommendations based on analysis
   * @param {Object} analysis - Health analysis results
   * @returns {Array} Recommendations
   */
  generateRecommendations(analysis) {
    const recommendations = [];
    
    // General recommendations based on detected issues
    if (analysis.detectedSymptoms.fatigue && analysis.detectedSymptoms.fatigue.length > 0) {
      recommendations.push('建议保证充足睡眠，避免过度劳累');
      recommendations.push('可适当进行轻度运动如散步、太极');
    }
    
    if (analysis.detectedSymptoms.sleep && analysis.detectedSymptoms.sleep.length > 0) {
      recommendations.push('建议固定作息时间，睡前避免使用电子设备');
      recommendations.push('可尝试放松技巧如深呼吸、冥想助眠');
    }
    
    if (analysis.detectedSymptoms.emotional && analysis.detectedSymptoms.emotional.length > 0) {
      recommendations.push('如持续感到焦虑或抑郁，建议寻求专业心理咨询');
      recommendations.push('可通过写日记、与朋友倾诉来缓解情绪压力');
    }
    
    if (analysis.detectedSymptoms.respiratory && analysis.detectedSymptoms.respiratory.length > 0) {
      recommendations.push('注意室内空气流通，避免吸入刺激性气体');
      recommendations.push('如有持续咳嗽或呼吸困难，及时就医检查');
    }
    
    if (analysis.detectedSymptoms.cardiovascular && analysis.detectedSymptoms.cardiovascular.length > 0) {
      recommendations.push('建议定期监测血压和心率');
      recommendations.push('如出现胸痛、心悸等症状，应及时就医');
    }
    
    // Voice pattern recommendations
    if (analysis.voiceAnalysis.pattern && 
        analysis.voiceAnalysis.pattern !== 'normal' && 
        analysis.voiceAnalysis.pattern !== 'unknown') {
      recommendations.push(`语音特征提示可能存在${analysis.voiceAnalysis.pattern}相关状态，建议关注休息情况`);
    }
    
    // Add general wellness advice if no specific issues
    if (recommendations.length === 0 && analysis.riskLevel === 'low') {
      recommendations.push('身体状况良好，请继续保持健康生活方式');
      recommendations.push('建议定期进行体检，关注饮食均衡和适量运动');
    }

    return recommendations;
  }

  /**
   * Store health data for longitudinal tracking
   * @param {Object} analysis - Health analysis to store
   */
  storeHealthData(analysis) {
    try {
      const storedData = JSON.parse(localStorage.getItem('xiaomanHealthData') || '[]');
      storedData.push(analysis);
      
      // Keep only last 30 entries to prevent excessive storage
      if (storedData.length > 30) {
        storedData.shift();
      }
      
      localStorage.setItem('xiaomanHealthData', JSON.stringify(storedData));
      return true;
    } catch (error) {
      console.error('Failed to store health data:', error);
      return false;
    }
  }

  /**
   * Get historical health trends
   * @returns {Array} Historical health data
   */
  getHealthHistory() {
    try {
      return JSON.parse(localStorage.getItem('xiaomanHealthData') || '[]');
    } catch (error) {
      console.error('Failed to retrieve health data:', error);
      return [];
    }
  }

  /**
   * Generate health summary report
   * @returns {Object} Summary of health trends
   */
  generateHealthSummary() {
    const history = this.getHealthHistory();
    if (history.length === 0) {
      return { message: '暂无健康数据历史' };
    }

    const recent = history.slice(-7); // Last week
    const trends = {
      overall: this.calculateTrend(recent.map(h => h.healthScores.overall)),
      physical: this.calculateTrend(recent.map(h => h.healthScores.physical)),
      mental: this.calculateTrend(recent.map(h => h.healthScores.mental)),
      sleep: this.calculateTrend(recent.map(h => h.healthScores.sleep)),
      energy: this.calculateTrend(recent.map(h => h.healthScores.energy))
    };

    return {
      period: `最近${recent.length}天`,
      totalRecords: history.length,
      latestScore: history[history.length - 1].healthScores.overall,
      trends,
      mostCommonIssues: this.getMostCommonIssues(history),
      recommendations: this.generateSummaryRecommendations(trends)
    };
  }

  /**
   * Calculate trend from a series of scores
   * @param {number[]} scores - Array of scores over time
   * @returns {string} Trend: improving, stable, declining
   */
  calculateTrend(scores) {
    if (scores.length < 2) return 'insufficient data';
    
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  /**
   * Get most common health issues from history
   * @param {Array} history - Health analysis history
   * @returns {Array} Most common issues
   */
  getMostCommonIssues(history) {
    const issueCounts = {};
    
    history.forEach(entry => {
      Object.keys(entry.detectedSymptoms || {}).forEach(category => {
        const count = entry.detectedSymptoms[category]?.length || 0;
        issueCounts[category] = (issueCounts[category] || 0) + count;
      });
    });
    
    return Object.entries(issueCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([category]) => category);
  }

  /**
   * Generate summary recommendations based on trends
   * @param {Object} trends - Health trend data
   * @returns {Array} Recommendations
   */
  generateSummaryRecommendations(trends) {
    const recommendations = [];
    
    Object.entries(trends).forEach(([category, trend]) => {
      if (trend === 'declining') {
        recommendations.push(`注意${category}健康呈下降趋势，建议加强关注和调理`);
      } else if (trend === 'improving') {
        recommendations.push(`${category}健康状况有所改善，请继续保持`);
      }
    });
    
    return recommendations;
  }
}

// Export singleton instance
export const healthAnalyzer = new HealthAnalyzer();