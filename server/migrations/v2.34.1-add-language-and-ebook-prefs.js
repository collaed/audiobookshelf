const migrationVersion = '2.34.1'
const migrationName = `${migrationVersion}-add-language-and-ebook-prefs`
const loggerPrefix = `[${migrationVersion} migration]`

async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)
  const { DataTypes } = require('sequelize')

  await queryInterface.addColumn('listenerProfiles', 'fluentLanguages', { type: DataTypes.JSON, defaultValue: '[]' })
  await queryInterface.addColumn('listenerProfiles', 'secondaryLanguages', { type: DataTypes.JSON, defaultValue: '[]' })
  await queryInterface.addColumn('listenerProfiles', 'includeEbooks', { type: DataTypes.BOOLEAN, defaultValue: true })
  await queryInterface.addColumn('listenerProfiles', 'preferredFormat', { type: DataTypes.STRING, defaultValue: 'all' })

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  await queryInterface.removeColumn('listenerProfiles', 'fluentLanguages')
  await queryInterface.removeColumn('listenerProfiles', 'secondaryLanguages')
  await queryInterface.removeColumn('listenerProfiles', 'includeEbooks')
  await queryInterface.removeColumn('listenerProfiles', 'preferredFormat')

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
