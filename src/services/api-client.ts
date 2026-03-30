const API_BASE_URL = "https://prycd-comps.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.PRYCD_API_KEY || "";
const RAPIDAPI_HOST = "prycd-comps.p.rapidapi.com";
const USER_ID = process.env.PRYCD_USER_ID || "wilco-mcp";

if (!RAPIDAPI_KEY) {
  console.error(
    "Warning: PRYCD_API_KEY environment variable not set. Set it to your RapidAPI key for Prycd."
  );
}

export function getUserId(): string {
  return USER_ID;
}

export async function apiRequest<T>(
  endpoint: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
): Promise<T> {
  const { method = "POST", body } = options;

  const url = `${API_BASE_URL}/${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": RAPIDAPI_HOST,
  };

  const fetchOptions: RequestInit = { method, headers };
  if (body && method === "POST") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `Prycd API error (${response.status}): ${errorText}. ` +
        `Endpoint: ${method} ${endpoint}. ` +
        getErrorSuggestion(response.status)
    );
  }

  return (await response.json()) as T;
}

function getErrorSuggestion(status: number): string {
  switch (status) {
    case 403:
      return "Check that PRYCD_API_KEY is set correctly and your RapidAPI subscription is active.";
    case 404:
      return "The endpoint was not found. Verify the request parameters.";
    case 429:
      return "Rate limit exceeded. You may have hit your RapidAPI plan limits. Wait and try again.";
    default:
      return "Check the Prycd API documentation for details.";
  }
}
