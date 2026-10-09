import { Suspense } from "react";

import { LoadingBlock } from "@/components/ui/States";
import { StudioApp } from "@/studio/StudioApp";

export default function StudioPage() {
  return (
    <Suspense fallback={<LoadingBlock className="min-h-[70vh]" />}>
      <StudioApp />
    </Suspense>
  );
}
