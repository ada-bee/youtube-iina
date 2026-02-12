import { readFileSync, writeFileSync } from "fs";

const pluginInfoPath = "xyz.brbc.youtube.iinaplugin/Info.json";
const rootInfoPath = "Info.json";

const pluginInfo = JSON.parse(readFileSync(pluginInfoPath, "utf8"));

if (typeof pluginInfo.identifier !== "string" || pluginInfo.identifier.trim() === "") {
  console.error("Missing or invalid identifier in plugin Info.json.");
  process.exit(1);
}

if (typeof pluginInfo.version !== "string" || pluginInfo.version.trim() === "") {
  console.error("Missing or invalid version in plugin Info.json.");
  process.exit(1);
}

if (!Number.isInteger(pluginInfo.ghVersion)) {
  console.error("Missing or invalid ghVersion in plugin Info.json.");
  process.exit(1);
}

const rootInfo = {
  identifier: pluginInfo.identifier,
  version: pluginInfo.version,
  ghVersion: pluginInfo.ghVersion,
};

writeFileSync(rootInfoPath, `${JSON.stringify(rootInfo, null, 2)}\n`, "utf8");
console.log(`Synced ${rootInfoPath} from ${pluginInfoPath}.`);
