import { formatDistance, format, addDays, isDate, setDefaultOptions } from 'date-fns'
import * as locale from 'date-fns/locale'

export default defineNuxtPlugin((nuxtApp) => {
  const gp = nuxtApp.vueApp.config.globalProperties

  // v-click-outside directive (Vue 3 compatible)
  nuxtApp.vueApp.directive('click-outside', {
    mounted(el, binding) {
      el.__clickOutsideHandler = (event) => {
        if (!(el === event.target || el.contains(event.target))) {
          binding.value(event)
        }
      }
      document.addEventListener('click', el.__clickOutsideHandler)
    },
    unmounted(el) {
      document.removeEventListener('click', el.__clickOutsideHandler)
      delete el.__clickOutsideHandler
    }
  })

  gp.$setDateFnsLocale = (localeString) => {
    if (!locale[localeString]) return 0
    return setDefaultOptions({ locale: locale[localeString] })
  }
  gp.$dateDistanceFromNow = (unixms) => {
    if (!unixms) return ''
    return formatDistance(unixms, Date.now(), { addSuffix: true })
  }
  gp.$formatDate = (unixms, fnsFormat = 'MM/dd/yyyy HH:mm') => {
    if (!unixms) return ''
    return format(unixms, fnsFormat)
  }
  gp.$formatJsDate = (jsdate, fnsFormat = 'MM/dd/yyyy HH:mm') => {
    if (!jsdate || !isDate(jsdate)) return ''
    return format(jsdate, fnsFormat)
  }
  gp.$formatTime = (unixms, fnsFormat = 'HH:mm') => {
    if (!unixms) return ''
    return format(unixms, fnsFormat)
  }
  gp.$formatJsTime = (jsdate, fnsFormat = 'HH:mm') => {
    if (!jsdate || !isDate(jsdate)) return ''
    return format(jsdate, fnsFormat)
  }
  gp.$formatDatetime = (unixms, fnsDateFormart = 'MM/dd/yyyy', fnsTimeFormat = 'HH:mm') => {
    if (!unixms) return ''
    return format(unixms, `${fnsDateFormart} ${fnsTimeFormat}`)
  }
  gp.$formatJsDatetime = (jsdate, fnsDateFormart = 'MM/dd/yyyy', fnsTimeFormat = 'HH:mm') => {
    if (!jsdate || !isDate(jsdate)) return ''
    return format(jsdate, `${fnsDateFormart} ${fnsTimeFormat}`)
  }
  gp.$addDaysToToday = (daysToAdd) => {
    var date = addDays(new Date(), daysToAdd)
    if (!date || !isDate(date)) return null
    return date
  }
  gp.$addDaysToDate = (jsdate, daysToAdd) => {
    var date = addDays(jsdate, daysToAdd)
    if (!date || !isDate(date)) return null
    return date
  }
})
