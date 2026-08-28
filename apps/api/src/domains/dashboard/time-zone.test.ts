import { describe, expect, it } from "vitest";
import { normalizeTimeZoneForPostgres } from "./time-zone";

describe("dashboard PostgreSQL time-zone normalization", () => {
  it.each([
    ["Africa/Asmera", "Africa/Asmara"],
    ["America/Buenos_Aires", "America/Argentina/Buenos_Aires"],
    ["America/Catamarca", "America/Argentina/Catamarca"],
    ["America/Coral_Harbour", "America/Atikokan"],
    ["America/Cordoba", "America/Argentina/Cordoba"],
    ["America/Godthab", "America/Nuuk"],
    ["America/Indianapolis", "America/Indiana/Indianapolis"],
    ["America/Jujuy", "America/Argentina/Jujuy"],
    ["America/Louisville", "America/Kentucky/Louisville"],
    ["America/Mendoza", "America/Argentina/Mendoza"],
    ["Asia/Calcutta", "Asia/Kolkata"],
    ["Asia/Choibalsan", "Asia/Ulaanbaatar"],
    ["Asia/Katmandu", "Asia/Kathmandu"],
    ["Asia/Rangoon", "Asia/Yangon"],
    ["Asia/Saigon", "Asia/Ho_Chi_Minh"],
    ["Atlantic/Faeroe", "Atlantic/Faroe"],
    ["Europe/Kiev", "Europe/Kyiv"],
    ["Europe/Uzhgorod", "Europe/Kyiv"],
    ["Europe/Zaporozhye", "Europe/Kyiv"],
    ["Pacific/Enderbury", "Pacific/Kanton"],
    ["Pacific/Ponape", "Pacific/Pohnpei"],
    ["Pacific/Truk", "Pacific/Chuuk"],
  ])("maps %s to %s", (legacyTimeZone, primaryTimeZone) => {
    expect(normalizeTimeZoneForPostgres(legacyTimeZone)).toBe(primaryTimeZone);
  });

  it.each(["UTC", "America/Argentina/Buenos_Aires", "Europe/Madrid"])(
    "keeps the PostgreSQL-compatible identifier %s",
    (timeZone) => {
      expect(normalizeTimeZoneForPostgres(timeZone)).toBe(timeZone);
    }
  );
});
