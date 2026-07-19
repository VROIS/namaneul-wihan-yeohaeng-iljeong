import { getMcpClient } from "../server/services/mcp-client";
async function run() {
  const mcp = await getMcpClient();
  const r = await mcp.googleSearch("paris top attractions");
  console.log(r);
  process.exit(0);
}
run();
