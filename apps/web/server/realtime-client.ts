/**
 * OpenAI Realtime API Client
 * Manages WebSocket connection to OpenAI Realtime API
 */

import WebSocket from "ws";
import {
  RealtimeServerEvent,
  RealtimeClientEvent,
  RealtimeSessionConfig,
  RealtimeModel,
} from "./types";

export interface RealtimeClientConfig {
  apiKey: string;
  model?: RealtimeModel;
  sessionConfig?: Partial<RealtimeSessionConfig>;
  onEvent?: (event: RealtimeServerEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export class RealtimeClient {
  private ws?: WebSocket;
  private config: RealtimeClientConfig;
  private sessionId?: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // Start with 1 second
  private eventHandlers: Map<string, Set<(event: RealtimeServerEvent) => void>> = new Map();

  constructor(config: RealtimeClientConfig) {
    this.config = config;
  }

  /**
   * Connect to OpenAI Realtime API
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const model = this.config.model || "gpt-realtime";
      const url = `wss://api.openai.com/v1/realtime?model=${model}`;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error("Realtime connection timeout"));
          this.ws?.close();
        }
      }, 10000); // 10 second timeout

      this.ws.on("open", () => {
        console.log("[Realtime] WebSocket connection opened");
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString()) as RealtimeServerEvent;
          this.handleEvent(event);

          // Resolve on session.created
          if (event.type === "session.created") {
            clearTimeout(connectionTimeout);
            this.sessionId = event.session.id;
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log(`[Realtime] Session created: ${this.sessionId}`);

            // Update session config if provided
            if (this.config.sessionConfig) {
              this.updateSession(this.config.sessionConfig);
            }

            resolve();
          }
        } catch (error) {
          console.error("[Realtime] Error parsing message:", error);
          this.config.onError?.(error as Error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("[Realtime] WebSocket error:", error);
        clearTimeout(connectionTimeout);
        this.config.onError?.(error);
        reject(error);
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[Realtime] WebSocket closed: ${code} - ${reason}`);
        this.isConnected = false;
        this.config.onClose?.();

        // Attempt reconnection with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.connect().catch((err) => {
              console.error("[Realtime] Reconnection failed:", err);
            });
          }, delay);
        }
      });
    });
  }

  /**
   * Handle incoming events from Realtime API
   */
  private handleEvent(event: RealtimeServerEvent): void {
    // Log event (can be disabled in production)
    if (event.type !== "rate_limits.updated") {
      console.log(`[Realtime] Event: ${event.type}`);
    }

    // Call global handler
    this.config.onEvent?.(event);

    // Call specific event handlers
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((handler) => handler(event));
    }

    // Handle errors
    if (event.type === "error") {
      console.error("[Realtime] Error event:", event.error);
      this.config.onError?.(new Error(event.error.message));
    }
  }

  /**
   * Subscribe to specific event types
   */
  on(eventType: string, handler: (event: RealtimeServerEvent) => void): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Send event to Realtime API
   */
  sendEvent(event: RealtimeClientEvent): void {
    if (!this.isConnected || !this.ws) {
      throw new Error("Realtime client not connected");
    }

    try {
      this.ws.send(JSON.stringify(event));
    } catch (error) {
      console.error("[Realtime] Error sending event:", error);
      throw error;
    }
  }

  /**
   * Update session configuration
   */
  updateSession(config: Partial<RealtimeSessionConfig>): void {
    this.sendEvent({
      type: "session.update",
      session: config,
    });
  }

  /**
   * Append audio to input buffer
   */
  appendAudio(audioBase64: string): void {
    this.sendEvent({
      type: "input_audio_buffer.append",
      audio: audioBase64,
    });
  }

  /**
   * Commit audio buffer (finalize user input)
   */
  commitAudio(): void {
    this.sendEvent({
      type: "input_audio_buffer.commit",
    });
  }

  /**
   * Clear audio buffer
   */
  clearAudio(): void {
    this.sendEvent({
      type: "input_audio_buffer.clear",
    });
  }

  /**
   * Request a response from the model
   */
  createResponse(config?: {
    instructions?: string;
    temperature?: number;
    max_output_tokens?: number | "inf";
  }): void {
    this.sendEvent({
      type: "response.create",
      response: config,
    });
  }

  /**
   * Cancel ongoing response
   */
  cancelResponse(): void {
    this.sendEvent({
      type: "response.cancel",
    });
  }

  /**
   * Truncate assistant audio that was generated but not heard by the user.
   */
  truncateAssistantAudio(itemId: string, contentIndex: number, audioEndMs: number): void {
    this.sendEvent({
      type: "conversation.item.truncate",
      item_id: itemId,
      content_index: contentIndex,
      audio_end_ms: Math.max(0, Math.floor(audioEndMs)),
    });
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    this.ws?.close();
  }

  /**
   * Get connection status
   */
  getStatus(): {
    isConnected: boolean;
    sessionId?: string;
  } {
    return {
      isConnected: this.isConnected,
      sessionId: this.sessionId,
    };
  }
}
