import { PublicAvatarView } from "./PublicAvatarView";

type PublicAvatarPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PublicAvatarPage({ params }: PublicAvatarPageProps) {
  const { slug } = await params;

  return <PublicAvatarView slug={slug} />;
}
