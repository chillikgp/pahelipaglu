/**
 * API routes for crossword generation with persistence.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateClues } from '../services/gemini.service.js';
import { generateCrossword } from '../services/crossword-engine.js';
import { applySuitabilityFilter } from '../services/suitability-filter.js';
import { validateManualPlacements, type ManualPlacement } from '../services/placement-validator.js';
import { serializePuzzle } from '../serialization/payload.js';
import {
    generateCrosswordId,
    saveMeta,
    saveGeminiRaw,
    saveCandidates,
    saveFiltered,
    savePlacements,
    saveGrid,
    saveSummary,
} from '../services/persistence.service.js';
import type { GenerateResponse, ClueItem, CrosswordPuzzle } from '../types/models.js';

/**
 * Zod schema for request validation.
 */
const GenerateRequestSchema = z.object({
    sessionId: z.string().min(1, 'sessionId is required'),
    contentLanguage: z.string().min(2, 'contentLanguage must be a valid BCP-47 locale'),
    mode: z.enum(['ai', 'manual_basic', 'manual_advanced']).default('ai'),

    // AI Mode fields
    inputType: z.enum(['TOPIC', 'URL', 'PDF', 'TEXT']).optional(),
    inputValue: z.string().optional(),
    numItems: z.number().int().min(3).max(50).default(10),
    userInstructions: z.string().optional(),

    // Manual Mode fields
    words: z.array(z.object({
        word: z.string().min(1),
        clue: z.string(),
        row: z.number().int().optional(),
        col: z.number().int().optional(),
        direction: z.enum(['ACROSS', 'DOWN']).optional(),
    })).optional(),

    // Shared fields
    gridSizeX: z.number().int().min(5).max(50).default(18),
    gridSizeY: z.number().int().min(5).max(50).default(18),
    fixedGridSize: z.number().int().min(5).max(50).optional(),
    removeUnplacedWords: z.boolean().default(true),
    seed: z.number().int().optional(),
});

type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

/**
 * Register crossword generation routes.
 */
