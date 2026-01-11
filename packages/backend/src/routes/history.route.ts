import { FastifyInstance } from 'fastify';
import { listCrosswords, getCrosswordBundle } from '../services/persistence.service.js';

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
}
