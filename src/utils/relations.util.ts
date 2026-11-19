import prisma from "../config/database.config";
import { BadRequestError } from "./customError.util";

// Prisma's `connect`/`set` fails with a vague "record not found" if any id is
// missing. Check up front so the client gets a clear 400 instead.
export const assertAllExist = async (
  model: "service" | "project",
  ids: string[],
  label: string
): Promise<void> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const count = await (prisma[model] as any).count({ where: { id: { in: unique } } });
  if (count !== unique.length) {
    throw new BadRequestError(`One or more ${label} do not exist`);
  }
};

export const toConnect = (ids: string[]) => [...new Set(ids)].map((id) => ({ id }));

/**
 * Every project must keep at least one service. Throws if unlinking
 * `projectIds` from `serviceId` (or deleting the service, when `projectIds`
 * is omitted) would leave any project with no service at all.
 */
export const assertProjectsKeepAService = async (
  serviceId: string,
  projectIds?: string[]
): Promise<void> => {
  const orphaned = await prisma.project.findMany({
    where: {
      ...(projectIds && { id: { in: projectIds } }),
      services: { some: { id: serviceId }, every: { id: serviceId } },
    },
    select: { title: true },
    take: 5,
  });
  if (orphaned.length > 0) {
    const names = orphaned.map((p) => `"${p.title}"`).join(", ");
    throw new BadRequestError(
      `Every project needs at least one service. Link another service to ${names} first.`
    );
  }
};
