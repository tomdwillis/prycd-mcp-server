import { z } from "zod";
import { apiRequest, getUserId } from "../services/api-client.js";
// --- Formatters ---
function formatComp(comp, distance) {
    const lines = [];
    const header = comp.address
        ? `**${comp.address}** — ${comp.city || ""}, ${comp.zip_code || ""}`
        : `**${comp.city || "Unknown"}**, ${comp.zip_code || ""}`;
    lines.push(header);
    lines.push(`  Price: ${comp.price} | Acreage: ${comp.acreage} | $/acre: ${comp.price_per_acre}`);
    lines.push(`  Status: ${comp.status} | Source: ${comp.source}`);
    if (distance !== undefined)
        lines.push(`  Distance: ${distance.toFixed(2)} mi`);
    if (comp.list_date)
        lines.push(`  Listed: ${comp.list_date}`);
    if (comp.sold_date)
        lines.push(`  Sold: ${comp.sold_date}`);
    if (comp.url)
        lines.push(`  Listing: ${comp.url}`);
    return lines.join("\n");
}
function formatGeographyResponse(data) {
    const sections = [];
    let totalComps = 0;
    for (const countyData of data) {
        const countyLines = [`## ${countyData.county}`, ""];
        for (const acreageGroup of countyData.comps) {
            countyLines.push(`### Acreage range: ${acreageGroup.acreage}`);
            countyLines.push(`${acreageGroup.comps.length} comps found`, "");
            for (const comp of acreageGroup.comps) {
                countyLines.push(formatComp(comp));
                countyLines.push("");
                totalComps++;
            }
        }
        sections.push(countyLines.join("\n"));
    }
    return [`**${totalComps} total comps found**`, "", ...sections].join("\n");
}
function formatLatLongResponse(data) {
    const lines = [`**${data.length} comps found**`, ""];
    for (const item of data) {
        lines.push(formatComp(item.comp, item.distance));
        lines.push("");
    }
    return lines.join("\n");
}
// --- Shared schemas ---
const compOptionsSchema = z.object({
    min_price: z.number().optional().describe("Minimum price filter"),
    max_price: z.number().optional().describe("Maximum price filter"),
    city: z.string().optional().describe("Filter by city name"),
    zip_code: z.string().optional().describe("Filter by ZIP code"),
    remove_duplicates: z.boolean().optional().default(true).describe("Remove duplicate comps"),
    excluded_sources: z
        .array(z.enum(["Zillow", "Realtor.com", "Redfin", "Lands of America", "Lands of America Off Market"]))
        .optional()
        .describe("Sources to exclude from results"),
    comp_type: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .default(0)
        .describe("0 = All comps, 1 = For Sale only, 2 = Sold only"),
    comp_age: z.number().int().optional().describe("Max age of comps in days (e.g. 365)"),
    get_historical: z.boolean().optional().describe("Pull historical sold comps based on comp_age"),
    only_valid_lat_long: z.boolean().optional().describe("Only return comps with valid coordinates"),
}).optional().describe("Optional filters for comp results");
function buildCompOptions(options) {
    if (!options)
        return undefined;
    const opts = {};
    if (options.min_price !== undefined)
        opts.min_price = options.min_price;
    if (options.max_price !== undefined)
        opts.max_price = options.max_price;
    if (options.city)
        opts.city = options.city;
    if (options.zip_code)
        opts.zip_code = options.zip_code;
    if (options.remove_duplicates !== undefined)
        opts.remove_duplicates = options.remove_duplicates;
    if (options.excluded_sources?.length)
        opts.excluded_sources = options.excluded_sources;
    if (options.comp_type !== undefined)
        opts.comp_type = options.comp_type;
    if (options.comp_age !== undefined)
        opts.comp_age = options.comp_age;
    if (options.get_historical !== undefined)
        opts.get_historical = options.get_historical;
    if (options.only_valid_lat_long !== undefined)
        opts.only_valid_lat_long = options.only_valid_lat_long;
    return Object.keys(opts).length > 0 ? opts : undefined;
}
// --- Tool Registration ---
export function registerCompTools(server) {
    // Comps by County
    server.registerTool("prycd_comps_by_county", {
        title: "Get Land Comps by County",
        description: `Search for land comps in one or more counties using the Prycd database.

Returns comparable land sales and listings from Zillow, Realtor.com, Redfin, and Lands of America.

Args:
  - counties (array): List of counties, each with "name" (include "County", e.g. "King County") and "state" (full name, e.g. "Washington")
  - acreages (array): Acreage ranges to search, each with "min" and "max" (e.g. {min: 5, max: 20})
  - comp_options (object, optional): Filters — min_price, max_price, city, zip_code, comp_type (0=All, 1=For Sale, 2=Sold), comp_age (days), excluded_sources, remove_duplicates, get_historical, only_valid_lat_long

Returns: Comps organized by county and acreage range, each with price, acreage, price per acre, status, source, listing URL, and dates.`,
        inputSchema: {
            counties: z
                .array(z.object({
                name: z.string().describe("County name including 'County' (e.g. 'King County')"),
                state: z.string().describe("Full state name (e.g. 'Washington')"),
            }))
                .min(1)
                .describe("List of counties to search"),
            acreages: z
                .array(z.object({
                min: z.number().describe("Minimum acreage"),
                max: z.number().describe("Maximum acreage"),
            }))
                .min(1)
                .describe("Acreage ranges to search"),
            comp_options: compOptionsSchema,
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        const body = {
            user_id: getUserId(),
            counties: params.counties,
            acreages: params.acreages,
        };
        const opts = buildCompOptions(params.comp_options);
        if (opts)
            body.comp_options = opts;
        const data = await apiRequest("compsByCounty", { body });
        if (!data.data?.length) {
            return { content: [{ type: "text", text: "No comps found for the specified counties and acreage ranges." }] };
        }
        return { content: [{ type: "text", text: formatGeographyResponse(data.data) }] };
    });
    // Comps by State
    server.registerTool("prycd_comps_by_state", {
        title: "Get Land Comps by State",
        description: `Search for land comps across one or more entire states using the Prycd database.

Best for broad market analysis. For more targeted searches, use comps by county or lat/long instead.

Args:
  - states (array): List of full state names (e.g. ["Montana", "Wyoming"])
  - acreages (array): Acreage ranges to search, each with "min" and "max"
  - comp_options (object, optional): Same filters as comps by county

Returns: Comps organized by county and acreage range.`,
        inputSchema: {
            states: z
                .array(z.string())
                .min(1)
                .describe("List of full state names (e.g. ['Montana', 'Wyoming'])"),
            acreages: z
                .array(z.object({
                min: z.number().describe("Minimum acreage"),
                max: z.number().describe("Maximum acreage"),
            }))
                .min(1)
                .describe("Acreage ranges to search"),
            comp_options: compOptionsSchema,
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        const body = {
            user_id: getUserId(),
            states: params.states,
            acreages: params.acreages,
        };
        const opts = buildCompOptions(params.comp_options);
        if (opts)
            body.comp_options = opts;
        const data = await apiRequest("compsByState", { body });
        if (!data.data?.length) {
            return { content: [{ type: "text", text: "No comps found for the specified states and acreage ranges." }] };
        }
        return { content: [{ type: "text", text: formatGeographyResponse(data.data) }] };
    });
    // Comps by Lat/Long
    server.registerTool("prycd_comps_by_location", {
        title: "Get Land Comps by Location (Lat/Long)",
        description: `Search for land comps within a radius of a specific latitude/longitude point.

Best for finding comps near a specific parcel. Returns results sorted by distance.

Args:
  - latitude (string): Latitude of the center point (e.g. "47.618")
  - longitude (string): Longitude of the center point (e.g. "-122.347")
  - min_acreage (number): Minimum acreage to search
  - max_acreage (number): Maximum acreage to search
  - radius (number): Search radius in miles (e.g. 10)
  - max_comps (number, optional): Maximum number of comps to return (default: 25)
  - comp_options (object, optional): Same filters as other comp tools

Returns: Comps sorted by distance from the center point, each with distance in miles.`,
        inputSchema: {
            latitude: z.string().describe("Latitude (e.g. '47.618')"),
            longitude: z.string().describe("Longitude (e.g. '-122.347')"),
            min_acreage: z.number().describe("Minimum acreage"),
            max_acreage: z.number().describe("Maximum acreage"),
            radius: z.number().describe("Search radius in miles"),
            max_comps: z.number().int().optional().default(25).describe("Max comps to return"),
            comp_options: compOptionsSchema,
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        const body = {
            user_id: getUserId(),
            latitude: params.latitude,
            longitude: params.longitude,
            min_acreage: params.min_acreage,
            max_acreage: params.max_acreage,
            radius: params.radius,
        };
        if (params.max_comps)
            body.max_comps = params.max_comps;
        const opts = buildCompOptions(params.comp_options);
        if (opts)
            body.comp_options = opts;
        const data = await apiRequest("compsByLatLong", { body });
        if (!data.data?.length) {
            return {
                content: [
                    {
                        type: "text",
                        text: `No comps found within ${params.radius} miles of (${params.latitude}, ${params.longitude}) for ${params.min_acreage}-${params.max_acreage} acres.`,
                    },
                ],
            };
        }
        return { content: [{ type: "text", text: formatLatLongResponse(data.data) }] };
    });
    // Health Check
    server.registerTool("prycd_health_check", {
        title: "Prycd API Health Check",
        description: `Check if the Prycd API is up and running. Use this to verify your API connection is working.

Returns: Status message from the Prycd API.`,
        inputSchema: {},
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async () => {
        const data = await apiRequest("healthcheck", {
            method: "GET",
        });
        return {
            content: [{ type: "text", text: `Prycd API status: ${data.status} — ${data.message}` }],
        };
    });
}
//# sourceMappingURL=comps.js.map