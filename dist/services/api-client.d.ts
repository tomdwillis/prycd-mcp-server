export declare function getUserId(): string;
export declare function apiRequest<T>(endpoint: string, options?: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
}): Promise<T>;
//# sourceMappingURL=api-client.d.ts.map