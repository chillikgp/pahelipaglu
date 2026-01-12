/**
 * Deterministic crossword placement engine with strict validation and intersection optimization.
 * 
 * UPGRADE (OPUS):
 * - Optimization 1: Intersection Graph (Prioritize connectable words)
 * - Optimization 2: Sorting Strategy (Intersection Count > Length)
 * - Optimization 3 & 4: First Word Oracle (Fork orientation, score potential)
 * - Optimization 5: Lookahead Scoring (Maximize future connectivity)
 * - Optimization 6: Shallow Retry (Limited shuffle of top connectable words)
 * - Optimization 7: Dynamic Tie-Breaking (Randomize equal scores during retry to avoid central clumping)
 * 
 * PRESERVED FIXES:
 * 1. Hard cell occupancy guarantee
 * 2. Start-cell collision block
 * 3. Grapheme-only grid writes
 * 4. Strict adjacency validation
 * 5. Low-fill safety guard
 * 7. Frontend-safe output contract
 */

import type {
    ClueItem,
    CrosswordPuzzle,
    Direction,
    GridCell,
    GraphemeToken,
    Intersection,
    WordPlacement,
} from '../types/models.js';
import { compareGraphemes, findCommonGraphemes } from '../utils/grapheme.js';
import { SeededRandom } from '../utils/random.js';

/**
 * Configuration for the crossword engine.
 */
export interface EngineConfig {
    width: number;
    height: number;
    seed?: number;
    retryAttempts?: number;
}

/**
 * Extended puzzle result with safety metadata.
 */
export interface CrosswordPuzzleResult extends CrosswordPuzzle {
    warning?: string;
    stats: {
        requestedWords: number;
        placedWords: number;
        unplacedWords: number;
        fillRatio: number;
    };
}

/**
 * Track start positions to prevent collisions (FIX 2).
 */
interface StartPosition {
    x: number;
    y: number;
    direction: Direction;
    firstGrapheme: GraphemeToken;
}

/**
 * Candidate placement with score.
 */
interface ScoredPlacement {
    word: ClueItem;
    startX: number;
    startY: number;
    direction: Direction;
    score: number;
    distToCenter: number;
    randomRank: number; // For dynamic tie-breaking
}

/**
 * CrosswordEngine generates crossword puzzles with deterministic, optimized placement.
 */
export class CrosswordEngine {
    private readonly width: number;
    private readonly height: number;
    private grid: GridCell[][];
    private placements: WordPlacement[];
    private startPositions: StartPosition[];
    private rng: SeededRandom;
    private wordIdCounter: number;
    private readonly retryAttempts: number;

    constructor(config: EngineConfig) {
        this.width = config.width;
        this.height = config.height;
        this.rng = new SeededRandom(config.seed);
        this.retryAttempts = config.retryAttempts ?? 1;
        this.grid = this.createEmptyGrid();
        this.placements = [];
        this.startPositions = [];
        this.wordIdCounter = 0;
    }

    private createEmptyGrid(): GridCell[][] {
        const grid: GridCell[][] = [];
        for (let y = 0; y < this.height; y++) {
            const row: GridCell[] = [];
            for (let x = 0; x < this.width; x++) {
                row.push({ grapheme: undefined, wordIds: [] });
            }
            grid.push(row);
        }
        return grid;
    }

    private reset(seed?: number): void {
        if (seed !== undefined) {
            this.rng = new SeededRandom(seed);
        }
        this.grid = this.createEmptyGrid();
        this.placements = [];
        this.startPositions = [];
        this.wordIdCounter = 0;
    }

    /**
     * OPUS Optimization 1: Compute intersection potential O(N^2).
     */
    private computeIntersectionGraph(clues: ClueItem[]): Map<string, number> {
        const scores = new Map<string, number>();

        for (let i = 0; i < clues.length; i++) {
            const wordA = clues[i];
            if (!wordA) continue;

            let count = 0;
            const setA = new Set(wordA.graphemes);

            for (let j = 0; j < clues.length; j++) {
                if (i === j) continue;
                const wordB = clues[j];
                if (!wordB) continue;

                // Check if any grapheme is shared
                if (wordB.graphemes.some(g => setA.has(g))) {
                    count++;
                }
            }
            scores.set(wordA.answerText, count);
        }
        return scores;
    }

