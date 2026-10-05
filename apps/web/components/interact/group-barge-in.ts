export const GROUP_BARGE_IN_CONFIRM_MS = 300;
export const GROUP_AVATAR_ECHO_WINDOW_MS = 2_500;
export const GROUP_AVATAR_ECHO_MAX_TOKENS = 64;

export type GroupHumanIntervention = "empty" | "backchannel" | "immediate" | "candidate";

const BACKCHANNELS = new Set([
  "si",
  "aja",
  "aha",
  "ajam",
  "mhm",
  "mm",
  "mmm",
  "uhum",
  "ok",
  "okay",
  "okey",
  "okei",
  "oki",
  "dale",
  "claro",
  "eh",
]);
const BUT_PREFIXES = new Set(["si", "ok", "okay", "okey", "okei", "oki", "dale"]);
const STOP_COMMANDS = new Set(["espera", "basta", "corta", "frena", "detenete", "stop"]);

function tokens(text: string) {
  return (
    text
      .normalize("NFC")
      .toLocaleLowerCase("es")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function withoutAccents(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Classification only: it does not grant floor ownership or discard a commit. */
export function classifyGroupHumanIntervention(text: string): GroupHumanIntervention {
  const originalTokens = tokens(text);
  const normalizedTokens = originalTokens.map(withoutAccents);
  const first = normalizedTokens[0];
  if (!first) return "empty";
  if (normalizedTokens.every((token) => BACKCHANNELS.has(token))) return "backchannel";

  // An unaccented "para" in "para mí..." is not a stop command. A standalone
  // "para" is accepted because Scribe can omit the accent on the command "pará".
  if (
    STOP_COMMANDS.has(first) ||
    originalTokens[0] === "pará" ||
    (first === "para" && normalizedTokens.length === 1)
  ) {
    return "immediate";
  }

  const firstSignificant = normalizedTokens.findIndex((token) => !BACKCHANNELS.has(token));
  if (
    firstSignificant > 0 &&
    normalizedTokens[firstSignificant] === "pero" &&
    normalizedTokens.slice(0, firstSignificant).some((token) => BUT_PREFIXES.has(token))
  ) {
    return "immediate";
  }
  return "candidate";
}

export type GroupBargeInCandidate = {
  text: string;
  firstCandidateAt: number;
  readyAt: number;
};

/**
 * Immutable deadline calculation. Call only for a significant partial; the
 * caller owns the timer, whether this episode began during speech, and the
 * committed transcript. Updating text must not postpone an existing deadline.
 */
export function updateGroupBargeInCandidate(
  candidate: GroupBargeInCandidate | null,
  text: string,
  now: number
): GroupBargeInCandidate {
  return {
    text,
    firstCandidateAt: candidate?.firstCandidateAt ?? now,
    readyAt: candidate?.readyAt ?? now + GROUP_BARGE_IN_CONFIRM_MS,
  };
}

/**
 * Ephemeral generated-text echo heuristic, not evidence of what was heard and
 * not speaker identification. Use one buffer per avatar and clear on teardown.
 * A phrase with any additional or reordered words is not an exact echo match.
 */
export function createGroupAvatarEchoBuffer() {
  let recentTokens: Array<{ token: string; at: number }> = [];
  const prune = (now: number) => {
    recentTokens = recentTokens.filter(({ at }) => now >= at && now - at < GROUP_AVATAR_ECHO_WINDOW_MS);
  };

  return {
    add(text: string, now: number) {
      prune(now);
      recentTokens.push(...tokens(text).map((token) => ({ token: withoutAccents(token), at: now })));
      recentTokens = recentTokens.slice(-GROUP_AVATAR_ECHO_MAX_TOKENS);
    },
    matches(text: string, now: number) {
      prune(now);
      const candidate = tokens(text).map(withoutAccents);
      if (candidate.length === 0 || candidate.length > recentTokens.length) return false;
      for (let offset = 0; offset <= recentTokens.length - candidate.length; offset += 1) {
        if (candidate.every((token, index) => token === recentTokens[offset + index]?.token)) return true;
      }
      return false;
    },
    clear() {
      recentTokens = [];
    },
  };
}
