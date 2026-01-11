/**
 * Gemini AI service for generating answer-clue pairs.
 * Uses the Google Generative AI SDK to communicate with Gemini.
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIInput, ClueItem, RawClue } from '../types/models.js';
import { toGraphemes, cleanAnswerText, normalizeNFC } from '../utils/grapheme.js';

// Environment variable for API key
const GEMINI_API_KEY = process.env['GEMINI_API_KEY'];

if (!GEMINI_API_KEY) {
    console.warn('Warning: GEMINI_API_KEY environment variable is not set');
}

/**
 * Create the Gemini client instance.
 */
function createGeminiClient() {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required');
    }
    return new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Custom request options with Referer header for API key restrictions.
 */
const REQUEST_OPTIONS = {
    customHeaders: new Headers({
        'Referer': 'https://www.defenceprep.in/',
    }),
};

/**
 * Build the prompt for generating crossword clues.
 */
function buildPrompt(input: AIInput): string {
    const languageInstructions = getLanguageInstructions(input.contentLanguage);

    return `You are a crossword puzzle creator. Generate ${input.numItems} answer-clue pairs for a crossword puzzle.

TOPIC/CONTENT: ${input.inputValue}

LANGUAGE: ${input.contentLanguage}
${languageInstructions}

USER INSTRUCTIONS: ${input.userInstructions || 'None provided'}

REQUIREMENTS:
1. Each answer must be a single word or phrase (no spaces in the answer)
2. Answers should be culturally appropriate for the target language
3. Prefer well-known, modern entities
4. Avoid punctuation, emojis, or special formatting in answers
5. Clues should be clear and unambiguous
6. Clues should be in the same language as the answers
7. Answers should vary in length for better crossword grid placement
8. Aim for answers between 3-12 characters/graphemes

OUTPUT FORMAT:
Return a valid JSON array with exactly ${input.numItems} objects:
[
  { "answer": "...", "clue": "..." },
  { "answer": "...", "clue": "..." }
]

Return ONLY the JSON array, no additional text or markdown formatting.`;
}

/**
 * Get language-specific instructions for the prompt.
 */
function getLanguageInstructions(locale: string): string {
    const language = locale.split('-')[0];

    switch (language) {
        case 'hi':
            return `
- Answers must be in Hindi (Devanagari script)
- Use modern Hindi vocabulary
- Avoid English loanwords unless commonly used
- Clues should be in Hindi
- Use proper Hindi grammar and sentence structure`;

        case 'en':
            return `
- Answers must be in English
- Use standard American/British English spelling
- Clues should be concise and clever`;

        case 'es':
            return `
- Answers must be in Spanish
- Use proper Spanish accents where required
- Clues should be in Spanish`;

        case 'fr':
            return `
- Answers must be in French
- Use proper French accents where required
- Clues should be in French`;

        default:
            return `
- Answers should be in the language indicated by the locale code
- Use proper script and character set for the language
- Clues should be in the same language as answers`;
    }
}

/**
 * Parse the raw JSON response from Gemini.
 * Handles malformed JSON by attempting repair and regex extraction.
 */
function parseGeminiResponse(responseText: string): RawClue[] {
    // Try to extract JSON from the response
    let jsonText = responseText.trim();

    // Log for debugging
    console.log(`[Gemini] Parsing response of length ${jsonText.length}`);

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
    }

    if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
    }

    jsonText = jsonText.trim();

    // Try to find the JSON array boundaries
    const startIdx = jsonText.indexOf('[');
    const endIdx = jsonText.lastIndexOf(']');

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonText = jsonText.slice(startIdx, endIdx + 1);
    }

    // First try: direct parse
    try {
        const parsed = JSON.parse(jsonText) as unknown;
        if (Array.isArray(parsed)) {
            return extractClues(parsed);
        }
    } catch {
        console.log('[Gemini] Direct parse failed, attempting repair...');
    }

    // Second try: fix truncated JSON by finding last complete object
    try {
        // Find the last complete object (ends with })
        const lastCompleteObj = jsonText.lastIndexOf('}');
        if (lastCompleteObj !== -1) {
            const repairedJson = jsonText.slice(0, lastCompleteObj + 1) + ']';
            const parsed = JSON.parse(repairedJson) as unknown;
            if (Array.isArray(parsed)) {
                console.log('[Gemini] Repaired truncated JSON successfully');
                return extractClues(parsed);
            }
        }
    } catch {
        console.log('[Gemini] Repair failed, using regex extraction...');
    }

    // Third try: extract individual objects using regex
    const clues: RawClue[] = [];
    const objectRegex = /\{\s*"answer"\s*:\s*"([^"]+)"\s*,\s*"clue"\s*:\s*"([^"]+)"\s*\}/g;

    let match;
    while ((match = objectRegex.exec(responseText)) !== null) {
        const answer = match[1];
        const clue = match[2];
        if (answer && clue) {
            clues.push({ answer, clue });
        }
    }

    // Also try alternative order (clue first)
    const altRegex = /\{\s*"clue"\s*:\s*"([^"]+)"\s*,\s*"answer"\s*:\s*"([^"]+)"\s*\}/g;
    while ((match = altRegex.exec(responseText)) !== null) {
        const clue = match[1];
        const answer = match[2];
        if (answer && clue) {
            clues.push({ answer, clue });
        }
    }

    if (clues.length > 0) {
        console.log(`[Gemini] Extracted ${clues.length} clues via regex`);
        return clues;
    }

    throw new Error('Could not parse any clues from response');
}

