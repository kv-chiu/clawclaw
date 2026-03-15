import { updateAllProjects } from "./update.js";
import { discoverProjects } from "./discover.js";
import { researchRepos } from "./research.js";
import { renderReadme } from "./render.js";
import { generateFeed } from "./feed.js";
import { renderHtml } from "./html.js";

const command = process.argv[2];

async function main() {
  switch (command) {
    case "update":
      await updateAllProjects();
      break;
    case "discover":
      await discoverProjects();
      break;
    case "research":
      await researchRepos(process.argv.slice(3));
      break;
    case "render":
      await renderReadme();
      await generateFeed();
      await renderHtml();
      break;
    default:
      console.log("Usage: pnpm start <update|discover|research|render>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
