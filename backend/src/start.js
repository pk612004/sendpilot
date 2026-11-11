/**
 * Runs the API and the worker in ONE process.
 * Handy on hosting plans that give you a single free service.
 * Locally, keep using `npm run dev` (two separate processes).
 */
import './server.js';
import './worker.js';
