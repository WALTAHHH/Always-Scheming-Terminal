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

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getSignals } from "./tools/getSignals.js";
import { getItems } from "./tools/getItems.js";
import { getEntities } from "./tools/getEntities.js";
import { getBrief } from "./tools/getBrief.js";

const server = new Server(
  { name: "ast", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ast_get_signals",
      description:
        "Get recent investment signals from the Always Scheming Terminal. Signals are LLM-extracted structured events (acquisitions, fundraising, earnings, layoffs, leadership changes, product launches) from gaming industry news. Use this to answer questions like 'what happened with Roblox?' or 'any recent M&A deals?'",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max signals to return (default 10, max 50)",
          },
          min_score: {
            type: "number",
            description:
              "Minimum investment relevance score 0-1 (default 0.3). Use 0.7+ for only market-moving events.",
          },
          signal_type: {
            type: "string",
            enum: [
              "acquisition",
              "fundraising",
              "earnings",
              "layoffs",
              "leadership",
              "product_launch",
              "regulatory",
              "platform_change",
              "macro",
            ],
            description: "Filter to a specific signal type",
          },
        },
      },
    },
    {
      name: "ast_get_items",
      description:
        "Get recent news articles and analysis from gaming industry sources. Returns raw articles with tags, not synthesized signals. Use for browsing recent news or filtering by company/date.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max articles to return (default 20, max 100)",
          },
          date_from: {
            type: "string",
            description: "ISO date string, e.g. 2026-08-01",
          },
          date_to: {
            type: "string",
            description: "ISO date string",
          },
          min_importance: {
            type: "number",
            description:
              "Minimum importance score 0-1. Use 0.4+ for high-signal articles only.",
          },
        },
      },
    },
    {
      name: "ast_get_entities",
      description:
        "List tracked gaming companies and entities. Returns canonical names, tickers, segments, and metadata. Use to look up whether a company is tracked or find its ticker symbol.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max entities (default 100)",
          },
          entity_type: {
            type: "string",
            description: "Filter by type, e.g. 'company'",
          },
        },
      },
    },
    {
      name: "ast_brief",
      description:
        "Get a synthesized intelligence brief answering a natural-language query about the gaming industry. Uses RAG over AST's article database with Gemini synthesis. Best for questions like 'What happened with Roblox in the last 30 days?' or 'Summarize recent M&A activity.'",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Natural language question about gaming industry news",
          },
          limit: {
            type: "number",
            description: "Number of source articles to retrieve (default 5)",
          },
          date_from: {
            type: "string",
            description: "ISO date string to restrict source articles",
          },
          entity: {
            type: "string",
            description:
              "Company name to focus the brief on, e.g. 'Roblox'",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "ast_get_signals":
      return getSignals(args ?? {});
    case "ast_get_items":
      return getItems(args ?? {});
    case "ast_get_entities":
      return getEntities(args ?? {});
    case "ast_brief":
      return getBrief(args ?? {});
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AST MCP server running on stdio");
}

main().catch(console.error);
