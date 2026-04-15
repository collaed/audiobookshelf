export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) return

  const gp = nuxtApp.vueApp.config.globalProperties

  var sendInit = async (castContext) => {
    const store = gp.$store
    const libraryId = store.state.libraries.currentLibraryId
    const bearerToken = store.getters['user/getToken']
    const headers = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}

    var covers = await $fetch(`/api/libraries/${libraryId}/items?limit=40&minified=1`, { headers }).then((data) => {
      return data.results.filter((b) => b.media.coverPath).map((libraryItem) => {
        var coverUrl = store.getters['globals/getLibraryItemCoverSrc'](libraryItem)
        if (process.env.NODE_ENV === 'development') return coverUrl
        return `${window.location.origin}${coverUrl}`
      })
    }).catch((error) => {
      console.error('failed to fetch books', error)
      return null
    })

    var castSession = castContext.getCurrentSession()
    castSession.sendMessage('urn:x-cast:com.audiobookshelf.cast', { covers })
  }

  var initializeCastApi = () => {
    var castContext = cast.framework.CastContext.getInstance()
    castContext.setOptions({
      receiverApplicationId: process.env.chromecastReceiver,
      autoJoinPolicy: chrome.cast ? chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED : null
    })

    castContext.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (event) => {
        console.log('Session state changed event', event)
        const store = gp.$store

        switch (event.sessionState) {
          case cast.framework.SessionState.SESSION_STARTED:
            console.log('[chromecast] CAST SESSION STARTED')
            store.commit('globals/setCasting', true)
            sendInit(castContext)
            setTimeout(() => { gp.$eventBus.$emit('cast-session-active', true) }, 500)
            break
          case cast.framework.SessionState.SESSION_RESUMED:
            console.log('[chromecast] CAST SESSION RESUMED')
            setTimeout(() => { gp.$eventBus.$emit('cast-session-active', true) }, 500)
            break
          case cast.framework.SessionState.SESSION_ENDED:
            console.log('[chromecast] CAST SESSION DISCONNECTED')
            store.commit('globals/setCasting', false)
            gp.$eventBus.$emit('cast-session-active', false)
            break
        }
      })

    gp.$store.commit('globals/setChromecastInitialized', true)

    var player = new cast.framework.RemotePlayer()
    var playerController = new cast.framework.RemotePlayerController(player)
    // Store on the app instance (replaces ctx.$root.castPlayer)
    nuxtApp.castPlayer = player
    nuxtApp.castPlayerController = playerController
  }

  window['__onGCastApiAvailable'] = function (isAvailable) {
    if (isAvailable) {
      initializeCastApi()
    }
  }

  var script = document.createElement('script')
  script.type = 'text/javascript'
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
  document.head.appendChild(script)
})
