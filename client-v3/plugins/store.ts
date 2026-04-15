import { createStore } from 'vuex'
import * as root from '@/stores/index.js'
import * as user from '@/stores/user.js'
import * as libraries from '@/stores/libraries.js'
import * as users from '@/stores/users.js'
import * as globals from '@/stores/globals.js'
import * as tasks from '@/stores/tasks.js'
import * as scanners from '@/stores/scanners.js'

function buildModule(mod) {
  return {
    namespaced: true,
    state: mod.state,
    getters: mod.getters || {},
    actions: mod.actions || {},
    mutations: mod.mutations || {}
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  const store = createStore({
    state: root.state,
    getters: root.getters || {},
    actions: root.actions || {},
    mutations: root.mutations || {},
    modules: {
      user: buildModule(user),
      libraries: buildModule(libraries),
      users: buildModule(users),
      globals: buildModule(globals),
      tasks: buildModule(tasks),
      scanners: buildModule(scanners)
    }
  })

  nuxtApp.vueApp.use(store)
})
