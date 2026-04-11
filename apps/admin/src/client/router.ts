import { createRouter as createVueRouter, createWebHistory } from 'vue-router'
import EditorView from './components/EditorView.vue'
import DevPlayground from './components/DevPlayground.vue'

export function createRouter() {
  const base = import.meta.env.BASE_URL || '/'
  return createVueRouter({
    history: createWebHistory(base),
    routes: [
      { path: '/', component: EditorView },
      { path: '/dev', component: DevPlayground },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
