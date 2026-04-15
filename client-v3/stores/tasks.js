export const state = () => ({
  tasks: [],
  queuedEmbedLIds: [],
  audioFilesEncoding: {},
  audioFilesFinished: {},
  taskProgress: {}
})

export const getters = {
  getTasksByLibraryItemId: (state) => (libraryItemId) => {
    return state.tasks.filter((t) => t.data?.libraryItemId === libraryItemId)
  },
  getRunningLibraryScanTask: (state) => (libraryId) => {
    const libraryScanActions = ['library-scan', 'library-match-all']
    return state.tasks.find((t) => libraryScanActions.includes(t.action) && t.data?.libraryId === libraryId && !t.isFinished)
  },
  getAudioFilesEncoding: (state) => (libraryItemId) => {
    return state.audioFilesEncoding[libraryItemId]
  },
  getAudioFilesFinished: (state) => (libraryItemId) => {
    return state.audioFilesFinished[libraryItemId]
  },
  getTaskProgress: (state) => (libraryItemId) => {
    return state.taskProgress[libraryItemId]
  }
}

export const actions = {}

export const mutations = {
  updateAudioFilesEncoding(state, payload) {
    if (!state.audioFilesEncoding[payload.libraryItemId]) {
      state.audioFilesEncoding[payload.libraryItemId] = {}
    }
    state.audioFilesEncoding[payload.libraryItemId][payload.ino] = payload.progress
    // Trigger reactivity by replacing the top-level object
    state.audioFilesEncoding = { ...state.audioFilesEncoding }
  },
  updateAudioFilesFinished(state, payload) {
    if (!state.audioFilesFinished[payload.libraryItemId]) {
      state.audioFilesFinished[payload.libraryItemId] = {}
    }
    state.audioFilesFinished[payload.libraryItemId][payload.ino] = payload.finished
    state.audioFilesFinished = { ...state.audioFilesFinished }
  },
  updateTaskProgress(state, payload) {
    state.taskProgress[payload.libraryItemId] = payload.progress
    state.taskProgress = { ...state.taskProgress }
  },
  setTasks(state, tasks) {
    state.tasks = tasks
  },
  addUpdateTask(state, task) {
    const index = state.tasks.findIndex((d) => d.id === task.id)
    if (index >= 0) {
      state.tasks.splice(index, 1, task)
    } else {
      state.tasks = state.tasks.filter((_task) => {
        if (!_task.data?.libraryItemId || _task.action !== task.action) return true
        return _task.data.libraryItemId !== task.data.libraryItemId
      })

      state.tasks.push(task)
    }
  },
  removeTask(state, task) {
    state.tasks = state.tasks.filter((d) => d.id !== task.id)
  },
  setQueuedEmbedLIds(state, libraryItemIds) {
    state.queuedEmbedLIds = libraryItemIds
  },
  addQueuedEmbedLId(state, libraryItemId) {
    if (!state.queuedEmbedLIds.some((lid) => lid === libraryItemId)) {
      state.queuedEmbedLIds.push(libraryItemId)
    }
  },
  removeQueuedEmbedLId(state, libraryItemId) {
    state.queuedEmbedLIds = state.queuedEmbedLIds.filter((lid) => lid !== libraryItemId)
  }
}
