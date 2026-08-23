"use client";

import React, { useState, type ReactNode } from "react";
import { Button, Card, DropdownMenu, YuniIcon, type DropdownMenuItem, type YuniIconName } from "@yuni/ui";
import styles from "./CatalogCard.module.css";

export type CatalogCardStatusTone = "success" | "danger" | "warning" | "neutral";

export type CatalogCardArtwork =
  | { kind: "avatar"; name: string; thumbnailUrl: string | null }
  | {
      kind: "group";
      name: string;
      members: Array<{ id: string; name: string; thumbnailUrl: string | null }>;
    };

export type CatalogCardProps = {
  id: string;
  title: string;
  description: string;
  href: string;
  hrefLabel: string;
  headingLevel: "h2" | "h3";
  artwork: CatalogCardArtwork;
  status: { label: string; tone: CatalogCardStatusTone };
  metadata?: string[];
  menuLabel?: string;
  menuItems?: DropdownMenuItem[];
  primaryAction?: { label: string; icon: YuniIconName; onSelect: () => void };
  notice?: ReactNode;
  onNavigate: (href: string) => void;
};

export function CatalogCard({
  id,
  title,
  description,
  href,
  hrefLabel,
  headingLevel,
  artwork,
  status,
  metadata = [],
  menuLabel,
  menuItems = [],
  primaryAction,
  notice,
  onNavigate,
}: CatalogCardProps) {
  const Title = headingLevel;

  return (
    <Card as="article" padding="sm" className={styles.card} aria-labelledby={`catalog-card-title-${id}`}>
      <a
        className={styles.profileLink}
        href={href}
        aria-label={hrefLabel}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(href);
        }}
      />

      <div className={styles.media}>
        <CatalogArtworkView artwork={artwork} />
        <span className={`${styles.status} ${styles[status.tone]}`}>
          <span className={styles.statusDot} aria-hidden="true" />
          {status.label}
        </span>

        <div className={styles.identity}>
          <Title id={`catalog-card-title-${id}`} className={styles.title}>
            {title}
          </Title>
          <p className={styles.description}>{description}</p>
          {metadata.length > 0 ? (
            <ul className={styles.metadata} aria-label="Detalles">
              {metadata.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {menuItems.length > 0 && menuLabel ? (
          <div className={styles.menu}>
            <DropdownMenu
              compact
              label={menuLabel}
              triggerContent={<YuniIcon name="moreVertical" size={20} />}
              items={menuItems}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        {primaryAction ? (
          <Button
            className={styles.primaryAction}
            icon={<YuniIcon name={primaryAction.icon} />}
            onClick={primaryAction.onSelect}
          >
            {primaryAction.label}
          </Button>
        ) : (
          <div className={styles.notice}>{notice}</div>
        )}
      </div>
    </Card>
  );
}

function CatalogArtworkView({ artwork }: { artwork: CatalogCardArtwork }) {
  if (artwork.kind === "group") {
    return (
      <div
        className={`${styles.artwork} ${styles.groupArtwork}`}
        data-count={artwork.members.length}
        role="img"
        aria-label={`Grupo ${artwork.name}: ${artwork.members.map((member) => member.name).join(", ")}`}
      >
        {artwork.members.map((member) => (
          <ArtworkTile key={member.id} name={member.name} thumbnailUrl={member.thumbnailUrl} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.artwork} role="img" aria-label={`Avatar de ${artwork.name}`}>
      <ArtworkTile name={artwork.name} thumbnailUrl={artwork.thumbnailUrl} />
    </div>
  );
}

function ArtworkTile({ name, thumbnailUrl }: { name: string; thumbnailUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(thumbnailUrl && failedUrl !== thumbnailUrl);

  return (
    <span className={`${styles.artworkTile} ${showImage ? "" : styles.fallback}`}>
      {showImage && thumbnailUrl ? (
        <img
          className={styles.image}
          src={thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(thumbnailUrl)}
        />
      ) : (
        <span className={styles.monogram} aria-hidden="true">
          {getMonogram(name)}
        </span>
      )}
    </span>
  );
}

function getMonogram(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
  return initials || "A";
}
