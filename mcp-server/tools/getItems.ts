import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';

export function registerItemsTool(server: McpServer, baseUrl: string, apiKey: string) {
  server.registerTool(
    'ast_get_items',
    {
      title: 'Get AST Items',
      description: 'Get recent news articles from AST.',
      inputSchema: z.object({
        source_id: z.string().optional().describe('Filter by source ID (optional)'),
        signal_type: z.string().optional().describe('Filter by signal type (optional)'),
        date_from: z.string().optional().describe('Start date (YYYY-MM-DD) (optional)'),
        date_to: z.string().optional().describe('End date (YYYY-MM-DD) (optional)'),
        limit: z.number().optional().describe('Max items to return (default 50)'),
        cursor: z.string().optional().describe('Pagination cursor (optional)'),
        min_importance: z.number().optional().describe('Minimum importance score 0-1 (optional)'),
      }),
    },
    async (args: {
      source_id?: string;
      signal_type?: string;
      date_from?: string;
      date_to?: string;
      limit?: number;
      cursor?: string;
      min_importance?: number;
    }) => {
      const params = new URLSearchParams();
      if (args.source_id) params.append('source_id', args.source_id);
      if (args.signal_type) params.append('signal_type', args.signal_type);
      if (args.date_from) params.append('date_from', args.date_from);
      if (args.date_to) params.append('date_to', args.date_to);
      if (args.limit) params.append('limit', args.limit.toString());
      if (args.cursor) params.append('cursor', args.cursor);
      if (args.min_importance) params.append('min_importance', args.min_importance.toString());

      try {
        const response = await axios.get(`${baseUrl}/api/v1/items`, {
          params,
          headers: {
            Authorization: `Bearer ${apiKey}`,
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
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching items: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}