import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AvatarCard, getAvatarCardRoutes, type AvatarCardVariant } from "./components/avatar-card/AvatarCard";
import type { ApiAvatarSummary } from "./lib/api/avatar-api";

function createAvatar(overrides: Partial<ApiAvatarSummary> = {}): ApiAvatarSummary {
  return {
    id: "avatar-1",
    name: "Ada Ciencias",
    description: "Explica fenómenos científicos con ejemplos cotidianos.",
    status: "active",
    providerSyncStatus: "synced",
    thumbnailUrl: "https://cdn.yuni.test/ada.webp",
    interactionAvailability: "ready",
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    access: {
      type: "owner",
      canEdit: true,
      canShare: true,
      canInteract: true,
    },
    ...overrides,
  };
}

function renderCard(avatar: ApiAvatarSummary, variant: AvatarCardVariant = "dashboard") {
  return renderToStaticMarkup(
    createElement(AvatarCard, {
      avatar,
      variant,
      onNavigate: vi.fn(),
    })
  );
}

describe("AvatarCard", () => {
  it("renders the visual launcher without catalog metadata on Dashboard", () => {
    const html = renderCard(createAvatar());

    expect(html).toContain("Ada Ciencias");
    expect(html).toContain('href="/avatars/avatar-1"');
    expect(html).toContain('aria-label="Ver perfil de Ada Ciencias"');
    expect(html).toContain("Listo para interactuar");
    expect(html).toContain("Interactuar");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('aria-label="Más acciones para Ada Ciencias"');
    expect(html).not.toContain(">Propio<");
    expect(html).not.toContain(">Activo<");
  });

  it("adds ownership and lifecycle metadata in the catalog variant", () => {
    const html = renderCard(createAvatar({ thumbnailUrl: null }), "catalog");

    expect(html).toContain(">Propio<");
    expect(html).toContain(">Activo<");
    expect(html).toContain(">AC<");
    expect(html).not.toContain("<img");
  });

  it("keeps long identity content available while the layout clamps it visually", () => {
    const longName = "Profesora de Ciencias Naturales para estudiantes de toda la universidad";
    const longDescription =
      "Explica contenidos complejos con analogías cercanas, ejemplos cotidianos y un tono claro para personas sin experiencia técnica.";
    const html = renderCard(createAvatar({ name: longName, description: longDescription }), "catalog");

    expect(html).toContain(longName);
    expect(html).toContain(longDescription);
  });

  it.each([
    ["ready", "Listo para interactuar", "Interactuar"],
    ["needs_attention", "Revisar configuración", "Revisar configuración"],
  ] as const)("renders the owner %s state with its primary action", (state, badge, action) => {
    const html = renderCard(createAvatar({ interactionAvailability: state }));

    expect(html).toContain(badge);
    expect(html).toContain(`<span>${action}</span>`);
  });

  it("explains a shared avatar that is still preparing without an inactive button", () => {
    const html = renderCard(
      createAvatar({
        interactionAvailability: "preparing",
        access: {
          type: "shared",
          canEdit: false,
          canShare: false,
          canInteract: true,
        },
      })
    );

    expect(html).toContain("Preparándose");
    expect(html).toContain("Lo estamos preparando. Vas a poder interactuar pronto.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Más acciones");
  });

  it("explains an owned avatar that is still preparing without offering an early call", () => {
    const html = renderCard(createAvatar({ interactionAvailability: "preparing" }));

    expect(html).toContain("Preparándose");
    expect(html).toContain("Lo estamos preparando. Vas a poder interactuar pronto.");
    expect(html).not.toContain("Interactuar");
  });

  it("explains an unavailable shared avatar without management actions", () => {
    const html = renderCard(
      createAvatar({
        interactionAvailability: "unavailable",
        access: {
          type: "shared",
          canEdit: false,
          canShare: false,
          canInteract: false,
        },
      })
    );

    expect(html).toContain("No disponible");
    expect(html).toContain("Este avatar compartido no está disponible para interactuar.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Más acciones");
  });

  it("keeps every card destination stable", () => {
    expect(getAvatarCardRoutes("avatar-42")).toEqual({
      interact: "/interact/avatar-42",
      profile: "/avatars/avatar-42",
      edit: "/avatars/avatar-42/edit",
      share: "/avatars/avatar-42?tab=compartir",
    });
  });
});