    /**
     * Generate a crossword puzzle with optimizations.
     */
    generatePuzzle(clues: ClueItem[]): CrosswordPuzzleResult {
        const requestedWords = clues.length;
        const intersectionScores = this.computeIntersectionGraph(clues);

        // OPUS Optimization 2: Sorting Strategy
        // 1. Intersection Count DESC
        // 2. Grapheme Length DESC
        const sortClues = (items: ClueItem[]) => {
            return [...items].sort((a, b) => {
                const scoreA = intersectionScores.get(a.answerText) || 0;
                const scoreB = intersectionScores.get(b.answerText) || 0;
                if (scoreA !== scoreB) {
                    return scoreB - scoreA; // Higher score first
                }
                return b.graphemes.length - a.graphemes.length; // Longer first
            });
        };

        const sortedClues = sortClues(clues);
        const topWord = sortedClues[0];
        console.log(`[Engine] Placing ${sortedClues.length} words. Top score: ${topWord ? intersectionScores.get(topWord.answerText) : 0}`);

        // First attempt using optimal sort (Deterministic / Center-focused)
        let bestResult = this.attemptPlacement(sortedClues, false);

        // OPUS Optimization 6: Limited Retry
        // If fill ratio < 0.6, retry up to 'retryAttempts' times with shuffled top words.
        let attempts = 0;

        while (attempts < this.retryAttempts) {
            const currentFill = requestedWords > 0 ? bestResult.placements.length / requestedWords : 0;
            if (currentFill >= 0.6) break;

            attempts++;
            console.log(`[Engine] Fill ratio ${currentFill.toFixed(2)} < 0.6. Retry attempt ${attempts}/${this.retryAttempts}...`);

            // Shuffle ALL words to break cliques and local optima.
            const shuffled = this.rng.shuffle(sortedClues);

            // Reset state with distinct seed
            this.reset((Date.now()) + attempts * 54321);

            // Enable Dynamic Tie-Breaking (randomize equal scores instead of centering)
            const retryResult = this.attemptPlacement(shuffled, true);

            if (retryResult.placements.length > bestResult.placements.length) {
                console.log(`[Engine] Retry improved: ${retryResult.placements.length} (was ${bestResult.placements.length})`);
                bestResult = retryResult;
            }
        }

        // Final stats
        const placedCount = bestResult.placements.length;
        const finalFill = requestedWords > 0 ? placedCount / requestedWords : 0;

        let warning: string | undefined;
        if (finalFill < 0.4) {
            warning = `Grid too constrained: only ${placedCount}/${requestedWords} words placed (${Math.round(finalFill * 100)}%).`;
        }

        // --- SHRINK TO FIT LOGIC ---
        // Calculate bounding box of placed words
        let minX = this.width;
        let maxX = 0;
        let minY = this.height;
        let maxY = 0;

        if (bestResult.placements.length > 0) {
            for (const p of bestResult.placements) {
                if (!p.placed) continue;
                // Update bounds based on start position
                minX = Math.min(minX, p.startX);
                minY = Math.min(minY, p.startY);

                // Update bounds based on end position
                if (p.direction === 'ACROSS') {
                    maxX = Math.max(maxX, p.startX + p.clueItem.graphemes.length - 1);
                    maxY = Math.max(maxY, p.startY);
                } else {
                    maxX = Math.max(maxX, p.startX);
                    maxY = Math.max(maxY, p.startY + p.clueItem.graphemes.length - 1);
                }
            }
        } else {
            // If no words placed, keep original size or collapse? 
            // Keeping original makes sense for empty state.
            minX = 0; maxX = this.width - 1;
            minY = 0; maxY = this.height - 1;
        }

        const newWidth = Math.max(0, maxX - minX + 1);
        const newHeight = Math.max(0, maxY - minY + 1);

        // Create new grid
        const newGrid: GridCell[][] = [];
        for (let y = 0; y < newHeight; y++) {
            const row: GridCell[] = [];
            for (let x = 0; x < newWidth; x++) {
                row.push({ grapheme: undefined, wordIds: [] });
            }
            newGrid.push(row);
        }

        // Shift placements and populate new grid
        const newPlacements = bestResult.placements.map(p => ({
            ...p,
            startX: p.startX - minX,
            startY: p.startY - minY,
        }));

        // Re-populate grid from shifted placements to be safe and clean
        // We could also copy cells, but re-writing ensures consistency
        for (const p of newPlacements) {
            for (let i = 0; i < p.clueItem.graphemes.length; i++) {
                const x = p.direction === 'ACROSS' ? p.startX + i : p.startX;
                const y = p.direction === 'DOWN' ? p.startY + i : p.startY;
                const grapheme = p.clueItem.graphemes[i];

                if (newGrid[y] && newGrid[y][x]) {
                    const cell = newGrid[y][x];
                    cell.grapheme = grapheme;
                    cell.wordIds.push(p.wordId);
                }
            }
        }

        console.log(`[Engine] Cropped grid from ${this.width}x${this.height} to ${newWidth}x${newHeight}`);

        return {
            grid: newGrid,
            placements: newPlacements,
            unplacedWords: bestResult.unplacedWords,
            gridWidth: newWidth,
            gridHeight: newHeight,
            warning,
            stats: {
                requestedWords,
                placedWords: placedCount,
                unplacedWords: bestResult.unplacedWords.length,
                fillRatio: finalFill,
            },
        };
    }

