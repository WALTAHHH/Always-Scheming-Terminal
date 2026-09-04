import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import axios from 'axios';

export function registerSignalsTool(server: McpServer, baseUrl: string, apiKey: string) {
  server.registerTool(
    'ast_get_signals',
    {
      title: 'Get AST Signals',
      description: 'Get recent investment signals from AST. Signals are LLM-extracted structured events (acquisitions, fundraising, earnings, layoffs) from gaming industry news.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max signals to return (default 10, max 50)' },
          min_score: { type: 'number', description: 'Minimum investment relevance score 0-1 (default 0.3)' },
          signal_type: { 
            type: 'string', 
            enum: ['acquisition', 'fundraising', 'earnings', 'layoffs', 'leadership', 'product_launch', 'regulatory', 'platform_change', 'macro'],
            description: 'Filter by signal type (optional)'
          }
        }
      }
    },
    async (args: { limit?: number; min_score?: number; signal_type?: string }) => {
      const limit = args.limit ?? 10;
      const minScore = args.min_score ?? 0.3;
      const signalType = args.signal_type;

      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      params.append('min_score', minScore.toString());
      if (signalType) {
        params.append('signal_type', signalType);
      }

      try {
        const response = await axios.get(`${baseUrl}/api/v1/signals`, {
          params,
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        // If signal_type filter was provided but API doesn't support it, filter client-side
        let signals = response.data.signals;
        if (signalType && signals) {
          signals = signals.filter((s: any) => s.signal_type === signalType);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ signals, count: signals.length }, null, -1),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching signals: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}