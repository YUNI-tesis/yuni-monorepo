import { describe, expect, it } from "vitest";
import { getInitials } from "./components/live-avatar/LiveAvatarStage";
import { withCurrentOption } from "./hooks/useLiveAvatarOptions";
import type { ApiLiveAvatarOption } from "./lib/api/live-avatar-api";

const option: ApiLiveAvatarOption = {
  id: "avatar-1",
  displayName: "Avatar Uno",
  thumbnailUrl: "https://cdn.yuni.test/avatar.png",
  provider: "liveavatar",
  mode: "lite",
  sandbox: true,
};

describe("live avatar UI helpers", () => {
  it("keeps provider options unchanged when the current avatar exists", () => {
    expect(withCurrentOption([option], "avatar-1")).toEqual([option]);
  });

  it("adds a synthetic current avatar option when the provider no longer returns it", () => {
    expect(withCurrentOption([option], "missing-avatar")[0]).toMatchObject({
      id: "missing-avatar",
      displayName: "Avatar actual",
      provider: "liveavatar",
    });
  });

  it("builds initials from display names", () => {
    expect(getInitials("Live Avatar")).toBe("LA");
    expect(getInitials("")).toBe("A");
  });
});
