export async function readReservationCounts(specs, runCount, onError = () => {}) {
  const results = await Promise.all(specs.map(async ({ key, clauses }) => {
    try { return [key, await runCount(clauses, key), null] }
    catch (error) {
      onError(key, error)
      return [key, null, error]
    }
  }))
  return {
    values: Object.fromEntries(results.map(([key, value]) => [key, value])),
    errors: results.filter(([, , error]) => error).map(([key]) => key),
  }
}
