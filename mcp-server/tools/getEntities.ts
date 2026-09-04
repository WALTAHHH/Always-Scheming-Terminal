import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';

export function registerEntitiesTool(server: McpServer, baseUrl: string, apiKey: string) {
  server.registerTool(
    'ast_get_entities',
    {
      title: 'Get AST Entities',
      description: 'Get list of tracked companies and other entities.',
      inputSchema: z.object({
        alias: z.string().optional().describe('Lookup entity by alias or canonical name (optional)'),
        entity_type: z.string().optional().describe('Filter by entity type (optional)'),
        limit: z.number().optional().describe('Max entities to return (default 100)'),
        cursor: z.string().optional().describe('Pagination cursor (optional)'),
      }),
    },
    async (args: {
      alias?: string;
      entity_type?: string;
      limit?: number;
      cursor?: string;
    }) => {
      const params = new URLSearchParams();
      if (args.alias) params.append('alias', args.alias);
      if (args.entity_type) params.append('entity_type', args.entity_type);
      if (args.limit) params.append('limit', args.limit.toString());
      if (args.cursor) params.append('cursor', args.cursor);

      try {
        const response = await axios.get(`${baseUrl}/api/v1/entities`, {
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
              text: `Error fetching entities: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}