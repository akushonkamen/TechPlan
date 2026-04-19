// WebSocket server for real-time skill execution progress

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { randomUUID } from "crypto";

interface ClientConnection {
  ws: WebSocket;
  executionId?: string;
}

export class SkillWebSocket {
  private wss: WebSocketServer;
  private clients = new Map<string, ClientConnection>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws) => {
      const clientId = randomUUID();
      this.clients.set(clientId, { ws });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          // Client can subscribe to a specific execution
          if (msg.type === 'subscribe' && msg.executionId) {
            const client = this.clients.get(clientId);
            if (client) {
              client.executionId = msg.executionId;
            }
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
      });
    });
  }

  /**
   * Send progress to all clients subscribed to an execution.
   */
  send(executionId: string, type: 'progress' | 'result' | 'error', data: string) {
    const message = JSON.stringify({ type, executionId, data });
    const entries = Array.from(this.clients.entries());

    for (const [, client] of entries) {
      if (client.executionId === executionId || !client.executionId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }

  close() {
    this.wss.close();
  }
}
