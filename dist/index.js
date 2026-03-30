import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { registerCompTools } from "./tools/comps.js";
const server = new McpServer({
    name: "prycd-mcp-server",
    version: "1.0.0",
});
registerCompTools(server);
async function runStdio() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Prycd MCP server running on stdio");
}
async function runHTTP() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    // CORS
    app.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        next();
    });
    // Health check
    app.get("/", (_req, res) => {
        res.json({ status: "ok", name: "prycd-mcp-server" });
    });
    // OAuth endpoints (required by Claude.ai custom connectors)
    app.get("/authorize", (req, res) => {
        const redirectUri = req.query.redirect_uri;
        const state = req.query.state;
        if (!redirectUri) {
            res.status(400).json({ error: "Missing redirect_uri" });
            return;
        }
        const url = new URL(redirectUri);
        url.searchParams.set("code", "prycd_auth_code");
        if (state)
            url.searchParams.set("state", state);
        res.redirect(url.toString());
    });
    app.post("/token", (_req, res) => {
        res.json({
            access_token: "prycd_access_token",
            token_type: "Bearer",
            expires_in: 31536000,
        });
    });
    // MCP endpoint
    app.post("/mcp", async (req, res) => {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
    app.get("/mcp", (_req, res) => {
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. Use POST." },
            id: null,
        }));
    });
    app.delete("/mcp", (_req, res) => {
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed." },
            id: null,
        }));
    });
    const port = parseInt(process.env.PORT || "3000");
    app.listen(port, () => {
        console.error(`Prycd MCP server running on http://localhost:${port}/mcp`);
    });
}
const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
    runHTTP().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
else {
    runStdio().catch((error) => {
        console.error("Server error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map