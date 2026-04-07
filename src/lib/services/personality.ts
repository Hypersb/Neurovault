// ============================================================
// Personality Modeling Engine
// ============================================================
import { generateCompletion } from '@/lib/ai/openai'
import { updateBrain } from './brain'
import { logger } from '@/lib/utils/logger'
import type { PersonalityProfile } from '@/types'

// ─── Personality Analysis ─────────────────────────────────────
export async function analyzePersonality(
  corpusText: string,
  brainId: string
): Promise<PersonalityProfile> {
  logger.info('Analyzing personality from corpus', {
    brainId,
    corpusLength: corpusText.length,
  })

  const sample = corpusText.slice(0, 8000)

  const { content } = await generateCompletion([
    {
      role: 'system',
      content: `You are a linguistic analyst specializing in personality and communication style modeling.
Analyze the provided text sample and return a JSON personality profile.
Return ONLY valid JSON with no extra text.`,
    },
    {
      role: 'user',
      content: `Analyze this text and return a JSON personality profile:

${sample}

Return this exact JSON structure:
{
  "tone": "formal|casual|academic|conversational|technical",
  "formalityLevel": 0.7,
  "vocabularyComplexity": 0.6,
  "sentenceComplexity": 0.5,
  "emotionalBaseline": "neutral|warm|analytical|empathetic",
  "teachingStyle": "socratic|direct|examples-first|theoretical",
  "domainExpertise": ["domain1", "domain2"],
  "communicationPatterns": ["pattern1", "pattern2", "pattern3"]
}

Scores are 0.0 to 1.0. Be precise and analytical.`,
    },
  ])

  let profile: PersonalityProfile

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])

    profile = {
      tone: parsed.tone ?? 'conversational',
      formalityLevel: clamp(parsed.formalityLevel ?? 0.5),
      vocabularyComplexity: clamp(parsed.vocabularyComplexity ?? 0.5),
      sentenceComplexity: clamp(parsed.sentenceComplexity ?? 0.5),
      emotionalBaseline: parsed.emotionalBaseline ?? 'neutral',
      teachingStyle: parsed.teachingStyle ?? 'direct',
      domainExpertise: Array.isArray(parsed.domainExpertise)
        ? parsed.domainExpertise.slice(0, 10)
        : [],
      communicationPatterns: Array.isArray(parsed.communicationPatterns)
        ? parsed.communicationPatterns.slice(0, 5)
        : [],
      updatedAt: new Date().toISOString(),
    }
  } catch (err) {
    logger.error('Failed to parse personality profile', { error: String(err) })
    profile = getDefaultProfile()
  }

  // Persist to brain
  await updateBrain(brainId, { personalityProfile: profile })

  return profile
}

// ─── Merge profiles (when new corpus added) ───────────────────
export function mergePersonalityProfiles(
  existing: PersonalityProfile,
  incoming: PersonalityProfile,
  weight = 0.3 // weight given to new data
): PersonalityProfile {
  const w = weight
  const ow = 1 - w

  return {
    tone: w > 0.5 ? incoming.tone : existing.tone,
    formalityLevel: existing.formalityLevel * ow + incoming.formalityLevel * w,
    vocabularyComplexity:
      existing.vocabularyComplexity * ow + incoming.vocabularyComplexity * w,
    sentenceComplexity:
      existing.sentenceComplexity * ow + incoming.sentenceComplexity * w,
    emotionalBaseline:
      w > 0.5 ? incoming.emotionalBaseline : existing.emotionalBaseline,
    teachingStyle: w > 0.5 ? incoming.teachingStyle : existing.teachingStyle,
    domainExpertise: Array.from(
      new Set([...existing.domainExpertise, ...incoming.domainExpertise])
    ).slice(0, 15),
    communicationPatterns: Array.from(
      new Set([...existing.communicationPatterns, ...incoming.communicationPatterns])
    ).slice(0, 8),
    updatedAt: new Date().toISOString(),
  }
}

// ─── Build System Prompt ──────────────────────────────────────
export function buildPersonalitySystemPrompt(profile: PersonalityProfile): string {
  const formalityDesc =
    profile.formalityLevel > 0.7
      ? 'highly formal'
      : profile.formalityLevel > 0.4
      ? 'moderately formal'
      : 'casual and relaxed'

  const complexityDesc =
    profile.vocabularyComplexity > 0.7
      ? 'sophisticated vocabulary'
      : profile.vocabularyComplexity > 0.4
      ? 'clear, accessible vocabulary'
      : 'simple, everyday language'

  return `You are responding with a specific personality profile:
- Communication tone: ${profile.tone}
- Formality: ${formalityDesc}
- Language style: ${complexityDesc}
- Emotional baseline: ${profile.emotionalBaseline}
- Teaching approach: ${profile.teachingStyle}
- Areas of expertise: ${profile.domainExpertise.join(', ') || 'general knowledge'}
- Key communication patterns: ${profile.communicationPatterns.join('; ') || 'adaptive'}

Maintain this personality consistently throughout the conversation.`
}

// ─── Helpers ──────────────────────────────────────────────────
function clamp(val: number): number {
  return Math.min(1, Math.max(0, val))
}

function getDefaultProfile(): PersonalityProfile {
  return {
    tone: 'conversational',
    formalityLevel: 0.5,
    vocabularyComplexity: 0.5,
    sentenceComplexity: 0.5,
    emotionalBaseline: 'neutral',
    teachingStyle: 'direct',
    domainExpertise: [],
    communicationPatterns: [],
    updatedAt: new Date().toISOString(),
  }
}
