import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CartDrawer } from "@/components/layout/CartDrawer";

export const metadata:Metadata={
  title:"رگال تعاملی تن‌پوش",
  description:"لباس‌های تن‌پوش را روی رگال مرور کن، از نزدیک ببین، سایزت را انتخاب کن و به سبد خرید اضافه کن.",
  alternates:{canonical:"/rack"},
};

export default function RackLayout({children}:{children:ReactNode}) {
  return <>{children}<CartDrawer side="start" /></>;
}