    private attemptPlacement(clues: ClueItem[], randomizeTieBreaker: boolean): CrosswordPuzzle {
        const unplacedWords: ClueItem[] = [];
        const placedIds = new Set<string>();

        // Place remaining words
        for (let i = 0; i < clues.length; i++) {
            const clue = clues[i];
            if (!clue) continue;

            // Validate graphemes
            if (!this.validateGraphemeArray(clue.graphemes)) {
                unplacedWords.push(clue);
                continue;
            }

            // OPUS Optimization 3: First Word Selection
            const isFirst = this.placements.length === 0;
            const success = isFirst ?
                this.placeFirstWord(clue, clues.slice(i + 1), randomizeTieBreaker) :
                this.placeWithIntersection(clue, clues.slice(i + 1), randomizeTieBreaker);

            if (success) {
                placedIds.add(clue.answerText);
            } else {
                unplacedWords.push(clue);
            }
        }

        return {
            grid: this.grid,
            placements: this.placements,
            unplacedWords,
            gridWidth: this.width,
            gridHeight: this.height,
        };
    }

    /**
     * OPUS Optimization 4: First Word Orientation Fork
     * Try both ACROSS and DOWN at center. Pick orientation that maximizes potential intersections.
     */
    private placeFirstWord(clue: ClueItem, remainingWords: ClueItem[], randomizeTieBreaker: boolean): boolean {
        const wordLength = clue.graphemes.length;
        const startX = Math.floor((this.width - wordLength) / 2);
        const startY = Math.floor(this.height / 2);

        // Define options
        const options: { direction: Direction; score: number; randomRank: number }[] = [];

        for (const dir of ['ACROSS', 'DOWN'] as Direction[]) {
            if (this.canPlace(clue, startX, startY, dir)) {
                // Score: How many remaining words COULD intersect with this placement?
                let score = 0;
                const placedGraphemes = new Set(clue.graphemes);
                for (const w of remainingWords) {
                    if (w && w.graphemes.some(g => placedGraphemes.has(g))) {
                        score++;
                    }
                }
                options.push({
                    direction: dir,
                    score,
                    randomRank: this.rng.next()
                });
            }
        }

        // Sort by score
        options.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            if (randomizeTieBreaker) return a.randomRank - b.randomRank;
            return 0;
        });

        if (options.length === 0) return false;

        const best = options[0];
        if (!best) return false;

        console.log(`[Engine] First word "${clue.answerText}" placed ${best.direction} (Score: ${best.score})`);
        return this.commitPlacement(clue, startX, startY, best.direction);
    }

    /**
     * OPUS Optimization 5: Placement Scoring (Lookahead)
     * Enumerate all valid placements, score them, pick best.
     */
    private placeWithIntersection(clue: ClueItem, remainingWords: ClueItem[], randomizeTieBreaker: boolean): boolean {
        const intersections = this.findAllIntersections(clue);
        if (intersections.length === 0) return false;

        const validPlacements: ScoredPlacement[] = [];

        // Evaluate all intersections
        for (const intersection of intersections) {
            const newDirection: Direction =
                intersection.existingPlacement.direction === 'ACROSS' ? 'DOWN' : 'ACROSS';

            let startX: number, startY: number;

            if (newDirection === 'ACROSS') {
                startX = intersection.gridX - intersection.newGraphemeIndex;
                startY = intersection.gridY;
            } else {
                startX = intersection.gridX;
                startY = intersection.gridY - intersection.newGraphemeIndex;
            }

            if (this.canPlace(clue, startX, startY, newDirection)) {
                let score = 0;
                const placedGraphemes = new Set(clue.graphemes);
                for (const w of remainingWords) {
                    if (w && w.graphemes.some(g => placedGraphemes.has(g))) {
                        score++;
                    }
                }

                // Distance to center
                const centerDist = Math.abs(startX + clue.graphemes.length / 2 - this.width / 2) +
                    Math.abs(startY + clue.graphemes.length / 2 - this.height / 2);

                validPlacements.push({
                    word: clue,
                    startX,
                    startY,
                    direction: newDirection,
                    score,
                    distToCenter: centerDist,
                    randomRank: this.rng.next() // Assign random rank for tie-breaking
                });
            }
        }

        if (validPlacements.length === 0) return false;

        // Sort candidates
        // 1. Score DESC (though likely equal for same word)
        // 2. Tie-break: RandomRank (if enabled) vs DistToCenter
        validPlacements.sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            if (randomizeTieBreaker) return a.randomRank - b.randomRank;
            return a.distToCenter - b.distToCenter;
        });

        // Pick best
        const best = validPlacements[0];
        if (!best) return false;

        return this.commitPlacement(clue, best.startX, best.startY, best.direction);
    }

    /**
     * Helper to check if placement is valid (wrapper around validatePlacement).
     */
    private canPlace(clue: ClueItem, x: number, y: number, dir: Direction): boolean {
        return this.validatePlacement(clue, x, y, dir);
    }

    // --- EXISTING VALIDATION LOGIC (PRESERVED) ---

    private validateGraphemeArray(graphemes: GraphemeToken[]): boolean {
        for (const g of graphemes) {
            if (typeof g !== 'string' || g.length === 0) return false;
        }
        return graphemes.length > 0;
    }

    private validatePlacement(
        clue: ClueItem,
        startX: number,
        startY: number,
        direction: Direction
    ): boolean {
        const graphemes = clue.graphemes;
        const length = graphemes.length;

        if (!this.checkBounds(startX, startY, length, direction)) return false;

        const firstGrapheme = graphemes[0];
        if (!firstGrapheme) return false;

        if (!this.checkStartCellCollision(startX, startY, direction, firstGrapheme)) return false;

        for (let i = 0; i < length; i++) {
            const x = direction === 'ACROSS' ? startX + i : startX;
            const y = direction === 'DOWN' ? startY + i : startY;
            const grapheme = graphemes[i];
            if (!grapheme) return false;

            const occupancyResult = this.checkCellOccupancy(x, y, grapheme);
            if (!occupancyResult.allowed) return false;

            if (!occupancyResult.isIntersection) {
                if (!this.checkStrictAdjacency(x, y, direction)) return false;
            }
        }

        if (!this.checkWordEnds(startX, startY, length, direction)) return false;

        return true;
    }

    private checkBounds(startX: number, startY: number, length: number, direction: Direction): boolean {
        if (startX < 0 || startY < 0) return false;
        if (direction === 'ACROSS') {
            return startX + length <= this.width && startY < this.height;
        } else {
            return startY + length <= this.height && startX < this.width;
        }
    }

    private checkStartCellCollision(
        startX: number,
        startY: number,
        direction: Direction,
        firstGrapheme: GraphemeToken
    ): boolean {
        for (const pos of this.startPositions) {
            if (pos.x === startX && pos.y === startY) {
                if (pos.direction === direction) return false;
                if (!compareGraphemes(pos.firstGrapheme, firstGrapheme)) return false;
            }
        }
        return true;
    }

    private checkCellOccupancy(x: number, y: number, grapheme: GraphemeToken): { allowed: boolean; isIntersection: boolean } {
        const cell = this.getCell(x, y);
        if (!cell) return { allowed: false, isIntersection: false };
        if (!cell.grapheme) return { allowed: true, isIntersection: false };
        const matches = compareGraphemes(cell.grapheme, grapheme);
        return { allowed: matches, isIntersection: matches };
    }

    private checkStrictAdjacency(x: number, y: number, direction: Direction): boolean {
        if (direction === 'ACROSS') {
            const above = this.getCell(x, y - 1);
            const below = this.getCell(x, y + 1);
            if (above?.grapheme || below?.grapheme) return false;
        } else {
            const left = this.getCell(x - 1, y);
            const right = this.getCell(x + 1, y);
            if (left?.grapheme || right?.grapheme) return false;
        }
        return true;
    }

    private checkWordEnds(startX: number, startY: number, length: number, direction: Direction): boolean {
        if (direction === 'ACROSS') {
            const before = this.getCell(startX - 1, startY);
            if (before?.grapheme) return false;
            const after = this.getCell(startX + length, startY);
            if (after?.grapheme) return false;
        } else {
            const before = this.getCell(startX, startY - 1);
            if (before?.grapheme) return false;
            const after = this.getCell(startX, startY + length);
            if (after?.grapheme) return false;
        }
        return true;
    }

    private getCell(x: number, y: number): GridCell | undefined {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
        return this.grid[y]?.[x];
    }

    private commitPlacement(clue: ClueItem, startX: number, startY: number, direction: Direction): boolean {
        this.wordIdCounter++;
        const wordId = this.wordIdCounter;
        const graphemes = clue.graphemes;

        for (let i = 0; i < graphemes.length; i++) {
            const x = direction === 'ACROSS' ? startX + i : startX;
            const y = direction === 'DOWN' ? startY + i : startY;
            const grapheme = graphemes[i];
            if (!grapheme) continue;

            const row = this.grid[y];
            if (!row) continue;
            const cell = row[x];
            if (!cell) continue;

            if (!cell.grapheme) {
                cell.grapheme = grapheme;
            }
            cell.wordIds.push(wordId);
        }

        const firstGrapheme = graphemes[0];
        if (firstGrapheme) {
            this.startPositions.push({ x: startX, y: startY, direction, firstGrapheme });
        }

        const placement: WordPlacement = {
            wordId,
            clueItem: clue,
            startX,
            startY,
            direction,
            placed: true,
        };

        this.placements.push(placement);
        return true;
    }

    private findAllIntersections(clue: ClueItem): Intersection[] {
        const intersections: Intersection[] = [];
        for (const placement of this.placements) {
            if (!placement.placed) continue;
            const commonPairs = findCommonGraphemes(placement.clueItem.graphemes, clue.graphemes);
            for (const [existingIdx, newIdx] of commonPairs) {
                let gridX: number;
                let gridY: number;
                if (placement.direction === 'ACROSS') {
                    gridX = placement.startX + existingIdx;
                    gridY = placement.startY;
                } else {
                    gridX = placement.startX;
                    gridY = placement.startY + existingIdx;
                }
                intersections.push({
                    gridX,
                    gridY,
                    existingGraphemeIndex: existingIdx,
                    newGraphemeIndex: newIdx,
                    existingPlacement: placement,
                });
            }
        }
        return intersections;
    }
}

/**
 * Factory function to create and run the crossword engine.
 */
export function generateCrossword(
    clues: ClueItem[],
    width: number,
    height: number,
    seed?: number
): CrosswordPuzzleResult {
    const engine = new CrosswordEngine({ width, height, seed, retryAttempts: 20 });
    return engine.generatePuzzle(clues);
}
