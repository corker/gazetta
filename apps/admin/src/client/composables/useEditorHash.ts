import { useRouter, useRoute } from 'vue-router'
import { type Router, type RouteLocationNormalizedLoaded } from 'vue-router'

const HASH_PREFIX = 'component='

/**
 * URL hash encoding for the selected component in the editor.
 *
 * Format: #component=hero, #component=_root, #component=%40header
 * The hash persists across refresh and is shareable.
 *
 * Hash updates use router.push({ hash, replace: true }) to avoid
 * polluting browser history with every component click.
 *
 * Safe to call in test environments without a router — operations
 * become no-ops.
 */
export function useEditorHash() {
  let router: Router | null = null
  let route: RouteLocationNormalizedLoaded | null = null
  try {
    router = useRouter()
    route = useRoute()
  } catch {
    // No router installed (test environment)
  }

  function setHash(componentPath: string) {
    if (!router || !route) return
    const hash = `#${HASH_PREFIX}${encodeURIComponent(componentPath)}`
    if (route.hash !== hash) {
      router.push({ hash, replace: true })
    }
  }

  function clearHash() {
    if (!router || !route) return
    if (route.hash) {
      router.push({ hash: '', replace: true })
    }
  }

  function readHash(): string | null {
    if (!route) return null
    const hash = route.hash
    if (!hash.startsWith(`#${HASH_PREFIX}`)) return null
    const encoded = hash.slice(1 + HASH_PREFIX.length)
    if (!encoded) return null
    return decodeURIComponent(encoded)
  }

  return { setHash, clearHash, readHash }
}
