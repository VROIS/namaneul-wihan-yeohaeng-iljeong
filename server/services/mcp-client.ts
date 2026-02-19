/**
 * MCP 클라이언트 — noapi-google-search-mcp (python -m google_search_mcp) 연동
 * stdio spawn으로 프로세스 실행, callTool 호출
 */
import { spawn, ChildProcess } from "child_process";

const MCP_COMMAND = process.env.MCP_GOOGLE_SEARCH_COMMAND || "python";
const MCP_ARGS = process.env.MCP_GOOGLE_SEARCH_ARGS
  ? process.env.MCP_GOOGLE_SEARCH_ARGS.split(",")
  : ["-m", "google_search_mcp"];

const MCP_ENV = { ...process.env, PYTHONUNBUFFERED: "1" };

let clientInstance: McpClient | null = null;

export interface CallToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class McpClient {
  private proc: ChildProcess | null = null;
  private reqId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private buffer = "";

  async connect(): Promise<void> {
    if (this.proc) return;
    this.proc = spawn(MCP_COMMAND, MCP_ARGS, {
      stdio: ["pipe", "pipe", "inherit"],
      env: MCP_ENV,
    });
    this.proc.stdout?.on("data", (chunk) => this.onData(chunk));
    this.proc.on("error", (err) => {
      for (const [, { reject }] of this.pending) reject(err);
      this.pending.clear();
    });
    this.proc.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        for (const [, { reject }] of this.pending) reject(new Error(`MCP exited: ${code}`));
        this.pending.clear();
      }
      this.proc = null;
    });
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const id = ++this.reqId;
    await this.send({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "nubi-mcp", version: "1.0" },
      },
    });
    await this.send({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
  }

  private send(data: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = (data as any).id;
      if (id) this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify(data) + "\n";
      this.proc?.stdin?.write(msg, (err) => {
        if (err) reject(err);
      });
      if (!id) resolve(undefined);
    });
  }

  private onData(chunk: Buffer | string): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const id = msg.id;
        if (id != null && this.pending.has(id)) {
          const { resolve } = this.pending.get(id)!;
          this.pending.delete(id);
          resolve(msg.result ?? msg.error);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
    if (!this.proc) await this.connect();
    const id = ++this.reqId;
    const result = await Promise.race([
      this.send({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MCP callTool timeout (120s)")), 120000)
      ),
    ]);
    if (result?.content) return { content: result.content, isError: result.isError };
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }

  async googleSearch(query: string, options?: { num?: number; site?: string }): Promise<string> {
    const result = await this.callTool("google_search", { query, ...options });
    const text = result.content?.map((c) => c.text).filter(Boolean).join("\n") || "";
    return text;
  }

  async googleImages(query: string): Promise<string> {
    const result = await this.callTool("google_images", { query });
    return result.content?.map((c) => c.text).filter(Boolean).join("\n") || "";
  }

  async googleMaps(query: string): Promise<string> {
    const result = await this.callTool("google_maps", { query });
    return result.content?.map((c) => c.text).filter(Boolean).join("\n") || "";
  }

  disconnect(): void {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    clientInstance = null;
  }
}

export async function getMcpClient(): Promise<McpClient> {
  if (!clientInstance) clientInstance = new McpClient();
  return clientInstance;
}
