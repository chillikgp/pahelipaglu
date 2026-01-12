import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Define minimal types needed for the script
interface PlacementsArtifact {
    placed: Array<{
        answer: string;
        clue: string;
        row: number;
        col: number;
        direction: 'ACROSS' | 'DOWN';
    }>;
    unplaced: Array<any>;
}

interface GridArtifact {
    width: number;
    height: number;
    cells: Array<Array<{ g: string | null }>>;
}

interface CrosswordMeta {
    gridSize: string;
    [key: string]: any;
}

const DATA_DIR = '/Users/saurav.sahu/Documents/randomprojects/crossword/data/crosswords';

async function main() {
    console.log('Starting backfill for grid resizing...');

    try {
        const entries = await readdir(DATA_DIR);
        const crosswords = entries.filter(e => !e.startsWith('.'));

        for (const cw of crosswords) {
            const cwDir = join(DATA_DIR, cw);
            console.log(`Processing ${cw}...`);

            // Read placements
            let placements: PlacementsArtifact;
            try {
                const content = await readFile(join(cwDir, 'placements.json'), 'utf-8');
                placements = JSON.parse(content);
            } catch (e) {
                console.warn(`  [WARN] Could not read placements.json for ${cw}. Skipping.`);
                continue;
            }

            if (!placements.placed || placements.placed.length === 0) {
                console.log(`  [SKIP] No placed words in ${cw}`);
                continue;
            }

            // Calculate bounding box
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            // We need grapheme length, but we might not have graphemes easily available in placements.
            // However, we can use the 'candidates.json' or assume answer length matches (which is risky for multi-codepoint graphemes).
            // Better approach: Read candidates.json to get grapheme length for each word.

            let candidates: any[] = [];
            try {
                const content = await readFile(join(cwDir, 'candidates.json'), 'utf-8');
                candidates = JSON.parse(content);
            } catch (e) {
                console.warn(`  [WARN] Could not read candidates.json for ${cw}. Calculating length using string/segmenter fallback.`);
            }

            // Map answer -> grapheme length
            const lengthMap = new Map<string, number>();
            if (candidates.length > 0) {
                for (const c of candidates) {
                    lengthMap.set(c.answer, c.graphemes.length);
                }
            } else {
                // Fallback: use Intl.Segmenter if available or simple length (risky for Hindi)
                // detailed segmenter is safer.
                // We don't know the language easily here without meta, but let's try to load meta first.
            }

            // If we can't get exact grapheme length easily without dependencies, let's load meta to get language first
            let meta: CrosswordMeta;
            try {
                const content = await readFile(join(cwDir, 'meta.json'), 'utf-8');
                meta = JSON.parse(content);
            } catch (e) {
                console.warn(`  [WARN] Could not read meta.json for ${cw}. Skipping.`);
                continue;
            }

            const segmenter = new Intl.Segmenter(meta.language || 'en-US', { granularity: 'grapheme' });

            for (const p of placements.placed) {
                // Determine length
                let len = lengthMap.get(p.answer);
                if (!len) {
                    // Fallback using segmenter on the answer string (which should be in placements)
                    // Note: placements.json has 'answer'.
                    len = [...segmenter.segment(p.answer)].length;
                }

                minX = Math.min(minX, p.col);
                minY = Math.min(minY, p.row); // placements use row/col (y/x)

                if (p.direction === 'ACROSS') {
                    maxX = Math.max(maxX, p.col + len - 1);
                    maxY = Math.max(maxY, p.row);
                } else {
                    maxX = Math.max(maxX, p.col);
                    maxY = Math.max(maxY, p.row + len - 1);
                }
            }

            // Current Grid Dimensions (from meta or grid.json)
            // Let's read grid.json to see current dimensions
            let grid: GridArtifact;
            try {
                const content = await readFile(join(cwDir, 'grid.json'), 'utf-8');
                grid = JSON.parse(content);
            } catch (e) {
                console.warn(`  [WARN] Could not read grid.json for ${cw}. Skipping.`);
                continue;
            }

            const currentWidth = grid.width;
            const currentHeight = grid.height;

            const contentWidth = Math.max(0, maxX - minX + 1);
            const contentHeight = Math.max(0, maxY - minY + 1);

            // Check if resize or shift is needed
            // If minX > 0 or minY > 0, we can shift.
            // If contentWidth < currentWidth or contentHeight < currentHeight, we can shrink.

            // NOTE: If minX is Infinity (no words), we skip.
            if (minX === Infinity) continue;

            const needsShift = minX > 0 || minY > 0;
            const needsShrink = contentWidth < currentWidth || contentHeight < currentHeight;

            if (!needsShift && !needsShrink) {
                console.log(`  [SKIP] ${cw} is already optimal (${currentWidth}x${currentHeight}).`);
                continue;
            }

            console.log(`  [UPDATE] Resizing ${cw} from ${currentWidth}x${currentHeight} to ${contentWidth}x${contentHeight} (Shift: -${minX}, -${minY})`);

            // 1. Update Placements
            for (const p of placements.placed) {
                p.col -= minX;
                p.row -= minY;
            }
            await writeFile(join(cwDir, 'placements.json'), JSON.stringify(placements, null, 2), 'utf-8');

            // 2. Update Grid
            // Create new empty grid
            const newCells: Array<Array<{ g: string | null }>> = [];
            for (let y = 0; y < contentHeight; y++) {
                const rowCells = [];
                for (let x = 0; x < contentWidth; x++) {
                    rowCells.push({ g: null as string | null });
                }
                newCells.push(rowCells);
            }

            // Populate new grid from shifted placements
            // (Re-generating from placements to ensure consistency)
            for (const p of placements.placed) {
                const wordGraphemes = [...segmenter.segment(p.answer)].map(s => s.segment);
                for (let i = 0; i < wordGraphemes.length; i++) {
                    const x = p.direction === 'ACROSS' ? p.col + i : p.col;
                    const y = p.direction === 'DOWN' ? p.row + i : p.row;
                    const grapheme = wordGraphemes[i];

                    if (newCells[y] && newCells[y][x]) {
                        newCells[y][x].g = grapheme;
                    }
                }
            }

            const newGrid: GridArtifact = {
                width: contentWidth,
                height: contentHeight,
                cells: newCells
            };
            await writeFile(join(cwDir, 'grid.json'), JSON.stringify(newGrid, null, 2), 'utf-8');


            // 3. Update Meta
            meta.gridSize = `${contentWidth}x${contentHeight}`;
            // Also update metadata inside meta if it exists
            if (meta.metadata) {
                // We don't track grid size there explicitly usually, but just in case
            }
            await writeFile(join(cwDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
        }
        console.log('Backfill complete.');
    } catch (err) {
        console.error('Fatal error:', err);
    }
}

main();
