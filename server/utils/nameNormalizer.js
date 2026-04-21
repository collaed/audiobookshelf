/**
 * Name normalization for consistent author matching.
 * Handles: FirstName LastName, LastName FirstName, LastName, FirstName,
 * initials, prefixes (de, van, von, di, le, la, el, al-, ibn, mc, mac, o'),
 * suffixes (Jr, Sr, III, PhD, MD), and multi-part last names.
 */

const PREFIXES = new Set(['de', 'van', 'von', 'di', 'du', 'le', 'la', 'el', 'ibn', 'mc', 'mac'])
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'phd', 'md', 'père', 'fils'])

function isPrefix(word) {
  const lower = word.toLowerCase()
  return PREFIXES.has(lower) || lower.startsWith('al-') || lower.startsWith("o'")
}

function isSuffix(word) {
  return SUFFIXES.has(word.toLowerCase())
}

function isInitial(word) {
  return /^[A-Za-z]\.?$/.test(word) || /^([A-Za-z]\.){1,}$/.test(word)
}

/**
 * Parse a name string into components.
 */
function parseName(nameStr) {
  if (!nameStr || typeof nameStr !== 'string') return { first: '', last: '', full: '' }
  const str = nameStr.trim().replace(/\s+/g, ' ')
  if (!str) return { first: '', last: '', full: '' }

  let first = '', last = '', suffix = '' // eslint-disable-line no-useless-assignment

  if (str.includes(',')) {
    const parts = str.split(',').map((s) => s.trim())
    const rest = parts.slice(1).join(' ').trim()
    const restWords = rest ? rest.split(/\s+/) : []
    const allSuffixes = restWords.length > 0 && restWords.every((w) => isSuffix(w))
    if (allSuffixes) {
      // "Alexandre Dumas, père" — comma separates name from suffix
      suffix = rest
      const words = parts[0].split(/\s+/)
      if (words.length === 1) {
        last = words[0]
      } else {
        let lastStart = words.length - 1
        while (lastStart > 0 && isPrefix(words[lastStart - 1])) lastStart--
        first = words.slice(0, lastStart).join(' ')
        last = words.slice(lastStart).join(' ')
      }
    } else {
      last = parts[0]
      const suffixWords = []
      const firstWords = []
      for (const w of restWords) {
        if (isSuffix(w)) suffixWords.push(w)
        else firstWords.push(w)
      }
      first = firstWords.join(' ')
      suffix = suffixWords.join(' ')
    }
  } else {
    const words = str.split(/\s+/)
    if (words.length === 1) {
      last = words[0]
    } else {
      // Extract trailing suffixes
      const suffixWords = []
      while (words.length > 1 && isSuffix(words[words.length - 1])) {
        suffixWords.unshift(words.pop())
      }
      suffix = suffixWords.join(' ')

      // Find where the last name starts (prefixes attach to last name)
      let lastStart = words.length - 1
      while (lastStart > 0 && isPrefix(words[lastStart - 1])) {
        lastStart--
      }

      // Check if the entire first portion is uppercase and the rest is not (e.g., 'SMITH John')
      // In that case, the first word is the last name
      if (words.length >= 2 && words[0] === words[0].toUpperCase() && words[0].length > 1 && !isInitial(words[0])) {
        const allCapsCount = words.filter((w, i) => i < lastStart && w === w.toUpperCase() && w.length > 1 && !isInitial(w)).length
        const nonCapsExist = words.some((w, i) => i > 0 && i < lastStart && w !== w.toUpperCase())
        if (allCapsCount === 1 && nonCapsExist) {
          // First word is all-caps last name like 'SMITH John'
          last = words[0]
          first = words.slice(1, words.length).filter((w) => !suffixWords.includes(w)).join(' ')
          const full = (first ? first + ' ' : '') + last
          const result = { first, last, full }
          if (suffix) result.suffix = suffix
          return result
        }
      }

      first = words.slice(0, lastStart).join(' ')
      last = words.slice(lastStart).join(' ')
    }
  }

  const full = (first ? first + ' ' : '') + last
  const result = { first, last, full }
  if (suffix) result.suffix = suffix
  return result
}

/**
 * Return a canonical lowercase form for comparison.
 * Strips periods, lowercases, last name first.
 */
function normalizeName(nameStr) {
  const parsed = parseName(nameStr)
  if (!parsed.last && !parsed.first) return ''
  const clean = (s) => s.toLowerCase().replace(/\./g, '').trim()
  const parts = [clean(parsed.last), clean(parsed.first)].filter(Boolean)
  return parts.join(' ')
}

/**
 * Return true if two name strings refer to the same person.
 * Supports initial matching: 'J.' matches any name starting with 'J'.
 */
function namesMatch(nameA, nameB) {
  if (normalizeName(nameA) === normalizeName(nameB)) return true

  const a = parseName(nameA)
  const b = parseName(nameB)

  // Last names must match
  if (a.last.toLowerCase() !== b.last.toLowerCase()) return false

  // If either has no first name, last-name match is enough
  if (!a.first || !b.first) return true

  const aFirsts = a.first.split(/\s+/)
  const bFirsts = b.first.split(/\s+/)

  // Compare the shorter list against the longer
  const [shorter, longer] = aFirsts.length <= bFirsts.length ? [aFirsts, bFirsts] : [bFirsts, aFirsts]

  for (let i = 0; i < shorter.length; i++) {
    const s = shorter[i].replace(/\./g, '').toLowerCase()
    const l = longer[i] ? longer[i].replace(/\./g, '').toLowerCase() : ''
    if (!l) continue
    if (s === l) continue
    // Initial match: single letter matches if it's the first letter
    if (s.length === 1 && l.startsWith(s)) continue
    if (l.length === 1 && s.startsWith(l)) continue
    return false
  }
  return true
}

/**
 * Format a parsed name object.
 * Formats: 'first-last', 'last-first', 'last-only', 'short'
 */
function formatName(parsed, format) {
  const { first, last, suffix } = parsed || {}
  const sfx = suffix ? `, ${suffix}` : ''
  switch (format) {
    case 'first-last':
      return (first ? first + ' ' : '') + last + sfx
    case 'last-first':
      return last + (first ? ', ' + first : '') + sfx
    case 'last-only':
      return last + sfx
    case 'short': {
      if (!first) return last + sfx
      const initial = first.charAt(0).toUpperCase() + '.'
      return initial + ' ' + last + sfx
    }
    default:
      return (first ? first + ' ' : '') + last + sfx
  }
}

module.exports = { parseName, normalizeName, namesMatch, formatName }
