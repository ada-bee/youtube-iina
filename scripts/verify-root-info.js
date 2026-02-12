import { existsSync, readFileSync } from "fs";

const pluginInfoPath = "xyz.brbc.youtube.iinaplugin/Info.json";
const rootInfoPath = "Info.json";

if (!existsSync(rootInfoPath)) {
  console.error(`Missing ${rootInfoPath}. Run: bun run sync:root-info`);
  process.exit(1);
}

const pluginInfo = JSON.parse(readFileSync(pluginInfoPath, "utf8"));
const rootInfo = JSON.parse(readFileSync(rootInfoPath, "utf8"));

const expected = {
  identifier: pluginInfo.identifier,
  version: pluginInfo.version,
  ghVersion: pluginInfo.ghVersion,
};

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

if (!isObject(rootInfo)) {
  console.error(`${rootInfoPath} must be a JSON object.`);
  process.exit(1);
}

const rootKeys = Object.keys(rootInfo).sort();
const expectedKeys = Object.keys(expected).sort();
if (JSON.stringify(rootKeys) !== JSON.stringify(expectedKeys)) {
  console.error(
    `${rootInfoPath} must only contain keys: ${expectedKeys.join(", ")}. ` +
      "Run: bun run sync:root-info"
  );
  process.exit(1);
}

for (const [key, value] of Object.entries(expected)) {
  if (rootInfo[key] !== value) {
    console.error(
      `${rootInfoPath} ${key} mismatch (expected ${value}, got ${rootInfo[key]}). ` +
        "Run: bun run sync:root-info"
    );
    process.exit(1);
  }
}

console.log(`${rootInfoPath} is in sync with ${pluginInfoPath}.`);
