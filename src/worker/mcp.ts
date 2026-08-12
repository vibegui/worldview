import type { AccessLevel, Env } from "./env.ts";
import { MCP_APP_MIME, readResource, resourcesForAccess } from "./resources.ts";
import { toolsForAccess } from "./tools.ts";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const SERVER_INFO = {
  name: "vibegui-personal-ai-os",
  version: "0.1.0",
};

const PROTOCOL_VERSION = "2024-11-05";

export async function handleMcpRequest(
  request: Request,
  env: Env,
  access: AccessLevel,
): Promise<Response> {
  const body = (await request
    .json()
    .catch(() => null)) as JsonRpcRequest | null;
  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return json(rpcError(null, -32600, "Invalid Request"), 400);
  }

  const id = body.id ?? null;
  try {
    const result = await dispatchMcp(env, access, body.method, body.params);
    return json(rpcOk(id, result));
  } catch (error) {
    const rpc = error as Error & { code?: number; data?: unknown };
    return json(
      rpcError(
        id,
        rpc.code ?? -32603,
        rpc.message || "Internal error",
        rpc.data,
      ),
    );
  }
}

export async function dispatchMcp(
  env: Env,
  access: AccessLevel,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions:
          access === "private" ? privateInstructions() : publicInstructions(),
      };

    case "ping":
      return {};

    case "tools/list":
      return {
        tools: toolsForAccess(env, access).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool._meta ? { _meta: tool._meta } : {}),
        })),
      };

    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : undefined;
      const args =
        params.arguments &&
        typeof params.arguments === "object" &&
        !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      if (!name) throw rpcErrorValue(-32602, "Missing tool name");

      // Re-checked on call, not just filtered from the list: guessing a name
      // must not reach a tool the caller cannot see. The same lookup covers a
      // module this instance never configured.
      const tool = toolsForAccess(env, access).find(
        (candidate) => candidate.name === name,
      );
      if (!tool) {
        throw rpcErrorValue(-32601, `Unknown tool: ${name}`);
      }

      const output = await tool.execute(env, args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
        isError: false,
      };
    }

    case "resources/list":
      return {
        resources: resourcesForAccess(access).map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: MCP_APP_MIME,
        })),
      };

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : undefined;
      if (!uri) throw rpcErrorValue(-32602, "Missing resource uri");

      const result = readResource(env, uri, access);
      if (!result) {
        throw rpcErrorValue(-32601, `Unknown resource: ${uri}`);
      }
      return {
        contents: [
          {
            uri,
            mimeType: MCP_APP_MIME,
            text: result.body,
          },
        ],
      };
    }

    case "prompts/list":
      return { prompts: [] };

    default:
      throw rpcErrorValue(-32601, `Method not found: ${method}`);
  }
}

function privateInstructions(): string {
  return [
    "You are the user's VibeGui Worldview OS, used privately through deco Studio.",
    "You exist to answer three questions: what the user's life is about, what game they are playing, and whether they are playing it well.",
    "At the beginning of a meaningful session, call GET_DECLARATION first, then GET_PORTFOLIO, LIST_GOALS, RECALL_MEMORY, and GET_DAILY_BRIEF before recommending priorities.",
    "There are two scores and only two: alignment (does this serve the declared future) and integrity (is it whole and complete — word, systems, and objects). Do not invent other scores.",
    "The declared future lives in git, in worldview.json. You cannot change it; propose an amendment for the user to commit.",
    "An idea is not something the user types. It is the gap between what should be and what is. Derive priorities from that gap and name the evidence that exposed it.",
    "Integrity is a positive property, not a moral one: whole and complete. A missed commitment is not the breach — leaving it unacknowledged is. When something will not be kept, help the user honor it: say so, say what happens instead and by when, and clean up the consequences.",
    "You declare, measure, and score. You never execute: no code, no pull requests, no publishing. Execution belongs to the user's software factory.",
    "Repositories and GitHub are read-only. Never claim to have changed an external project.",
    "You may maintain this system's own projects, goals, memory, decisions, captures, and daily briefs.",
    "Treat activity as evidence of attention, never as measured hours.",
    "Distinguish facts, observations, and recommendations. Cite repository or issue URLs when available.",
    "Persist only durable information. Routine conversation is not memory.",
    "Project lifecycle is explicit: draft, active, or archived. Do not invent additional priority labels.",
  ].join("\n");
}

function publicInstructions(): string {
  return [
    "You are connected to the public VibeGui writing tools.",
    "Only published writing is available. Private projects, goals, memory, captures, and conversations do not exist in this capability set.",
    "Cite article titles and canonical URLs when using the writing.",
  ].join("\n");
}

function rpcOk(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

function rpcErrorValue(
  code: number,
  message: string,
): Error & { code: number } {
  const error = new Error(message) as Error & { code: number };
  error.code = code;
  return error;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
