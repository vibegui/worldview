import {
  type App,
  type McpUiHostContext,
  useApp,
  useHostStyles,
} from "@modelcontextprotocol/ext-apps/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface McpViewState {
  connected: boolean;
  loading: boolean;
  toolName?: string;
  toolResult?: unknown;
  error?: string;
}

interface McpContextValue extends McpViewState {
  callTool: <T>(name: string, args?: Record<string, unknown>) => Promise<T>;
  hostContext?: McpUiHostContext;
}

const McpContext = createContext<McpContextValue | null>(null);

/**
 * Standalone means this bundle is being served to a plain browser at `/` rather
 * than read as a resource by an MCP host. The worker sets the flag when it
 * serves the page. There is no host bridge in that case, so tool calls go over
 * HTTP JSON-RPC to the same `/mcp` endpoint, authenticated by the session
 * cookie — same tools, same server, one transport switch.
 */
const STANDALONE =
  typeof window !== "undefined" &&
  (window as { __STANDALONE__?: boolean }).__STANDALONE__ === true;

let rpcId = 0;

async function callToolOverHttp(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch("/mcp", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: (rpcId += 1),
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (response.status === 401) {
    // The session expired. In production `/` is the login form; under the dev
    // server vite owns `/`, so the worker origin is passed in — otherwise this
    // bounces between two pages that both say nothing.
    const login =
      (window as { __LOGIN_URL__?: string }).__LOGIN_URL__ ?? "/";
    window.location.assign(login);
    throw new Error("Session expired");
  }
  if (!response.ok) {
    throw new Error(`${name} failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    error?: { message?: string };
    result?: {
      isError?: boolean;
      structuredContent?: unknown;
      content?: Array<{ type: string; text?: string }>;
    };
  };
  if (payload.error) {
    throw new Error(payload.error.message ?? `${name} returned an error`);
  }
  const result = payload.result;
  if (result?.isError) {
    const text = result.content?.find((item) => item.type === "text");
    throw new Error(text?.text ?? `${name} returned an error`);
  }
  return result?.structuredContent;
}

export function McpProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<McpViewState>({
    // No host will ever connect in standalone, so waiting for one would hang
    // the app on its loading state forever.
    connected: STANDALONE,
    loading: false,
  });
  const [hostContext, setHostContext] = useState<
    McpUiHostContext | undefined
  >();

  const onAppCreated = useCallback((created: App) => {
    created.ontoolinput = (params) => {
      setView((current) => ({
        ...current,
        loading: true,
        toolName: current.toolName,
        error: undefined,
        toolResult: undefined,
      }));
      if (created.getHostContext()?.toolInfo?.tool.name) {
        setView((current) => ({
          ...current,
          toolName: created.getHostContext()?.toolInfo?.tool.name,
        }));
      }
      void params;
    };

    created.ontoolresult = (result) => {
      const text = result.content?.find((item) => item.type === "text");
      setView((current) => ({
        ...current,
        loading: false,
        toolResult: result.structuredContent,
        error: result.isError && text?.type === "text" ? text.text : undefined,
      }));
    };

    created.ontoolcancelled = () => {
      setView((current) => ({
        ...current,
        loading: false,
        error: "Tool call cancelled",
      }));
    };

    created.onerror = (error) => {
      setView((current) => ({
        ...current,
        loading: false,
        error: String(error),
      }));
    };

    created.onhostcontextchanged = (context) => {
      setHostContext((current) => ({ ...current, ...context }));
    };
  }, []);

  const { app, isConnected } = useApp({
    appInfo: {
      name: "VibeGui Worldview OS",
      version: "0.1.0",
    },
    capabilities: {},
    onAppCreated,
  });

  useHostStyles(app, app?.getHostContext());

  useEffect(() => {
    if (!isConnected) return;
    const context = app?.getHostContext();
    setHostContext(context);
    setView((current) => ({
      ...current,
      connected: true,
      toolName: current.toolName ?? context?.toolInfo?.tool.name,
    }));
  }, [app, isConnected]);

  const callTool = useCallback(
    async <T,>(
      name: string,
      args: Record<string, unknown> = {},
    ): Promise<T> => {
      if (!app && !STANDALONE) throw new Error("MCP App is not connected");
      setView((current) => ({
        ...current,
        loading: true,
        toolName: name,
        toolResult: undefined,
        error: undefined,
      }));

      try {
        let structuredContent: unknown;
        if (app) {
          const result = await app.callServerTool({ name, arguments: args });
          if (result.isError) {
            const text = result.content?.find((item) => item.type === "text");
            throw new Error(
              text?.type === "text" ? text.text : `${name} returned an error`,
            );
          }
          structuredContent = result.structuredContent;
        } else {
          structuredContent = await callToolOverHttp(name, args);
        }
        setView((current) => ({
          ...current,
          loading: false,
          toolResult: structuredContent,
        }));
        return structuredContent as T;
      } catch (error) {
        setView((current) => ({
          ...current,
          loading: false,
          error: String(error),
        }));
        throw error;
      }
    },
    [app],
  );

  const value = useMemo(
    () => ({ ...view, callTool, hostContext }),
    [callTool, hostContext, view],
  );

  return <McpContext.Provider value={value}>{children}</McpContext.Provider>;
}

export function useMcp(): McpContextValue {
  const context = useContext(McpContext);
  if (!context) {
    throw new Error("useMcp must be used inside McpProvider");
  }
  return context;
}
