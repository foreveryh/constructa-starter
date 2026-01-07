/**
 * Claude Agent Module
 *
 * Exports session management and title extraction utilities.
 */

export { AgentSession, type AgentSessionConfig, type OutboundMessage } from './session';
export { SessionManager, getSessionManager, type SessionInfo } from './session-manager';
export { extractSessionTitle, generateFallbackTitle } from './title-generator';