export async function registerGenerateRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * POST /generate-crossword
     * Main endpoint for generating crossword puzzles.
     * Supports AI, Manual Basic (words+hints), and Manual Advanced (full placement) modes.
     */
    fastify.post(
        '/generate-crossword',
        async (
            request: FastifyRequest<{ Body: GenerateRequest }>,
            reply: FastifyReply
        ): Promise<GenerateResponse> => {
            const startTime = Date.now();
            const crosswordId = generateCrosswordId();
            const input = GenerateRequestSchema.parse(request.body);
            const gridWidth = input.gridSizeX;
            const gridHeight = input.gridSizeY;
            const mode = input.mode;

            console.log(`[API] Starting generation for ${crosswordId} | Mode: ${mode}`);

            try {
                // Determine source clues based on mode
                let clueItems: ClueItem[] = [];
                let puzzle: CrosswordPuzzle | undefined;
                let warning: string | undefined;

                // Step 1: Get Candidate Words
                if (mode === 'ai') {
                    if (!input.inputType || !input.inputValue) {
                        reply.code(400);
                        return { success: false, error: 'inputType and inputValue required for AI mode' };
                    }

                    console.log(`[API] Step 1: Fetching candidates from Gemini (${input.inputType})...`);
                    const geminiResult = await generateClues({
                        inputType: input.inputType,
                        inputValue: input.inputValue!, // Assert non-null after check
                        contentLanguage: input.contentLanguage, // Fixed property name
                        numItems: input.numItems,
                        userInstructions: input.userInstructions || '',
                        sessionId: input.sessionId,
                        gridSizeX: input.gridSizeX,
                        gridSizeY: input.gridSizeY,
                        removeUnplacedWords: input.removeUnplacedWords,
                    });

                    // Save prompt and raw response
                    await saveGeminiRaw(
                        crosswordId,
                        geminiResult.prompt,
                        geminiResult.model,
                        geminiResult.rawResponse
                    );

                    clueItems = geminiResult.clues;
                } else {
                    // Manual modes (Basic or Advanced)
                    if (!input.words || input.words.length === 0) {
                        reply.code(400);
                        return { success: false, error: 'words list required for manual mode' };
                    }

                    console.log(`[API] Step 1: Processing ${input.words.length} manual words...`);

                    const segmenter = new Intl.Segmenter(input.contentLanguage, { granularity: 'grapheme' });

                    clueItems = input.words.map(w => ({
                        answer: w.word.toUpperCase(),
                        clue: w.clue,
                        answerText: w.word.toUpperCase(),
                        clueText: w.clue,
                        graphemes: Array.from(segmenter.segment(w.word.toUpperCase())).map(s => s.segment)
                    }));
                }

                await saveCandidates(crosswordId, clueItems);

                // Step 2 & 3: Filter & Generate (Logic splits here)

                if (mode === 'manual_advanced') {
                    // Manual Advanced: Skip filter and engine, validate placement directly
                    console.log(`[API] Step 2: Validating manual placements...`);

                    const placements: ManualPlacement[] = input.words!.map(w => {
                        if (w.row === undefined || w.col === undefined || w.direction === undefined) {
                            throw new Error('row, col, and direction required for manual_advanced words');
                        }
                        return {
                            word: w.word,
                            clue: w.clue,
                            row: w.row, // Expecting 0-based from frontend
                            col: w.col, // Expecting 0-based from frontend
                            direction: w.direction,
                        };
                    });

                    const validation = validateManualPlacements(
                        placements,
                        clueItems, // Passed to attach clue text/clean word data
                        gridWidth,
                        gridHeight
                    );

                    if (!validation.valid || !validation.puzzle) {
                        const errorMsg = validation.errors.map(e => `${e.word}: ${e.error}`).join('; ');
                        // Save summary on failure
                        await saveSummary(
                            crosswordId,
                            mode,
                            clueItems.length,
                            clueItems.length,
                            0,
                            clueItems.length,
                            `Validation failed: ${errorMsg}`
                        );

                        reply.code(400);
                        return { success: false, error: `Invalid placement: ${errorMsg}` };
                    }

                    puzzle = validation.puzzle;

                    // Save filtered as "all requested" for consistency
                    await saveFiltered(crosswordId, {
                        originalCount: clueItems.length,
                        filteredCount: clueItems.length,
                        filteredWords: clueItems,
                        removedWords: [],
                        wasFiltered: false,
                        warning: undefined,
                    });

                } else {
                    // AI or Manual Basic: Run Suitability Filter & Auto-Placement
                    console.log(`[API] Step 2: Filtering for suitability...`);
                    const filterResult = applySuitabilityFilter(clueItems, gridWidth, gridHeight);
                    await saveFiltered(crosswordId, filterResult);

                    if (filterResult.filteredWords.length === 0) {
                        await saveSummary(
                            crosswordId,
                            mode,
                            clueItems.length,
                            0,
                            0,
                            0,
                            'No words passed suitability filter'
                        );
                        reply.code(500);
                        return { success: false, error: 'No words passed filter.' };
                    }

                    warning = filterResult.warning;

                    console.log(`[API] Step 3: Placing words...`);
                    puzzle = generateCrossword(
                        filterResult.filteredWords,
                        gridWidth,
                        gridHeight,
                        input.seed
                    );
                }

                // Step 4: Serialize & Final Save
                if (puzzle.warning) {
                    warning = warning ? `${warning}. ${puzzle.warning}` : puzzle.warning;
                }

                await savePlacements(crosswordId, puzzle);
                await saveGrid(crosswordId, puzzle);

                console.log(`\n[API] Step 4: Serializing puzzle...`);
                // For manual_advanced, removeUnplacedWords is irrelevant (all placed), but passing it is harmless
                const serialized = serializePuzzle(
                    puzzle,
                    mode === 'manual_advanced' ? false : input.removeUnplacedWords
                );

                await saveMeta(crosswordId, {
                    id: crosswordId,
                    userId: 'user_1', // Single user mode
                    theme: input.inputType === 'TOPIC' ? input.inputValue || 'Manual' : 'Custom',
                    language: input.contentLanguage,
                    gridSize: `${puzzle.gridWidth}x${puzzle.gridHeight}`,
                    createdAt: new Date().toISOString(),
                    requestedCount: clueItems.length, // Added root property
                    mode: mode, // Added root property
                    metadata: {
                        requestedWords: clueItems.length,
                        filteredWords: mode === 'manual_advanced' ? clueItems.length : undefined,
                        placedWords: serialized.placedWords.length,
                        unplacedWords: serialized.unplacedWords.length,
                        language: input.contentLanguage,
                        fillRatio: serialized.stats.fillRatio,
                        mode: mode,
                    },
                });

                await saveSummary(
                    crosswordId,
                    mode,
                    clueItems.length,
                    serialized.stats.requestedWords,
                    serialized.placedWords.length,
                    serialized.unplacedWords.length,
                    warning
                );

                const elapsed = Date.now() - startTime;
                console.log(`\n[API] Completed in ${elapsed}ms | ID: ${crosswordId}`);

                return {
                    success: true,
                    crosswordId,
                    puzzle: puzzle,
                    payload: serialized.payload,
                    warning,
                };

            } catch (error) {
                console.error('[API] Error:', error);

                // Attempt to save error summary if possible
                try {
                    await saveSummary(
                        crosswordId,
                        mode,
                        0, 0, 0, 0,
                        `Error: ${error instanceof Error ? error.message : String(error)}`
                    );
                } catch (e) { /* ignore */ }

                reply.code(500);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal Server Error',
                };
            }
        }
    );
}
