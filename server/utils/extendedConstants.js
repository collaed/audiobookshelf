/**
 * Shared constants/enums for the extended features.
 * Inspired by divingclub's Enums pattern — single source of truth.
 */

const IncomingStatus = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
})

const AgentTaskType = Object.freeze({
  SCAN_INCOMING: 'scan_incoming',
  SCAN_INCOMING_AUDIO: 'scan_incoming_audio',
  AUDIO_QUALITY: 'audio_quality',
  AUDIO_IDENTIFY: 'audio_identify',
  AUDIO_DIAGNOSE: 'audio_diagnose',
  AUDIO_CLEAN: 'audio_clean',
  AUDIO_AUTO_CLEAN: 'audio_auto_clean',
  AUDIO_AUTO_CLEAN_FOLDER: 'audio_auto_clean_folder',
  FIND_DUPLICATES: 'find_duplicates',
  MOVE_FILE: 'move_file',
  DOWNLOAD_METADATA: 'download_metadata',
  DIAG: 'diag',
  UPDATE_AGENT: 'update_agent',
  IDENTIFY_BOOK: 'identify_book',
  CHECK_QUALITY: 'check_quality',
})

const VALID_AGENT_TASK_TYPES = Object.values(AgentTaskType)

const RecommendationCategory = Object.freeze({
  ALL: 'all',
  DNA_MATCH: 'dna',
  AUTHORS: 'authors',
  NARRATORS: 'narrators',
  SERIES: 'series',
  GEMS: 'gems',
})

const VALID_RECOMMENDATION_CATEGORIES = Object.values(RecommendationCategory)

const LlmProviderType = Object.freeze({
  AIROUTER: 'airouter',
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  CUSTOM: 'custom',
  DISABLED: 'disabled',
})

const SummaryStyle = Object.freeze({
  EXECUTIVE: 'executive',
  CASUAL: 'casual',
  ACADEMIC: 'academic',
})

const SummaryLength = Object.freeze({
  SHORT: 'short',
  MEDIUM: 'medium',
  LONG: 'long',
})

const ModernizeStyle = Object.freeze({
  MODERN_LITERARY: 'modern literary',
  CASUAL_READABLE: 'casual readable',
  YOUNG_ADULT: 'young adult',
  SIMPLIFIED: 'simplified',
})

const CleanProfile = Object.freeze({
  LIGHT: 'light',
  MODERATE: 'moderate',
  HEAVY: 'heavy',
  CUSTOM: 'custom',
})

const FeedSchedule = Object.freeze({
  DAILY: 'daily',
  WEEKDAYS: 'weekdays',
  WEEKLY: 'weekly',
  TWICE_WEEKLY: 'twice-weekly',
})

module.exports = {
  IncomingStatus, AgentTaskType, VALID_AGENT_TASK_TYPES,
  RecommendationCategory, VALID_RECOMMENDATION_CATEGORIES,
  LlmProviderType, SummaryStyle, SummaryLength, ModernizeStyle,
  CleanProfile, FeedSchedule,
}
