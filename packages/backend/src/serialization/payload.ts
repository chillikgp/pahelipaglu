/**
 * Crossword puzzle serialization to URL-encoded payload format.
 * Handles grapheme encoding for crossword editor compatibility.
 */

import type { CrosswordPuzzle, WordPlacement } from '../types/models.js';
import { encodeGrapheme } from '../utils/grapheme.js';

/**
 * Serialize a crossword puzzle to URL-encoded payload format.
 * 
 * Output format:
 * - ans1={encoded}&question1={clue}&ans2=...
 * - Uses {} encoding for multi-codepoint graphemes
 * - URL-encodes all values
 * 
 * @param puzzle - The crossword puzzle to serialize
 * @param removeUnplacedWords - Whether to exclude unplaced words from output
 * @returns URL-encoded payload string
 */
export function serializeToPayload(
    puzzle: CrosswordPuzzle,
    removeUnplacedWords: boolean
): string {
    const params = new URLSearchParams();

    // Get placements to include
    let placements: WordPlacement[];

    if (removeUnplacedWords) {
        placements = puzzle.placements.filter((p) => p.placed);
    } else {
        // Include placed words, then add unplaced words
        placements = [...puzzle.placements.filter((p) => p.placed)];

        // Add unplaced words with incrementing IDs
        let nextId = placements.length + 1;
        for (const unplaced of puzzle.unplacedWords) {
            placements.push({
                wordId: nextId++,
                clueItem: unplaced,
                startX: -1,
                startY: -1,
                direction: 'ACROSS',
                placed: false,
            });
        }
    }

    // Sort by wordId for stable numbering
    placements.sort((a, b) => a.wordId - b.wordId);

    // Renumber from 1 for clean output
    let outputNumber = 1;

    for (const placement of placements) {
        const clue = placement.clueItem;

        // Encode the answer with {} for multi-codepoint graphemes
        const encodedAnswer = clue.graphemes.map(encodeGrapheme).join('');

        // Add to params
        params.append(`ans${outputNumber}`, encodedAnswer);
        params.append(`question${outputNumber}`, clue.clueText);

        outputNumber++;
    }

    // Add metadata
    if (removeUnplacedWords) {
        params.append('removeUnplacedWords', 'true');
    }

    return params.toString();
}

/**
 * Serialize puzzle to a structured JSON format for API response.
 */
export interface SerializedPuzzleData {
    /** URL-encoded payload string */
    payload: string;
    /** Grid representation for display */
    grid: (string | null)[][];
    /** Placed words with their positions */
    placedWords: {
        number: number;
        answer: string;
        clue: string;
        startX: number;
        startY: number;
        direction: 'ACROSS' | 'DOWN';
        graphemeCount: number;
    }[];
    /** Unplaced words */
    unplacedWords: {
        answer: string;
        clue: string;
        graphemeCount: number;
    }[];
    /** Grid dimensions */
    dimensions: {
        width: number;
        height: number;
    };
    /** Generation statistics */
    stats: {
        requestedWords: number;
        placedWords: number;
        unplacedWords: number;
        fillRatio: number;
    };
}

/**
 * Serialize puzzle to a complete data structure for API response.
 */
export function serializePuzzle(
    puzzle: CrosswordPuzzle,
    removeUnplacedWords: boolean
): SerializedPuzzleData {
    // Build the payload
    const payload = serializeToPayload(puzzle, removeUnplacedWords);

    // Build the grid representation
    const grid: (string | null)[][] = [];
    for (let y = 0; y < puzzle.gridHeight; y++) {
        const row: (string | null)[] = [];
        const gridRow = puzzle.grid[y];

        for (let x = 0; x < puzzle.gridWidth; x++) {
            const cell = gridRow?.[x];
            row.push(cell?.grapheme ?? null);
        }
        grid.push(row);
    }

    // Build placed words list
    const placedWords = puzzle.placements
        .filter((p) => p.placed)
        .sort((a, b) => a.wordId - b.wordId)
        .map((p, index) => ({
            number: index + 1,
            answer: p.clueItem.answerText,
            clue: p.clueItem.clueText,
            startX: p.startX,
            startY: p.startY,
            direction: p.direction,
            graphemeCount: p.clueItem.graphemes.length,
        }));

    // Build unplaced words list
    const unplacedWords = puzzle.unplacedWords.map((w) => ({
        answer: w.answerText,
        clue: w.clueText,
        graphemeCount: w.graphemes.length,
    }));

    return {
        payload,
        grid,
        placedWords,
        unplacedWords,
        dimensions: {
            width: puzzle.gridWidth,
            height: puzzle.gridHeight,
        },
        stats: {
            requestedWords: placedWords.length + unplacedWords.length,
            placedWords: placedWords.length,
            unplacedWords: unplacedWords.length,
            fillRatio: (placedWords.length + unplacedWords.length) > 0 ?
                placedWords.length / (placedWords.length + unplacedWords.length) : 0,
        }
    };
}

/**
 * Generate a simple text representation of the grid for debugging.
 */
export function gridToText(puzzle: CrosswordPuzzle): string {
    const lines: string[] = [];

    for (let y = 0; y < puzzle.gridHeight; y++) {
        let line = '';
        const row = puzzle.grid[y];

        for (let x = 0; x < puzzle.gridWidth; x++) {
            const cell = row?.[x];
            if (cell?.grapheme) {
                // Pad single graphemes for alignment
                line += cell.grapheme.padEnd(2, ' ');
            } else {
                line += '· ';
            }
        }
        lines.push(line);
    }

    return lines.join('\n');
}
