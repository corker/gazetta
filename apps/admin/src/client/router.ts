import { createRouter as createVueRouter, createWebHistory } from 'vue-router'
import EditorView from './components/EditorView.vue'

export function createRouter() {
  const base = import.meta.env.BASE_URL || '/'
  return createVueRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', component: EditorView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
