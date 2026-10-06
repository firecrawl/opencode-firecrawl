import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Browser sign-in against Firecrawl's OAuth server: dynamic client registration, PKCE, and a loopback redirect.
 * The token is minted for the REST API resource, which accepts it as a bearer token in place of an API key.
 */
const ISSUER = "https://www.firecrawl.dev";
const RESOURCE = "https://api.firecrawl.dev/";
const SCOPE = "firecrawl:global offline_access";
const ATTEMPT_MS = 10 * 60_000;
const REQUEST_TIMEOUT_MS = 30_000;

export const METHOD_ID = "browser";

export type OAuthCredential = {
  type: "oauth";
  methodID: string;
  access: string;
  refresh: string;
  expires: number;
  metadata: { clientID: string };
};

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string };

async function request<T>(path: string, init: { json?: object; form?: Record<string, string> }): Promise<T> {
  const response = await fetch(`${ISSUER}${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": init.json ? "application/json" : "application/x-www-form-urlencoded" },
    body: init.json ? JSON.stringify(init.json) : new URLSearchParams(init.form),
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string; error_description?: string };
  if (!response.ok) {
    throw new Error(`Firecrawl sign-in failed at ${path}: ${body.error_description ?? body.error ?? response.status}`);
  }
  return body;
}

async function token(form: Record<string, string>, clientID: string, previousRefresh?: string): Promise<OAuthCredential> {
  const body = await request<TokenResponse>("/api/oauth/token", { form: { ...form, client_id: clientID, resource: RESOURCE } });
  const refresh = body.refresh_token ?? previousRefresh;
  if (!body.access_token || !refresh) throw new Error("Firecrawl sign-in returned no usable token. Sign in again.");
  return {
    type: "oauth",
    methodID: METHOD_ID,
    access: body.access_token,
    refresh,
    expires: Date.now() + (body.expires_in ?? 3600) * 1000,
    metadata: { clientID },
  };
}

function page(response: ServerResponse, status: number, message: string) {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(`<!doctype html><title>Firecrawl</title><p style="font-family:system-ui;margin:3rem">${message}</p>`);
}

/** Starts a sign-in: the returned url opens Firecrawl's consent page, and `callback` settles once the browser returns. */
export async function authorize() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const redirectURI = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;

  // CEILING: a loopback redirect's port changes per attempt, so each sign-in registers its own public client.
  // A hosted client ID metadata document (the server advertises support) would let one client cover every port.
  let clientID: string;
  try {
    ({ client_id: clientID } = await request<{ client_id: string }>("/api/oauth/register", {
      json: {
        client_name: "OpenCode",
        redirect_uris: [redirectURI],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SCOPE,
      },
    }));
  } catch (error) {
    server.close();
    throw error;
  }

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const url = new URL("/api/oauth/authorize", ISSUER);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientID,
    redirect_uri: redirectURI,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    scope: SCOPE,
    resource: RESOURCE,
  }).toString();

  const expiresAt = Date.now() + ATTEMPT_MS;
  const code = new Promise<string>((resolve, reject) => {
    const settle = () => {
      clearTimeout(timer);
      server.close();
    };
    const timer = setTimeout(() => {
      settle();
      reject(new Error("Firecrawl sign-in timed out."));
    }, ATTEMPT_MS);
    server.on("request", (request, response) => {
      const params = new URL(request.url ?? "/", redirectURI);
      // A request without the matching state is not this sign-in's redirect, so it cannot settle it.
      if (params.pathname !== "/callback" || params.searchParams.get("state") !== state) {
        return page(response, 404, "Not found.");
      }
      const error = params.searchParams.get("error");
      const received = params.searchParams.get("code");
      settle();
      if (error || !received) {
        page(response, 400, "Firecrawl sign-in was not completed. You can close this tab.");
        return reject(new Error(`Firecrawl sign-in was not completed: ${params.searchParams.get("error_description") ?? error}`));
      }
      page(response, 200, "Signed in to Firecrawl. You can close this tab and return to OpenCode.");
      resolve(received);
    });
  });

  return {
    url: url.toString(),
    instructions: "Sign in to Firecrawl in your browser and approve access for OpenCode.",
    mode: "auto" as const,
    expiresAt,
    callback: code.then((received) =>
      token({ grant_type: "authorization_code", code: received, redirect_uri: redirectURI, code_verifier: verifier }, clientID),
    ),
  };
}

export async function refresh(credential: { refresh: string; metadata?: Readonly<Record<string, unknown>> }) {
  const clientID = credential.metadata?.clientID;
  if (typeof clientID !== "string") throw new Error("This Firecrawl sign-in cannot be refreshed. Sign in again.");
  return token({ grant_type: "refresh_token", refresh_token: credential.refresh }, clientID, credential.refresh);
}
