import { rawEnv, type RawEnv } from "./env";

export type NewAvatarConversationConfig = {
  conversationModel: string;
  conversationProfile: "standard" | "natural";
};

export function createNewAvatarConversationConfig(env: RawEnv): NewAvatarConversationConfig {
  return {
    conversationModel: env.AVATAR_DEFAULT_CONVERSATION_MODEL,
    conversationProfile: env.AVATAR_DEFAULT_CONVERSATION_PROFILE,
  };
}

export const newAvatarConversationConfig = createNewAvatarConversationConfig(rawEnv);
