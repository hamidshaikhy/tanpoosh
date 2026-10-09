import { redirect } from "next/navigation";

export default async function SharedLookRedirect({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/studio?share=${encodeURIComponent(token.slice(0, 43))}`);
}
