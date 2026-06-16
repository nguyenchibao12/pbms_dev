/**
 * Parse page/limit from query. Defaults: page=1, limit=50, max limit=200.
 */
export const parsePagination = (query = {}) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

export const paginatedResult = (rows, total, page, limit) => ({
  items: rows,
  total,
  page,
  limit,
  pages: total > 0 ? Math.ceil(total / limit) : 0,
});

export const findAndPaginate = async (model, { where = {}, include, order, page, limit, offset }) => {
  const { count, rows } = await model.findAndCountAll({
    where,
    include,
    order,
    limit,
    offset,
    distinct: Boolean(include?.length),
  });
  return paginatedResult(rows, count, page, limit);
};
