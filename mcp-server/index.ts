#!/usr/bin/env node
/**
 * AST MCP Server — wraps /api/v1/ as MCP tools.
 * See README.md for setup instructions.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getSignals } from './tools/getSignals.js';
import { getItems } from './tools/getItems.js';
import { getEntities } from './tools/getEntities.js';
import { getBrief } from './tools/getBrief.js';

const server = new Server(
  { name: 'ast', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'ast_get_signals',
      description: 'Get recent investment signals (M&A, fundraising, earnings, layoffs…) extracted from gaming industry news by AST.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max signals (default 10, max 50)' },
          min_score: { type: 'number', description: 'Min investment relevance 0-1 (default 0.3)' },
          signal_type: { type: 'string', enum: ['acquisition','fundraising','earnings','layoffs','leadership','product_launch','regulatory','platform_change','macro'] },
        },
      },
    },
    {
      name: 'ast_get_items',
      description: 'Get recent gaming industry news articles with tags and importance scores.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max articles (default 20, max 100)' },
          date_from: { type: 'string', description: 'ISO date, e.g. 2026-08-01' },
          date_to: { type: 'string', description: 'ISO date' },
          min_importance: { type: 'number', description: 'Min importance score 0-1 (0.4+ for high-signal only)' },
        },
      },
    },
    {
      name: 'ast_get_entities',
      description: 'List tracked gaming companies (canonical names, tickers, segments).',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max entities (default 100)' },
          entity_type: { type: 'string', description: "e.g. 'company'" },
        },
      },
    },
    {
      name: 'ast_brief',
      description: "RAG-synthesized brief answering a natural-language query about gaming industry news. Best for questions like 'What happened with Roblox in the last 30 days?'",
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Natural language question' },
          limit: { type: 'number', description: 'Source articles to retrieve (default 5)' },
          date_from: { type: 'string', description: 'ISO date filter' },
          entity: { type: 'string', description: "Company to focus on, e.g. 'Roblox'" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  switch (name) {
    case 'ast_get_signals': return getSignals(args ?? {});
    case 'ast_get_items':   return getItems(args ?? {});
    case 'ast_get_entities': return getEntities(args ?? {});
    case 'ast_brief':       return getBrief(args ?? {});
    default: throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => console.error('AST MCP server running'));
