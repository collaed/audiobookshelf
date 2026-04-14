const { DataTypes, Model } = require('sequelize')

class ListenerProfile extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {UUIDV4} */
    this.userId
    /** @type {Array} */
    this.favoriteGenres
    /** @type {Array} */
    this.favoriteAuthors
    /** @type {Array} */
    this.favoriteNarrators
    /** @type {Array} */
    this.themeKeywords
    /** @type {number} */
    this.avgBookLength
    /** @type {number} */
    this.totalListeningTime
    /** @type {number} */
    this.booksFinished
    /** @type {Date} */
    this.lastCalculatedAt
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  static getOrCreateForUser(userId) {
    return this.findOrCreate({ where: { userId }, defaults: { userId } })
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        userId: { type: DataTypes.UUID, allowNull: false, unique: true },
        favoriteGenres: { type: DataTypes.JSON, defaultValue: '[]' },
        favoriteAuthors: { type: DataTypes.JSON, defaultValue: '[]' },
        favoriteNarrators: { type: DataTypes.JSON, defaultValue: '[]' },
        themeKeywords: { type: DataTypes.JSON, defaultValue: '[]' },
        avgBookLength: DataTypes.FLOAT,
        totalListeningTime: { type: DataTypes.FLOAT, defaultValue: 0 },
        booksFinished: { type: DataTypes.INTEGER, defaultValue: 0 },
        lastCalculatedAt: DataTypes.DATE
      },
      {
        sequelize,
        modelName: 'listenerProfile'
      }
    )

    const { user } = sequelize.models
    user.hasOne(ListenerProfile, { onDelete: 'CASCADE' })
    ListenerProfile.belongsTo(user)
  }
}

module.exports = ListenerProfile
