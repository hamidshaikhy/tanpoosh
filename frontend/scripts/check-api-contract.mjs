import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "yaml";

const schema = parse(fs.readFileSync("src/lib/api/openapi.yaml", "utf8"));
const paths = Object.entries(schema.paths).map(([route, methods]) => ({
  route, methods,
  re: new RegExp("^" + route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{[^}]+\\\}/g, "[^/]+") + "$"),
}));
const errors = [];
let checked = 0;
const dynamic = new Set();

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts") ? [path.join(dir, e.name)] : []);
}
for (const file of files("src")) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["api", "publicGet", "publicGetOrNull"].includes(node.expression.text)) {
      const arg = node.arguments[0];
      let route;
      if (arg && ts.isStringLiteralLike(arg)) route = arg.text;
      else if (arg && ts.isTemplateExpression(arg)) route = arg.head.text + arg.templateSpans.map((span) => "VALUE" + span.literal.text).join("");
      else { dynamic.add(file); ts.forEachChild(node, visit); return; }
      route = "/api/v1" + route.split("?")[0];
      let methods = ["get"];
      const opts = node.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        const prop = opts.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === "method");
        if (prop && ts.isStringLiteralLike(prop.initializer)) methods = [prop.initializer.text.toLowerCase()];
        else if (prop && ts.isConditionalExpression(prop.initializer) && ts.isStringLiteralLike(prop.initializer.whenTrue) && ts.isStringLiteralLike(prop.initializer.whenFalse)) methods = [prop.initializer.whenTrue.text, prop.initializer.whenFalse.text].map((m) => m.toLowerCase());
        else if (prop) { dynamic.add(file); ts.forEachChild(node, visit); return; }
      }
      checked++;
      // Taxonomy's kind is a closed two-value union; verify both actual dispatches.
      const routes = route.startsWith("/api/v1/manage/VALUE") ? [route.replace("/manage/VALUE", "/manage/categories"), route.replace("/manage/VALUE", "/manage/collections")] : [route];
      if (!routes.every((r) => methods.every((m) => paths.some((p) => p.re.test(r) && p.methods[m])))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        errors.push(`${file}:${line}: ${methods.join("/").toUpperCase()} ${route}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`API contract: ${checked} literal/template calls match paths and methods. ${dynamic.size} files use dynamic dispatch (runtime E2E coverage).`);
