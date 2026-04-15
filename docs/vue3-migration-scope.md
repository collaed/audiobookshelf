# Vue 2 → Vue 3 Migration — Actual Scope

## Key Finding

The Options API (data, computed, methods, watch, mounted, etc.) **works unchanged in Vue 3**.
The 226 files do NOT need to be rewritten to Composition API.

## Actual Breaking Changes

| Change | Files | Fix | Effort |
|--------|-------|-----|--------|
| `Vue.prototype.$xxx` in plugins | 8 plugins | `app.config.globalProperties.$xxx` | 30 min |
| `Vue.use(Plugin)` | 2 plugins | `app.use(Plugin)` | 5 min |
| `Vue.directive()` | 1 plugin | `app.directive()` | 5 min |
| `import Vue from 'vue'` | 8 plugins | Remove (not needed in Vue 3) | 5 min |
| `.native` modifier | 3 components | Remove `.native` | 5 min |
| `this.$set()` | 4 usages | Remove `$set`, just assign directly | 5 min |
| `$eventBus.$on/$off` | 39 files | Replace with `mitt` event emitter | 2 hours |
| `$axios` (Nuxt 2 module) | 105 files | Replace with `$fetch` or keep as global | 1 hour (global property) |
| `$strings` (i18n plugin) | 163 files | Keep as global property (no change needed) | 0 |
| `$encode` (custom helper) | 10 files | Keep as global property | 0 |
| Nuxt 2 → Nuxt 3 config | 1 file | Rewrite nuxt.config | 1 hour |
| Vuex store | 7 modules | Wrap in Pinia or keep Vuex 4 | 2 hours |
| `asyncData` / `fetch` | 37 files | `useAsyncData` / `useFetch` | 3 hours |
| Nuxt 2 `~static/` paths | ~20 files | `~/public/` | 30 min |

## Total: ~10 hours, not weeks

The migration is mostly:
1. Update 8 plugin files (1 hour)
2. Replace $eventBus with mitt (2 hours)  
3. Wrap $axios as global property or replace (1 hour)
4. Vuex → Vuex 4 or Pinia (2 hours)
5. Nuxt 2 → Nuxt 3 config + asyncData (3 hours)
6. Small fixes (.native, $set, paths) (1 hour)
