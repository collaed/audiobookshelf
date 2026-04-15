const { expect } = require('chai')
const { Sequelize, DataTypes, Model } = require('sequelize')
const { v4: uuidv4 } = require('uuid')

describe('ListenerProfile model', () => {
  let sequelize, ListenerProfile, UserModel

  before(async () => {
    sequelize = new Sequelize('sqlite::memory:', { logging: false })

    // Stub user model required by ListenerProfile.init associations
    class user extends Model {}
    user.init({ id: { type: DataTypes.UUID, primaryKey: true } }, { sequelize, modelName: 'user' })
    UserModel = user

    ListenerProfile = require('../../../server/models/ListenerProfile')
    ListenerProfile.init(sequelize)
    await sequelize.sync({ force: true })
  })

  after(async () => {
    await sequelize.close()
  })

  beforeEach(async () => {
    await ListenerProfile.destroy({ where: {} })
    await UserModel.destroy({ where: {} })
  })

  async function createUser() {
    const id = uuidv4()
    await UserModel.create({ id })
    return id
  }

  it('should create a profile with default values', async () => {
    const userId = await createUser()
    const profile = await ListenerProfile.create({ userId })
    expect(profile.id).to.be.a('string')
    expect(profile.userId).to.equal(userId)
    expect(profile.includeEbooks).to.equal(true)
    expect(profile.preferredFormat).to.equal('all')
    expect(profile.totalListeningTime).to.equal(0)
    expect(profile.booksFinished).to.equal(0)
  })

  it('getOrCreateForUser creates a new profile', async () => {
    const userId = await createUser()
    const [profile, created] = await ListenerProfile.getOrCreateForUser(userId)
    expect(created).to.be.true
    expect(profile.userId).to.equal(userId)
  })

  it('getOrCreateForUser returns existing profile on second call', async () => {
    const userId = await createUser()
    const [first] = await ListenerProfile.getOrCreateForUser(userId)
    const [second, created] = await ListenerProfile.getOrCreateForUser(userId)
    expect(created).to.be.false
    expect(second.id).to.equal(first.id)
  })

  it('should store and retrieve JSON array fields', async () => {
    const userId = await createUser()
    const profile = await ListenerProfile.create({
      userId,
      favoriteGenres: ['sci-fi', 'fantasy'],
      fluentLanguages: ['en', 'es']
    })
    const fetched = await ListenerProfile.findByPk(profile.id)
    expect(fetched.favoriteGenres).to.deep.equal(['sci-fi', 'fantasy'])
    expect(fetched.fluentLanguages).to.deep.equal(['en', 'es'])
  })

  it('should have correct default values for JSON fields', async () => {
    const userId = await createUser()
    const profile = await ListenerProfile.create({ userId })
    const fetched = await ListenerProfile.findByPk(profile.id)
    const genres = typeof fetched.favoriteGenres === 'string' ? JSON.parse(fetched.favoriteGenres) : fetched.favoriteGenres
    expect(genres).to.deep.equal([])
  })
})
