import {
  createCreatorDashboardRepository,
  type CreatorDashboardQuery,
  type PrismaClientInstance,
} from "@yuni/db";

type DatabaseCreatorDashboardRepository = ReturnType<typeof createCreatorDashboardRepository>;

export type CreatorDashboardSummaryData = Awaited<
  ReturnType<DatabaseCreatorDashboardRepository["getSummaryData"]>
>;

export type { CreatorDashboardQuery };

export type CreatorDashboardRepository = {
  getSummaryData(ownerId: string, query: CreatorDashboardQuery): Promise<CreatorDashboardSummaryData>;
};

export function createCreatorDashboardDataRepository(
  prisma: PrismaClientInstance
): CreatorDashboardRepository {
  return createCreatorDashboardRepository(prisma);
}
