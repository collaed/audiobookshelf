const { DataTypes, Model } = require('sequelize')

class IncomingItem extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {string} */
    this.filePath
    /** @type {string} */
    this.fileName
    /** @type {number} */
    this.fileSize
    /** @type {string} */
    this.fileFormat
    /** @type {string} */
    this.parsedTitle
    /** @type {string} */
    this.parsedAuthor
    /** @type {string} */
    this.parsedSeries
    /** @type {string} */
    this.parsedSequence
    /** @type {string} */
    this.matchedTitle
    /** @type {string} */
    this.matchedAuthor
    /** @type {string} */
    this.matchedCover
    /** @type {string} */
    this.matchedAsin
    /** @type {string} */
    this.matchedIsbn
    /** @type {string} */
    this.matchProvider
    /** @type {number} */
    this.matchConfidence
    /** @type {string} */
    this.status
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  static getByStatus(status) {
    return this.findAll({ where: { status } })
  }

  static getPending() {
    return this.getByStatus('pending')
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        filePath: { type: DataTypes.STRING, allowNull: false },
        fileName: { type: DataTypes.STRING, allowNull: false },
        fileSize: DataTypes.BIGINT,
        fileFormat: DataTypes.STRING,
        parsedTitle: DataTypes.STRING,
        parsedAuthor: DataTypes.STRING,
        parsedSeries: DataTypes.STRING,
        parsedSequence: DataTypes.STRING,
        matchedTitle: DataTypes.STRING,
        matchedAuthor: DataTypes.STRING,
        matchedCover: DataTypes.STRING,
        matchedAsin: DataTypes.STRING,
        matchedIsbn: DataTypes.STRING,
        matchProvider: DataTypes.STRING,
        matchConfidence: DataTypes.FLOAT,
        status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
        libraryId: DataTypes.UUID
      },
      {
        sequelize,
        modelName: 'incomingItem'
      }
    )

    const { library } = sequelize.models
    library.hasMany(IncomingItem, { onDelete: 'SET NULL' })
    IncomingItem.belongsTo(library)
  }
}

module.exports = IncomingItem
