"use client";

import { use } from "react";

import { ProductEditor } from "@/manage/ProductEditor";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProductEditor productId={Number(id)} />;
}
