/**
 * Placement validator for manual_advanced mode.
 * 
 * Validates user-defined placements with the same rules
 * as the auto-placement engine:
 * - Bounds checking
 * - No illegal overlaps
 * - Grapheme correctness (one grapheme per cell)
 */

import type { ClueItem, GridCell, CrosswordPuzzle } from '../types/models.js';

/**
 * Manual placement input from user.
 */
export interface ManualPlacement {
    word: string;
    clue: string;
    row: number;
    col: number;
    direction: 'ACROSS' | 'DOWN';
}

/**
 * Validation error for a specific placement.
 */
export interface PlacementError {
    index: number;
    word: string;
    error: string;
}

/**
 * Validation result.
 */
export interface ValidationResult {
    valid: boolean;
    errors: PlacementError[];
    puzzle?: CrosswordPuzzle;
}

/**
 * Check if a placement is within grid bounds.
 */
function checkBounds(
    graphemes: string[],
    row: number,
    col: number,
    direction: 'ACROSS' | 'DOWN',
    gridWidth: number,
    gridHeight: number
): string | null {
    if (row < 0 || row >= gridHeight) {
        return `Row ${row} is out of bounds (0-${gridHeight - 1})`;
    }
    if (col < 0 || col >= gridWidth) {
        return `Column ${col} is out of bounds (0-${gridWidth - 1})`;
    }

    const endRow = direction === 'DOWN' ? row + graphemes.length - 1 : row;
    const endCol = direction === 'ACROSS' ? col + graphemes.length - 1 : col;

    if (endRow >= gridHeight) {
        return `Word extends beyond grid (row ${endRow} >= ${gridHeight})`;
    }
    if (endCol >= gridWidth) {
        return `Word extends beyond grid (col ${endCol} >= ${gridWidth})`;
    }

    return null;
}

/**
 * Check if a placement conflicts with existing cells.
 */
function checkConflicts(
    grid: GridCell[][],
    graphemes: string[],
    row: number,
    col: number,
    direction: 'ACROSS' | 'DOWN'
): string | null {
    for (let i = 0; i < graphemes.length; i++) {
        const cellRow = direction === 'DOWN' ? row + i : row;
        const cellCol = direction === 'ACROSS' ? col + i : col;

        const existingCell = grid[cellRow]?.[cellCol];
        if (existingCell?.grapheme) {
            // Cell is occupied - check if graphemes match (valid intersection)
            if (existingCell.grapheme !== graphemes[i]) {
                return `Conflict at (${cellRow}, ${cellCol}): expected "${graphemes[i]}" but cell has "${existingCell.grapheme}"`;
            }
        }
    }

    return null;
}

/**
 * Place a word in the grid.
 */
function placeWord(
    grid: GridCell[][],
    graphemes: string[],
    row: number,
    col: number,
    direction: 'ACROSS' | 'DOWN',
    wordId: number
): void {
    for (let i = 0; i < graphemes.length; i++) {
        const cellRow = direction === 'DOWN' ? row + i : row;
        const cellCol = direction === 'ACROSS' ? col + i : col;

        if (!grid[cellRow]) {
            grid[cellRow] = [];
        }
        if (!grid[cellRow][cellCol]) {
            grid[cellRow][cellCol] = { wordIds: [] };
        }

        grid[cellRow][cellCol].grapheme = graphemes[i];
        grid[cellRow][cellCol].wordIds.push(wordId);
    }
}

/**
 * Validate and build a crossword from manual placements.
 * 
 * Uses the same grapheme tokenization as the auto-placement engine.
 */
export function validateManualPlacements(
    placements: ManualPlacement[],
    clueItems: ClueItem[],
    gridWidth: number,
    gridHeight: number
): ValidationResult {
    const errors: PlacementError[] = [];

    // Initialize empty grid
    // Initialize empty grid
    const grid: GridCell[][] = [];
    for (let y = 0; y < gridHeight; y++) {
        const row: GridCell[] = [];
        for (let x = 0; x < gridWidth; x++) {
            row.push({ wordIds: [] });
        }
        grid.push(row);
    }

    // Validate each placement
    for (let i = 0; i < placements.length; i++) {
        const placement = placements[i];
        const clueItem = clueItems[i];

        if (!placement || !clueItem) {
            errors.push({
                index: i,
                word: placement?.word ?? 'unknown',
                error: 'Missing placement or clue data',
            });
            continue;
        }

        const graphemes = clueItem.graphemes;

        // Check bounds
        const boundsError = checkBounds(
            graphemes,
            placement.row,
            placement.col,
            placement.direction,
            gridWidth,
            gridHeight
        );
        if (boundsError) {
            errors.push({ index: i, word: placement.word, error: boundsError });
            continue;
        }

        // Check conflicts with existing placements
        const conflictError = checkConflicts(
            grid,
            graphemes,
            placement.row,
            placement.col,
            placement.direction
        );
        if (conflictError) {
            errors.push({ index: i, word: placement.word, error: conflictError });
            continue;
        }

        // Place the word
        placeWord(
            grid,
            graphemes,
            placement.row,
            placement.col,
            placement.direction,
            i + 1
        );
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // Build CrosswordPuzzle
    const puzzle: CrosswordPuzzle = {
        grid,
        gridWidth,
        gridHeight,
        placements: placements.map((p, i) => ({
            wordId: i + 1,
            clueItem: clueItems[i]!,
            startX: p.col,
            startY: p.row,
            direction: p.direction,
            placed: true,
        })),
        unplacedWords: [],
    };

    return { valid: true, errors: [], puzzle };
}
