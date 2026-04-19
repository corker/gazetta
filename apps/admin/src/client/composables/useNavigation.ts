import { useRoute, useRouter } from 'vue-router'

/**
 * Navigation helper that preserves query params (?locale=, ?target=)
 * across route changes. Prevents locale/target from being dropped
 * when components use string-based router.push().
 *
 * SRP: owns the "navigate while preserving context" concern.
 * Components call navigateTo() instead of router.push() directly.
 */
export function useNavigation() {
  const route = useRoute()
  const router = useRouter()

  function navigateTo(path: string, hash?: string) {
    router.push({ path, query: route.query, hash })
  }

  return { navigateTo }
}
