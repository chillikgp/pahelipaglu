/**
 * Crossword persistence service.
 * 
 * Implements file-based artifact storage for crossword generation history.
 * Each crossword is stored as an immutable directory with standardized artifacts.
 */

import { randomUUID } from 'crypto';
import { mkdir, writeFile, readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { ClueItem, CrosswordPuzzle } from '../types/models.js';
import type { SuitabilityFilterResult } from './suitability-filter.js';
import { getDataDir } from '../config/data-dir.js';

/**
 * Crossword metadata structure.
 */
export interface CrosswordMeta {
    id: string;
    theme: string;
    language: string;
    gridSize: string;
    requestedCount: number;
    createdAt: string;
    userId: string;
    mode: GenerationMode;
    metadata?: Record<string, any>;
}

/**
 * Gemini raw response artifact.
 */
export interface GeminiRawArtifact {
    prompt: string;
    model: string;
    rawResponse: string;
    timestamp: string;
}

/**
 * Candidate item with grapheme tokenization.
 */
export interface CandidateItem {
    answer: string;
    graphemes: string[];
    clue: string;
}

/**
 * Filtered result artifact.
 */
export interface FilteredArtifact {
    kept: CandidateItem[];
    removed: Array<{
        answer: string;
        reason: string;
    }>;
}

/**
 * Placement artifact.
 */
export interface PlacementsArtifact {
    placed: Array<{
        answer: string;
        row: number;
        col: number;
        direction: 'ACROSS' | 'DOWN';
    }>;
    unplaced: Array<{
        answer: string;
        reason: string;
    }>;
}

/**
 * Grid artifact (grapheme-safe).
 */
export interface GridArtifact {
    width: number;
    height: number;
    cells: Array<Array<{ g: string | null }>>;
}

/**
 * Generation mode.
 */
export type GenerationMode = 'ai' | 'manual_basic' | 'manual_advanced';

/**
 * Summary artifact for UI.
 */
export interface SummaryArtifact {
    mode: GenerationMode;
    placedCount: number;
    unplacedCount: number;
    filteredCount: number;
    requestedCount: number;
    fillRatio: number;
    warning?: string;
}

/**
 * Full crossword artifact bundle.
 */
export interface CrosswordBundle {
    meta: CrosswordMeta;
    geminiRaw?: GeminiRawArtifact;
    candidates?: CandidateItem[];
    filtered?: FilteredArtifact;
    placements?: PlacementsArtifact;
    grid?: GridArtifact;
    summary: SummaryArtifact;
}

/**
 * List item for history view.
 */
export interface CrosswordListItem {
    id: string;
    theme: string;
    language: string;
    gridSize: string;
    mode: GenerationMode;
    createdAt: string;
    placedCount: number;
    warning?: string;
}

/**
 * Generate a unique crossword ID.
 */
export function generateCrosswordId(): string {
    return `cw_${randomUUID().slice(0, 12)}`;
}

/**
 * Get the directory path for a crossword.
 */
function getCrosswordDir(crosswordId: string): string {
    return join(getDataDir(), crosswordId);
}

/**
 * Ensure the data directory exists.
 */
async function ensureDataDir(): Promise<void> {
    await mkdir(getDataDir(), { recursive: true });
}

/**
 * Ensure a crossword directory exists.
 */
async function ensureCrosswordDir(crosswordId: string): Promise<string> {
    const dir = getCrosswordDir(crosswordId);
    await mkdir(dir, { recursive: true });
    return dir;
}

/**
 * Write a JSON artifact atomically.
 * Writes to a temp file first, then renames.
 */
async function writeArtifact<T>(
    crosswordId: string,
    filename: string,
    data: T
): Promise<void> {
    const dir = await ensureCrosswordDir(crosswordId);
    const filepath = join(dir, filename);
    const temppath = `${filepath}.tmp`;

    const content = JSON.stringify(data, null, 2);

    // Write to temp file
    await writeFile(temppath, content, 'utf-8');

    // Rename atomically (on POSIX systems)
    const { rename } = await import('fs/promises');
    await rename(temppath, filepath);
}

/**
 * Read a JSON artifact.
 */
async function readArtifact<T>(
    crosswordId: string,
    filename: string
): Promise<T | null> {
    try {
        const dir = getCrosswordDir(crosswordId);
        const filepath = join(dir, filename);
        const content = await readFile(filepath, 'utf-8');
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}

/**
 * Save crossword metadata.
 */
export async function saveMeta(
    crosswordId: string,
    meta: CrosswordMeta
): Promise<CrosswordMeta> {
    await ensureDataDir();
    await ensureCrosswordDir(crosswordId);

    await writeArtifact(crosswordId, 'meta.json', meta);
    console.log(`[Persistence] Saved meta.json for ${crosswordId}`);

    return meta;
}

/**
 * Save Gemini raw response.
 */
export async function saveGeminiRaw(
    crosswordId: string,
    prompt: string,
    model: string,
    rawResponse: string
): Promise<void> {
    const artifact: GeminiRawArtifact = {
        prompt,
        model,
        rawResponse,
        timestamp: new Date().toISOString(),
    };

    await writeArtifact(crosswordId, 'gemini_raw.json', artifact);
    console.log(`[Persistence] Saved gemini_raw.json for ${crosswordId}`);
}

/**
 * Save parsed candidates.
 */
export async function saveCandidates(
    crosswordId: string,
    clues: ClueItem[]
): Promise<void> {
    const candidates: CandidateItem[] = clues.map((c) => ({
        answer: c.answerText,
        graphemes: c.graphemes,
        clue: c.clueText,
    }));

    await writeArtifact(crosswordId, 'candidates.json', candidates);
    console.log(`[Persistence] Saved candidates.json for ${crosswordId}`);
}

/**
 * Save filtered results.
 */
export async function saveFiltered(
    crosswordId: string,
    filterResult: SuitabilityFilterResult
): Promise<void> {
    const artifact: FilteredArtifact = {
        kept: filterResult.filteredWords.map((c) => ({
            answer: c.answerText,
            graphemes: c.graphemes,
            clue: c.clueText,
        })),
        removed: filterResult.removedWords.map((c) => ({
            answer: c.answerText,
            reason: 'low crossword suitability',
        })),
    };

    await writeArtifact(crosswordId, 'filtered.json', artifact);
    console.log(`[Persistence] Saved filtered.json for ${crosswordId}`);
}

/**
 * Save placements.
 */
export async function savePlacements(
    crosswordId: string,
    puzzle: CrosswordPuzzle
): Promise<void> {
    const artifact: PlacementsArtifact = {
        placed: puzzle.placements
            .filter((p) => p.placed)
            .map((p) => ({
                answer: p.clueItem.answerText,
                row: p.startY,
                col: p.startX,
                direction: p.direction,
            })),
        unplaced: puzzle.unplacedWords.map((w) => ({
            answer: w.answerText,
            reason: 'no valid placement found',
        })),
    };

    await writeArtifact(crosswordId, 'placements.json', artifact);
    console.log(`[Persistence] Saved placements.json for ${crosswordId}`);
}

/**
 * Save grid.
 */
export async function saveGrid(
    crosswordId: string,
    puzzle: CrosswordPuzzle
): Promise<void> {
    const artifact: GridArtifact = {
        width: puzzle.gridWidth,
        height: puzzle.gridHeight,
        cells: puzzle.grid.map((row) =>
            row.map((cell) => ({
                g: cell.grapheme ?? null,
            }))
        ),
    };

    await writeArtifact(crosswordId, 'grid.json', artifact);
    console.log(`[Persistence] Saved grid.json for ${crosswordId}`);
}

/**
 * Save summary.
 */
export async function saveSummary(
    crosswordId: string,
    mode: GenerationMode,
    requestedCount: number,
    filteredCount: number,
    placedCount: number,
    unplacedCount: number,
    warning?: string
): Promise<SummaryArtifact> {
    const artifact: SummaryArtifact = {
        mode,
        placedCount,
        unplacedCount,
        filteredCount,
        requestedCount,
        fillRatio: filteredCount > 0 ? placedCount / filteredCount : 0,
        warning,
    };

    await writeArtifact(crosswordId, 'summary.json', artifact);
    console.log(`[Persistence] Saved summary.json for ${crosswordId}`);

    return artifact;
}

/**
 * Get a list of all crosswords for a user.
 */
export async function listCrosswords(userId?: string): Promise<CrosswordListItem[]> {
    try {
        await ensureDataDir();
        const entries = await readdir(getDataDir());

        const items: CrosswordListItem[] = [];

        for (const entry of entries) {
            if (!entry.startsWith('cw_')) continue;

            try {
                const meta = await readArtifact<CrosswordMeta>(entry, 'meta.json');
                const summary = await readArtifact<SummaryArtifact>(entry, 'summary.json');

                if (!meta || !summary) continue;

                // Filter by userId if provided
                if (userId && meta.userId !== userId) continue;

                items.push({
                    id: meta.id,
                    theme: meta.theme,
                    language: meta.language,
                    gridSize: meta.gridSize,
                    mode: summary.mode || 'ai', // Fallback for old crosswords
                    createdAt: meta.createdAt,
                    placedCount: summary.placedCount,
                    warning: summary.warning,
                });
            } catch {
                // Skip invalid entries
                continue;
            }
        }

        // Sort by creation date (newest first)
        items.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return items;
    } catch {
        return [];
    }
}

/**
 * Get full crossword bundle by ID.
 */
export async function getCrosswordBundle(crosswordId: string): Promise<CrosswordBundle | null> {
    try {
        const meta = await readArtifact<CrosswordMeta>(crosswordId, 'meta.json');
        if (!meta) return null;

        const summary = await readArtifact<SummaryArtifact>(crosswordId, 'summary.json');
        if (!summary) return null;

        return {
            meta,
            geminiRaw: await readArtifact<GeminiRawArtifact>(crosswordId, 'gemini_raw.json') ?? undefined,
            candidates: await readArtifact<CandidateItem[]>(crosswordId, 'candidates.json') ?? undefined,
            filtered: await readArtifact<FilteredArtifact>(crosswordId, 'filtered.json') ?? undefined,
            placements: await readArtifact<PlacementsArtifact>(crosswordId, 'placements.json') ?? undefined,
            grid: await readArtifact<GridArtifact>(crosswordId, 'grid.json') ?? undefined,
            summary,
        };
    } catch {
        return null;
    }
}

/**
 * Check if a crossword exists.
 */
export async function crosswordExists(crosswordId: string): Promise<boolean> {
    try {
        const dir = getCrosswordDir(crosswordId);
        await stat(dir);
        return true;
    } catch {
        return false;
    }
}
