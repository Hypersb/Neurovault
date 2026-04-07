// ============================================================
// Knowledge Graph Service
// ============================================================
import { db } from '@/lib/db'
import { concepts, relationships } from '@/lib/db/schema'
import { generateCompletion } from '@/lib/ai/openai'
import { logger } from '@/lib/utils/logger'
import { eq, and } from 'drizzle-orm'
import { tokenizeForSearch } from './retrieval'
import type { Concept, KnowledgeGraph } from '@/types'

export interface RelevantKnowledge {
  concepts: Array<{
    id: string
    name: string
    description: string | null
    domain: string | null
    importanceScore: number
  }>
  relationships: Array<{
    sourceConceptId: string
    targetConceptId: string
    sourceConceptName: string
    targetConceptName: string
    relationshipType: string
    strength: number
  }>
}

interface ExtractedEntity {
  name: string
  description: string
  domain: string
  importanceScore: number
}

interface ExtractedRelationship {
  source: string
  target: string
  type: string
  strength: number
}

// ─── Entity Extraction ────────────────────────────────────────
export async function extractEntitiesAndRelationships(
  text: string,
  brainId: string
): Promise<{ conceptsCreated: number; relationshipsCreated: number }> {
  logger.info('Extracting entities from text', { brainId, textLength: text.length })

  const prompt = `Analyze the following text and extract:
1. Key concepts/entities (people, places, ideas, theories, processes, tools)
2. Relationships between those concepts

Return a JSON object with this exact structure:
{
  "entities": [
    {"name": "...", "description": "...", "domain": "...", "importanceScore": 0.8}
  ],
  "relationships": [
    {"source": "entity_name", "target": "entity_name", "type": "relationship_type", "strength": 0.7}
  ]
}

Relationship types: "is_a", "part_of", "causes", "enables", "related_to", "leads_to", "contrasts_with"
Importance/strength: 0.0 to 1.0

Text to analyze:
${text.slice(0, 4000)}`

  let extracted: { entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }

  try {
    const { content } = await generateCompletion([
      {
        role: 'system',
        content: 'You are a knowledge extraction system. Return only valid JSON.',
      },
      { role: 'user', content: prompt },
    ])

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    extracted = JSON.parse(jsonMatch[0])
  } catch (err) {
    logger.error('Entity extraction failed', { error: String(err) })
    return { conceptsCreated: 0, relationshipsCreated: 0 }
  }

  // Upsert concepts
  const conceptMap = new Map<string, string>()
  let conceptsCreated = 0

  for (const entity of extracted.entities ?? []) {
    if (!entity.name || entity.name.length < 2) continue

    // Check for existing concept
    const existing = await db
      .select()
      .from(concepts)
      .where(and(eq(concepts.brainId, brainId), eq(concepts.name, entity.name)))
      .limit(1)

    if (existing.length > 0) {
      conceptMap.set(entity.name, existing[0].id)
      // Update importance if higher
      if (entity.importanceScore > existing[0].importanceScore) {
        await db
          .update(concepts)
          .set({ importanceScore: entity.importanceScore, updatedAt: new Date() })
          .where(eq(concepts.id, existing[0].id))
      }
    } else {
      const [created] = await db
        .insert(concepts)
        .values({
          brainId,
          name: entity.name,
          description: entity.description || null,
          domain: entity.domain || null,
          importanceScore: entity.importanceScore ?? 0.5,
        })
        .returning()
      conceptMap.set(entity.name, created.id)
      conceptsCreated++
    }
  }

  // Insert relationships
  let relationshipsCreated = 0

  for (const rel of extracted.relationships ?? []) {
    const sourceId = conceptMap.get(rel.source)
    const targetId = conceptMap.get(rel.target)
    if (!sourceId || !targetId || sourceId === targetId) continue

    const existing = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.brainId, brainId),
          eq(relationships.sourceConceptId, sourceId),
          eq(relationships.targetConceptId, targetId)
        )
      )
      .limit(1)

    if (existing.length === 0) {
      await db.insert(relationships).values({
        brainId,
        sourceConceptId: sourceId,
        targetConceptId: targetId,
        relationshipType: rel.type || 'related_to',
        strength: rel.strength ?? 0.5,
      })
      relationshipsCreated++
    }
  }

  logger.info('Knowledge extraction complete', {
    conceptsCreated,
    relationshipsCreated,
  })

  return { conceptsCreated, relationshipsCreated }
}

