const { expect } = require('chai')
const sinon = require('sinon')
const Path = require('path')
const fs = require('../../../server/libs/fsExtra')
const os = require('os')

const IncomingManager = require('../../../server/managers/IncomingManager')

describe('IncomingManager - File Operations', () => {
  let tmpDir

  beforeEach(async () => {
    tmpDir = Path.join(os.tmpdir(), `abs_test_${Date.now()}`)
    await fs.ensureDir(tmpDir)
    IncomingManager.incomingPath = tmpDir
    IncomingManager.processing.clear()
    IncomingManager.items.clear()
    // Stub dependencies that processFile calls
    sinon.stub(IncomingManager, 'checkDuplicate').resolves(null)
    sinon.stub(IncomingManager, 'identifyBook').resolves(null)
    const SocketAuthority = require('../../../server/SocketAuthority')
    sinon.stub(SocketAuthority, 'emitter')
  })

  afterEach(async () => {
    sinon.restore()
    await fs.remove(tmpDir)
  })

  describe('scanIncoming', () => {
    it('finds audio files recursively', async () => {
      // Create nested structure: Author/Book.m4b
      const nested = Path.join(tmpDir, 'Author', 'Series')
      await fs.ensureDir(nested)
      await fs.writeFile(Path.join(nested, 'book.m4b'), 'fake')
      await fs.writeFile(Path.join(tmpDir, 'flat.mp3'), 'fake')

      await IncomingManager.scanIncoming()

      expect(IncomingManager.items.size).to.equal(2)
      const titles = [...IncomingManager.items.values()].map((i) => i.parsed.fileName)
      expect(titles).to.include('book.m4b')
      expect(titles).to.include('flat.mp3')
    })

    it('ignores non-audio files', async () => {
      await fs.writeFile(Path.join(tmpDir, 'readme.txt'), 'text')
      await fs.writeFile(Path.join(tmpDir, 'cover.jpg'), 'img')
      await fs.writeFile(Path.join(tmpDir, 'real.flac'), 'audio')

      await IncomingManager.scanIncoming()

      expect(IncomingManager.items.size).to.equal(1)
      const item = [...IncomingManager.items.values()][0]
      expect(item.parsed.fileName).to.equal('real.flac')
    })
  })

  describe('processFile', () => {
    it('skips files already being processed', async () => {
      const filePath = Path.join(tmpDir, 'test.m4b')
      await fs.writeFile(filePath, 'fake')
      IncomingManager.processing.add(filePath)

      await IncomingManager.processFile(filePath)

      expect(IncomingManager.items.size).to.equal(0)
    })

    it('skips non-audio extensions', async () => {
      const filePath = Path.join(tmpDir, 'notes.txt')
      await fs.writeFile(filePath, 'text')

      await IncomingManager.processFile(filePath)

      expect(IncomingManager.items.size).to.equal(0)
    })

    it('cleans up processing set after completion', async () => {
      const filePath = Path.join(tmpDir, 'test.m4b')
      await fs.writeFile(filePath, 'fake')

      await IncomingManager.processFile(filePath)

      expect(IncomingManager.processing.has(filePath)).to.be.false
    })
  })

  describe('confirmItem - file move', () => {
    it('creates destination directory and moves file', async () => {
      const srcFile = Path.join(tmpDir, 'test.m4b')
      await fs.writeFile(srcFile, 'audio-data')

      const destBase = Path.join(tmpDir, 'library')
      const itemId = 'test-id'
      IncomingManager.items.set(itemId, {
        id: itemId,
        filePath: srcFile,
        fileName: 'test.m4b',
        parsed: { title: 'MyBook', author: null },
        identified: { author: 'Author', title: 'MyBook' },
        status: 'pending'
      })

      const Database = require('../../../server/Database')
      sinon.stub(Database, 'libraryFolderModel').value({
        findOne: sinon.stub().resolves({ id: 'folder1', path: destBase })
      })

      const result = await IncomingManager.confirmItem(itemId, 'lib1', 'folder1')

      expect(result.status).to.equal('confirmed')
      const destPath = Path.join(destBase, 'Author', 'MyBook', 'test.m4b')
      expect(await fs.pathExists(destPath)).to.be.true
      expect(await fs.pathExists(srcFile)).to.be.false
    })

    it('does not overwrite existing files', async () => {
      const srcFile = Path.join(tmpDir, 'test.m4b')
      await fs.writeFile(srcFile, 'new-data')

      const destBase = Path.join(tmpDir, 'library')
      const destDir = Path.join(destBase, 'Unknown', 'MyBook')
      await fs.ensureDir(destDir)
      await fs.writeFile(Path.join(destDir, 'test.m4b'), 'original-data')

      const itemId = 'test-id-2'
      IncomingManager.items.set(itemId, {
        id: itemId,
        filePath: srcFile,
        fileName: 'test.m4b',
        parsed: { title: 'MyBook', author: null },
        identified: null,
        status: 'pending'
      })

      const Database = require('../../../server/Database')
      sinon.stub(Database, 'libraryFolderModel').value({
        findOne: sinon.stub().resolves({ id: 'folder1', path: destBase })
      })

      // fs.move with overwrite:false throws on conflict
      try {
        await IncomingManager.confirmItem(itemId, 'lib1', 'folder1')
      } catch {
        // Expected to throw
      }

      // Original file should be preserved
      const content = await fs.readFile(Path.join(destDir, 'test.m4b'), 'utf8')
      expect(content).to.equal('original-data')
    })
  })
})
