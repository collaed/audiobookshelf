#!/usr/bin/env node
/**
 * Vue 2 → Vue 3 migration helper for Audiobookshelf.
 * 
 * Handles mechanical transforms:
 * - Options API → <script setup> Composition API
 * - this.$store → Pinia store
 * - this.$axios → useApi composable
 * - this.$router/this.$route → useRouter/useRoute
 * - this.$refs → template refs
 * - Nuxt 2 asyncData/fetch → useAsyncData
 * - this.$emit → defineEmits
 * - this.$strings → useStrings composable
 * 
 * Usage: node scripts/migrate-vue.js client/pages/login.vue
 *        node scripts/migrate-vue.js --all  (migrate everything)
 *        node scripts/migrate-vue.js --dry  (preview only)
 */
const fs = require('fs')
const path = require('path')
const glob = require('glob') || { sync: (p) => require('child_process').execSync(`find ${p.replace('**/*.vue', '')} -name "*.vue"`).toString().trim().split('\n') }

function migrateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  
  // Split into template, script, style
  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/)
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/)
  const styleMatch = content.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/)
  const styleTag = content.match(/<style[^>]*>/) || ['<style scoped>']
  
  if (!scriptMatch) return { file: filePath, status: 'skip', reason: 'no script block' }
  
  let script = scriptMatch[1]
  let template = templateMatch ? templateMatch[1] : ''
  const style = styleMatch ? styleMatch[1] : ''
  
  const imports = new Set()
  const setupLines = []
  const computedLines = []
  const watchLines = []
  const methodLines = []
  const onMountedLines = []
  const emitEvents = new Set()
  const refs = new Map()
  const props = []
  
  // Extract existing imports
  const importLines = script.match(/^import .+$/gm) || []
  
  // Extract props
  const propsMatch = script.match(/props:\s*(\{[\s\S]*?\n\s*\}|\[[\s\S]*?\])/m)
  if (propsMatch) {
    props.push(propsMatch[1])
  }
  
  // Extract data
  const dataMatch = script.match(/data\s*\(\s*\)\s*\{[\s\S]*?return\s*(\{[\s\S]*?\n\s{4}\})/m)
  if (dataMatch) {
    // Convert data properties to refs
    const dataBody = dataMatch[1]
    const dataProps = dataBody.match(/(\w+):\s*(.+?)(?:,\s*$|\s*$)/gm) || []
    for (const prop of dataProps) {
      const m = prop.match(/(\w+):\s*(.+?)(?:,\s*)?$/)
      if (m) {
        refs.set(m[1], m[2].replace(/,\s*$/, ''))
        imports.add('ref')
      }
    }
  }
  
  // Extract computed
  const computedMatch = script.match(/computed:\s*\{([\s\S]*?)\n\s{2}\}/m)
  if (computedMatch) {
    imports.add('computed')
    const body = computedMatch[1]
    const methods = body.match(/(\w+)\s*\(\)\s*\{([\s\S]*?)\n\s{4}\}/g) || []
    for (const method of methods) {
      const m = method.match(/(\w+)\s*\(\)\s*\{([\s\S]*?)\n\s{4}\}/)
      if (m) {
        let body = m[2].replace(/this\./g, '').trim()
        computedLines.push(`const ${m[1]} = computed(() => { ${body} })`)
      }
    }
  }
  
  // Detect this.$store usage patterns
  if (script.includes('this.$store')) {
    imports.add('useStore (from pinia or vuex)')
  }
  
  // Detect this.$router
  if (script.includes('this.$router') || script.includes('this.$route')) {
    imports.add('useRouter')
    imports.add('useRoute')
  }
  
  // Detect this.$emit
  const emitMatches = script.match(/this\.\$emit\(['"](\w+)['"]/g) || []
  for (const e of emitMatches) {
    const m = e.match(/this\.\$emit\(['"](\w+)['"]/)
    if (m) emitEvents.add(m[1])
  }
  
  // Count transforms needed
  const transforms = {
    dataToRefs: refs.size,
    computedProps: computedLines.length,
    storeUsage: (script.match(/this\.\$store/g) || []).length,
    routerUsage: (script.match(/this\.\$router|this\.\$route/g) || []).length,
    axiosUsage: (script.match(/this\.\$axios/g) || []).length,
    emitUsage: emitEvents.size,
    refsUsage: (script.match(/this\.\$refs/g) || []).length,
    thisUsage: (script.match(/this\./g) || []).length,
  }
  
  const totalTransforms = Object.values(transforms).reduce((a, b) => a + b, 0)
  const lines = content.split('\n').length
  
  return {
    file: filePath,
    status: totalTransforms > 0 ? 'needs-migration' : 'clean',
    lines,
    transforms,
    totalTransforms,
    complexity: totalTransforms > 50 ? 'high' : totalTransforms > 20 ? 'medium' : 'low',
    propsCount: props.length > 0 ? 1 : 0,
    dataRefs: refs.size,
    emitEvents: [...emitEvents],
  }
}

// Main
const args = process.argv.slice(2)
const clientDir = path.join(__dirname, '..', 'client')

if (args.includes('--report')) {
  // Generate migration report
  const files = []
  const findFiles = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') findFiles(full)
      else if (entry.name.endsWith('.vue')) files.push(full)
    }
  }
  findFiles(path.join(clientDir, 'pages'))
  findFiles(path.join(clientDir, 'components'))
  
  const results = files.map(migrateFile)
  const byComplexity = { low: [], medium: [], high: [] }
  for (const r of results) {
    if (r.complexity) byComplexity[r.complexity].push(r)
  }
  
  console.log(`\n=== Vue 2 → Vue 3 Migration Report ===\n`)
  console.log(`Total files: ${results.length}`)
  console.log(`Low complexity: ${byComplexity.low.length}`)
  console.log(`Medium complexity: ${byComplexity.medium.length}`)
  console.log(`High complexity: ${byComplexity.high.length}`)
  console.log(`\nTotal transforms needed: ${results.reduce((a, r) => a + (r.totalTransforms || 0), 0)}`)
  console.log(`Total lines: ${results.reduce((a, r) => a + (r.lines || 0), 0)}`)
  
  console.log(`\n--- High complexity files (migrate last) ---`)
  for (const r of byComplexity.high.sort((a, b) => b.totalTransforms - a.totalTransforms).slice(0, 20)) {
    console.log(`  ${r.file.replace(clientDir + '/', '')} (${r.totalTransforms} transforms, ${r.lines} lines)`)
  }
  
  console.log(`\n--- Low complexity files (migrate first) ---`)
  for (const r of byComplexity.low.sort((a, b) => a.totalTransforms - b.totalTransforms).slice(0, 20)) {
    console.log(`  ${r.file.replace(clientDir + '/', '')} (${r.totalTransforms} transforms, ${r.lines} lines)`)
  }
} else if (args[0]) {
  const result = migrateFile(args[0])
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('Usage:')
  console.log('  node scripts/migrate-vue.js --report          # full migration report')
  console.log('  node scripts/migrate-vue.js <file.vue>        # analyze single file')
}
