#!/usr/bin/env node

/**
 * AST MCP Server
 * Wraps the Always Scheming Terminal /api/v1/ endpoints as MCP tools.
 *
 * Setup:
 *   export AST_API_KEY=ast_your_key_here
 *   export AST_BASE_URL=https://terminal.always-scheming.com  # optional, this is the default
 *   npx ts-node index.ts
 *
 * Or add to Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "ast": {
 *         "command": "node",
 *         "args": ["/path/to/mcp-server/dist/index.js"],
 *         "env": { "AST_API_KEY": "ast_your_key_here" }
 *       }
 *     }
 *   }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerSignalsTool } from './tools/getSignals';
import { registerItemsTool } from './tools/getItems';
import { registerEntitiesTool } from './tools/getEntities';
import { registerBriefTool } from './tools/getBrief';

const AST_API_KEY = process.env.AST_API_KEY;
const AST_BASE_URL = process.env.AST_BASE_URL || 'https://terminal.always-scheming.com';

if (!AST_API_KEY) {
  console.error('AST_API_KEY environment variable is required');
  process.exit(1);
}

const server = new McpServer(
  {
    name: 'ast-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {},
  }
);

// Register tools
registerSignalsTool(server, AST_BASE_URL, AST_API_KEY);
registerItemsTool(server, AST_BASE_URL, AST_API_KEY);
registerEntitiesTool(server, AST_BASE_URL, AST_API_KEY);
registerBriefTool(server, AST_BASE_URL, AST_API_KEY);

// Start stdio transport
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});