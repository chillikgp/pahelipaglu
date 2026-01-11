/**
 * API types matching the backend models.
 */

export type InputType = 'TOPIC' | 'URL' | 'PDF' | 'TEXT';

export interface GenerateRequest {
    sessionId: string;
    contentLanguage: string;
    mode?: GenerationMode;
    // AI Mode fields
    inputType?: InputType;
    inputValue?: string;
    numItems?: number;
    userInstructions?: string;
    // Manual Mode fields
    words?: Array<{
        word: string;
        clue: string;
        row?: number;
        col?: number;
        direction?: 'ACROSS' | 'DOWN';
    }>;
    // Shared fields
    gridSizeX: number;
    gridSizeY: number;
    fixedGridSize?: number;
    removeUnplacedWords: boolean;
    seed?: number;
}

export interface PlacedWord {
    number: number;
    answer: string;
    clue: string;
    startX: number;
    startY: number;
    direction: 'ACROSS' | 'DOWN';
    graphemeCount: number;
}

export interface UnplacedWord {
    answer: string;
    clue: string;
    graphemeCount: number;
}

export interface GridCell {
    grapheme?: string;
    wordIds: number[];
}

export interface GenerateResponse {
    success: boolean;
    crosswordId?: string;
    payload?: string;
    warning?: string;
    puzzle?: {
        grid: GridCell[][];
        placements: Array<{
            wordId: number;
            clueItem: {
                graphemes: string[];
                answerText: string;
                clueText: string;
            };
            startX: number;
            startY: number;
            direction: 'ACROSS' | 'DOWN';
            placed: boolean;
        }>;
        unplacedWords: Array<{
            graphemes: string[];
            answerText: string;
            clueText: string;
        }>;
        gridWidth: number;
        gridHeight: number;
        stats?: {
            requestedWords: number;
            placedWords: number;
            unplacedWords: number;
            fillRatio: number;
        };
    };
    metadata?: {
        requestedWords: number;
        filteredWords: number;
        placedWords: number;
        unplacedWords: number;
        language: string;
        fillRatio?: number;
    };
    error?: string;
}

export interface ApiStatus {
    geminiConfigured: boolean;
    supportedLanguages: string[];
    supportedInputTypes: InputType[];
    maxGridSize: number;
    maxItems: number;
}

export const LANGUAGES = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'hi-IN', name: 'Hindi (हिंदी)' },
    { code: 'es-ES', name: 'Spanish (Español)' },
    { code: 'fr-FR', name: 'French (Français)' },
] as const;

/**
 * Generation mode for crosswords.
 */
export type GenerationMode = 'ai' | 'manual_basic' | 'manual_advanced';

/**
 * List item for history view (from summary.json).
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
 * Full crossword artifact bundle.
 */
export interface CrosswordBundle {
    meta: {
        id: string;
        theme: string;
        language: string;
        gridSize: string;
        requestedCount: number;
        createdAt: string;
        userId: string;
        mode: GenerationMode;
    };
    summary: {
        mode: GenerationMode;
        placedCount: number;
        unplacedCount: number;
        filteredCount: number;
        requestedCount: number;
        fillRatio: number;
        warning?: string;
    };
    grid?: {
        width: number;
        height: number;
        cells: Array<Array<{ g: string | null }>>;
    };
    placements?: {
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
    };
}
