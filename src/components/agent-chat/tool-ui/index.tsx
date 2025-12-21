/**
 * Tool UI Registry
 *
 * Exports specialized tool components and creates the by_name mapping
 * for Assistant UI's MessagePrimitive.Parts components.
 */

export { ReadTool } from './read-tool';
export { BashTool } from './bash-tool';
export { SearchTool } from './search-tool';

// Re-export default ToolCallPart as fallback
export { ToolCallPart } from '../tool-call-part';

import { ReadTool } from './read-tool';
import { BashTool } from './bash-tool';
import { SearchTool } from './search-tool';

/**
 * Tool name to component mapping for Assistant UI
 *
 * Maps specific tool names to their specialized renderers.
 * Tools not in this map will use the Fallback component.
 */
export const toolsByName = {
  // File operations
  Read: ReadTool,

  // Shell operations
  Bash: BashTool,

  // Search operations
  Glob: SearchTool,
  Grep: SearchTool,
} as const;
