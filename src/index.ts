import { updateAllProjects } from "./update.js";
import { discoverProjects } from "./discover.js";
import { renderReadme } from "./render.js";

const command = process.argv[2];

async function main() {
  switch (command) {
    case "update":
      await updateAllProjects();
      break;
    case "discover":
      await discoverProjects();
      break;
    case "render":
      await renderReadme();
      break;
    default:
      console.log("Usage: pnpm start <update|discover|render>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
