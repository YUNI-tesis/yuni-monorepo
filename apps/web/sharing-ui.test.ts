import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAccessGrant,
  createShareLink,
  deleteAccessGrant,
  deleteShareLink,
  getPublicSharedAvatar,
  listAccessGrants,
  listShareLinks,
  updateAccessGrant,
  updateShareLink,
} from "./lib/api/sharing-api";
import {
  canOpenPublicLink,
  getAccessGrantCreateError,
  getAccessGrantPresentation,
  normalizeGrantEmail,
  toPublicSlug,
  validateGrantEmail,
  validateShareLinkDraft,
} from "./lib/avatar-sharing";
import { ApiClientError } from "./lib/api/http-client";
import { getAvatarCardActionMode } from "./lib/avatar-dashboard";

describe("sharing UI helpers", () => {
  it.each([
    ["Asistente de Álgebra", "asistente-de-algebra"],
    ["  Demo & Prueba  ", "demo-prueba"],
    ["A", "a-avatar"],
    ["---", "avatar"],
  ])("creates a valid editable slug from %s", (name, expected) => {
    expect(toPublicSlug(name)).toBe(expected);
  });

  it("keeps generated slugs inside the API limit", () => {
    const slug = toPublicSlug("Avatar ".repeat(30));

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("validates link and grant drafts without changing their values", () => {
    expect(validateShareLinkDraft("", "Invalid slug")).toEqual({
      name: "Escribí un nombre para reconocer el link.",
      slug: "Usá entre 3 y 80 caracteres: minúsculas, números y guiones.",
    });
    expect(validateShareLinkDraft("Demo", "demo-link")).toEqual({
      name: null,
      slug: null,
    });
    expect(normalizeGrantEmail("  USER@EXAMPLE.COM ")).toBe("user@example.com");
    expect(validateGrantEmail("user@example.com")).toBeNull();
    expect(validateGrantEmail("invalid")).toBe("Ingresá un email válido.");
  });

  it("maps grant states and shared card capabilities", () => {
    expect(getAccessGrantPresentation("pending")).toMatchObject({
      label: "Cuenta pendiente",
      tone: "warning",
    });
    expect(getAccessGrantPresentation("linked")).toMatchObject({
      label: "Cuenta vinculada",
      tone: "success",
    });
    expect(getAccessGrantPresentation("revoked")).toMatchObject({
      label: "Acceso revocado",
      tone: "danger",
    });
    expect(getAvatarCardActionMode("owner")).toBe("owner-actions");
    expect(getAvatarCardActionMode("shared")).toBe("shared-actions");
  });

  it("presents a friendly error when the owner grants access to themselves", () => {
    expect(
      getAccessGrantCreateError(
        new ApiClientError(
          "Owners cannot grant access to themselves",
          400,
          "BAD_REQUEST",
          "SELF_ACCESS_GRANT"
        )
      )
    ).toBe("No necesitás darte acceso: ya sos el propietario de este avatar.");
  });

  it("only enables public preview when link and avatar are active", () => {
    expect(canOpenPublicLink({ isEnabled: true }, "active")).toBe(true);
    expect(canOpenPublicLink({ isEnabled: false }, "active")).toBe(false);
    expect(canOpenPublicLink({ isEnabled: true }, "draft")).toBe(false);
  });
});

describe("sharing API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls every private sharing endpoint with the expected method and payload", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, shareLinks: [], accessGrants: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await listShareLinks("avatar-1");
    await createShareLink("avatar-1", { slug: "demo-link", name: "Demo", isEnabled: true });
    await updateShareLink("avatar-1", "link-1", { isEnabled: false });
    await deleteShareLink("avatar-1", "link-1");
    await listAccessGrants("avatar-1");
    await createAccessGrant("avatar-1", "user@example.com");
    await updateAccessGrant("avatar-1", "grant-1", "revoked");
    await deleteAccessGrant("avatar-1", "grant-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init.method ?? "GET"])).toEqual([
      ["http://localhost:4000/avatars/avatar-1/share-links", "GET"],
      ["http://localhost:4000/avatars/avatar-1/share-links", "POST"],
      ["http://localhost:4000/avatars/avatar-1/share-links/link-1", "PATCH"],
      ["http://localhost:4000/avatars/avatar-1/share-links/link-1", "DELETE"],
      ["http://localhost:4000/avatars/avatar-1/access-grants", "GET"],
      ["http://localhost:4000/avatars/avatar-1/access-grants", "POST"],
      ["http://localhost:4000/avatars/avatar-1/access-grants/grant-1", "PATCH"],
      ["http://localhost:4000/avatars/avatar-1/access-grants/grant-1", "DELETE"],
    ]);
    expect(fetchMock.mock.calls[1]?.[1].body).toBe(
      JSON.stringify({ slug: "demo-link", name: "Demo", isEnabled: true })
    );
    expect(fetchMock.mock.calls[5]?.[1].body).toBe(JSON.stringify({ email: "user@example.com" }));
    expect(fetchMock.mock.calls[6]?.[1].body).toBe(JSON.stringify({ status: "revoked" }));
  });

  it("resolves encoded public slugs and exposes conflict errors to the form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            shareLink: { slug: "demo-link", name: "Demo" },
            avatar: { name: "Avatar", description: "", thumbnailUrl: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Share link slug already exists" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicSharedAvatar("demo link")).resolves.toMatchObject({
      shareLink: { slug: "demo-link" },
    });
    await expect(createShareLink("avatar-1", { slug: "demo-link", name: "Demo" })).rejects.toMatchObject({
      status: 409,
      message: "Share link slug already exists",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/public/links/demo%20link/avatar");
  });
});
