import { getMcpClient } from "../server/services/mcp-client";
async function test() {
  try {
    const mcp = await getMcpClient();
    console.log("MCP Client initialized.");
    const query = "Goyang top museums landmarks tickets price entrance fee";
    console.log("Searching:", query);
    const res = await mcp.googleSearch(query, { num: 10 });
    console.log(`Search success! Found ${res.length} characters in response.`);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}
test();
