const { expect } = require('chai')
const { Sequelize, DataTypes, Model } = require('sequelize')

describe('IncomingItem model', () => {
  let sequelize, IncomingItem

  before(async () => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })

    // Stub library model required by IncomingItem.init associations
    class library extends Model {}
    library.init({ id: { type: DataTypes.UUID, primaryKey: true } }, { sequelize, modelName: 'library' })

    IncomingItem = require('../../../server/models/IncomingItem')
    IncomingItem.init(sequelize)
    await sequelize.sync({ force: true })
  })

  after(async () => {
    await sequelize.close()
  })

  beforeEach(async () => {
    await IncomingItem.destroy({ where: {} })
  })

  it('should create an item with all fields', async () => {
    const item = await IncomingItem.create({
      filePath: '/incoming/test.m4b',
      fileName: 'test.m4b',
      fileSize: 123456,
      fileFormat: 'm4b',
      parsedTitle: 'Test Book',
      parsedAuthor: 'Test Author',
      parsedSeries: 'Test Series',
      parsedSequence: '1',
      matchedTitle: 'Matched Title',
      matchedAuthor: 'Matched Author',
      matchedCover: 'http://cover.jpg',
      matchedAsin: 'B00TEST',
      matchedIsbn: '1234567890',
      matchProvider: 'audible',
      matchConfidence: 0.95,
      status: 'confirmed'
    })
    expect(item.id).to.be.a('string')
    expect(item.filePath).to.equal('/incoming/test.m4b')
    expect(item.matchConfidence).to.equal(0.95)
    expect(item.status).to.equal('confirmed')
  })

  it('should default status to pending', async () => {
    const item = await IncomingItem.create({ filePath: '/incoming/a.m4b', fileName: 'a.m4b' })
    expect(item.status).to.equal('pending')
  })

  it('should enforce required filePath', async () => {
    try {
      await IncomingItem.create({ fileName: 'a.m4b' })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err.name).to.include('SequelizeValidationError')
    }
  })

  it('should enforce required fileName', async () => {
    try {
      await IncomingItem.create({ filePath: '/incoming/a.m4b' })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err.name).to.include('SequelizeValidationError')
    }
  })

  it('getPending() returns only pending items', async () => {
    await IncomingItem.bulkCreate([
      { filePath: '/a', fileName: 'a', status: 'pending' },
      { filePath: '/b', fileName: 'b', status: 'confirmed' },
      { filePath: '/c', fileName: 'c', status: 'pending' }
    ])
    const pending = await IncomingItem.getPending()
    expect(pending).to.have.lengthOf(2)
    pending.forEach((item) => expect(item.status).to.equal('pending'))
  })

  it('getByStatus returns only items with given status', async () => {
    await IncomingItem.bulkCreate([
      { filePath: '/a', fileName: 'a', status: 'pending' },
      { filePath: '/b', fileName: 'b', status: 'confirmed' },
      { filePath: '/c', fileName: 'c', status: 'confirmed' }
    ])
    const confirmed = await IncomingItem.getByStatus('confirmed')
    expect(confirmed).to.have.lengthOf(2)
    confirmed.forEach((item) => expect(item.status).to.equal('confirmed'))
  })
})
