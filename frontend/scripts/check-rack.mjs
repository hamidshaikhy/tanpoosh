// Run the live rack regression tests without the full suite's account/fixture setup.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
const temporary=mkdtempSync(path.join(os.tmpdir(),"tanpoosh-rack-"));
const config=path.join(temporary,"playwright.config.cjs");
writeFileSync(config,`module.exports=${JSON.stringify({testDir:path.resolve("e2e"),timeout:120000,expect:{timeout:20000},workers:1,reporter:"list",use:{baseURL:process.env.E2E_BASE_URL||"http://localhost:8088",viewport:{width:1440,height:900},launchOptions:{channel:"chrome",args:["--enable-webgl","--ignore-gpu-blocklist","--use-angle=swiftshader","--enable-unsafe-swiftshader"]}}})}`);
try{execFileSync(process.execPath,["node_modules/@playwright/test/cli.js","test","rack.spec.ts","--config",config],{stdio:"inherit"});}finally{unlinkSync(config);rmdirSync(temporary);}
