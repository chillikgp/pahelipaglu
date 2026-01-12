import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = '/Users/saurav.sahu/Documents/randomprojects/crossword/data/crosswords';

async function main() {
    console.log('Starting backfill of clues in placements.json...');

    try {
        const entries = await readdir(DATA_DIR);
        const crosswords = entries.filter(e => !e.startsWith('.'));

        for (const cw of crosswords) {
            const cwDir = join(DATA_DIR, cw);
            console.log(`Processing ${cw}...`);

            // Read candidates to get clue mapping, handle potential missing file
            let candidates = [];
            try {
                const candidatesContent = await readFile(join(cwDir, 'candidates.json'), 'utf-8');
                candidates = JSON.parse(candidatesContent);
            } catch (e) {
                console.warn(`  [WARN] Could not read candidates.json for ${cw}. Skipping.`);
                continue;
            }

            const clueMap = new Map<string, string>();
            for (const c of candidates) {
                clueMap.set(c.answer, c.clue);
            }

            // Read placements.json
            let placements;
            try {
                const placementsContent = await readFile(join(cwDir, 'placements.json'), 'utf-8');
                placements = JSON.parse(placementsContent);
            } catch (e) {
                console.warn(`  [WARN] Could not read placements.json for ${cw}. Skipping.`);
                continue;
            }

            let modified = false;

            // Update placed words
            if (placements.placed) {
                for (const p of placements.placed) {
                    if (!p.clue) {
                        const clue = clueMap.get(p.answer);
                        if (clue) {
                            p.clue = clue;
                            modified = true;
                        } else {
                            console.warn(`  [WARN] No clue found for answer "${p.answer}" in ${cw}`);
                            // Fallback to empty string to satisfy type if needed, or leave it. 
                            // Requirements say "always contain", so let's set it.
                            p.clue = '';
                            modified = true;
                        }
                    }
                }
            }

            // Update unplaced words
            if (placements.unplaced) {
                for (const u of placements.unplaced) {
                    if (!u.clue) {
                        const clue = clueMap.get(u.answer);
                        if (clue) {
                            u.clue = clue;
                            modified = true;
                        } else {
                            console.warn(`  [WARN] No clue found for unplaced answer "${u.answer}" in ${cw}`);
                            u.clue = '';
                            modified = true;
                        }
                    }
                }
            }

            if (modified) {
                await writeFile(join(cwDir, 'placements.json'), JSON.stringify(placements, null, 2), 'utf-8');
                console.log(`  [OK] Updated placements.json for ${cw}`);
            } else {
                console.log(`  [SKIP] No changes needed for ${cw}`);
            }
        }
    } catch (err) {
        console.error('Fatal error:', err);
    }
}

main();
