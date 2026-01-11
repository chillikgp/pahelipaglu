/**
 * Core data models for the crossword generator system.
 * All types are designed to be grapheme-safe and support multi-language content.
 */

/**
 * A single grapheme cluster. This represents one visual character,
 * which may consist of multiple Unicode code points.
 * Example: "क्" in Hindi is a single grapheme but multiple codepoints.
 */
export type GraphemeToken = string;

/**
 * Supported input types for crossword generation.
 */
export type InputType = 'TOPIC' | 'URL' | 'PDF' | 'TEXT';

/**
 * Generation mode.
 */
export type GenerationMode = 'ai' | 'manual_basic' | 'manual_advanced';

/**
 * Input contract for the crossword generation API.
 */
export interface AIInput {
    /** Unique session identifier */
    sessionId: string;
    /** BCP-47 locale code (e.g., "hi-IN", "en-US") */
    contentLanguage: string;
    /** Type of input being provided */
    inputType: InputType;
    /** The actual input value (topic name, URL, text content, etc.) */
    inputValue: string;
    /** Number of answer-clue pairs to generate */
    numItems: number;
    /** Additional instructions for the AI */
    userInstructions: string;
    /** Grid width in cells */
    gridSizeX: number;
    /** Grid height in cells */
    gridSizeY: number;
    /** Optional fixed grid size (overrides X/Y if provided) */
    fixedGridSize?: number;
    /** Whether to exclude words that couldn't be placed from output */
    removeUnplacedWords: boolean;
}

/**
 * A clue item with its answer broken down into grapheme tokens.
 */
export interface ClueItem {
    /** The answer broken into individual grapheme clusters */
    graphemes: GraphemeToken[];
    /** The original answer text (normalized to NFC) */
    answerText: string;
    /** The clue text in natural language */
    clueText: string;
}

/**
 * A single cell in the crossword grid.
 */
export interface GridCell {
    /** The grapheme displayed in this cell (undefined if empty) */
    grapheme?: GraphemeToken;
    /** IDs of words that pass through this cell */
    wordIds: number[];
}

/**
 * Direction of word placement.
 */
export type Direction = 'ACROSS' | 'DOWN';

/**
 * Represents the placement of a word in the grid.
 */
export interface WordPlacement {
    /** Unique word identifier (1-indexed for output compatibility) */
    wordId: number;
    /** The clue item being placed */
    clueItem: ClueItem;
    /** X coordinate of the starting cell */
    startX: number;
    /** Y coordinate of the starting cell */
    startY: number;
    /** Direction of the word */
    direction: Direction;
    /** Whether the word was successfully placed */
    placed: boolean;
}

/**
 * Complete crossword puzzle data structure.
 */
export interface CrosswordPuzzle {
    /** The grid of cells [y][x] */
    grid: GridCell[][];
    /** All word placements (both placed and unplaced) */
    placements: WordPlacement[];
    /** Words that could not be placed in the grid */
    unplacedWords: ClueItem[];
    /** Grid width */
    gridWidth: number;
    /** Grid height */
    gridHeight: number;
    /** warning message (optional) */
    warning?: string;
}

/**
 * Raw answer-clue pair from Gemini API.
 */
export interface RawClue {
    answer: string;
    clue: string;
}

/**
 * API response structure.
 */
export interface GenerateResponse {
    success: boolean;
    /** Unique identifier for the generated crossword */
    crosswordId?: string;
    puzzle?: CrosswordPuzzle;
    payload?: string;
    error?: string;
    /** Warning message if filter or placement had issues */
    warning?: string;
    metadata?: {
        /** Words requested from Gemini */
        requestedWords: number;
        /** Words that passed suitability filter */
        filteredWords: number;
        /** Words successfully placed in grid */
        placedWords: number;
        /** Words that couldn't be placed */
        unplacedWords: number;
        /** Content language */
        language: string;
        /** Fill ratio: placedWords / filteredWords */
        fillRatio?: number;
        /** Generation mode used */
        mode?: GenerationMode;
    };
}

/**
 * Intersection point for crossword placement.
 */
export interface Intersection {
    /** X position in the grid where intersection would occur */
    gridX: number;
    /** Y position in the grid where intersection would occur */
    gridY: number;
    /** Index in the existing word's graphemes */
    existingGraphemeIndex: number;
    /** Index in the new word's graphemes */
    newGraphemeIndex: number;
    /** The word placement being intersected */
    existingPlacement: WordPlacement;
}
