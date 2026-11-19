const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

// Reads ?page=&limit= leniently — bad values fall back to defaults.
export const getPagination = (query: Record<string, unknown>): Pagination => {
  const page = Math.max(1, parseInt(String(query.page ?? "")) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(String(query.limit ?? "")) || DEFAULT_LIMIT)
  );
  return { page, limit, skip: (page - 1) * limit };
};

export const paginated = <T>(items: T[], total: number, { page, limit }: Pagination) => ({
  items,
  pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
});
