import Toast from 'vue-toastification'
import 'vue-toastification/dist/index.css'

const options = {
  hideProgressBar: true,
  draggable: false
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(Toast, options)
})
