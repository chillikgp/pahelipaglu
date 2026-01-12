import { FastifyInstance } from 'fastify';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { listCrosswords, getCrosswordBundle, crosswordExists } from '../services/persistence.service.js';
import { getDataDir } from '../config/data-dir.js';

/**
 * Register history routes.
 */
export async function registerHistoryRoutes(fastify: FastifyInstance) {
    // List all crosswords
    fastify.get('/crosswords', async () => {
        const list = await listCrosswords();
        return {
            success: true,
            crosswords: list
        };
    });

    // Get specific crossword bundle
    fastify.get<{ Params: { id: string } }>('/crosswords/:id', async (request, reply) => {
        const { id } = request.params;
        const bundle = await getCrosswordBundle(id);

        if (!bundle) {
            return reply.status(404).send({
                success: false,
                error: 'Crossword not found'
            });
        }

        return {
            success: true,
            crossword: bundle
        };
    });

    // Save polyomino JSON for a crossword
    fastify.post<{ Params: { id: string }; Body: unknown }>(
        '/crosswords/:id/polyomino',
        async (request, reply) => {
            const { id } = request.params;
            const polyominoData = request.body;

            // Verify crossword exists
            const exists = await crosswordExists(id);
            if (!exists) {
                return reply.status(404).send({
                    success: false,
                    error: 'Crossword not found'
                });
            }

            // Validate basic structure
            if (
                typeof polyominoData !== 'object' ||
                polyominoData === null ||
                !('pieces' in polyominoData)
            ) {
                return reply.status(400).send({
                    success: false,
                    error: 'Invalid polyomino data structure'
                });
            }

            try {
                const crosswordDir = join(getDataDir(), id);
                const polyominoPath = join(crosswordDir, 'polyomino.json');
                await writeFile(polyominoPath, JSON.stringify(polyominoData, null, 2), 'utf-8');

                console.log(`[History] Saved polyomino.json for ${id}`);

                return {
                    success: true,
                    message: 'Polyomino saved successfully'
                };
            } catch (error) {
                console.error('[History] Error saving polyomino:', error);
                return reply.status(500).send({
                    success: false,
                    error: 'Failed to save polyomino'
                });
            }
        }
    );
}
