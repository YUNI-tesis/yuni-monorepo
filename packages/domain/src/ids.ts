import { z } from "zod";

export type YuniId = string;

export const YuniIdSchema = z.string().min(1);
