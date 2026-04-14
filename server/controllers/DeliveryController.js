const { Request, Response } = require('express')
const Logger = require('../Logger')
const Database = require('../Database')
const DeliveryManager = require('../managers/DeliveryManager')

class DeliveryController {
  constructor() {}

  /**
   * POST /api/items/:id/send-to-kindle
   * Body: { email: "user@kindle.com" }
   */
  async sendToKindle(req, res) {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })

    try {
      const book = req.libraryItem?.media
      if (!book) return res.sendStatus(404)
      const result = await DeliveryManager.sendToKindle(book.id, email)
      res.json(result)
    } catch (err) {
      Logger.error(`[DeliveryController] Send to Kindle error: ${err.message}`)
      res.status(400).json({ error: err.message })
    }
  }

  /**
   * POST /api/items/:id/send-to-device
   * Body: { deviceName: "My Kobo" }
   */
  async sendToDevice(req, res) {
    const { deviceName } = req.body
    if (!deviceName) return res.status(400).json({ error: 'deviceName required' })

    try {
      const book = req.libraryItem?.media
      if (!book) return res.sendStatus(404)
      const result = await DeliveryManager.sendToDevice(book.id, deviceName, req.user.id)
      res.json(result)
    } catch (err) {
      Logger.error(`[DeliveryController] Send to device error: ${err.message}`)
      res.status(400).json({ error: err.message })
    }
  }

  /**
   * GET /api/items/:id/mobile-links
   */
  async getMobileLinks(req, res) {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const links = DeliveryManager.getMobileLinks(req.libraryItem.id, baseUrl)
    res.json(links)
  }

  /**
   * GET /api/opds — OPDS root catalog (navigation)
   */
  async opdsRoot(req, res) {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    const libraries = await Database.libraryModel.findAll()

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:abs:root</id>
  <title>Audiobookshelf</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${baseUrl}/api/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="${baseUrl}/api/opds/search?q={searchTerms}" type="application/atom+xml"/>
`
    for (const lib of libraries) {
      xml += `  <entry>
    <id>urn:abs:library:${lib.id}</id>
    <title>${lib.name}</title>
    <link rel="subsection" href="${baseUrl}/api/opds/library/${lib.id}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
    <updated>${new Date().toISOString()}</updated>
    <content type="text">${lib.mediaType} library</content>
  </entry>
`
    }
    xml += `</feed>`
    res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=navigation')
    res.send(xml)
  }

  /**
   * GET /api/opds/library/:id — OPDS acquisition feed for a library
   */
  async opdsLibrary(req, res) {
    const baseUrl = `${req.protocol}://${req.get('host')}`
    try {
      const xml = await DeliveryManager.generateOpdsCatalog(req.params.id, baseUrl)
      res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition')
      res.send(xml)
    } catch (err) {
      Logger.error(`[DeliveryController] OPDS error: ${err.message}`)
      res.status(500).json({ error: err.message })
    }
  }

  /**
   * GET /api/opds/search?q=QUERY — OPDS search
   */
  async opdsSearch(req, res) {
    const q = req.query.q
    if (!q) return res.status(400).send('q parameter required')

    const baseUrl = `${req.protocol}://${req.get('host')}`
    const { Op } = require('sequelize')

    const books = await Database.bookModel.findAll({
      where: { title: { [Op.like]: `%${q}%` } },
      include: [{ model: Database.authorModel }],
      limit: 50
    })

    const libraryItems = await Database.libraryItemModel.findAll({
      where: { mediaId: books.map((b) => b.id) }
    })
    const liMap = {}
    for (const li of libraryItems) liMap[li.mediaId] = li

    const entries = books
      .filter((b) => liMap[b.id])
      .map((b) => {
        const entry = DeliveryManager.getOpdsEntry(b, liMap[b.id], baseUrl)
        entry.authors = b.authors?.map((a) => ({ name: a.name })) || []
        return entry
      })

    const xml = DeliveryManager.buildOpdsXml(entries, baseUrl, 'search')
    res.set('Content-Type', 'application/atom+xml;profile=opds-catalog;kind=acquisition')
    res.send(xml)
  }
}
module.exports = new DeliveryController()
