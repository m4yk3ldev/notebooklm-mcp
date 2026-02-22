import { launchChrome, refreshCookiesHeadless } from "./browser-auth.js";

async function test() {
  const args = process.argv.slice(2);
  
  if (args.includes("--refresh")) {
    console.log("Testing headless refresh...");
    try {
      const tokens = await refreshCookiesHeadless();
      console.log("Tokens extracted successfully:", Object.keys(tokens.cookies));
    } catch (err) {
      console.error("Refresh failed:", err);
      process.exit(1);
    }
    process.exit(0);
  }

  console.log("Testing visible launch...");
  await launchChrome(false);
  console.log("Visible Chrome launched. Waiting 5s...");
  await new Promise(r => setTimeout(r, 5000));
  
  console.log("\nTesting headless launch...");
  await launchChrome(true);
  console.log("Headless Chrome launched. Waiting 5s...");
  await new Promise(r => setTimeout(r, 5000));
  
  console.log("\nTests finished successfully.");
  process.exit(0);
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