/**
 * Extract valid clues from parsed array.
 */
function extractClues(parsed: unknown[]): RawClue[] {
    const clues: RawClue[] = [];

    for (const item of parsed) {
        if (
            typeof item === 'object' &&
            item !== null &&
            'answer' in item &&
            'clue' in item &&
            typeof item.answer === 'string' &&
            typeof item.clue === 'string'
        ) {
            clues.push({
                answer: item.answer,
                clue: item.clue,
            });
        }
    }

    return clues;
}

/**
 * Convert raw clues to ClueItems with grapheme tokenization.
 */
function processClues(rawClues: RawClue[], locale: string): ClueItem[] {
    return rawClues
        .map((raw) => {
            // Clean and normalize the answer
            const cleanedAnswer = cleanAnswerText(raw.answer);

            if (cleanedAnswer.length === 0) {
                return null;
            }

            // Tokenize into graphemes
            const graphemes = toGraphemes(cleanedAnswer, locale);

            // Skip answers that are too short or too long
            if (graphemes.length < 2 || graphemes.length > 20) {
                return null;
            }

            return {
                graphemes,
                answerText: cleanedAnswer,
                clueText: normalizeNFC(raw.clue.trim()),
            };
        })
        .filter((item): item is ClueItem => item !== null);
}

/**
 * Generate answer-clue pairs using Gemini AI.
 * 
 * @param input - The AI input configuration
 * @returns GenerateCluesResult with clues and metadata for persistence
 */
export async function generateClues(input: AIInput): Promise<GenerateCluesResult> {
    const genAI = createGeminiClient();

    // Use Gemini 2.5 Flash as specified
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 16384,
        },
    });

    const prompt = buildPrompt(input);

    console.log(`[Gemini] Generating ${input.numItems} clues for: ${input.inputValue}`);
    console.log(`[Gemini] Language: ${input.contentLanguage}`);

    try {
        const result = await model.generateContent(prompt, REQUEST_OPTIONS);
        const response = result.response;
        const responseText = response.text();

        console.log(`[Gemini] Raw response received (${responseText.length} chars)`);

        // Parse the response
        const rawClues = parseGeminiResponse(responseText);
        console.log(`[Gemini] Parsed ${rawClues.length} raw clues`);

        // Process clues into ClueItems
        const clueItems = processClues(rawClues, input.contentLanguage);
        console.log(`[Gemini] Processed ${clueItems.length} valid clue items`);

        return {
            clues: clueItems,
            prompt,
            model: 'gemini-2.5-flash',
            rawResponse: responseText,
        };
    } catch (error) {
        console.error('[Gemini] Error generating clues:', error);
        throw new Error(`Failed to generate clues: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Result from generateClues including metadata for persistence.
 */
export interface GenerateCluesResult {
    clues: ClueItem[];
    prompt: string;
    model: string;
    rawResponse: string;
}

/**
 * Validate that the Gemini API is configured and accessible.
 */
export async function validateGeminiConfig(): Promise<boolean> {
    if (!GEMINI_API_KEY) {
        return false;
    }

    try {
        const genAI = createGeminiClient();
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Simple test request
        const result = await model.generateContent('Say "OK" if you receive this.', REQUEST_OPTIONS);
        const text = result.response.text();

        return text.toLowerCase().includes('ok');
    } catch {
        return false;
    }
}
