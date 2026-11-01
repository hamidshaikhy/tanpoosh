import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RACK_EDIT } from "./catalog";

type Geometry = {positions:number[];uvs:number[];front:number[];back:number[];edge:number[];outline:number[]};

describe("garment surfaces stay joined at their silhouette",()=>{
  for(const {asset} of RACK_EDIT)it(`${asset} is a closed, consistently wound surface`,()=>{
    const mesh=JSON.parse(readFileSync(new URL(`../../public/rack/${asset}.json`,import.meta.url),"utf8")) as Geometry;
    const count=mesh.positions.length/3;
    const triangles=[...mesh.front,...mesh.back,...mesh.edge];
    const edges=new Map<string,{count:number;winding:number}>();
    const invalidFaces:number[]=[];
    let volume=0;
    expect(mesh.uvs).toHaveLength(count*2);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    for(let i=0;i<triangles.length;i+=3){
      const [a,b,c]=triangles.slice(i,i+3);
      const valid=[a,b,c].every(index=>Number.isInteger(index)&&index>=0&&index<count);
      if(!valid){invalidFaces.push(i/3);continue;}
      const [ax,ay,az]=mesh.positions.slice(a*3,a*3+3);
      const [bx,by,bz]=mesh.positions.slice(b*3,b*3+3);
      const [cx,cy,cz]=mesh.positions.slice(c*3,c*3+3);
      const nx=(by-ay)*(cz-az)-(bz-az)*(cy-ay);
      const ny=(bz-az)*(cx-ax)-(bx-ax)*(cz-az);
      const nz=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
      if(nx*nx+ny*ny+nz*nz<1e-20)invalidFaces.push(i/3);
      volume+=(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;
      for(const [x,y] of [[a,b],[b,c],[c,a]]){
        const key=x<y?`${x},${y}`:`${y},${x}`;
        const entry=edges.get(key)??{count:0,winding:0};
        entry.count++;entry.winding+=x<y?1:-1;edges.set(key,entry);
      }
    }
    expect(invalidFaces).toEqual([]);
    expect([...edges].filter(([,value])=>value.count!==2||value.winding!==0)).toEqual([]);
    expect(count-edges.size+triangles.length/3).toBe(2);
    expect(volume).toBeGreaterThan(.01);
    // The same vertex IDs must join both sides, so pulling a seam vertex
    // cannot leave a second outline behind the deformed cloth.
    const front=new Set(mesh.front),back=new Set(mesh.back);
    expect([...front].filter(index=>back.has(index)).sort((a,b)=>a-b)).toEqual([...mesh.outline].sort((a,b)=>a-b));
  });
});
