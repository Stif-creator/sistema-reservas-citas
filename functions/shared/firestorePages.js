export async function readQueryPages(reader, source, pageSize = 500) {
  const values = []
  let pageQuery = source.limit(pageSize)
  while (true) {
    const snapshot = await reader.get(pageQuery)
    values.push(...snapshot.docs)
    if (snapshot.size < pageSize) return values
    pageQuery = source.startAfter(snapshot.docs.at(-1)).limit(pageSize)
  }
}
