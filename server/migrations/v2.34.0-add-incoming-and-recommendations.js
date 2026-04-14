const { DataTypes } = require('sequelize')

const migrationVersion = '2.34.0'
const migrationName = `${migrationVersion}-add-incoming-and-recommendations`
const loggerPrefix = `[${migrationVersion} migration]`

async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  await queryInterface.createTable('incomingItems', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    filePath: { type: DataTypes.STRING, allowNull: false },
    fileName: { type: DataTypes.STRING, allowNull: false },
    fileSize: { type: DataTypes.BIGINT },
    fileFormat: { type: DataTypes.STRING },
    parsedTitle: { type: DataTypes.STRING },
    parsedAuthor: { type: DataTypes.STRING },
    parsedSeries: { type: DataTypes.STRING },
    parsedSequence: { type: DataTypes.STRING },
    matchedTitle: { type: DataTypes.STRING },
    matchedAuthor: { type: DataTypes.STRING },
    matchedCover: { type: DataTypes.STRING },
    matchedAsin: { type: DataTypes.STRING },
    matchedIsbn: { type: DataTypes.STRING },
    matchProvider: { type: DataTypes.STRING },
    matchConfidence: { type: DataTypes.FLOAT },
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
    libraryId: { type: DataTypes.UUID, references: { model: 'libraries', key: 'id' }, onDelete: 'SET NULL' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false }
  })

  await queryInterface.createTable('listenerProfiles', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
    favoriteGenres: { type: DataTypes.JSON, defaultValue: '[]' },
    favoriteAuthors: { type: DataTypes.JSON, defaultValue: '[]' },
    favoriteNarrators: { type: DataTypes.JSON, defaultValue: '[]' },
    themeKeywords: { type: DataTypes.JSON, defaultValue: '[]' },
    avgBookLength: { type: DataTypes.FLOAT },
    totalListeningTime: { type: DataTypes.FLOAT, defaultValue: 0 },
    booksFinished: { type: DataTypes.INTEGER, defaultValue: 0 },
    lastCalculatedAt: { type: DataTypes.DATE },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false }
  })

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  await queryInterface.dropTable('incomingItems')
  await queryInterface.dropTable('listenerProfiles')

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
