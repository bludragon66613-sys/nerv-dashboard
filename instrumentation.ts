export const runtime = 'nodejs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { buildCatalog } = await import('./lib/catalog')
    try {
      await buildCatalog()
    } catch (err) {
      console.error('[instrumentation] Catalog build failed:', err)
    }
  }
}
