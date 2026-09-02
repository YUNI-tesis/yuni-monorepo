import type { RawEnv } from "./env";
import { rawEnv } from "./env";

export type FeatureConfig = {
  groupAccountSharingEnabled: boolean;
  groupPublicSharingEnabled: boolean;
  groupSharingAnalyticsEnabled: boolean;
};

export function createFeatureConfig(env: RawEnv): FeatureConfig {
  return {
    groupAccountSharingEnabled: env.GROUP_ACCOUNT_SHARING_ENABLED,
    groupPublicSharingEnabled: env.GROUP_PUBLIC_SHARING_ENABLED,
    groupSharingAnalyticsEnabled: env.GROUP_SHARING_ANALYTICS_ENABLED,
  };
}

export const featureConfig = createFeatureConfig(rawEnv);
