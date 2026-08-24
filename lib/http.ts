// Reading an API response without lying about what went wrong.
//
// The pattern this replaces was `const data = await res.json()` inside a
// try, with a catch that said the network could not be reached. That catch
// fires for a genuine network failure and equally for a server that
// answered with something that is not JSON, so a configuration fault or a
// crash was reported to the merchant as a connectivity problem. They then
// check their data bundle, which is fine, and try again, which cannot help.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; offline?: boolean };

export async function callApi<T>(
  input: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    // Genuinely could not reach the server: no response at all.
    return {
      ok: false,
      offline: true,
      error: "We could not reach the network just now. Tap again in a moment.",
    };
  }

  // The server answered. Whatever is wrong is not the merchant's signal.
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : response.status >= 500
          ? "Something went wrong on our side. Tap again in a moment."
          : "That did not go through. Tap again.";
    return { ok: false, error: message, status: response.status };
  }

  if (body === null) {
    return {
      ok: false,
      status: response.status,
      error: "We got an unexpected reply. Tap again in a moment.",
    };
  }

  return { ok: true, data: body as T };
}
