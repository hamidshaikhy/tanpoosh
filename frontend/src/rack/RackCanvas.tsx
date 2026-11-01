"use client";

import { useEffect, useRef } from "react";
import type { RackControls } from "./engine";
import type { RackItem } from "./catalog";

type Props = RackControls & {
  productView?: boolean;
  items: RackItem[];
  onSelect: (index:number)=>void;
  onInspect: ()=>void;
  onProgress: (progress:number)=>void;
  onReady: ()=>void;
  onError: ()=>void;
};

export function RackCanvas(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof import("./engine").createRackScene> | null>(null);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current=props;api.current?.update(props); },[props]);
  useEffect(()=>{
    let disposed=false;
    import("./engine").then(({createRackScene})=>{
      if(disposed || !host.current)return;
      try {
        const p=callbacks.current;
        api.current=createRackScene(host.current,{
          items:p.items,initial:p.active,productView:p.productView,
          onSelect:i=>callbacks.current.onSelect(i),onInspect:()=>callbacks.current.onInspect(),
          onProgress:n=>callbacks.current.onProgress(n),onReady:()=>callbacks.current.onReady(),onError:()=>callbacks.current.onError(),
        });
        api.current.update(callbacks.current);
      } catch { callbacks.current.onError(); }
    }).catch(()=>{if(!disposed)callbacks.current.onError();});
    return ()=>{disposed=true;api.current?.destroy();api.current=null;};
  },[]);
  return <div className="rack-canvas" ref={host} data-testid="rack-canvas" />;
}
