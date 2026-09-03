import { PublicGroupView } from "./PublicGroupView";

export default async function PublicGroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicGroupView slug={slug} />;
}
