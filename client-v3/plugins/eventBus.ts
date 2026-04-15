import mitt from 'mitt'

export default defineNuxtPlugin((nuxtApp) => {
  const emitter = mitt()
  // Alias $on/$off/$emit so existing code using $eventBus.$emit / $eventBus.$on works
  emitter.$on = emitter.on
  emitter.$off = emitter.off
  emitter.$emit = emitter.emit
  nuxtApp.vueApp.config.globalProperties.$eventBus = emitter
})
