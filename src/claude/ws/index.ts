/**
 * Claude WebSocket Module
 *
 * Exports WebSocket server utilities for Claude Agent communication.
 */

export { createAgentWebSocketServer, agentWebSocketPlugin } from './server';
export { createAgentWebSocketServer as createBootstrapWebSocketServer } from './bootstrap';
