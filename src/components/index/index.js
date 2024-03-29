const EventEmitter = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const _ = require('lodash')
const Database = require('better-sqlite3')
const moment = require('moment')
const delta = require('./delta')
const exiftool = require('../exiftool/parallel')
const globber = require('./glob')

const EXIF_DATE_FORMAT = 'YYYY:MM:DD HH:mm:ssZ'

class Index {
  constructor (indexPath) {
    // create the database if it doesn't exist
    fs.mkdirSync(path.dirname(indexPath), { recursive: true })
    this.db = new Database(indexPath, {})
    this.db.exec('CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, timestamp INTEGER, metadata BLOB)')
  }

  /*
    Index all the files in <media> and store into <database>
  */
  update (mediaFolder, options = {}) {
    // will emit many different events
    const emitter = new EventEmitter()

    // prepared database statements
    const selectStatement = this.db.prepare('SELECT path, timestamp FROM files')
    const insertStatement = this.db.prepare('INSERT OR REPLACE INTO files VALUES (?, ?, ?)')
    const deleteStatement = this.db.prepare('DELETE FROM files WHERE path = ?')
    const countStatement = this.db.prepare('SELECT COUNT(*) AS count FROM files')
    const selectMetadata = this.db.prepare('SELECT * FROM files')

    // create hashmap of all files in the database
    const databaseMap = {}
    for (const row of selectStatement.iterate()) {
      databaseMap[row.path] = row.timestamp
    }

    function finished () {
      // emit every file in the index
      for (const row of selectMetadata.iterate()) {
        emitter.emit('file', {
          path: row.path,
          timestamp: new Date(row.timestamp),
          metadata: JSON.parse(row.metadata)
        })
      }
      // emit the final count
      const result = countStatement.get()
      emitter.emit('done', { count: result.count })
    }

    // find all files on disk
    globber.find(mediaFolder, options, (err, diskMap) => {
      if (err) return console.error('error', err)

      // calculate the difference: which files have been added, modified, etc
      const deltaFiles = delta.calculate(databaseMap, diskMap, options)
      emitter.emit('stats', {
        database: Object.keys(databaseMap).length,
        disk: Object.keys(diskMap).length,
        unchanged: deltaFiles.unchanged.length,
        added: deltaFiles.added.length,
        modified: deltaFiles.modified.length,
        deleted: deltaFiles.deleted.length,
        skipped: deltaFiles.skipped.length
      })

      // remove deleted files from the DB
      _.each(deltaFiles.deleted, path => {
        deleteStatement.run(path)
      })

      // check if any files need parsing
      let processed = 0
      const toProcess = _.union(deltaFiles.added, deltaFiles.modified)
      if (toProcess.length === 0) {
        return finished()
      }

      // call <exiftool> on added and modified files
      // and write each entry to the database
      const stream = exiftool.parse(mediaFolder, toProcess, options.concurrency)
      stream.on('data', entry => {
        const timestamp = moment(entry.File.FileModifyDate, EXIF_DATE_FORMAT).valueOf()
        insertStatement.run(entry.SourceFile, timestamp, JSON.stringify(entry))
        ++processed
        emitter.emit('progress', { path: entry.SourceFile, processed, total: toProcess.length })
      }).on('end', finished)
    })

    return emitter
  }

  /*
    Do a full vacuum to optimise the database
    which can be needed if files are often deleted/modified
  */
  vacuum () {
    this.db.exec('VACUUM')
  }
}

module.exports = Index
