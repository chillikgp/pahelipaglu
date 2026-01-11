/**
 * Pre-placement suitability filter.
 * 
 * Removes words that are mathematically unsuitable for crossword construction
 * based on intersection scoring with other words in the set.
 * 
 * Runs AFTER Gemini generation, BEFORE placement engine.
 */

import type { ClueItem } from '../types/models.js';
import { findCommonGraphemes } from '../utils/grapheme.js';

/**
 * Result of the suitability filter.
 */
export interface SuitabilityFilterResult {
    /** Words that passed the filter */
    filteredWords: ClueItem[];
    /** Words that were removed by the filter */
    removedWords: ClueItem[];
    /** Original count before filtering */
    originalCount: number;
    /** Count after filtering */
    filteredCount: number;
    /** Whether any words were removed */
    wasFiltered: boolean;
    /** Warning message if words were removed */
    warning?: string;
}

/**
 * Configuration for the suitability filter.
 */
interface FilterConfig {
    /** Grid width */
    gridWidth: number;
    /** Grid height */
    gridHeight: number;
    /** Minimum intersection count required (default: 1) */
    minIntersectionCount?: number;
    /** Allow short words (≤3 graphemes) without intersections */
    allowShortFillerWords?: boolean;
}

/**
 * Word with its intersection score.
 */
interface ScoredWord {
    clue: ClueItem;
    intersectionCount: number;
    graphemeLength: number;
}

/**
 * Compute intersection count for a word against all other words.
 * Returns the number of OTHER words that share ≥1 grapheme with this word.
 */
function computeIntersectionCount(
    word: ClueItem,
    allWords: ClueItem[],
    wordIndex: number
): number {
    let count = 0;

    for (let i = 0; i < allWords.length; i++) {
        // Skip self-comparison
        if (i === wordIndex) continue;

        const other = allWords[i];
        if (!other) continue;

        // Find common graphemes between the two words
        const commonPairs = findCommonGraphemes(word.graphemes, other.graphemes);

        // If there's at least one common grapheme, count this word
        if (commonPairs.length > 0) {
            count++;
        }
    }

    return count;
}

/**
 * Score all words by their intersection potential.
 */
function scoreWords(words: ClueItem[]): ScoredWord[] {
    return words.map((clue, index) => ({
        clue,
        intersectionCount: computeIntersectionCount(clue, words, index),
        graphemeLength: clue.graphemes.length,
    }));
}

/**
 * Check if a word should be removed based on filtering rules.
 * 
 * Remove a word W if ALL are true:
 * 1. intersectionCount(W) === 0
 * 2. graphemeLength(W) > 3
 */
function shouldRemoveWord(
    scored: ScoredWord,
    config: FilterConfig
): boolean {
    const { intersectionCount, graphemeLength } = scored;
    const gridSize = Math.min(config.gridWidth, config.gridHeight);

    // Rule 1: Remove if no intersections AND not a short filler word
    if (intersectionCount === 0 && graphemeLength > 3) {
        return true;
    }

    // Optional: If grid is small (≤11), remove words that are too long
    if (gridSize <= 11 && graphemeLength > gridSize - 2) {
        return true;
    }

    return false;
}

/**
 * Apply the suitability filter to a list of clue items.
 * 
 * This filter:
 * 1. Scores each word by intersection potential with other words
 * 2. Removes words that cannot reasonably intersect
 * 3. Enforces grid size constraints
 * 
 * @param words - Array of clue items from Gemini
 * @param gridWidth - Target grid width
 * @param gridHeight - Target grid height
 * @returns Filter result with filtered words and metadata
 */
export function applySuitabilityFilter(
    words: ClueItem[],
    gridWidth: number,
    gridHeight: number
): SuitabilityFilterResult {
    if (words.length === 0) {
        return {
            filteredWords: [],
            removedWords: [],
            originalCount: 0,
            filteredCount: 0,
            wasFiltered: false,
        };
    }

    const config: FilterConfig = {
        gridWidth,
        gridHeight,
        minIntersectionCount: 1,
        allowShortFillerWords: true,
    };

    // Score all words
    const scoredWords = scoreWords(words);

    console.log(`[Filter] Scoring ${words.length} words for suitability`);

    // Log intersection counts for debugging
    for (const scored of scoredWords) {
        console.log(
            `[Filter] "${scored.clue.answerText}" - ` +
            `${scored.graphemeLength} graphemes, ` +
            `${scored.intersectionCount} intersections`
        );
    }

    // Apply filtering rules
    const filteredWords: ClueItem[] = [];
    const removedWords: ClueItem[] = [];

    for (const scored of scoredWords) {
        if (shouldRemoveWord(scored, config)) {
            removedWords.push(scored.clue);
            console.log(`[Filter] REMOVED: "${scored.clue.answerText}" (no intersections, ${scored.graphemeLength} graphemes)`);
        } else {
            filteredWords.push(scored.clue);
        }
    }

    // Quality heuristic: If we have too many words for a small grid,
    // prefer words with higher intersection counts
    const gridSize = Math.min(gridWidth, gridHeight);
    const maxRecommended = getMaxRecommendedWords(gridSize);

    if (filteredWords.length > maxRecommended) {
        console.log(`[Filter] Grid ${gridSize}x${gridSize} recommends max ${maxRecommended} words, have ${filteredWords.length}`);

        // Re-score and sort by intersection count (descending)
        const rescoredFiltered = scoreWords(filteredWords);
        rescoredFiltered.sort((a, b) => b.intersectionCount - a.intersectionCount);

        // Keep only top N by intersection score
        const topWords = rescoredFiltered.slice(0, maxRecommended);
        const droppedWords = rescoredFiltered.slice(maxRecommended);

        filteredWords.length = 0;
        filteredWords.push(...topWords.map(s => s.clue));

        for (const dropped of droppedWords) {
            removedWords.push(dropped.clue);
            console.log(`[Filter] DROPPED (low score): "${dropped.clue.answerText}" (score: ${dropped.intersectionCount})`);
        }
    }

    const wasFiltered = removedWords.length > 0;

    console.log(`[Filter] Result: ${filteredWords.length} passed, ${removedWords.length} removed`);

    return {
        filteredWords,
        removedWords,
        originalCount: words.length,
        filteredCount: filteredWords.length,
        wasFiltered,
        warning: wasFiltered
            ? `${removedWords.length} word(s) removed due to low crossword suitability`
            : undefined,
    };
}

/**
 * Get the maximum recommended number of words for a grid size.
 * Heuristic: ~(gridSize * 0.8) words can typically fit.
 */
function getMaxRecommendedWords(gridSize: number): number {
    if (gridSize <= 7) return 8;
    if (gridSize <= 10) return 12;
    if (gridSize <= 15) return 20;
    if (gridSize <= 20) return 30;
    return 40;
}
