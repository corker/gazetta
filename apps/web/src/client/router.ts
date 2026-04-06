import { createRouter as createVueRouter, createWebHistory } from 'vue-router'
import EditorView from './components/EditorView.vue'

export function createRouter() {
  // Support both /admin (when proxied through gazetta dev) and / (standalone)
  const base = window.location.pathname.startsWith('/admin') ? '/admin' : '/'
  return createVueRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', component: EditorView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