// ─── Graph Query ──────────────────────────────────────────────
export async function getKnowledgeGraph(brainId: string): Promise<KnowledgeGraph> {
  const [nodes, edges] = await Promise.all([
    db.select().from(concepts).where(eq(concepts.brainId, brainId)),
    db.select().from(relationships).where(eq(relationships.brainId, brainId)),
  ])

  return {
    nodes: nodes.map((c) => ({
      id: c.id,
      label: c.name,
      domain: c.domain,
      importanceScore: c.importanceScore,
    })),
    edges: edges.map((r) => ({
      id: r.id,
      source: r.sourceConceptId,
      target: r.targetConceptId,
      label: r.relationshipType,
      strength: r.strength,
    })),
  }
}

export async function getConcept(conceptId: string): Promise<Concept | null> {
  const [row] = await db.select().from(concepts).where(eq(concepts.id, conceptId))
  if (!row) return null
  return {
    id: row.id,
    brainId: row.brainId,
    name: row.name,
    description: row.description,
    domain: row.domain,
    importanceScore: row.importanceScore,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function findRelevantKnowledge(
  brainId: string,
  query: string,
  maxConcepts = 5
): Promise<RelevantKnowledge> {
  const queryTokens = new Set(tokenizeForSearch(query))

  if (queryTokens.size === 0) {
    return { concepts: [], relationships: [] }
  }

  const conceptRows = await db.select().from(concepts).where(eq(concepts.brainId, brainId))

  const scored = conceptRows
    .map((concept) => {
      const haystack = `${concept.name} ${concept.description ?? ''} ${concept.domain ?? ''}`
      const conceptTokens = new Set(tokenizeForSearch(haystack))
      let overlap = 0

      for (const token of queryTokens) {
        if (conceptTokens.has(token)) overlap++
      }

      const lexicalScore = overlap / queryTokens.size
      const blended = lexicalScore * 0.8 + concept.importanceScore * 0.2

      return { concept, blended }
    })
    .filter((entry) => entry.blended > 0)
    .sort((a, b) => b.blended - a.blended)
    .slice(0, maxConcepts)

  const topConcepts = scored.map((entry) => entry.concept)

  if (topConcepts.length === 0) {
    return { concepts: [], relationships: [] }
  }

  const topIds = new Set(topConcepts.map((concept) => concept.id))
  const topById = new Map(topConcepts.map((concept) => [concept.id, concept]))
  const relationshipRows = await db
    .select()
    .from(relationships)
    .where(eq(relationships.brainId, brainId))

  return {
    concepts: topConcepts.map((concept) => ({
      id: concept.id,
      name: concept.name,
      description: concept.description,
      domain: concept.domain,
      importanceScore: concept.importanceScore,
    })),
    relationships: relationshipRows
      .filter(
        (relationship) =>
          topIds.has(relationship.sourceConceptId) && topIds.has(relationship.targetConceptId)
      )
      .slice(0, 10)
      .map((relationship) => ({
        sourceConceptId: relationship.sourceConceptId,
        targetConceptId: relationship.targetConceptId,
        sourceConceptName:
          topById.get(relationship.sourceConceptId)?.name ?? relationship.sourceConceptId,
        targetConceptName:
          topById.get(relationship.targetConceptId)?.name ?? relationship.targetConceptId,
        relationshipType: relationship.relationshipType,
        strength: relationship.strength,
      })),
  }
}
