import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDir = resolve(root, "dist");
const result = await build({
  entryPoints: [resolve(root, "src", "app.ts")],
  bundle: true,
  write: false,
  minify: false,
  format: "iife",
  target: ["es2020"],
  legalComments: "none",
});

const template = await readFile(resolve(root, "src", "index.html"), "utf8");
const css = await readFile(resolve(root, "src", "styles.css"), "utf8");
const javascript = result.outputFiles[0].text.replaceAll("</script>", "<\\/script>");
const html = template
  .replace("/*__INLINE_CSS__*/", css)
  .replace("/*__INLINE_JS__*/", javascript);

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, "StencilBuilder.html"), html, "utf8");
console.log(`Built: ${resolve(outputDir, "StencilBuilder.html")}`);
