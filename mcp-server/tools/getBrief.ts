import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';

export function registerBriefTool(server: McpServer, baseUrl: string, apiKey: string) {
  server.registerTool(
    'ast_get_brief',
    {
      title: 'Get AST Brief',
      description: 'Synthesized brief for a query (stub if /brief not live yet).',
      inputSchema: z.object({
        query: z.string().describe('Query to generate brief about'),
      }),
    },
    async (args: { query: string }) => {
      // Try to call the brief endpoint if it exists, otherwise return stub
      try {
        const response = await axios.post(`${baseUrl}/api/v1/brief`, {
          query: args.query,
        }, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, -1),
            },
          ],
        };
      } catch (error: any) {
        // If endpoint not found (404), return stub message
        if (error.response?.status === 404) {
          return {
            content: [
              {
                type: 'text',
                text: `Brief endpoint not yet implemented. Query: "${args.query}"`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching brief: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}