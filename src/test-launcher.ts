import { launchChrome } from "./browser-auth.js";

async function test() {
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
