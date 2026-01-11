/**
 * Data directory configuration utility.
 * 
 * Resolves the crossword data directory with:
 * 1. Environment variable override (CROSSWORD_DATA_DIR)
 * 2. Fallback to repo-root/data/crosswords
 * 
 * Monorepo-safe: walks up directory tree to find repo root.
 */

import { existsSync, statSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Cached resolved data directory.
 */
let resolvedDataDir: string | null = null;

/**
 * Find the repository root by walking up the directory tree.
 * Looks for:
 * - package.json with "workspaces" field
 * - .git directory
 * 
 * @param startDir - Directory to start searching from
 * @returns Absolute path to repo root
 */
function findRepoRoot(startDir: string): string {
    let currentDir = resolve(startDir);
    const root = resolve('/');

    while (currentDir !== root) {
        // Check for .git directory
        const gitDir = join(currentDir, '.git');
        if (existsSync(gitDir)) {
            try {
                const stat = statSync(gitDir);
                if (stat.isDirectory()) {
                    return currentDir;
                }
            } catch {
                // Continue searching
            }
        }

        // Check for package.json with workspaces
        const packageJsonPath = join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(
                    require('fs').readFileSync(packageJsonPath, 'utf-8')
                );
                if (packageJson.workspaces) {
                    return currentDir;
                }
            } catch {
                // Continue searching
            }
        }

        // Check for pnpm-workspace.yaml (pnpm monorepo indicator)
        const pnpmWorkspace = join(currentDir, 'pnpm-workspace.yaml');
        if (existsSync(pnpmWorkspace)) {
            return currentDir;
        }

        // Move up one directory
        const parentDir = dirname(currentDir);
        if (parentDir === currentDir) {
            // Reached filesystem root
            break;
        }
        currentDir = parentDir;
    }

    // Fallback: use the starting directory
    console.warn('[Config] Could not find repo root, using start directory');
    return startDir;
}

/**
 * Get the current file's directory (ESM-safe).
 */
function getCurrentDir(): string {
    // For ESM modules
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        return dirname(fileURLToPath(import.meta.url));
    }
    // For CommonJS fallback
    return __dirname;
}

/**
 * Resolve the crossword data directory.
 * 
 * Resolution order:
 * 1. CROSSWORD_DATA_DIR environment variable
 * 2. <repo-root>/data/crosswords
 * 
 * @returns Absolute path to data directory
 */
export function resolveDataDir(): string {
    // Return cached value if available
    if (resolvedDataDir) {
        return resolvedDataDir;
    }

    // Check environment variable first
    const envDataDir = process.env['CROSSWORD_DATA_DIR'];
    if (envDataDir) {
        resolvedDataDir = resolve(envDataDir);
        return resolvedDataDir;
    }

    // Find repo root and construct default path
    const currentDir = getCurrentDir();
    const repoRoot = findRepoRoot(currentDir);
    resolvedDataDir = join(repoRoot, 'data', 'crosswords');

    return resolvedDataDir;
}

/**
 * Get the data directory (must be initialized first).
 * 
 * @returns Absolute path to data directory
 * @throws Error if not initialized
 */
export function getDataDir(): string {
    if (!resolvedDataDir) {
        // Auto-resolve if not initialized
        return resolveDataDir();
    }
    return resolvedDataDir;
}

/**
 * Initialize the data directory.
 * Creates the directory if it doesn't exist.
 * Logs the resolved path.
 * 
 * @throws Error if directory creation fails
 */
export function initializeDataDir(): void {
    const dataDir = resolveDataDir();

    try {
        // Create directory with mkdir -p semantics
        mkdirSync(dataDir, { recursive: true });

        // Verify it exists
        if (!existsSync(dataDir)) {
            throw new Error(`Failed to create directory: ${dataDir}`);
        }

        console.log(`📁 Crossword data directory: ${dataDir}`);

    } catch (error) {
        console.error(`[Config] FATAL: Failed to initialize data directory: ${dataDir}`);
        console.error(error);
        process.exit(1);
    }
}

/**
 * Check if we're in production mode.
 */
export function isProduction(): boolean {
    return process.env['NODE_ENV'] === 'production';
}

/**
 * Get debug info about the data directory.
 * Only available in non-production.
 */
export function getDataDirDebugInfo(): { dataDir: string; exists: boolean } | null {
    if (isProduction()) {
        return null;
    }

    const dataDir = getDataDir();
    return {
        dataDir,
        exists: existsSync(dataDir),
    };
}
