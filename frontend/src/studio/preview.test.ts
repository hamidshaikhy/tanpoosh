import { expect, it } from "vitest";
import type { StudioManifest } from "@/lib/api/types";
import { previewFiles, previewKey } from "./preview";
import type { Outfit } from "./store";
import { readFileSync } from "node:fs";

const photo={file:"/studio-images/test.webp",width:1024,height:1536,bytes:10};
const manifest:StudioManifest={version:2,mode:"layers",notice:"",model:{...photo,id:"model",name:""},looks:[],garments:[
  {id:"shirt",slot:"top",label:"",origin:"test",colors:{white:{...photo,file:"/studio-images/shirt.webp"}}},
  {id:"pants",slot:"bottom",label:"",origin:"test",colors:{black:{...photo,file:"/studio-images/pants.webp"}}},
  {id:"shoes",slot:"shoes",label:"",origin:"test",colors:{black:{...photo,file:"/studio-images/shoes.webp"}}},
  {id:"glasses",slot:"accessory",label:"",origin:"test",colors:{black:{...photo,file:"/studio-images/glasses.webp"}}},
]};
const outfit:Outfit={top:{slug:"shirt",color:"white",size:"M"},bottom:{slug:"pants",color:"black",size:"32"},shoes:{slug:"shoes",color:"black",size:"42"}};

it("requires a complete outfit and never substitutes another product or color",()=>{
  expect(previewFiles(manifest,{top:outfit.top})).toBeNull();
  expect(previewFiles(manifest,{...outfit,top:{slug:"shirt",color:"blue",size:"M"}})).toBeNull();
  expect(previewFiles(manifest,{...outfit,accessory:{slug:"glasses",color:"black",size:"ONE"}})).toEqual([
    "/studio-images/shoes.webp","/studio-images/pants.webp","/studio-images/shirt.webp","/studio-images/glasses.webp",
  ]);
});
it("does not invalidate a photograph when the stock size changes",()=>{
  expect(previewKey({...outfit,top:{...outfit.top!,size:"L"}})).toBe(previewKey(outfit));
  expect(previewKey({...outfit,accessory:{slug:"glasses",color:"black",size:"ONE"}})).not.toBe(previewKey(outfit));
});
it("selects complete photographs only on an exact match including optional items",()=>{
  const complete:StudioManifest={...manifest,mode:"looks",looks:[{id:"formal",name:"",image:photo,selections:outfit}]};
  expect(previewFiles(complete,outfit)).toEqual([photo.file]);
  expect(previewFiles(complete,{...outfit,accessory:{slug:"glasses",color:"black",size:"ONE"}})).toBeNull();
});

it("covers all 2,520 supported combinations without substituting photographs", () => {
  const actual = JSON.parse(readFileSync("public/studio-images/manifest.json", "utf8")) as StudioManifest;
  const options = (slot: string) => actual.garments.filter(g => g.slot === slot).flatMap(g => Object.keys(g.colors).map(color => ({slug:g.id,color,size:null})));
  let count = 0;
  for (const top of options("top")) for (const bottom of options("bottom")) for (const shoes of options("shoes")) {
    for (const accessory of [null, ...options("accessory")]) {
      const selection: Outfit = {top,bottom,shoes,...(accessory ? {accessory} : {})};
      const files = previewFiles(actual, selection);
      expect(files).not.toBeNull();
      expect(files).toHaveLength(3 + Number(Boolean(accessory)));
      count++;
    }
  }
  expect(options("outerwear")).toEqual([]);
  expect(count).toBe(2_520);
});

it("never requests retired outerwear photos from a legacy outfit", () => {
  expect(previewFiles(manifest, {...outfit, outerwear: {slug:"coat",color:"navy",size:"M"}})).toEqual(previewFiles(manifest,outfit));
});
