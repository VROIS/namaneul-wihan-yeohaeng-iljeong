import { getMcpClient } from "../server/services/mcp-client";
async function test() {
  const mcp = await getMcpClient();
  const query =
    "Goyang top museums landmarks tourist attractions tickets price entrance fee top 30 2024 with price and image";
  console.log("Searching:", query);
  const res = await mcp.googleSearch(query, { num: 30 });
  console.log("RAW RESULTS:", res.slice(0, 500), "...");
  process.exit(0);
}
test().catch(console.error);
