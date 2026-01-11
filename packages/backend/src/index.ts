/**
 * Fastify server entry point for the crossword generator API.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerGenerateRoutes } from './routes/generate.route.js';
import { registerHistoryRoutes } from './routes/history.route.js';
import { initializeDataDir, getDataDirDebugInfo, isProduction } from './config/data-dir.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

/**
 * Create and configure the Fastify server.
 */
async function createServer() {
    const fastify = Fastify({
        logger: true,
    });

    // Register CORS for frontend access
    await fastify.register(cors, {
        origin: true, // Allow all origins in development
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Register routes
    await registerGenerateRoutes(fastify);
    await registerHistoryRoutes(fastify);

    // Register debug endpoint (dev-only)
    if (!isProduction()) {
        fastify.get('/_debug/data-dir', async () => {
            const info = getDataDirDebugInfo();
            if (!info) {
                return { error: 'Not available in production' };
            }
            return info;
        });
    }

    return fastify;
}

/**
 * Start the server.
 */
async function start() {
    try {
        // Initialize data directory first (fail fast if can't create)
        initializeDataDir();

        const fastify = await createServer();

        await fastify.listen({ port: PORT, host: HOST });

        console.log(`\n📦 Crossword Generator API`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🚀 Server running at http://${HOST}:${PORT}`);
        console.log(`📋 API Endpoints:`);
        console.log(`   POST /generate-crossword`);
        console.log(`   GET  /crosswords`);
        console.log(`   GET  /crosswords/:id`);
        console.log(`   GET  /health`);
        console.log(`   GET  /api-status`);
        if (!isProduction()) {
            console.log(`   GET  /_debug/data-dir (dev-only)`);
        }
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        // Check Gemini configuration
        if (!process.env['GEMINI_API_KEY']) {
            console.log(`\n⚠️  Warning: GEMINI_API_KEY not set`);
            console.log(`   Set it with: export GEMINI_API_KEY=your_key`);
        } else {
            console.log(`\n✅ Gemini API configured`);
        }

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Run the server
start();
