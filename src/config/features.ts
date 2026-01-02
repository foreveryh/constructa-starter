/**
 * Feature Toggle Configuration
 *
 * Controls which features are visible in the navigation.
 * Set to false to hide features temporarily, but keep the code for future use.
 */

export const FEATURE_CONFIG = {
  // Navigation features
  dashboard: false,      // Dashboard page - hidden
  chat: false,           // Chat page - hidden
  agentChat: false,      // Agent Chat page - hidden
  claudeChat: true,      // Claude Chat page - enabled (core feature)
  imageChat: false,      // Image Chat page - hidden
  documents: false,      // Documents page - hidden
  workflow: false,       // Workflow page - hidden

  // Cloud features (navClouds section)
  capture: false,        // Capture feature - hidden
  proposal: false,       // Proposal feature - hidden
  prompts: false,        // Prompts feature - hidden
} as const;

export type FeatureKey = keyof typeof FEATURE_CONFIG;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: FeatureKey): boolean {
  return FEATURE_CONFIG[feature] === true;
}

/**
 * Get enabled features
 */
export function getEnabledFeatures(): FeatureKey[] {
  return Object.keys(FEATURE_CONFIG).filter(
    (key) => FEATURE_CONFIG[key as FeatureKey] === true
  ) as FeatureKey[];
}
