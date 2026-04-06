import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const dark = ref(true)

  function init() {
    const saved = localStorage.getItem('gazetta_theme')
    dark.value = saved ? saved === 'dark' : true
    apply()
  }

  function toggle() {
    dark.value = !dark.value
    localStorage.setItem('gazetta_theme', dark.value ? 'dark' : 'light')
    apply()
  }

  function apply() {
    document.documentElement.classList.toggle('dark', dark.value)
  }

  return { dark, init, toggle }
})
