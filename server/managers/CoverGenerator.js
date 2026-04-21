const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const Logger = require('../Logger')

/**
 * Generate book covers using Pillow (via Python one-liner).
 * Genre-based color schemes from BrainyCat.
 */
const GENRE_COLORS = {
  fiction:     { stripe: '#2563eb', bg: '#f8fafc', text: '#1e293b' },
  romance:    { stripe: '#e11d48', bg: '#fff1f2', text: '#1e293b' },
  thriller:   { stripe: '#0f172a', bg: '#f8fafc', text: '#1e293b' },
  fantasy:    { stripe: '#7c3aed', bg: '#faf5ff', text: '#1e293b' },
  'sci-fi':   { stripe: '#0891b2', bg: '#ecfeff', text: '#1e293b' },
  horror:     { stripe: '#450a0a', bg: '#1c1917', text: '#e2e8f0' },
  mystery:    { stripe: '#854d0e', bg: '#fefce8', text: '#1e293b' },
  'non-fiction': { stripe: '#dc2626', bg: '#ffffff', text: '#1e293b', layout: 'horizontal' },
  'self-help':   { stripe: '#f59e0b', bg: '#ffffff', text: '#1e293b', layout: 'horizontal' },
  business:      { stripe: '#1d4ed8', bg: '#ffffff', text: '#1e293b', layout: 'horizontal' },
}

class CoverGenerator {
  detectGenre(title, genres) {
    const t = ((title || '') + ' ' + (genres || []).join(' ')).toLowerCase()
    for (const g of Object.keys(GENRE_COLORS)) {
      if (t.includes(g)) return g
    }
    if (/love|heart|kiss|passion/.test(t)) return 'romance'
    if (/kill|murder|dead|blood/.test(t)) return 'thriller'
    if (/magic|dragon|wizard|elf/.test(t)) return 'fantasy'
    if (/space|alien|robot|cyber/.test(t)) return 'sci-fi'
    return 'fiction'
  }

  async generate(title, author, genre, outputPath) {
    const colors = GENRE_COLORS[genre] || GENRE_COLORS.fiction
    const isHoriz = colors.layout === 'horizontal'

    // Python script using Pillow
    const script = `
import sys, json
from PIL import Image, ImageDraw, ImageFont
d = json.loads(sys.argv[1])
w, h = 600, 900
img = Image.new('RGB', (w, h), d['bg'])
draw = ImageDraw.Draw(img)
try: tf = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 42)
except: tf = ImageFont.load_default()
try: af = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
except: af = tf
s = tuple(int(d['stripe'][i:i+2],16) for i in (1,3,5))
t = tuple(int(d['text'][i:i+2],16) for i in (1,3,5))
if d.get('horiz'):
    draw.rectangle([0,0,w,int(h*0.12)], fill=s)
    ty = int(h*0.20)
    mx = 30
else:
    sw = int(w*0.08)
    draw.rectangle([0,0,sw,h], fill=s)
    ty = int(h*0.25)
    mx = int(w*0.15)
words = d['title'].split()
lines, cur = [], ''
for word in words:
    test = (cur+' '+word).strip()
    bb = draw.textbbox((0,0), test, font=tf)
    if bb[2]-bb[0] > w-mx-30 and cur:
        lines.append(cur); cur = word
    else: cur = test
if cur: lines.append(cur)
for i, line in enumerate(lines[:4]):
    draw.text((mx, ty + i*52), line, fill=t, font=tf)
ay = ty + len(lines[:4])*52 + 30
draw.text((mx, ay), d['author'], fill=t, font=af)
img.save(d['out'], 'JPEG', quality=85)
`
    const data = JSON.stringify({
      title: title || 'Untitled', author: author || 'Unknown',
      stripe: colors.stripe, bg: colors.bg, text: colors.text,
      horiz: isHoriz, out: outputPath
    })

    return new Promise((resolve, reject) => {
      execFile('python3', ['-c', script, data], { timeout: 10000 }, (err) => {
        if (err) { Logger.error(`[CoverGenerator] ${err.message}`); return reject(err) }
        resolve(outputPath)
      })
    })
  }

  async generateForBook(bookId) {
    const Database = require('../Database')
    const book = await Database.bookModel.findByPk(bookId)
    if (!book) throw new Error('Book not found')
    if (book.coverPath && fs.existsSync(book.coverPath)) return { exists: true }

    const genre = this.detectGenre(book.title, book.genres)
    const coverDir = path.join(global.MetadataPath, 'items', bookId)
    fs.mkdirSync(coverDir, { recursive: true })
    const coverPath = path.join(coverDir, 'cover.jpg')
    await this.generate(book.title, book.authorName, genre, coverPath)
    return { generated: true, path: coverPath, genre }
  }
}

module.exports = new CoverGenerator()
