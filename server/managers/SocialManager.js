const Sequelize = require('sequelize')
const Logger = require('../Logger')
const Database = require('../Database')
const SocketAuthority = require('../SocketAuthority')

class SocialManager {
  constructor() {}

  async getActivityFeed(limit = 50) {
    const progresses = await Database.mediaProgressModel.findAll({
      where: { isFinished: true, mediaItemType: 'book' },
      order: [['finishedAt', 'DESC']],
      limit,
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title'],
          required: true,
          include: {
            model: Database.authorModel,
            attributes: ['name'],
            through: { attributes: [] }
          }
        },
        {
          model: Database.userModel,
          attributes: ['id', 'username']
        }
      ]
    })

    return progresses.map((mp) => ({
      userId: mp.user?.id,
      userName: mp.user?.username,
      bookTitle: mp.book?.title,
      bookAuthor: mp.book?.authors?.map((a) => a.name).join(', ') || null,
      finishedAt: mp.finishedAt
    }))
  }

  async compareTastes(userId1, userId2) {
    const [prog1, prog2] = await Promise.all(
      [userId1, userId2].map((uid) =>
        Database.mediaProgressModel.findAll({
          where: { userId: uid, isFinished: true, mediaItemType: 'book' },
          include: {
            model: Database.bookModel,
            attributes: ['id', 'genres'],
            required: true,
            include: {
              model: Database.authorModel,
              attributes: ['id', 'name'],
              through: { attributes: [] }
            }
          }
        })
      )
    )

    const bookIds1 = new Set(prog1.map((p) => p.mediaItemId))
    const bookIds2 = new Set(prog2.map((p) => p.mediaItemId))
    const sharedBooks = [...bookIds1].filter((id) => bookIds2.has(id))

    const authors1 = new Set(prog1.flatMap((p) => p.book?.authors?.map((a) => a.name) || []))
    const authors2 = new Set(prog2.flatMap((p) => p.book?.authors?.map((a) => a.name) || []))
    const sharedAuthors = [...authors1].filter((a) => authors2.has(a))

    const genres1 = new Set(prog1.flatMap((p) => p.book?.genres || []))
    const genres2 = new Set(prog2.flatMap((p) => p.book?.genres || []))
    const sharedGenres = [...genres1].filter((g) => genres2.has(g))

    const totalUnique = new Set([...bookIds1, ...bookIds2]).size
    const compatibilityScore = totalUnique > 0 ? Math.round((sharedBooks.length / totalUnique) * 100) : 0

    return { sharedBooks, sharedAuthors, sharedGenres, compatibilityScore }
  }

  async getCommunityRecommendations(userId, limit = 20) {
    // Get current user's finished books
    const userProgress = await Database.mediaProgressModel.findAll({
      where: { userId, isFinished: true, mediaItemType: 'book' },
      attributes: ['mediaItemId']
    })
    const userBookIds = new Set(userProgress.map((p) => p.mediaItemId))
    if (!userBookIds.size) return []

    // Find all other users who finished any of the same books
    const similarProgress = await Database.mediaProgressModel.findAll({
      where: {
        isFinished: true,
        mediaItemType: 'book',
        mediaItemId: { [Sequelize.Op.in]: [...userBookIds] },
        userId: { [Sequelize.Op.ne]: userId }
      },
      attributes: ['userId']
    })

    const similarUserIds = [...new Set(similarProgress.map((p) => p.userId))]
    if (!similarUserIds.length) return []

    // Get books those users finished that current user hasn't
    const theirProgress = await Database.mediaProgressModel.findAll({
      where: {
        userId: { [Sequelize.Op.in]: similarUserIds },
        isFinished: true,
        mediaItemType: 'book',
        mediaItemId: { [Sequelize.Op.not]: [...userBookIds] }
      },
      attributes: ['mediaItemId'],
      include: {
        model: Database.bookModel,
        attributes: ['id', 'title'],
        required: true
      }
    })

    // Rank by how many similar users finished each book
    const counts = {}
    const titles = {}
    for (const p of theirProgress) {
      counts[p.mediaItemId] = (counts[p.mediaItemId] || 0) + 1
      titles[p.mediaItemId] = p.book?.title
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([bookId, count]) => ({ bookId, title: titles[bookId], recommendedBy: count }))
  }

  emitActivity(eventData) {
    SocketAuthority.emitter('social_activity', eventData)
  }
}

module.exports = new SocialManager()
