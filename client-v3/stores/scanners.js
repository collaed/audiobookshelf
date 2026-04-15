export const state = () => ({
  bookProviders: [],
  podcastProviders: [],
  bookCoverProviders: [],
  podcastCoverProviders: [],
  providersLoaded: false
})

export const getters = {
  checkBookProviderExists: (state) => (providerValue) => {
    return state.bookProviders.some((p) => p.value === providerValue)
  },
  checkPodcastProviderExists: (state) => (providerValue) => {
    return state.podcastProviders.some((p) => p.value === providerValue)
  },
  areProvidersLoaded: (state) => state.providersLoaded
}

export const actions = {
  async fetchProviders({ commit, state }) {
    if (state.providersLoaded) return

    try {
      const response = await this.$axios.$get('/api/search/providers')
      if (response?.providers) {
        commit('setAllProviders', response.providers)
      }
    } catch (error) {
      console.error('Failed to fetch providers', error)
    }
  },
  async refreshProviders({ commit, state }) {
    if (!state.providersLoaded) return

    try {
      const response = await this.$axios.$get('/api/search/providers')
      if (response?.providers) {
        commit('setAllProviders', response.providers)
      }
    } catch (error) {
      console.error('Failed to refresh providers', error)
    }
  }
}

export const mutations = {
  setAllProviders(state, providers) {
    state.bookProviders = providers.books || []
    state.podcastProviders = providers.podcasts || []
    state.bookCoverProviders = providers.booksCovers || []
    state.podcastCoverProviders = providers.podcasts || []
    state.providersLoaded = true
  }
}
