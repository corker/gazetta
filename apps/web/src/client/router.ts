import { createRouter as createVueRouter, createWebHistory } from 'vue-router'
import EditorView from './components/EditorView.vue'

export function createRouter() {
  return createVueRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: EditorView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
